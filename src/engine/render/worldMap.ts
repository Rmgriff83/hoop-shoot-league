/**
 * Canonical shot space ↔ world court mapping. Physics always runs canonical
 * (release at x=0, hoop at +7.24); the world places the player shooting LEFT at
 * the left hoop and the AI shooting RIGHT at the right hoop, back-to-back
 * around center court.
 */
import { COURT_LEN, HOOP_LEFT_X, HOOP_RIGHT_X, RIM_FROM_BASELINE, SHOT_DIST } from '../../core/physics/constants'
import type { Vec3 } from '../../core/physics/types'
import type { SideId } from '../../core/match/matchEngine'

export const PLAYER_RELEASE_X = HOOP_LEFT_X + SHOT_DIST // 8.815 — shoots −x
export const AI_RELEASE_X = HOOP_RIGHT_X - SHOT_DIST // 19.835 — shoots +x

// The campaign half court expressed in canonical shot space (hoop at +SHOT_DIST):
// baseline sits RIM_FROM_BASELINE beyond the rim; midcourt is half the court back.
export const CANON_BASELINE_X = SHOT_DIST + RIM_FROM_BASELINE // 8.815
export const CANON_MIDCOURT_X = CANON_BASELINE_X - COURT_LEN / 2 // −5.51
/** Out-of-bounds apron shown around the court — same as MatchScreen's floor. */
export const COURT_APRON = 1.5

/** Screen-facing for drag input: −1 = player's hoop is to the left. */
export function facingOf(side: SideId): 1 | -1 {
  return side === 'player' ? -1 : 1
}

export function canonToWorld(side: SideId, p: Vec3): Vec3 {
  return side === 'player'
    ? { x: PLAYER_RELEASE_X - p.x, y: p.y, z: p.z }
    : { x: AI_RELEASE_X + p.x, y: p.y, z: p.z }
}

export function hoopWorldX(side: SideId): number {
  return side === 'player' ? HOOP_LEFT_X : HOOP_RIGHT_X
}
