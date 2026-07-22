import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { idealLaunch, speedForAngle } from '../src/core/physics/ballistics'
import { createShot, simulateShot, stepShot } from '../src/core/physics/shotSim'
import { classifyShot } from '../src/core/shot/classify'
import type { LaunchParams } from '../src/core/physics/types'

describe('emergent swish physics (handoff §3-4 — the design gift)', () => {
  it('ideal high-arc shots (52°, 55°) swish: 2 points, zero rim contact', () => {
    for (const angle of [52, 55]) {
      const out = simulateShot(idealLaunch(angle)!)
      expect(out.made, `${angle}° should drop`).toBe(true)
      expect(out.type, `${angle}° should be clean`).toBe('SWISH')
      expect(out.points).toBe(2)
      expect(out.entryAngleDeg).toBeGreaterThan(43)
    }
  })

  it('a flat 42° rope arrives at ~32° and cannot swish — rim contact is physics, not script', () => {
    const out = simulateShot(idealLaunch(42)!)
    expect(out.rimContacts).toBeGreaterThan(0)
    expect(out.type).not.toBe('SWISH')
  })

  it('short shot clips the front rim and kicks back toward the shooter', () => {
    // ~3% under-powered at a flat angle → front rim.
    const v = speedForAngle(45)!
    const out = simulateShot({ angleDeg: 45, speed: v * 0.965 })
    expect(out.made).toBe(false)
    expect(['FRONT_RIM', 'IN_AND_OUT', 'AIRBALL']).toContain(out.type)
    if (out.type === 'FRONT_RIM') {
      // First rim contact should send the ball back (−x) or pop it up.
      const first = out.events.find((e) => e.kind === 'rim')!
      expect(first.normal.x).toBeLessThan(0.4)
    }
  })

  it('long shot catches back rim or banks', () => {
    const v = speedForAngle(48)!
    const out = simulateShot({ angleDeg: 48, speed: v * 1.04 })
    expect(out.made === false || out.type === 'BANK' || out.rimContacts > 0).toBe(true)
    if (!out.made) expect(['BACK_RIM', 'BOARD_MISS', 'IN_AND_OUT']).toContain(out.type)
  })

  it('lateral error produces side-rim results', () => {
    const v = speedForAngle(50)!
    const out = simulateShot({ angleDeg: 50, speed: v, vz: 0.18 })
    // Enough sideways drift that a dead-center-speed ball clips the side of the cylinder.
    expect(out.rimContacts).toBeGreaterThan(0)
    const first = out.events.find((e) => e.kind === 'rim')!
    expect(Math.abs(first.pos.z)).toBeGreaterThan(0.05)
  })

  it('way-off shots are airballs', () => {
    const out = simulateShot({ angleDeg: 45, speed: 7.2 })
    expect(out.type).toBe('AIRBALL')
    expect(out.points).toBe(0)
  })
})

describe('rim–board gap trap (mounting bracket fix)', () => {
  it('long square back-rim misses never come to rest behind the rim', () => {
    // Sweep the launches most likely to land on the back rim / gap shelf.
    for (const angle of [46, 48, 50, 52, 55]) {
      const v = speedForAngle(angle)!
      for (const over of [1.03, 1.04, 1.05, 1.06, 1.07]) {
        for (const vz of [0, 0.08, 0.16]) {
          const out = simulateShot({ angleDeg: angle, speed: v * over, vz })
          const last = out.events[out.events.length - 1]
          const rest = last?.pos
          const inTrap = rest !== undefined && rest.x > 7.44 && rest.x < 7.63 && rest.y > 2.85
          // The final logged event must not sit in the trap box while the sim
          // just timed out (a shed ball keeps moving and logs floor events).
          expect(
            inTrap && out.flightTime > 0 && last!.t > 4.5,
            `${angle}° ×${over} vz=${vz} rested in the rim–board gap`,
          ).toBe(false)
        }
      }
    }
  })

  it('a ball dropped into the gap region resolves fast and never parks behind the rim', () => {
    const s = createShot({ angleDeg: 50, speed: speedForAngle(50)! })
    // Hand-place it nearly motionless above the old trap shelf.
    s.pos = { x: 7.55, y: 3.2, z: 0 }
    s.vel = { x: 0.05, y: 0, z: 0 }
    const t0 = s.t
    for (let i = 0; i < 1200 && !s.settled; i++) stepShot(s)
    expect(s.settled).toBe(true)
    // Sheds off the bracket promptly (either drops in — a legit lucky bank —
    // or falls out); it must never sit in the gap until the 7 s hard stop.
    expect(s.t - t0).toBeLessThan(3)
    const parkedInGap = s.pos.x > 7.44 && s.pos.x < 7.63 && s.pos.y > 2.85
    expect(parkedInGap).toBe(false)
    // classifyShot still terminates cleanly on this synthetic state.
    expect(typeof classifyShot(s).type).toBe('string')
  })
})

describe('determinism', () => {
  it('same launch → byte-identical event log and outcome', () => {
    const launch: LaunchParams = { angleDeg: 47.3, speed: 9.11, vz: 0.05 }
    const a = simulateShot(launch)
    const b = simulateShot(launch)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('no tunneling (property)', () => {
  it('penetration never exceeds 2 cm across random plausible launches', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 30, max: 70, noNaN: true }),
        fc.double({ min: 7.5, max: 11, noNaN: true }),
        fc.double({ min: -0.6, max: 0.6, noNaN: true }),
        (angleDeg, speed, vz) => {
          const out = simulateShot({ angleDeg, speed, vz })
          return out.maxPenetration < 0.02
        },
      ),
      { numRuns: 300 },
    )
  })

  it('every simulated shot terminates with a classified outcome', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 78, noNaN: true }),
        fc.double({ min: 6, max: 12, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (angleDeg, speed, vz) => {
          const out = simulateShot({ angleDeg, speed, vz })
          return typeof out.type === 'string' && (out.made ? out.points >= 1 : out.points === 0)
        },
      ),
      { numRuns: 300 },
    )
  })
})
