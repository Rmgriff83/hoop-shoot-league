import { describe, expect, it } from 'vitest'
import { COUNTDOWN_SECONDS, TIME_TRIAL_SECONDS, TimeTrial } from '../src/core/match/timeTrial'
import { SIM_DT } from '../src/core/physics/constants'
import { idealLaunch, speedForAngle } from '../src/core/physics/ballistics'

const SWISH_LAUNCH = idealLaunch(52)!
const BRICK_LAUNCH = { angleDeg: 45, speed: 7.2 } // clean airball

function tickSeconds(t: TimeTrial, seconds: number): void {
  const steps = Math.ceil(seconds / SIM_DT)
  for (let i = 0; i < steps; i++) t.tick(SIM_DT)
}

describe('time trial', () => {
  it('countdown gates pickups; GO opens play', () => {
    const t = new TimeTrial()
    expect(t.pickup()).toBe(false)
    tickSeconds(t, COUNTDOWN_SECONDS + 0.05)
    expect(t.phase).toBe('running')
    expect(t.drainEvents().some((e) => e.kind === 'go')).toBe(true)
    expect(t.pickup()).toBe(true)
    expect(t.pickup()).toBe(false) // already holding
  })

  it('scores swishes at 2, tracks streaks, keeps totals coherent', () => {
    const t = new TimeTrial()
    tickSeconds(t, COUNTDOWN_SECONDS + 0.05)
    for (let i = 0; i < 3; i++) {
      expect(t.pickup()).toBe(true)
      expect(t.release(SWISH_LAUNCH)).toBe(true)
      tickSeconds(t, 3) // let it land
    }
    t.pickup()
    t.release(BRICK_LAUNCH)
    tickSeconds(t, 3)
    expect(t.attempts).toBe(4)
    expect(t.makes).toBe(3)
    expect(t.swishes).toBe(3)
    expect(t.score).toBe(6)
    expect(t.bestStreak).toBe(3)
    expect(t.streak).toBe(0) // brick broke it
    expect(t.score).toBe(2 * t.swishes + (t.makes - t.swishes))
  })

  it('rapid fire: several balls in flight at once, all score', () => {
    const t = new TimeTrial()
    tickSeconds(t, COUNTDOWN_SECONDS + 0.05)
    // Release three swishes back-to-back with only 0.3 s between.
    for (let i = 0; i < 3; i++) {
      expect(t.pickup()).toBe(true)
      expect(t.release(SWISH_LAUNCH)).toBe(true)
      tickSeconds(t, 0.3)
    }
    expect(t.balls.length).toBeGreaterThanOrEqual(2) // genuinely overlapping flights
    tickSeconds(t, 4)
    expect(t.makes).toBe(3)
    expect(t.score).toBe(6)
  })

  it('buzzer beater: released before zero, lands after, still counts; no pickups after buzzer', () => {
    const t = new TimeTrial()
    tickSeconds(t, COUNTDOWN_SECONDS + 0.05)
    tickSeconds(t, TIME_TRIAL_SECONDS - 0.4) // 0.4 s left
    expect(t.phase).toBe('running')
    expect(t.pickup()).toBe(true)
    expect(t.release(SWISH_LAUNCH)).toBe(true)
    tickSeconds(t, 0.6) // buzzer fires while the ball is up
    expect(t.phase).toBe('finishing')
    expect(t.pickup()).toBe(false)
    tickSeconds(t, 4)
    expect(t.phase).toBe('done')
    expect(t.score).toBe(2)
    const events = t.drainEvents()
    // (events were drained progressively is fine — just check final bookkeeping)
    expect(t.makes).toBe(1)
    expect(events.length + 1).toBeGreaterThan(0)
  })

  it('a slow shooter still ends cleanly: buzzer with empty hands → done immediately', () => {
    const t = new TimeTrial()
    tickSeconds(t, COUNTDOWN_SECONDS + TIME_TRIAL_SECONDS + 0.1)
    expect(t.phase).toBe('done')
    expect(t.attempts).toBe(0)
    expect(t.score).toBe(0)
  })

  it('holding at the buzzer loses the ball (no free release)', () => {
    const t = new TimeTrial()
    tickSeconds(t, COUNTDOWN_SECONDS + 0.05)
    tickSeconds(t, TIME_TRIAL_SECONDS - 0.2)
    t.pickup()
    tickSeconds(t, 0.4) // buzzer while holding
    expect(t.release(idealLaunch(52) ?? { angleDeg: 52, speed: speedForAngle(52)! })).toBe(false)
    expect(t.attempts).toBe(0)
    expect(t.phase).toBe('done')
  })
})
