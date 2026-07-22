import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AiRatings } from '../core/ai/types'
import type { SideTotals } from '../core/match/matchEngine'

export interface OpponentInfo {
  id: string
  name: string
  hometown: string
  nickname?: string
  ratings: AiRatings
  colors: { primary: string; secondary: string; accent: string }
}

export interface MatchResult {
  won: boolean
  playerScore: number
  aiScore: number
  otNumber: number
  player: SideTotals
  ai: SideTotals | null
  opponent: OpponentInfo
}

/** Default quick-match opponent until the league (Phase 6) provides real ones. */
export const QUICK_MATCH_OPPONENT: OpponentInfo = {
  id: 'quick-rival',
  name: 'Ricky Buckets',
  hometown: 'Practice Gym',
  nickname: 'The Wall',
  ratings: { accuracy: 0.5, swishRate: 0.5, pace: 4.2, composure: 0.5, streakiness: 0.4, consistency: 0.7 },
  colors: { primary: '#9d7bff', secondary: '#6c4fd1', accent: '#ffd93d' },
}

export const useMatchStore = defineStore('match', () => {
  const opponent = ref<OpponentInfo>(QUICK_MATCH_OPPONENT)
  const result = ref<MatchResult | null>(null)
  /** Set when the match belongs to a league game (Phase 6+). */
  const leagueGameId = ref<string | null>(null)

  function setupQuickMatch() {
    opponent.value = QUICK_MATCH_OPPONENT
    leagueGameId.value = null
    result.value = null
  }

  return { opponent, result, leagueGameId, setupQuickMatch }
})
