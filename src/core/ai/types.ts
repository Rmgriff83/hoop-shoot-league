/** Difficulty/performance ratings (handoff §6). All 0..1 except pace (seconds per shot). */
export interface AiRatings {
  /** Base make probability — drives aim-error magnitude. */
  accuracy: number
  /** Of makes, share that are clean — biases launch angle into the 52–55° window. */
  swishRate: number
  /** Seconds per shot cycle — cadence on the live view. */
  pace: number
  /** Performance shift when trailing/leading under pressure. */
  composure: number
  /** Hot-and-cold variance vs. metronome. */
  streakiness: number
  /** How tightly results cluster around the mean game-to-game. */
  consistency: number
}

/** Per-game mutable mood — created at tipoff, updated after every shot. */
export interface AiGameMood {
  /** Two-state Markov: +1 hot, −1 cold. */
  streakState: 1 | -1
  /** Per-game accuracy offset drawn at tipoff from (1 − consistency). */
  gameOffset: number
}

export interface ShotSituation {
  /** Own score minus opponent score at the moment of the shot. */
  scoreDiff: number
  ballsLeft: number
}
