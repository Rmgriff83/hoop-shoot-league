/**
 * Drag → launch mapping (handoff §1/§3): angle is the real skill so it maps
 * 1:1 (one degree of finger = one degree of launch, no compression). Power is
 * forgiving: the useful 8.6–9.6 m/s band occupies ~55% of the drag range via a
 * piecewise-linear saturating curve.
 *
 * Canonical space: the pull vector is the *launch* direction (slingshot —
 * input layer flips screen coordinates per shooter facing).
 */
import type { LaunchParams } from '../physics/types'

export const ANGLE_MIN = 20
export const ANGLE_MAX = 78
export const V_MIN = 7.0
export const V_MAX = 11.0
export const DEAD_ZONE_PX = 30

// Power curve control points (dragFraction → speedFraction). The middle
// segment is the useful band: shallow slope = fine, forgiving control.
const P1 = { u: 0.2, v: 0.4 } // 7.0→8.6 m/s over the first 20% of drag
const P2 = { u: 0.75, v: 0.65 } // 8.6→9.6 m/s over 55% of drag ← the band

/** Monotonic saturating power curve, u∈[0,1] → v∈[0,1]. */
export function powerCurve(u: number): number {
  const x = Math.min(Math.max(u, 0), 1)
  if (x <= P1.u) return (x / P1.u) * P1.v
  if (x <= P2.u) return P1.v + ((x - P1.u) / (P2.u - P1.u)) * (P2.v - P1.v)
  return P2.v + ((x - P2.u) / (1 - P2.u)) * (1 - P2.v)
}

export interface DragVector {
  /** Pull, in px, already oriented so +x = toward the hoop, +y = up. */
  dx: number
  dy: number
  /** Longest useful drag for this viewport, px. */
  dMax: number
}

/** null while the drag is inside the dead zone (release = cancel, no shot). */
export function dragToLaunch(drag: DragVector): LaunchParams | null {
  const d = Math.hypot(drag.dx, drag.dy)
  if (d < DEAD_ZONE_PX) return null
  const rawAngle = (Math.atan2(drag.dy, drag.dx) * 180) / Math.PI
  const angleDeg = Math.min(Math.max(rawAngle, ANGLE_MIN), ANGLE_MAX)
  const u = (d - DEAD_ZONE_PX) / Math.max(drag.dMax - DEAD_ZONE_PX, 1)
  const speed = V_MIN + (V_MAX - V_MIN) * powerCurve(u)
  return { angleDeg, speed }
}
