/**
 * Ratings → physical aim error (handoff §6: "no fake dice rolls"). The AI
 * solves the ideal shot analytically, then we perturb it:
 *   swishRate → launch-angle distribution (μθ into the 52–55° window)
 *   accuracy  → speed-error sigma (speed dominates make probability: near the
 *               optimum angle, range is 1st-order insensitive to angle, so the
 *               angle knob shapes ARC quality while the speed knob shapes MAKES
 *               — exactly the skill split the handoff describes)
 * The shared physics sim resolves the result.
 *
 * SIGMA_V_TABLE is fitted by scripts/calibrate.ts (Monte-Carlo): it maps target
 * make probability → speed-error sigma (as a fraction of ideal speed).
 * Re-run `npm run calibrate` after any physics-constant change.
 */
import { speedForAngle } from '../physics/ballistics'
import type { LaunchParams } from '../physics/types'
import type { Rng } from '../rng/rng'
import { effectiveAccuracy } from './mood'
import type { AiGameMood, AiRatings, ShotSituation } from './types'

/** [makeProbability, sigmaV fraction] rows, descending probability. Fitted — see scripts/calibrate.ts. */
export const SIGMA_V_TABLE: ReadonlyArray<readonly [number, number]> = [
  [0.97, 0.002],
  [0.88, 0.005],
  [0.73, 0.008],
  [0.59, 0.012],
  [0.5, 0.017],
  [0.45, 0.023],
  [0.39, 0.03],
  [0.35, 0.04],
  [0.27, 0.055],
  [0.2, 0.075],
  [0.16, 0.1],
  [0.13, 0.13],
]

/**
 * End-to-end compensation, also fitted: the full aiShot pipeline (angle spread +
 * lateral wobble on top of speed error) makes less often than the pure-σv table
 * predicts. Rows: [desired make probability, table lookup that delivers it].
 */
const ACC_LOOKUP: ReadonlyArray<readonly [number, number]> = [
  [0.29, 0.436],
  [0.39, 0.545],
  [0.51, 0.613],
  [0.63, 0.687],
  [0.77, 0.761],
  [0.87, 0.825],
]

function lookupFor(target: number): number {
  const t = ACC_LOOKUP
  const first = t[0]!
  const last = t[t.length - 1]!
  if (target <= first[0]) return Math.max(first[1] - (first[0] - target) * 1.09, 0.1)
  if (target >= last[0]) return Math.min(last[1] + (target - last[0]) * 0.64, 0.97)
  for (let i = 0; i < t.length - 1; i++) {
    const [tLo, lLo] = t[i]!
    const [tHi, lHi] = t[i + 1]!
    if (target >= tLo && target <= tHi) {
      return lLo + ((target - tLo) / (tHi - tLo)) * (lHi - lLo)
    }
  }
  return last[1]
}

/** Interpolate the fitted table: target make probability → σv fraction. */
export function sigmaVFor(makeP: number): number {
  const t = SIGMA_V_TABLE
  if (makeP >= t[0]![0]) return t[0]![1]
  const last = t[t.length - 1]!
  if (makeP <= last[0]) return last[1]
  for (let i = 0; i < t.length - 1; i++) {
    const [pHi, sLo] = t[i]!
    const [pLo, sHi] = t[i + 1]!
    if (makeP <= pHi && makeP >= pLo) {
      const f = (pHi - makeP) / (pHi - pLo)
      return sLo + (sHi - sLo) * f
    }
  }
  return last[1]
}

/** Mean launch angle: swishRate 0.9 shooters live at ~53° — the swish window. */
export function meanAngleFor(swishRate: number): number {
  return 44 + 10 * swishRate
}

/** Angle discipline: high swishRate = tight arc selection. */
export function sigmaAngleFor(swishRate: number): number {
  return 3.4 - 2.2 * swishRate
}

/**
 * Produce one AI shot: ideal solve + rating-scaled perturbation.
 * `errorMult` is the campaign difficulty tier's sigma multiplier (handoff §10:
 * ratings stay fixed for honest standings; the tier scales error instead).
 */
export function aiShot(
  ratings: AiRatings,
  mood: AiGameMood,
  situation: ShotSituation,
  rng: Rng,
  errorMult = 1,
): LaunchParams {
  const acc = effectiveAccuracy(ratings, mood, situation)

  // Arc selection (swish discipline).
  const angleDeg = Math.min(
    Math.max(meanAngleFor(ratings.swishRate) + sigmaAngleFor(ratings.swishRate) * errorMult * rng.normal(), 35),
    66,
  )

  // Ideal speed through the rim center at that angle, then rating-scaled error
  // (compensated lookup — see ACC_LOOKUP above).
  const ideal = speedForAngle(angleDeg)!
  const sigmaV = sigmaVFor(lookupFor(acc)) * errorMult
  const speed = ideal * (1 + sigmaV * rng.normal())

  // Lateral wobble also shrinks with skill.
  const vz = (0.16 * (1 - acc) * rng.normal() + 0.02 * rng.normal()) * errorMult

  return { angleDeg, speed, vz }
}
