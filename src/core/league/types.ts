import type { AiRatings } from '../ai/types'

export type Conference = 'EAST' | 'WEST'

/** Full authored shooter config (handoff §6 schema). */
export interface ShooterConfig {
  id: string
  name: string
  /** Team affiliation IS their hometown. */
  hometown: string
  conference: Conference
  number: number
  nickname: string
  bio: string
  colors: { primary: string; secondary: string; accent: string }
  signature: string
  ratings: AiRatings
  /** This shooter moves to the conference opposite the player's to keep 9/9. */
  flex?: boolean
}

/** One league game (box-score level — §8 volume note). */
export interface GameRecord {
  id: string
  day: number
  homeId: string
  awayId: string
  homeScore: number
  awayScore: number
  homeSwishes: number
  awaySwishes: number
  otRacks: number
  /** True when the player played this live (full shot log stored separately). */
  playedLive: boolean
  played: boolean
}

export interface StandingRow {
  teamId: string
  w: number
  l: number
  pct: number
  pointsFor: number
  pointsAgainst: number
  /** Conference seed 1..9 after sorting. */
  seed?: number
}

export type SeriesRound = 'quarterfinal' | 'conferenceFinal' | 'championship'

export interface PlayoffSeries {
  id: string
  round: SeriesRound
  conference: Conference | null // null = championship
  highSeedId: string
  lowSeedId: string
  bestOf: 3 | 5
  highWins: number
  lowWins: number
  winnerId: string | null
  games: GameRecord[]
}

export type SeasonPhase = 'regular' | 'playoffs' | 'done'

export interface SeasonState {
  year: number
  seed: number
  /** 42 days × 9 games (ids into games map). */
  schedule: GameRecord[]
  currentDay: number
  phase: SeasonPhase
  series: PlayoffSeries[]
  championId: string | null
}
