import { describe, expect, it } from 'vitest'
import { aiShot } from '../src/core/ai/aimError'
import { initMood } from '../src/core/ai/mood'
import { nextCadence } from '../src/core/ai/cadence'
import type { AiRatings } from '../src/core/ai/types'
import { simulateShot } from '../src/core/physics/shotSim'
import { Rng } from '../src/core/rng/rng'
import { SHOT_CLOCK } from '../src/core/match/rack'

function ratings(accuracy: number, swishRate: number): AiRatings {
  return { accuracy, swishRate, pace: 4, composure: 0.5, streakiness: 0, consistency: 1 }
}

function observedMakeRate(r: AiRatings, n: number, seed: number): { make: number; swishShare: number } {
  const rng = new Rng(seed)
  const mood = initMood(r, rng)
  let makes = 0
  let swishes = 0
  for (let i = 0; i < n; i++) {
    const out = simulateShot(aiShot(r, mood, { scoreDiff: 0, ballsLeft: 10 }, rng), { fast: true })
    if (out.made) {
      makes++
      if (out.points === 2) swishes++
    }
  }
  return { make: makes / n, swishShare: makes ? swishes / makes : 0 }
}

describe('AI calibration regression (re-run npm run calibrate after physics changes)', () => {
  it('observed make% tracks the accuracy rating (±6%)', () => {
    for (const acc of [0.4, 0.6, 0.8]) {
      const { make } = observedMakeRate(ratings(acc, 0.6), 1200, 7 + acc * 100)
      expect(Math.abs(make - acc), `accuracy ${acc} → observed ${make}`).toBeLessThan(0.06)
    }
  })

  it('swish share rises with swishRate (arc discipline is physical)', () => {
    const low = observedMakeRate(ratings(0.7, 0.2), 1200, 11)
    const high = observedMakeRate(ratings(0.7, 0.9), 1200, 12)
    expect(high.swishShare).toBeGreaterThan(low.swishShare + 0.08)
  })

  it('cadence is never instant and virtually always beats the clock', () => {
    const rng = new Rng(5)
    const r: AiRatings = { accuracy: 0.6, swishRate: 0.6, pace: 4, composure: 0.7, streakiness: 0.3, consistency: 0.8 }
    let violations = 0
    for (let i = 0; i < 500; i++) {
      const c = nextCadence(r, { scoreDiff: -5, ballsLeft: 10 }, rng)
      expect(c.pickupDelay).toBeGreaterThan(0.3)
      expect(c.aimTime).toBeGreaterThanOrEqual(0.5)
      if (c.aimTime >= SHOT_CLOCK) violations++
    }
    expect(violations / 500).toBeLessThan(0.06)
  })
})
