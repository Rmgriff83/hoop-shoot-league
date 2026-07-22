/**
 * Closed-form projectile math for the canonical shot. Used by the trajectory
 * preview, the AI's ideal-shot solver, and as the ground-truth for tests
 * (reproduces the handoff §3 table).
 */
import { G, RELEASE_HEIGHT, RIM_HEIGHT, SHOT_DIST } from './constants'
import type { LaunchParams, Vec3 } from './types'

const DEG = Math.PI / 180

/** Rim-center drop relative to release: 3.05 − 2.10 = 0.95 m. */
export const RIM_DROP = RIM_HEIGHT - RELEASE_HEIGHT

/**
 * Release speed (m/s) that passes through a point `dist` ahead and `rise` above
 * the release, at launch angle `angleDeg`. Null when the angle can't reach it.
 */
export function speedForAngle(angleDeg: number, dist = SHOT_DIST, rise = RIM_DROP): number | null {
  const th = angleDeg * DEG
  const cos = Math.cos(th)
  const reach = dist * Math.tan(th) - rise
  if (cos <= 0 || reach <= 0) return null
  const v2 = (G * dist * dist) / (2 * cos * cos * reach)
  return Math.sqrt(v2)
}

/** Time to cover `dist` horizontally. */
export function flightTime(angleDeg: number, speed: number, dist = SHOT_DIST): number {
  return dist / (speed * Math.cos(angleDeg * DEG))
}

/** Apex height above the floor. */
export function apexHeight(angleDeg: number, speed: number): number {
  const vy = speed * Math.sin(angleDeg * DEG)
  return RELEASE_HEIGHT + (vy * vy) / (2 * G)
}

/** Downward entry angle (deg) when crossing the rim plane at `dist`. */
export function entryAngle(angleDeg: number, speed: number, dist = SHOT_DIST): number {
  const th = angleDeg * DEG
  const vx = speed * Math.cos(th)
  const t = dist / vx
  const vy = speed * Math.sin(th) - G * t
  return Math.atan2(-vy, vx) / DEG
}

/** The perfect shot at this angle: dead-center through the rim. */
export function idealLaunch(angleDeg: number): LaunchParams | null {
  const speed = speedForAngle(angleDeg)
  return speed === null ? null : { angleDeg, speed }
}

/** Analytic arc position at time t (no collisions) — trajectory preview + tests. */
export function arcPoint(launch: LaunchParams, t: number): Vec3 {
  const th = launch.angleDeg * DEG
  const vx = launch.speed * Math.cos(th)
  const vy = launch.speed * Math.sin(th)
  return {
    x: vx * t,
    y: RELEASE_HEIGHT + vy * t - 0.5 * G * t * t,
    z: (launch.vz ?? 0) * t,
  }
}
