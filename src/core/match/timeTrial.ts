/**
 * Time Trial: 60 seconds, halfcourt, as many points as you can. No per-shot
 * clock — the global timer is the pressure, and it's rapid fire: grab the next
 * ball the instant you release, so several balls can be in flight at once.
 * Shots released before the buzzer count when they land (buzzer beaters).
 */
import { SIM_DT } from '../physics/constants'
import { createShot, stepShot } from '../physics/shotSim'
import type { BallState, ContactEvent, LaunchParams, ShotOutcome } from '../physics/types'
import { classifyShot } from '../shot/classify'

export const TIME_TRIAL_SECONDS = 60
export const COUNTDOWN_SECONDS = 3

export type TimeTrialPhase = 'countdown' | 'running' | 'finishing' | 'done'

export type TimeTrialEvent =
  | { kind: 'go' }
  | { kind: 'pickup' }
  | { kind: 'release'; launch: LaunchParams }
  | { kind: 'contact'; contact: ContactEvent }
  | { kind: 'outcome'; outcome: ShotOutcome; buzzerBeater: boolean }
  | { kind: 'buzzer' }
  | { kind: 'done' }

interface FlightBall {
  state: BallState
  seenEvents: number
  scored: boolean
}

export class TimeTrial {
  phase: TimeTrialPhase = 'countdown'
  countdown = COUNTDOWN_SECONDS
  timeLeft = TIME_TRIAL_SECONDS
  score = 0
  makes = 0
  swishes = 0
  attempts = 0
  streak = 0
  bestStreak = 0
  holding = false
  private flights: FlightBall[] = []
  private events: TimeTrialEvent[] = []
  private accumulator = 0

  /** In-flight ball states, oldest first (renderer maps these onto a view pool). */
  get balls(): readonly BallState[] {
    return this.flights.map((f) => f.state)
  }

  drainEvents(): TimeTrialEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  /** Grab a ball — only while the clock runs and hands are empty. */
  pickup(): boolean {
    if (this.phase !== 'running' || this.holding) return false
    this.holding = true
    this.events.push({ kind: 'pickup' })
    return true
  }

  release(launch: LaunchParams): boolean {
    if (this.phase !== 'running' || !this.holding) return false
    this.holding = false
    this.attempts++
    this.flights.push({ state: createShot(launch), seenEvents: 0, scored: false })
    this.events.push({ kind: 'release', launch })
    return true
  }

  tick(dt: number): void {
    // Keeps stepping after 'done' too, so the last balls finish bouncing
    // behind the results overlay instead of freezing midair.
    if (this.phase === 'done' && this.flights.length === 0) return
    this.accumulator += dt
    while (this.accumulator >= SIM_DT) {
      this.accumulator -= SIM_DT
      this.stepFixed()
    }
  }

  private stepFixed(): void {
    if (this.phase === 'countdown') {
      this.countdown -= SIM_DT
      if (this.countdown <= 0) {
        this.phase = 'running'
        this.events.push({ kind: 'go' })
      }
      return
    }

    if (this.phase === 'running') {
      this.timeLeft -= SIM_DT
      if (this.timeLeft <= 0) {
        this.timeLeft = 0
        this.holding = false
        this.phase = 'finishing'
        this.events.push({ kind: 'buzzer' })
      }
    }

    // Step every in-flight ball; score on resolve, drop once settled.
    for (const f of this.flights) {
      if (f.state.settled) continue
      stepShot(f.state)
      while (f.seenEvents < f.state.events.length) {
        this.events.push({ kind: 'contact', contact: f.state.events[f.seenEvents++]! })
      }
      if (f.state.resolved && !f.scored) {
        f.scored = true
        const outcome = classifyShot(f.state)
        this.events.push({ kind: 'outcome', outcome, buzzerBeater: this.phase !== 'running' })
        if (outcome.made) {
          this.makes++
          if (outcome.points === 2) this.swishes++
          this.score += outcome.points
          this.streak++
          this.bestStreak = Math.max(this.bestStreak, this.streak)
        } else {
          this.streak = 0
        }
      }
    }
    this.flights = this.flights.filter((f) => !f.state.settled || !f.scored)

    if (this.phase === 'finishing' && this.flights.every((f) => f.scored)) {
      this.phase = 'done'
      this.events.push({ kind: 'done' })
    }
  }
}
