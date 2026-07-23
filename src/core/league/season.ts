/**
 * Season orchestration: 42-day regular season (one 9-game slate per day, the
 * living league — handoff §7) → playoffs → champion. Data-driven: the caller
 * says which team is the player and supplies live results; every other game is
 * quickSim'd from ratings.
 */
import type { AiRatings } from '../ai/types'
import { hashSeed } from '../rng/rng'
import { generateSchedule, seasonDaysOf, type TeamRef } from './scheduleGen'
import { quickSimGame } from './quickSim'
import { conferenceTable } from './standings'
import { advanceBracket, buildQuarterfinals, recordSeriesGame } from './playoffs'
import type { GameRecord, PlayoffSeries, SeasonState } from './types'

export interface LeagueTeam extends TeamRef {
  name: string
  ratings: AiRatings
  isPlayer: boolean
}

export interface LiveGameResult {
  playerScore: number
  oppScore: number
  playerSwishes: number
  oppSwishes: number
  otRacks: number
}

export function createSeason(teams: LeagueTeam[], year: number, seed: number): SeasonState {
  return {
    year,
    seed,
    schedule: generateSchedule(teams, hashSeed(seed, year, 'schedule')),
    currentDay: 1,
    phase: 'regular',
    series: [],
    championId: null,
  }
}

export function gamesOn(state: SeasonState, day: number): GameRecord[] {
  return state.schedule.filter((g) => g.day === day)
}

export function playerGameOn(state: SeasonState, day: number, playerId: string): GameRecord | null {
  return gamesOn(state, day).find((g) => g.homeId === playerId || g.awayId === playerId) ?? null
}

function fillGame(g: GameRecord, home: AiRatings, away: AiRatings, seasonSeed: number, year: number): void {
  const r = quickSimGame(home, away, [seasonSeed, year, g.day, g.id])
  g.homeScore = r.home.points
  g.awayScore = r.away.points
  g.homeSwishes = r.home.swishes
  g.awaySwishes = r.away.swishes
  g.otRacks = r.otRacks
  g.played = true
  g.playedLive = false
}

/**
 * Resolve the current regular-season day. If `live` is provided it is the
 * player's real match result; otherwise the player's game sims from
 * `playerSelfRatings`. Advances the day; flips to playoffs after day 42.
 */
export function resolveDay(
  state: SeasonState,
  teams: LeagueTeam[],
  playerId: string,
  playerSelfRatings: AiRatings,
  live: LiveGameResult | null,
): void {
  if (state.phase !== 'regular') return
  const ratingsOf = (id: string): AiRatings =>
    id === playerId ? playerSelfRatings : teams.find((t) => t.id === id)!.ratings
  for (const g of gamesOn(state, state.currentDay)) {
    if (g.played) continue
    const isPlayers = g.homeId === playerId || g.awayId === playerId
    if (isPlayers && live) {
      const playerIsHome = g.homeId === playerId
      g.homeScore = playerIsHome ? live.playerScore : live.oppScore
      g.awayScore = playerIsHome ? live.oppScore : live.playerScore
      g.homeSwishes = playerIsHome ? live.playerSwishes : live.oppSwishes
      g.awaySwishes = playerIsHome ? live.oppSwishes : live.playerSwishes
      g.otRacks = live.otRacks
      g.played = true
      g.playedLive = true
    } else {
      fillGame(g, ratingsOf(g.homeId), ratingsOf(g.awayId), state.seed, state.year)
    }
  }
  state.currentDay++
  if (state.currentDay > seasonDaysOf(state.schedule)) {
    startPlayoffs(state, teams)
  }
}

function startPlayoffs(state: SeasonState, teams: LeagueTeam[]): void {
  state.phase = 'playoffs'
  const east = conferenceTable(teams, 'EAST', state.schedule, state.seed)
  const west = conferenceTable(teams, 'WEST', state.schedule, state.seed)
  state.series = buildQuarterfinals(east, west)
}

export function playerSeries(state: SeasonState, playerId: string): PlayoffSeries | null {
  return (
    state.series.find(
      (s) => !s.winnerId && (s.highSeedId === playerId || s.lowSeedId === playerId),
    ) ?? null
  )
}

/**
 * Resolve one playoff step. If the player is in an unfinished series, `live`
 * must carry their next game's result (playoffs are always played live —
 * handoff §7). AI-only series resolve fully. Advances rounds and crowns a
 * champion when the bracket completes.
 */
export function resolvePlayoffStep(
  state: SeasonState,
  teams: LeagueTeam[],
  playerId: string,
  live: LiveGameResult | null,
): void {
  if (state.phase !== 'playoffs') return
  const ratingsOf = (id: string): AiRatings => teams.find((t) => t.id === id)!.ratings

  // 1) Player's series game (live).
  const mine = playerSeries(state, playerId)
  if (mine && live) {
    const playerIsHigh = mine.highSeedId === playerId
    const gameNo = mine.highWins + mine.lowWins + 1
    recordSeriesGame(
      mine,
      playerIsHigh ? live.playerScore : live.oppScore,
      playerIsHigh ? live.oppScore : live.playerScore,
    )
    mine.games.push({
      id: `${mine.id}-g${gameNo}`,
      day: seasonDaysOf(state.schedule) + gameNo,
      homeId: mine.highSeedId,
      awayId: mine.lowSeedId,
      homeScore: playerIsHigh ? live.playerScore : live.oppScore,
      awayScore: playerIsHigh ? live.oppScore : live.playerScore,
      homeSwishes: playerIsHigh ? live.playerSwishes : live.oppSwishes,
      awaySwishes: playerIsHigh ? live.oppSwishes : live.playerSwishes,
      otRacks: live.otRacks,
      playedLive: true,
      played: true,
    })
  }

  // 2) Sim AI-only series and advance rounds until the bracket either waits on
  //    the player's next live game or completes.
  for (let pass = 0; pass < 6; pass++) {
    for (const s of state.series) {
      if (s.winnerId) continue
      if (s.highSeedId === playerId || s.lowSeedId === playerId) continue
      let gameNo = s.highWins + s.lowWins
      while (!s.winnerId) {
        gameNo++
        const r = quickSimGame(ratingsOf(s.highSeedId), ratingsOf(s.lowSeedId), [state.seed, s.id, gameNo])
        recordSeriesGame(s, r.home.points, r.away.points)
        s.games.push({
          id: `${s.id}-g${gameNo}`,
          day: seasonDaysOf(state.schedule) + gameNo,
          homeId: s.highSeedId,
          awayId: s.lowSeedId,
          homeScore: r.home.points,
          awayScore: r.away.points,
          homeSwishes: r.home.swishes,
          awaySwishes: r.away.swishes,
          otRacks: r.otRacks,
          playedLive: false,
          played: true,
        })
      }
    }
    const created = advanceBracket(state.series)
    state.series.push(...created)
    const chip = state.series.find((s) => s.round === 'championship')
    if (chip?.winnerId) {
      state.championId = chip.winnerId
      state.phase = 'done'
      return
    }
    if (created.length === 0) break
  }
}
