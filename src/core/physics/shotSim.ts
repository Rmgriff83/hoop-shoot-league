/**
 * Fixed-timestep shot simulator. Deterministic: no RNG in here — aim noise is
 * injected upstream (player gesture / AI aim error), physics just resolves it.
 * One implementation serves the player, the live AI, and headless resolution.
 */
import {
  BACKSPIN_DEFAULT,
  E_NET_WALL,
  G,
  HOOP_X,
  HOOP_Y,
  MAKE_DEPTH,
  MAX_SHOT_TIME,
  NET_DRAG,
  R_BALL,
  R_RIM,
  RELEASE_HEIGHT,
  SIM_DT,
} from './constants'
import { findContact, resolveContact, type Contact } from './colliders'
import type { BallState, ContactEvent, LaunchParams, ShotOutcome } from './types'
import { classifyShot } from '../shot/classify'

const DEG = Math.PI / 180

export function createShot(launch: LaunchParams): BallState {
  const th = launch.angleDeg * DEG
  return {
    t: 0,
    pos: { x: 0, y: RELEASE_HEIGHT, z: 0 },
    vel: {
      x: launch.speed * Math.cos(th),
      y: launch.speed * Math.sin(th),
      z: launch.vz ?? 0,
    },
    spin: launch.backspin ?? BACKSPIN_DEFAULT,
    inCylinder: false,
    everEntered: false,
    entryAngleDeg: null,
    made: false,
    resolved: false,
    settled: false,
    floorHits: 0,
    slowTime: 0,
    events: [],
    maxPenetration: 0,
  }
}

/** Pure ballistic advance (no collision) — position is quadratic in dt. */
function advance(s: BallState, dt: number): void {
  s.pos.x += s.vel.x * dt
  s.pos.z += s.vel.z * dt
  s.pos.y += s.vel.y * dt - 0.5 * G * dt * dt
  s.vel.y -= G * dt
  s.t += dt
}

/**
 * Bisect the sub-interval [0, dt] to land the ball just at first contact.
 * Assumes no contact at t=0 and contact at t=dt. Leaves state at contact time
 * and returns the contact plus remaining time.
 */
function bisectToContact(s: BallState, dt: number): { contact: Contact; remaining: number } {
  const start = { pos: { ...s.pos }, vel: { ...s.vel }, t: s.t }
  let lo = 0
  let hi = dt
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2
    s.pos = { ...start.pos }
    s.vel = { ...start.vel }
    s.t = start.t
    advance(s, mid)
    if (findContact(s.pos)) hi = mid
    else lo = mid
  }
  // Settle just before contact (lo), then report the contact found at hi.
  s.pos = { ...start.pos }
  s.vel = { ...start.vel }
  s.t = start.t
  advance(s, lo)
  const probe = { pos: { ...s.pos }, vel: { ...s.vel }, t: s.t }
  advance(s, hi - lo)
  const contact = findContact(s.pos)
  if (!contact) {
    // Numerical edge — keep the advanced state and carry on.
    return { contact: { kind: 'floor', depth: 0, n: { x: 0, y: 1, z: 0 }, q: { ...s.pos } }, remaining: dt - hi }
  }
  s.pos = probe.pos
  s.vel = probe.vel
  s.t = probe.t
  return { contact, remaining: dt - lo }
}

function recordEvent(s: BallState, c: Contact, impact: number): void {
  const ev: ContactEvent = {
    kind: c.kind,
    t: s.t,
    pos: { ...s.pos },
    normal: { ...c.n },
    speed: impact,
  }
  if (c.kind === 'rim') {
    // Azimuth of the contact point around the hoop: 0 = front (shooter side), 180 = back.
    ev.azimuthDeg = Math.atan2(Math.abs(c.q.z), -(c.q.x - HOOP_X)) / DEG
  }
  s.events.push(ev)
}

function horizDistToAxis(x: number, z: number): number {
  return Math.hypot(x - HOOP_X, z)
}

/** Rim-plane crossing + make/in-and-out bookkeeping. Call with the pre-step position. */
function updateCylinderState(s: BallState, prevX: number, prevY: number, prevZ: number): void {
  const { pos, vel } = s
  // Downward crossing of the rim plane.
  if (prevY >= HOOP_Y && pos.y < HOOP_Y) {
    const f = (prevY - HOOP_Y) / (prevY - pos.y)
    const xi = prevX + (pos.x - prevX) * f
    const zi = prevZ + (pos.z - prevZ) * f
    if (horizDistToAxis(xi, zi) < R_RIM) {
      s.inCylinder = true
      s.everEntered = true
      if (s.entryAngleDeg === null) {
        s.entryAngleDeg = Math.atan2(-vel.y, Math.hypot(vel.x, vel.z)) / DEG
      }
    }
  }
  // Popped back out the top (the heartbreaker).
  if (prevY < HOOP_Y && pos.y >= HOOP_Y && s.inCylinder) {
    s.inCylinder = false
  }

  if (s.inCylinder && !s.made) {
    // Net drag while threading the cylinder.
    const k = Math.exp(-NET_DRAG * SIM_DT)
    vel.x *= k
    vel.y *= k
    vel.z *= k
    // The net catches balls rattling sideways below the plane and funnels them down.
    const hd = horizDistToAxis(pos.x, pos.z)
    const maxR = R_RIM - R_BALL * 0.15
    if (hd > maxR && pos.y < HOOP_Y) {
      const nx = (HOOP_X - pos.x) / hd
      const nz = (0 - pos.z) / hd
      const vOut = -(vel.x * nx + vel.z * nz)
      if (vOut > 0) {
        vel.x += (1 + E_NET_WALL) * vOut * nx
        vel.z += (1 + E_NET_WALL) * vOut * nz
      }
    }
    if (pos.y < HOOP_Y - MAKE_DEPTH) {
      s.made = true
      s.resolved = true
    }
  }
}

function updateResolution(s: BallState): void {
  const { pos } = s
  // Dead-ball safety net: a ball resting anywhere off the floor (wedged,
  // balanced on the rim, whatever) is dead after half a second — no rest
  // state may ever stall a rack.
  const speed = Math.hypot(s.vel.x, s.vel.y, s.vel.z)
  if (speed < 0.4 && pos.y > R_BALL * 1.5) s.slowTime += SIM_DT
  else s.slowTime = 0
  if (s.slowTime > 0.5) {
    s.settled = true
    s.resolved = true
    return
  }
  if (!s.resolved) {
    // Provably dead: below the rim plane, outside the cylinder, heading down —
    // nothing (floor bounce included, e² capped) can climb back to 3.05 m.
    if (pos.y < HOOP_Y - 0.4 && !s.inCylinder && s.vel.y < 0) s.resolved = true
    if (s.floorHits > 0) s.resolved = true
  }
  if (
    s.floorHits >= 3 ||
    s.t > MAX_SHOT_TIME ||
    pos.x < -3 ||
    pos.x > HOOP_X + 3 ||
    (s.floorHits > 0 && Math.hypot(s.vel.x, s.vel.y, s.vel.z) < 0.6)
  ) {
    s.settled = true
    s.resolved = true
  }
}

/** Resolve a contact in place: partial impulse, event log, projection out of penetration. */
function resolveInPlace(s: BallState, contact: Contact): void {
  const impact = resolveContact(s, contact)
  if (impact !== null) {
    // Only meaningful hits become events — soft partial-impulse grazes (< ~0.4 m/s
    // effective) are one physical "rub" and would spam the log/sfx as dozens of hits.
    if (impact > 0.4 || contact.kind !== 'rim') {
      recordEvent(s, contact, impact)
    }
    if (contact.kind === 'floor') s.floorHits++
  }
  // Project out of any residual penetration — graze-scaled impulses leave inward
  // velocity; this keeps the ball sliding on the tube surface, never through it.
  // Iterated because the ball can wedge into two colliders at once (back rim +
  // board corner): popping out of one must not leave it inside the other.
  for (let i = 0; i < 4; i++) {
    const residual = findContact(s.pos)
    if (!residual) break
    s.pos.x += residual.n.x * (residual.depth + 1e-4)
    s.pos.y += residual.n.y * (residual.depth + 1e-4)
    s.pos.z += residual.n.z * (residual.depth + 1e-4)
  }
}

/**
 * Advance one fixed SIM_DT step. Deep first-touches bisect to the contact
 * moment (fast flight → precise impact points); shallow penetrations — the
 * common rubbing/rolling case with graze-scaled impulses — resolve in place,
 * which keeps contact-heavy stretches cheap.
 */
export function stepShot(s: BallState): void {
  if (s.settled) return
  const prevX = s.pos.x
  const prevY = s.pos.y
  const prevZ = s.pos.z
  advance(s, SIM_DT)
  const hit = findContact(s.pos)
  if (hit) {
    if (hit.depth > 0.006) {
      // Deep hit mid-flight: rewind (undo gravity + time) and bisect to first touch.
      s.pos = { x: prevX, y: prevY, z: prevZ }
      s.vel.y += G * SIM_DT
      s.t -= SIM_DT
      const wasTouchingAtStart = findContact(s.pos) !== null
      if (wasTouchingAtStart) {
        // Started the step in contact — bisection's precondition fails; step and resolve in place.
        advance(s, SIM_DT)
        resolveInPlace(s, findContact(s.pos) ?? hit)
      } else {
        const { contact } = bisectToContact(s, SIM_DT)
        resolveInPlace(s, contact)
      }
    } else {
      resolveInPlace(s, hit)
    }
  }
  updateCylinderState(s, prevX, prevY, prevZ)
  // Tunneling invariant: after resolution the ball must sit outside every collider.
  const residual = findContact(s.pos)
  if (residual && residual.depth > s.maxPenetration) s.maxPenetration = residual.depth
  updateResolution(s)
}

export interface SimulateOptions {
  /** Stop as soon as the outcome is decided (headless league/AI resolution). */
  fast?: boolean
}

/** Run a launch to completion and classify it. */
export function simulateShot(launch: LaunchParams, opts: SimulateOptions = {}): ShotOutcome {
  const s = createShot(launch)
  const maxSteps = Math.ceil(MAX_SHOT_TIME / SIM_DT) + 1
  for (let i = 0; i < maxSteps; i++) {
    stepShot(s)
    if (s.settled) break
    if (opts.fast && s.resolved) break
  }
  return classifyShot(s)
}
