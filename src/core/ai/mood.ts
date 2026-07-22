/**
 * Streaks, composure, and game-to-game variance. All of it lands as a shift on
 * *effective accuracy*, which aimError converts to physical error — ratings
 * tune error magnitude, never outcomes (handoff §6).
 */
import type { Rng } from '../rng/rng'
import type { AiGameMood, AiRatings, ShotSituation } from './types'

export function initMood(ratings: AiRatings, rng: Rng): AiGameMood {
  return {
    streakState: rng.next() < 0.5 ? 1 : -1,
    // Low consistency → wide per-game form swings.
    gameOffset: (1 - ratings.consistency) * 0.08 * rng.normal(),
  }
}

/** Advance the hot/cold Markov chain after each shot. Stickiness ∝ streakiness. */
export function updateMood(ratings: AiRatings, mood: AiGameMood, rng: Rng): void {
  const stay = 0.5 + 0.45 * ratings.streakiness
  if (rng.next() > stay) mood.streakState = mood.streakState === 1 ? -1 : 1
}

/** Effective accuracy for this shot, all mood/pressure shifts applied. */
export function effectiveAccuracy(ratings: AiRatings, mood: AiGameMood, situation: ShotSituation): number {
  let acc = ratings.accuracy
  acc += mood.gameOffset
  acc += mood.streakState * 0.06 * ratings.streakiness
  // Pressure: trailing hurts low-composure shooters, steels high-composure ones.
  const pressure = Math.min(Math.max(-situation.scoreDiff / 10, 0), 1)
  acc += (ratings.composure - 0.5) * 0.1 * pressure
  return Math.min(Math.max(acc, 0.05), 0.97)
}
