/**
 * Head-to-head match: player and AI race through racks simultaneously, each
 * with their own shot clock and live-simulated balls. Emits a drainable event
 * stream the renderer/sfx consume. Regulation = 25-ball racks; ties go to
 * 7-ball overtime racks until decided (handoff §2 — rack stays the atomic unit).
 */
import { aiShot } from '../ai/aimError'
import { nextCadence } from '../ai/cadence'
import { initMood, updateMood } from '../ai/mood'
import type { AiGameMood, AiRatings } from '../ai/types'
import { SIM_DT } from '../physics/constants'
import { createShot, stepShot } from '../physics/shotSim'
import type { BallState, ContactEvent, LaunchParams, ShotOutcome } from '../physics/types'
import { Rng } from '../rng/rng'
import { classifyShot } from '../shot/classify'
import {
  createRack,
  OT_RACK_SIZE,
  pickupBall,
  RACK_SIZE,
  recordOutcome,
  releaseBall,
  tickClock,
  type RackState,
} from './rack'

export type SideId = 'player' | 'ai'

export type MatchEvent =
  | { kind: 'pickup'; side: SideId }
  | { kind: 'release'; side: SideId; launch: LaunchParams }
  | { kind: 'contact'; side: SideId; contact: ContactEvent }
  | { kind: 'outcome'; side: SideId; outcome: ShotOutcome; points: number }
  | { kind: 'violation'; side: SideId }
  | { kind: 'rackDone'; side: SideId }
  | { kind: 'otStart'; otNumber: number }
  | { kind: 'matchDone'; winner: SideId }

export interface SideTotals {
  points: number
  makes: number
  swishes: number
  misses: number
  violations: number
  longestStreak: number
  shots: RackState['shots']
}

interface AiDriver {
  mood: AiGameMood
  phase: 'waitPickup' | 'aiming'
  timer: number
  aimTime: number
}

export interface MatchSide {
  rack: RackState
  ball: BallState | null
  seenEvents: number
  totals: SideTotals
  ai: AiDriver | null
}

export type MatchPhase = 'regulation' | 'overtime' | 'done'

export interface MatchConfig {
  aiRatings: AiRatings
  seed: number
  /** Practice mode: no AI side at all. */
  solo?: boolean
  /** Difficulty tier sigma multiplier applied to the AI's aim error. */
  errorMult?: number
}

export class MatchEngine {
  readonly player: MatchSide
  readonly ai: MatchSide | null
  phase: MatchPhase = 'regulation'
  otNumber = 0
  winner: SideId | null = null
  private readonly rng: Rng
  private readonly config: MatchConfig
  private events: MatchEvent[] = []
  private accumulator = 0

  constructor(config: MatchConfig) {
    this.config = config
    this.rng = new Rng(config.seed)
    this.player = makeSide(null)
    this.ai = config.solo
      ? null
      : makeSide({
          mood: initMood(config.aiRatings, this.rng),
          phase: 'waitPickup',
          timer: nextCadence(config.aiRatings, { scoreDiff: 0, ballsLeft: RACK_SIZE }, this.rng).pickupDelay,
          aimTime: 0,
        })
  }

  /** Drain queued events (renderer/sfx). */
  drainEvents(): MatchEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  score(side: SideId): number {
    const s = side === 'player' ? this.player : this.ai
    return s ? s.totals.points + s.rack.points : 0
  }

  /** Player taps the rack — pick up + shot clock starts. */
  playerPickup(): boolean {
    if (this.phase === 'done') return false
    const ok = pickupBall(this.player.rack)
    if (ok) this.events.push({ kind: 'pickup', side: 'player' })
    return ok
  }

  /** Player releases the drag — ball in flight. */
  playerRelease(launch: LaunchParams): boolean {
    if (!releaseBall(this.player.rack, launch)) return false
    this.player.ball = createShot(launch)
    this.player.seenEvents = 0
    this.events.push({ kind: 'release', side: 'player', launch })
    return true
  }

  get playerAiming(): boolean {
    return this.player.rack.phase === 'aiming'
  }

  /** Advance the whole match by real dt. */
  tick(dt: number): void {
    if (this.phase === 'done') return
    this.accumulator += dt
    while (this.accumulator >= SIM_DT) {
      this.accumulator -= SIM_DT
      this.stepFixed()
    }
  }

  private stepFixed(): void {
    this.stepSide(this.player, 'player')
    if (this.ai) {
      this.driveAi()
      this.stepSide(this.ai, 'ai')
    }
    this.checkPhase()
  }

  private stepSide(side: MatchSide, id: SideId): void {
    // Shot clock.
    if (tickClock(side.rack, SIM_DT)) {
      this.events.push({ kind: 'violation', side: id })
      if (side.rack.phase === 'done') this.events.push({ kind: 'rackDone', side: id })
    }
    // In-flight ball.
    const ball = side.ball
    if (ball && !ball.settled) {
      stepShot(ball)
      while (side.seenEvents < ball.events.length) {
        this.events.push({ kind: 'contact', side: id, contact: ball.events[side.seenEvents++]! })
      }
      if (ball.resolved && side.rack.phase === 'inFlight') {
        const outcome = classifyShot(ball)
        recordOutcome(side.rack, outcome) // mutates rack.phase → idle | done
        this.events.push({ kind: 'outcome', side: id, outcome, points: outcome.points })
        if (id === 'ai' && this.ai?.ai) updateMood(this.config.aiRatings, this.ai.ai.mood, this.rng)
        if ((side.rack.phase as RackState['phase']) === 'done') this.events.push({ kind: 'rackDone', side: id })
      }
    }
  }

  private driveAi(): void {
    const side = this.ai!
    const driver = side.ai!
    if (side.rack.phase === 'done') return
    driver.timer -= SIM_DT
    if (driver.phase === 'waitPickup') {
      if (side.rack.phase === 'idle' && driver.timer <= 0) {
        pickupBall(side.rack)
        this.events.push({ kind: 'pickup', side: 'ai' })
        const cadence = nextCadence(this.config.aiRatings, this.situationFor('ai'), this.rng)
        driver.phase = 'aiming'
        driver.timer = cadence.aimTime
      }
    } else if (driver.phase === 'aiming' && side.rack.phase === 'aiming' && driver.timer <= 0) {
      const launch = aiShot(this.config.aiRatings, driver.mood, this.situationFor('ai'), this.rng, this.config.errorMult ?? 1)
      releaseBall(side.rack, launch)
      side.ball = createShot(launch)
      side.seenEvents = 0
      this.events.push({ kind: 'release', side: 'ai', launch })
      driver.phase = 'waitPickup'
      driver.timer = nextCadence(this.config.aiRatings, this.situationFor('ai'), this.rng).pickupDelay
    } else if (driver.phase === 'aiming' && side.rack.phase === 'idle') {
      // Clock expired while "aiming" (deliberate rare freeze-up) — reset cadence.
      driver.phase = 'waitPickup'
      driver.timer = nextCadence(this.config.aiRatings, this.situationFor('ai'), this.rng).pickupDelay
    }
  }

  private situationFor(id: SideId) {
    const own = this.score(id)
    const opp = this.score(id === 'player' ? 'ai' : 'player')
    const side = id === 'player' ? this.player : this.ai!
    return { scoreDiff: own - opp, ballsLeft: side.rack.size - side.rack.ballIndex }
  }

  private checkPhase(): void {
    if (!this.ai) {
      // Practice: done when the rack is done and the last ball settled.
      if (this.player.rack.phase === 'done' && (!this.player.ball || this.player.ball.resolved)) {
        this.phase = 'done'
      }
      return
    }
    if (this.player.rack.phase !== 'done' || this.ai.rack.phase !== 'done') return
    // Let in-flight visuals resolve before deciding (both racks report done
    // only after their last outcome, so balls are resolved by construction).
    foldRack(this.player)
    foldRack(this.ai)
    const p = this.player.totals.points
    const a = this.ai.totals.points
    if (p !== a) {
      this.phase = 'done'
      this.winner = p > a ? 'player' : 'ai'
      this.events.push({ kind: 'matchDone', winner: this.winner })
      return
    }
    // Tied → 7-shot overtime rack (repeat until decided).
    this.otNumber++
    this.phase = 'overtime'
    this.player.rack = createRack(OT_RACK_SIZE)
    this.ai.rack = createRack(OT_RACK_SIZE)
    this.player.ball = null
    this.ai.ball = null
    if (this.ai.ai) {
      this.ai.ai.phase = 'waitPickup'
      this.ai.ai.timer = nextCadence(this.config.aiRatings, { scoreDiff: 0, ballsLeft: OT_RACK_SIZE }, this.rng).pickupDelay
    }
    this.events.push({ kind: 'otStart', otNumber: this.otNumber })
  }
}

function makeSide(ai: AiDriver | null): MatchSide {
  return {
    rack: createRack(RACK_SIZE),
    ball: null,
    seenEvents: 0,
    totals: { points: 0, makes: 0, swishes: 0, misses: 0, violations: 0, longestStreak: 0, shots: [] },
    ai,
  }
}

/** Fold a finished rack into the side's running totals. */
function foldRack(side: MatchSide): void {
  const r = side.rack
  side.totals.points += r.points
  side.totals.makes += r.makes
  side.totals.swishes += r.swishes
  side.totals.misses += r.misses
  side.totals.violations += r.violations
  side.totals.longestStreak = Math.max(side.totals.longestStreak, r.longestStreak)
  side.totals.shots.push(...r.shots)
  // Zero the rack's counters so score() (totals + live rack) stays correct
  // while the rack object is replaced on OT start.
  r.points = 0
}
