import { describe, expect, it } from 'vitest'
import { MatchEngine, type MatchEvent } from '../src/core/match/matchEngine'
import { createRack } from '../src/core/match/rack'
import { aiShot } from '../src/core/ai/aimError'
import { initMood } from '../src/core/ai/mood'
import type { AiRatings } from '../src/core/ai/types'
import { Rng } from '../src/core/rng/rng'
import { SIM_DT } from '../src/core/physics/constants'

const RATINGS: AiRatings = { accuracy: 0.55, swishRate: 0.6, pace: 3, composure: 0.5, streakiness: 0.3, consistency: 0.8 }

/** Drive the player like a decent shooter: pickup when idle, release after a beat. */
function runMatch(engine: MatchEngine, playerAccuracy: number, seed: number, maxSeconds = 900): MatchEvent[] {
  const rng = new Rng(seed)
  const ratings: AiRatings = { ...RATINGS, accuracy: playerAccuracy }
  const mood = initMood(ratings, rng)
  const events: MatchEvent[] = []
  let holdTimer = 0.8
  for (let t = 0; t < maxSeconds && engine.phase !== 'done'; t += SIM_DT) {
    if (engine.player.rack.phase === 'idle') {
      engine.playerPickup()
      holdTimer = 0.6 + rng.next()
    } else if (engine.playerAiming) {
      holdTimer -= SIM_DT
      if (holdTimer <= 0) {
        engine.playerRelease(aiShot(ratings, mood, { scoreDiff: 0, ballsLeft: 5 }, rng))
      }
    }
    engine.tick(SIM_DT)
    events.push(...engine.drainEvents())
  }
  return events
}

describe('match engine', () => {
  it('plays a full head-to-head match to a winner with coherent totals', () => {
    const engine = new MatchEngine({ aiRatings: RATINGS, seed: 42 })
    const events = runMatch(engine, 0.65, 1)

    expect(engine.phase).toBe('done')
    expect(engine.winner).not.toBeNull()
    expect(events.some((e) => e.kind === 'matchDone')).toBe(true)

    for (const side of [engine.player, engine.ai!]) {
      const t = side.totals
      // 25 regulation shots (+ 7 per OT), every ball accounted for.
      expect(t.shots.length % 7 === 4 || t.shots.length === 25).toBe(true)
      expect(t.makes + t.misses + t.violations).toBe(t.shots.length)
      // Score arithmetic: swishes worth 2, other makes 1.
      expect(t.points).toBe(t.swishes * 2 + (t.makes - t.swishes))
    }
    // AI shot on a human rhythm: pickups and releases alternate, never instant.
    const aiReleases = events.filter((e) => e.kind === 'release' && e.side === 'ai')
    expect(aiReleases.length).toBeGreaterThan(15)
  })

  it('tie after regulation → 7-shot OT racks until decided', () => {
    const engine = new MatchEngine({ aiRatings: RATINGS, seed: 7 })
    // Force a 1-ball regulation "rack" for both sides so a 0-0 tie is easy to hit:
    // both shooters brick on purpose via impossible launches.
    engine.player.rack = createRack(1)
    engine.ai!.rack = createRack(1)
    const events: MatchEvent[] = []
    let released = false
    for (let t = 0; t < 400 && engine.phase === 'regulation'; t += SIM_DT) {
      if (!released && engine.player.rack.phase === 'idle') {
        engine.playerPickup()
        engine.playerRelease({ angleDeg: 45, speed: 6 }) // guaranteed airball
        released = true
      }
      engine.tick(SIM_DT)
      events.push(...engine.drainEvents())
      // Make the AI brick too: hijack its ball at release with an airball.
      const rel = events.find((e) => e.kind === 'release' && e.side === 'ai')
      if (rel && engine.ai!.ball && engine.ai!.ball.t < SIM_DT * 2) {
        engine.ai!.ball.vel.x = 3
        engine.ai!.ball.vel.y = 3
      }
    }
    expect(engine.phase).toBe('overtime')
    expect(engine.otNumber).toBe(1)
    expect(engine.player.rack.size).toBe(7)
    expect(engine.ai!.rack.size).toBe(7)
    expect(events.some((e) => e.kind === 'otStart')).toBe(true)
  })

  it('solo practice mode finishes when the rack is done', () => {
    const engine = new MatchEngine({ aiRatings: RATINGS, seed: 3, solo: true })
    engine.player.rack = createRack(2)
    for (let t = 0; t < 120 && engine.phase !== 'done'; t += SIM_DT) {
      if (engine.player.rack.phase === 'idle') {
        engine.playerPickup()
        engine.playerRelease({ angleDeg: 52, speed: 9.03 })
      }
      engine.tick(SIM_DT)
    }
    expect(engine.phase).toBe('done')
    expect(engine.ai).toBeNull()
    expect(engine.player.rack.makes).toBe(2) // ideal 52° swishes
  })
})
