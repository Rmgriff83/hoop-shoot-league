/**
 * Analytic colliders. The rim is a true torus: contact = distance from ball
 * center to the hoop circle < R_BALL + R_TUBE, via the closed-form
 * nearest-point-on-circle test. This is what makes every §4 miss archetype
 * (front/back/side rim, in-and-out, shooter's roll, bank) emerge for free.
 */
import {
  BOARD_BOTTOM,
  BOARD_HALF_W,
  BOARD_TOP,
  BOARD_X,
  BRACKET_HALF_W,
  BRACKET_X0,
  BRACKET_X1,
  BRACKET_Y0,
  BRACKET_Y1,
  E_BOARD,
  E_FLOOR,
  E_RIM,
  HOOP_X,
  HOOP_Y,
  MU_BOARD,
  MU_FLOOR,
  MU_RIM,
  R_BALL,
  R_RIM,
  R_TUBE,
  SPIN_DECAY_BOARD,
  SPIN_DECAY_RIM,
  SPIN_KICK,
} from './constants'
import type { BallState, ContactKind, Vec3 } from './types'

export interface Contact {
  kind: ContactKind
  depth: number
  /** Unit normal pointing from the surface toward the ball center. */
  n: Vec3
  /** Contact point on the surface. */
  q: Vec3
}

export function rimContact(p: Vec3): Contact | null {
  const dx = p.x - HOOP_X
  const dz = p.z
  const horiz = Math.hypot(dx, dz)
  // Nearest point on the hoop circle to the ball center.
  let qx: number, qz: number
  if (horiz < 1e-9) {
    qx = HOOP_X + R_RIM
    qz = 0
  } else {
    qx = HOOP_X + (dx / horiz) * R_RIM
    qz = (dz / horiz) * R_RIM
  }
  const ex = p.x - qx
  const ey = p.y - HOOP_Y
  const ez = p.z - qz
  const d = Math.hypot(ex, ey, ez)
  const min = R_BALL + R_TUBE
  if (d >= min) return null
  const inv = d < 1e-9 ? 0 : 1 / d
  return {
    kind: 'rim',
    depth: min - d,
    n: { x: ex * inv, y: ey * inv, z: ez * inv },
    q: { x: qx, y: HOOP_Y, z: qz },
  }
}

/**
 * Rim mounting bracket — sloped ribbon between the back rim and the board.
 * Reported as 'board' (it's part of the board assembly): same sfx, and a
 * bracket-aided make correctly classifies as a BANK.
 */
export function bracketContact(p: Vec3): Contact | null {
  const abx = BRACKET_X1 - BRACKET_X0
  const aby = BRACKET_Y1 - BRACKET_Y0
  const t = Math.min(
    Math.max(((p.x - BRACKET_X0) * abx + (p.y - BRACKET_Y0) * aby) / (abx * abx + aby * aby), 0),
    1,
  )
  const qx = BRACKET_X0 + abx * t
  const qy = BRACKET_Y0 + aby * t
  const qz = Math.min(Math.max(p.z, -BRACKET_HALF_W), BRACKET_HALF_W)
  const ex = p.x - qx
  const ey = p.y - qy
  const ez = p.z - qz
  const d = Math.hypot(ex, ey, ez)
  if (d >= R_BALL || d < 1e-9) return null
  return {
    kind: 'board',
    depth: R_BALL - d,
    n: { x: ex / d, y: ey / d, z: ez / d },
    q: { x: qx, y: qy, z: qz },
  }
}

export function boardContact(p: Vec3): Contact | null {
  if (p.y < BOARD_BOTTOM || p.y > BOARD_TOP || Math.abs(p.z) > BOARD_HALF_W) return null
  const depth = p.x + R_BALL - BOARD_X
  // Only the front face matters; ignore once well past the plane (can't happen in play).
  if (depth <= 0 || depth > R_BALL) return null
  return {
    kind: 'board',
    depth,
    n: { x: -1, y: 0, z: 0 },
    q: { x: BOARD_X, y: p.y, z: p.z },
  }
}

export function floorContact(p: Vec3): Contact | null {
  const depth = R_BALL - p.y
  if (depth <= 0) return null
  return { kind: 'floor', depth, n: { x: 0, y: 1, z: 0 }, q: { x: p.x, y: 0, z: p.z } }
}

export function findContact(p: Vec3): Contact | null {
  return rimContact(p) ?? bracketContact(p) ?? boardContact(p) ?? floorContact(p)
}

const MATERIALS: Record<Exclude<ContactKind, 'net'>, { e: number; mu: number; spinDecay: number }> = {
  rim: { e: E_RIM, mu: MU_RIM, spinDecay: SPIN_DECAY_RIM },
  board: { e: E_BOARD, mu: MU_BOARD, spinDecay: SPIN_DECAY_BOARD },
  floor: { e: E_FLOOR, mu: MU_FLOOR, spinDecay: SPIN_DECAY_RIM },
}

/**
 * Impulse response: restitution along the normal, friction against tangential
 * slip (including backspin surface velocity — this is shooter's touch: backspin
 * deadens the ball off the front rim), then spin decay.
 * Mutates vel/spin. Returns impact speed for sfx, or null if already separating.
 */
export function resolveContact(state: BallState, c: Contact): number | null {
  if (c.kind === 'net') return null
  const v = state.vel
  const n = c.n
  const vn = v.x * n.x + v.y * n.y + v.z * n.z
  if (vn >= 0) return null
  const impact = Math.abs(vn)
  const mat = MATERIALS[c.kind]

  // Rim contacts scale by "commitment": κ = how head-on the ball's path is to
  // the tube (impact parameter). A real ball deforms — a tangential kiss off
  // the tube top transfers almost nothing and the ball rubs on in, while a
  // head-on catch gets the full clang. Without this, zero-depth grazes off the
  // front rim launch balls over the hoop (rigid-body over-reaction).
  let kappa = 1
  if (c.kind === 'rim') {
    const speed = Math.hypot(v.x, v.y, v.z)
    if (speed > 1e-6) {
      const cosIn = -vn / speed // 1 = dead head-on into the tube
      kappa = cosIn * cosIn
    }
  }

  // Normal restitution.
  const j = (1 + mat.e * kappa) * kappa * vn
  v.x -= j * n.x
  v.y -= j * n.y
  v.z -= j * n.z

  // Surface velocity from spin ω=(0,0,w) at the contact offset r = −R_BALL·n.
  const w = state.spin
  const sx = w * R_BALL * n.y * SPIN_KICK
  const sy = -w * R_BALL * n.x * SPIN_KICK
  // Relative slip at the contact point, tangential part only.
  let rx = v.x + sx
  let ry = v.y + sy
  let rz = v.z
  const rn = rx * n.x + ry * n.y + rz * n.z
  rx -= rn * n.x
  ry -= rn * n.y
  rz -= rn * n.z
  const mu = mat.mu * kappa
  v.x -= mu * rx
  v.y -= mu * ry
  v.z -= mu * rz

  state.spin *= 1 - (1 - mat.spinDecay) * kappa
  return impact * kappa
}
