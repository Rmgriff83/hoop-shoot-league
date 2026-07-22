/**
 * One rack = the atomic unit of play (25 balls regulation, 7 in overtime).
 * Headless state machine: pickup starts the 3 s shot clock, release stops it,
 * expiry loses the ball. The same machine runs the player (driven by input)
 * and the AI (driven by cadence timers).
 */
import type { LaunchParams, ShotOutcome } from '../physics/types'

export const RACK_SIZE = 25
export const OT_RACK_SIZE = 7
export const SHOT_CLOCK = 3 // seconds, pickup → release

export type RackPhase = 'idle' | 'aiming' | 'inFlight' | 'done'

export interface RackShotRecord {
  ballIndex: number
  /** null = shot-clock violation (ball lost, never released). */
  launch: LaunchParams | null
  type: ShotOutcome['type'] | 'VIOLATION'
  points: number
  entryAngleDeg: number | null
  /** Seconds of shot clock used before release. */
  clockUsed: number
}

export interface RackState {
  size: number
  phase: RackPhase
  /** 0-based index of the current/next ball. */
  ballIndex: number
  clockRemaining: number
  points: number
  makes: number
  swishes: number
  misses: number
  violations: number
  currentStreak: number
  longestStreak: number
  shots: RackShotRecord[]
}

export function createRack(size = RACK_SIZE): RackState {
  return {
    size,
    phase: 'idle',
    ballIndex: 0,
    clockRemaining: SHOT_CLOCK,
    points: 0,
    makes: 0,
    swishes: 0,
    misses: 0,
    violations: 0,
    currentStreak: 0,
    longestStreak: 0,
    shots: [],
  }
}

export function ballsLeft(r: RackState): number {
  return r.size - r.ballIndex
}

/** Tap the rack — starts the shot clock. No-op unless idle with balls left. */
export function pickupBall(r: RackState): boolean {
  if (r.phase !== 'idle' || r.ballIndex >= r.size) return false
  r.phase = 'aiming'
  r.clockRemaining = SHOT_CLOCK
  return true
}

/**
 * Advance the shot clock while aiming. Returns true when the clock expired on
 * this tick (violation recorded, ball lost).
 */
export function tickClock(r: RackState, dt: number): boolean {
  if (r.phase !== 'aiming') return false
  r.clockRemaining -= dt
  if (r.clockRemaining > 0) return false
  r.clockRemaining = 0
  r.violations++
  r.currentStreak = 0
  r.shots.push({
    ballIndex: r.ballIndex,
    launch: null,
    type: 'VIOLATION',
    points: 0,
    entryAngleDeg: null,
    clockUsed: SHOT_CLOCK,
  })
  advanceBall(r)
  return true
}

/** Release within the clock — ball is now in flight. */
export function releaseBall(r: RackState, launch: LaunchParams): boolean {
  if (r.phase !== 'aiming') return false
  r.phase = 'inFlight'
  // Stash launch/clock on the pending record; completed by recordOutcome.
  pending.set(r, { launch, clockUsed: SHOT_CLOCK - r.clockRemaining })
  return true
}

const pending = new WeakMap<RackState, { launch: LaunchParams; clockUsed: number }>()

/** The sim finished resolving the flight — score it and advance. */
export function recordOutcome(r: RackState, outcome: ShotOutcome): void {
  if (r.phase !== 'inFlight') return
  const p = pending.get(r)
  pending.delete(r)
  r.points += outcome.points
  if (outcome.made) {
    r.makes++
    if (outcome.points === 2) r.swishes++
    r.currentStreak++
    r.longestStreak = Math.max(r.longestStreak, r.currentStreak)
  } else {
    r.misses++
    r.currentStreak = 0
  }
  r.shots.push({
    ballIndex: r.ballIndex,
    launch: p?.launch ?? null,
    type: outcome.type,
    points: outcome.points,
    entryAngleDeg: outcome.entryAngleDeg,
    clockUsed: p?.clockUsed ?? 0,
  })
  advanceBall(r)
}

function advanceBall(r: RackState): void {
  r.ballIndex++
  r.phase = r.ballIndex >= r.size ? 'done' : 'idle'
  r.clockRemaining = SHOT_CLOCK
}
