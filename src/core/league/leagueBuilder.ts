/**
 * Assemble the 18-team league: player + 17 authored shooters, with the flex
 * shooter moved opposite the player's conference so both stay 9/9.
 */
import { SHOOTERS } from '../data/shooters'
import type { Conference } from './types'
import type { LeagueTeam } from './season'
import type { AiRatings } from '../ai/types'

export const PLAYER_TEAM_ID = 'player'

export function buildLeagueTeams(playerConference: Conference, playerName: string, playerRatings: AiRatings): LeagueTeam[] {
  const teams: LeagueTeam[] = SHOOTERS.map((s) => ({
    id: s.id,
    conference: s.flex ? (playerConference === 'EAST' ? 'WEST' : 'EAST') : s.conference,
    name: s.name,
    ratings: s.ratings,
    isPlayer: false,
  }))
  teams.push({
    id: PLAYER_TEAM_ID,
    conference: playerConference,
    name: playerName,
    ratings: playerRatings,
    isPlayer: true,
  })
  return teams
}
