/**
 * The player's rolling self-sim ratings (handoff §7): EWMA of their own played
 * performance, used by quickSim when they skip a game. Seeded from the
 * difficulty tier's baseline at campaign start.
 */
import type { AiRatings } from '../ai/types'

export type DifficultyTier = 'rookie' | 'pro' | 'allstar' | 'legend'

/** AI aim-error sigma multiplier per tier — frozen at campaign creation (handoff §10). */
export const TIER_ERROR_MULT: Record<DifficultyTier, number> = {
  rookie: 1.35,
  pro: 1.0,
  allstar: 0.85,
  legend: 0.7,
}

/** Starting self-sim baseline per tier (what "a player at this level" makes). */
export const TIER_BASELINE: Record<DifficultyTier, { accuracy: number; swishRate: number }> = {
  rookie: { accuracy: 0.45, swishRate: 0.35 },
  pro: { accuracy: 0.5, swishRate: 0.45 },
  allstar: { accuracy: 0.55, swishRate: 0.5 },
  legend: { accuracy: 0.6, swishRate: 0.55 },
}

const ALPHA = 0.25

export interface PlayerSelfRatings {
  accuracy: number
  swishRate: number
  gamesPlayed: number
}

export function initSelfRatings(tier: DifficultyTier): PlayerSelfRatings {
  return { ...TIER_BASELINE[tier], gamesPlayed: 0 }
}

/** Fold one live-played game into the EWMA. */
export function updateSelfRatings(self: PlayerSelfRatings, game: { makes: number; swishes: number; shots: number }): void {
  if (game.shots === 0) return
  const makeRate = game.makes / game.shots
  const swishShare = game.makes ? game.swishes / game.makes : 0
  self.accuracy += ALPHA * (makeRate - self.accuracy)
  self.swishRate += ALPHA * (swishShare - self.swishRate)
  self.gamesPlayed++
}

/** Full AiRatings shape so quickSim can treat the player like any shooter. */
export function selfAsAiRatings(self: PlayerSelfRatings): AiRatings {
  return {
    accuracy: self.accuracy,
    // quickSim's swish split expects the authored-style swishRate knob; invert
    // the empirical share formula share ≈ 0.05 + 0.3·acc·swishRate.
    swishRate: Math.min(Math.max((self.swishRate - 0.05) / Math.max(0.3 * self.accuracy, 0.05), 0.05), 0.95),
    pace: 4,
    composure: 0.6,
    streakiness: 0.4,
    consistency: 0.75,
  }
}
