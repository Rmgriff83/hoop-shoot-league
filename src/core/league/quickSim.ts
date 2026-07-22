/**
 * Cheap rating-based resolution for games the player isn't watching
 * (handoff §6/§7): 25 Bernoulli draws per shooter with streak modulation and
 * an empirical swish split, 7-shot OT racks until untied. Seeded per game →
 * reproducible box scores, no physics.
 */
import { hashSeed, Rng } from '../rng/rng'
import type { AiRatings } from '../ai/types'

export interface QuickBox {
  points: number
  makes: number
  swishes: number
  shots: number
}

export interface QuickResult {
  home: QuickBox
  away: QuickBox
  otRacks: number
}

/**
 * Fitted vs the physics pipeline (scripts/calibrate.ts sweep): observed swish
 * share of makes ≈ 0.05 + 0.30·accuracy·swishRate. Keeps simmed box scores in
 * the same universe as physics games.
 */
export function effectiveSwishShare(r: AiRatings): number {
  return Math.min(0.05 + 0.3 * r.accuracy * r.swishRate, 0.75)
}

function simRack(r: AiRatings, rng: Rng, size: number): QuickBox {
  const swishShare = effectiveSwishShare(r)
  let streak: 1 | -1 = rng.next() < 0.5 ? 1 : -1
  const box: QuickBox = { points: 0, makes: 0, swishes: 0, shots: size }
  for (let i = 0; i < size; i++) {
    const p = Math.min(Math.max(r.accuracy + streak * 0.06 * r.streakiness, 0.05), 0.97)
    if (rng.next() < p) {
      box.makes++
      if (rng.next() < swishShare) {
        box.swishes++
        box.points += 2
      } else {
        box.points += 1
      }
    }
    const stay = 0.5 + 0.45 * r.streakiness
    if (rng.next() > stay) streak = streak === 1 ? -1 : 1
  }
  return box
}

function addBox(a: QuickBox, b: QuickBox): QuickBox {
  return {
    points: a.points + b.points,
    makes: a.makes + b.makes,
    swishes: a.swishes + b.swishes,
    shots: a.shots + b.shots,
  }
}

export function quickSimGame(
  homeRatings: AiRatings,
  awayRatings: AiRatings,
  seedParts: (string | number)[],
): QuickResult {
  const rng = new Rng(hashSeed(...seedParts))
  let home = simRack(homeRatings, rng, 25)
  let away = simRack(awayRatings, rng, 25)
  let otRacks = 0
  while (home.points === away.points) {
    otRacks++
    home = addBox(home, simRack(homeRatings, rng, 7))
    away = addBox(away, simRack(awayRatings, rng, 7))
    if (otRacks > 20) {
      // Pathological equal-rating loop guard: nudge with a tiebreak rack of 1.
      if (rng.next() < 0.5) home = addBox(home, { points: 1, makes: 1, swishes: 0, shots: 1 })
      else away = addBox(away, { points: 1, makes: 1, swishes: 0, shots: 1 })
      break
    }
  }
  return { home, away, otRacks }
}
