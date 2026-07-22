import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { ANGLE_MAX, ANGLE_MIN, DEAD_ZONE_PX, dragToLaunch, powerCurve, V_MAX, V_MIN } from '../src/core/shot/aim'

describe('drag → launch mapping', () => {
  it('angle maps 1:1 — the drag direction IS the launch angle', () => {
    for (const deg of [25, 35, 45, 52, 60, 70]) {
      const rad = (deg * Math.PI) / 180
      const d = 300
      const launch = dragToLaunch({ dx: Math.cos(rad) * d, dy: Math.sin(rad) * d, dMax: 600 })!
      expect(launch.angleDeg).toBeCloseTo(deg, 5)
    }
  })

  it('angle clamps to [20, 78]', () => {
    expect(dragToLaunch({ dx: 300, dy: 10, dMax: 600 })!.angleDeg).toBe(ANGLE_MIN)
    expect(dragToLaunch({ dx: 5, dy: 300, dMax: 600 })!.angleDeg).toBe(ANGLE_MAX)
  })

  it('dead zone cancels', () => {
    expect(dragToLaunch({ dx: 10, dy: 10, dMax: 600 })).toBeNull()
    expect(dragToLaunch({ dx: DEAD_ZONE_PX + 5, dy: 0, dMax: 600 })).not.toBeNull()
  })

  it('power curve is monotonic and spans [0,1]', () => {
    expect(powerCurve(0)).toBe(0)
    expect(powerCurve(1)).toBe(1)
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (a, b) => {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        return powerCurve(lo) <= powerCurve(hi) + 1e-12
      }),
    )
  })

  it('the useful 8.6–9.6 m/s band occupies ~55% of the drag range (power is forgiving)', () => {
    // Invert numerically: find drag fractions hitting 8.6 and 9.6 m/s.
    const speedAt = (u: number) => V_MIN + (V_MAX - V_MIN) * powerCurve(u)
    let uLo = 0
    let uHi = 1
    for (let u = 0; u <= 1; u += 0.001) {
      if (speedAt(u) < 8.6) uLo = u
      if (speedAt(u) < 9.6) uHi = u
    }
    const bandWidth = uHi - uLo
    expect(bandWidth).toBeGreaterThan(0.45)
    expect(bandWidth).toBeLessThan(0.7)
  })

  it('full drag reaches V_MAX, dead-zone edge starts at V_MIN', () => {
    const min = dragToLaunch({ dx: DEAD_ZONE_PX + 0.5, dy: 0.5, dMax: 600 })!
    expect(min.speed).toBeCloseTo(V_MIN, 1)
    const max = dragToLaunch({ dx: 900, dy: 0, dMax: 600 })!
    expect(max.speed).toBeCloseTo(V_MAX, 5)
  })
})
