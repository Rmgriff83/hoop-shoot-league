/**
 * Assemble the 16-team league: player + 15 active authored shooters, with the
 * flex shooter moved opposite the player's conference so both stay at 8.
 */
import { ACTIVE_SHOOTERS, SHOOTERS } from '../data/shooters'
import type { Conference, SeasonState } from './types'
import type { LeagueTeam } from './season'
import type { AiRatings } from '../ai/types'

export const PLAYER_TEAM_ID = 'player'

export function buildLeagueTeams(playerConference: Conference, playerName: string, playerRatings: AiRatings): LeagueTeam[] {
  const teams: LeagueTeam[] = ACTIVE_SHOOTERS.map((s) => ({
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

/**
 * Teams for a specific season: the active league, plus any retired shooters
 * that season actually scheduled (legacy 18-team campaigns keep resolving and
 * displaying until they roll over to a fresh season).
 */
export function teamsForSeason(
  season: SeasonState,
  playerConference: Conference,
  playerName: string,
  playerRatings: AiRatings,
): LeagueTeam[] {
  const teams = buildLeagueTeams(playerConference, playerName, playerRatings)
  const present = new Set(teams.map((t) => t.id))
  const scheduled = new Set<string>()
  for (const g of season.schedule) {
    scheduled.add(g.homeId)
    scheduled.add(g.awayId)
  }
  for (const id of scheduled) {
    if (present.has(id)) continue
    const legacy = SHOOTERS.find((s) => s.id === id)
    if (legacy) {
      teams.push({
        id: legacy.id,
        conference: legacy.conference,
        name: legacy.name,
        ratings: legacy.ratings,
        isPlayer: false,
      })
    }
  }
  return teams
}
