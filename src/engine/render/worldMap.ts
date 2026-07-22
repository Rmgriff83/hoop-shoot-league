/**
 * Canonical shot space ↔ world court mapping. Physics always runs canonical
 * (release at x=0, hoop at +7.24); the world places the player shooting LEFT at
 * the left hoop and the AI shooting RIGHT at the right hoop, back-to-back
 * around center court.
 */
import { HOOP_LEFT_X, HOOP_RIGHT_X, SHOT_DIST } from '../../core/physics/constants'
import type { Vec3 } from '../../core/physics/types'
import type { SideId } from '../../core/match/matchEngine'

export const PLAYER_RELEASE_X = HOOP_LEFT_X + SHOT_DIST // 8.815 — shoots −x
export const AI_RELEASE_X = HOOP_RIGHT_X - SHOT_DIST // 19.835 — shoots +x

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
