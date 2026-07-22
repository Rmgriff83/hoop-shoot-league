import { describe, expect, it } from 'vitest'
import { apexHeight, entryAngle, flightTime, speedForAngle } from '../src/core/physics/ballistics'

/**
 * The handoff §3 table is the ground truth. If these drift, the game's feel
 * contract is broken — fix the physics, never the fixtures.
 */
const TABLE = [
  { angle: 42, speed: 9.14, apex: 4.01, time: 1.07, entry: 32.5 },
  { angle: 45, speed: 9.04, apex: 4.18, time: 1.13, entry: 36.4 },
  { angle: 48, speed: 9.0, apex: 4.38, time: 1.2, entry: 40.3 },
  { angle: 52, speed: 9.03, apex: 4.68, time: 1.3, entry: 45.5 },
  { angle: 55, speed: 9.12, apex: 4.95, time: 1.38, entry: 49.4 },
]

describe('validated launch solutions (handoff §3)', () => {
  for (const row of TABLE) {
    it(`launch ${row.angle}° → v=${row.speed} m/s, apex ${row.apex} m, t=${row.time} s, entry ${row.entry}°`, () => {
      const v = speedForAngle(row.angle)
      expect(v).not.toBeNull()
      expect(v!).toBeCloseTo(row.speed, 1)
      expect(apexHeight(row.angle, v!)).toBeCloseTo(row.apex, 1)
      expect(flightTime(row.angle, v!)).toBeCloseTo(row.time, 1)
      expect(entryAngle(row.angle, v!)).toBeCloseTo(row.entry, 0)
    })
  }

  it('velocity curve is flat: 9.0–9.4 m/s across 40–58°', () => {
    for (let a = 40; a <= 58; a++) {
      const v = speedForAngle(a)!
      expect(v).toBeGreaterThan(8.9)
      expect(v).toBeLessThan(9.45)
    }
  })

  it('unreachable angles return null', () => {
    expect(speedForAngle(5)).toBeNull()
    expect(speedForAngle(-10)).toBeNull()
  })
})
