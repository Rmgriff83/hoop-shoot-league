import { describe, expect, it } from 'vitest'
import {
  ballsLeft,
  createRack,
  OT_RACK_SIZE,
  pickupBall,
  RACK_SIZE,
  recordOutcome,
  releaseBall,
  SHOT_CLOCK,
  tickClock,
} from '../src/core/match/rack'
import type { ShotOutcome } from '../src/core/physics/types'

const SWISH: ShotOutcome = {
  made: true,
  points: 2,
  type: 'SWISH',
  entryAngleDeg: 46,
  rimContacts: 0,
  boardContacts: 0,
  flightTime: 1.3,
  events: [],
  maxPenetration: 0,
}
const MAKE: ShotOutcome = { ...SWISH, points: 1, type: 'MAKE', rimContacts: 1 }
const MISS: ShotOutcome = { ...SWISH, made: false, points: 0, type: 'FRONT_RIM', rimContacts: 1 }

const LAUNCH = { angleDeg: 52, speed: 9.03 }

describe('rack state machine', () => {
  it('full rack: 25 balls, mixed outcomes, correct box score', () => {
    const r = createRack()
    for (let i = 0; i < RACK_SIZE; i++) {
      expect(pickupBall(r)).toBe(true)
      expect(releaseBall(r, LAUNCH)).toBe(true)
      recordOutcome(r, i % 5 === 0 ? SWISH : i % 2 === 0 ? MAKE : MISS)
    }
    expect(r.phase).toBe('done')
    expect(r.ballIndex).toBe(25)
    expect(ballsLeft(r)).toBe(0)
    // i%5==0 → 5 swishes; other evens → 10 rim makes; 10 odd misses
    expect(r.swishes).toBe(5)
    expect(r.makes).toBe(15)
    expect(r.misses).toBe(10)
    expect(r.points).toBe(5 * 2 + 10 * 1)
    expect(r.shots).toHaveLength(25)
  })

  it('shot clock expiry loses the ball: violation, no points, next ball', () => {
    const r = createRack()
    pickupBall(r)
    expect(tickClock(r, 1)).toBe(false)
    expect(tickClock(r, 2.5)).toBe(true) // crosses 3s
    expect(r.violations).toBe(1)
    expect(r.ballIndex).toBe(1)
    expect(r.phase).toBe('idle')
    expect(r.shots[0]!.type).toBe('VIOLATION')
    expect(r.shots[0]!.points).toBe(0)
  })

  it('clock only runs while aiming; release stops it', () => {
    const r = createRack()
    expect(tickClock(r, 5)).toBe(false) // idle — nothing happens
    pickupBall(r)
    tickClock(r, 1.2)
    releaseBall(r, LAUNCH)
    expect(tickClock(r, 5)).toBe(false) // in flight — clock stopped
    recordOutcome(r, MAKE)
    expect(r.shots[0]!.clockUsed).toBeCloseTo(1.2, 5)
    expect(r.violations).toBe(0)
  })

  it('streak tracking: makes chain, misses and violations break', () => {
    const r = createRack()
    const play = (o: ShotOutcome) => {
      pickupBall(r)
      releaseBall(r, LAUNCH)
      recordOutcome(r, o)
    }
    play(MAKE)
    play(SWISH)
    play(MAKE)
    expect(r.currentStreak).toBe(3)
    play(MISS)
    expect(r.currentStreak).toBe(0)
    play(MAKE)
    play(MAKE)
    pickupBall(r)
    tickClock(r, SHOT_CLOCK + 0.1)
    expect(r.currentStreak).toBe(0)
    expect(r.longestStreak).toBe(3)
  })

  it('overtime rack is 7 balls', () => {
    const r = createRack(OT_RACK_SIZE)
    for (let i = 0; i < OT_RACK_SIZE; i++) {
      pickupBall(r)
      releaseBall(r, LAUNCH)
      recordOutcome(r, MAKE)
    }
    expect(r.phase).toBe('done')
    expect(pickupBall(r)).toBe(false)
  })

  it('illegal transitions are no-ops', () => {
    const r = createRack()
    expect(releaseBall(r, LAUNCH)).toBe(false) // not aiming
    recordOutcome(r, MAKE) // not in flight — ignored
    expect(r.points).toBe(0)
    pickupBall(r)
    expect(pickupBall(r)).toBe(false) // already aiming
  })
})
