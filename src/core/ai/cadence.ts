/**
 * AI shooting rhythm (handoff §6): grab ball from rack → brief pre-shot beat →
 * release. Never instant — `pace` (seconds per shot cycle) drives this visibly
 * on the zoom-out view. Low-composure shooters under pressure occasionally aim
 * long enough to flirt with (rarely, eat) the 3 s shot clock.
 */
import { SHOT_CLOCK } from '../match/rack'
import type { Rng } from '../rng/rng'
import type { AiRatings, ShotSituation } from './types'

export interface ShotCadence {
  /** Delay after previous ball resolves before picking up the next, s. */
  pickupDelay: number
  /** Aim time between pickup (clock start) and release, s. */
  aimTime: number
}

export function nextCadence(ratings: AiRatings, situation: ShotSituation, rng: Rng): ShotCadence {
  const pace = Math.max(ratings.pace, 1.5)
  const pickupDelay = Math.max(0.35, pace * 0.4 * (0.85 + 0.3 * rng.next()))
  // Pressure makes low-composure shooters hold the ball longer.
  const pressure = Math.min(Math.max(-situation.scoreDiff / 10, 0), 1)
  const hesitation = (1 - ratings.composure) * pressure * 0.6 * rng.next()
  let aimTime = pace * 0.45 * (0.8 + 0.4 * rng.next()) + hesitation
  // Almost always beat the clock — but a rare freeze-up violation is human.
  if (aimTime > SHOT_CLOCK - 0.15 && rng.next() < 0.85) {
    aimTime = SHOT_CLOCK - 0.15 - 0.3 * rng.next()
  }
  return { pickupDelay, aimTime: Math.max(0.5, aimTime) }
}
