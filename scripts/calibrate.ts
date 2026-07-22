/**
 * Monte-Carlo calibration: fits SIGMA_V_TABLE in src/core/ai/aimError.ts.
 * Run `npm run calibrate` after touching physics constants, then paste the
 * printed table over the constant. Also prints a make%/swish% sweep across
 * accuracy ratings as a sanity report.
 */
import { simulateShot } from '../src/core/physics/shotSim'
import { speedForAngle } from '../src/core/physics/ballistics'
import { Rng } from '../src/core/rng/rng'
import { aiShot } from '../src/core/ai/aimError'
import { initMood } from '../src/core/ai/mood'
import type { AiRatings } from '../src/core/ai/types'

const N = 4000

function makeRateForSigmaV(sigmaV: number, rng: Rng): number {
  let makes = 0
  for (let i = 0; i < N; i++) {
    const angleDeg = 50 + 1.5 * rng.normal()
    const ideal = speedForAngle(angleDeg)!
    const out = simulateShot(
      { angleDeg, speed: ideal * (1 + sigmaV * rng.normal()), vz: 0.05 * rng.normal() },
      { fast: true },
    )
    if (out.made) makes++
  }
  return makes / N
}

console.log('--- σv → make% (paste into SIGMA_V_TABLE as [makeP, sigmaV]) ---')
const grid = [0.002, 0.005, 0.008, 0.012, 0.017, 0.023, 0.03, 0.04, 0.055, 0.075, 0.1, 0.13]
const rng = new Rng(1234)
for (const sigmaV of grid) {
  const p = makeRateForSigmaV(sigmaV, rng)
  console.log(`  [${p.toFixed(2)}, ${sigmaV}],`)
}

console.log('\n--- full aiShot sweep: accuracy → observed make% / swish-share ---')
for (const accuracy of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
  for (const swishRate of [0.2, 0.6, 0.9]) {
    const ratings: AiRatings = { accuracy, swishRate, pace: 4, composure: 0.5, streakiness: 0, consistency: 1 }
    const r = new Rng(99 + accuracy * 1000 + swishRate * 10)
    const mood = initMood(ratings, r)
    let makes = 0
    let swishes = 0
    for (let i = 0; i < N; i++) {
      const out = simulateShot(aiShot(ratings, mood, { scoreDiff: 0, ballsLeft: 10 }, r), { fast: true })
      if (out.made) {
        makes++
        if (out.points === 2) swishes++
      }
    }
    console.log(
      `  acc=${accuracy} swish=${swishRate}  → make ${(makes / N).toFixed(3)}  swish-share ${(makes ? swishes / makes : 0).toFixed(3)}`,
    )
  }
}
