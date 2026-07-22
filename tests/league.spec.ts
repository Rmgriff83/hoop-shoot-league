import { describe, expect, it } from 'vitest'
import { generateSchedule, SEASON_DAYS, type TeamRef } from '../src/core/league/scheduleGen'
import { quickSimGame } from '../src/core/league/quickSim'
import { conferenceTable, gamesBehind } from '../src/core/league/standings'
import { SHOOTERS } from '../src/core/data/shooters'
import {
  createSeason,
  playerGameOn,
  playerSeries,
  resolveDay,
  resolvePlayoffStep,
  type LeagueTeam,
} from '../src/core/league/season'
import type { AiRatings } from '../src/core/ai/types'

function leagueTeams(playerConference: 'EAST' | 'WEST' = 'EAST'): LeagueTeam[] {
  const teams: LeagueTeam[] = SHOOTERS.map((s) => ({
    id: s.id,
    conference: s.flex ? (playerConference === 'EAST' ? 'WEST' : 'EAST') : s.conference,
    name: s.name,
    ratings: s.ratings,
    isPlayer: false,
  }))
  teams.push({
    id: 'player',
    conference: playerConference,
    name: 'You',
    ratings: { accuracy: 0.55, swishRate: 0.5, pace: 4, composure: 0.6, streakiness: 0.4, consistency: 0.75 },
    isPlayer: true,
  })
  return teams
}

describe('authored league', () => {
  it('17 AI shooters; flex balancing gives 9/9 for either player conference', () => {
    expect(SHOOTERS).toHaveLength(17)
    for (const conf of ['EAST', 'WEST'] as const) {
      const teams = leagueTeams(conf)
      expect(teams.filter((t) => t.conference === 'EAST')).toHaveLength(9)
      expect(teams.filter((t) => t.conference === 'WEST')).toHaveLength(9)
    }
  })
})

describe('schedule generation (property: handoff §7 exactly)', () => {
  it('378 games, 42 days × 9, everyone plays daily, ×3 conference ×2 cross', () => {
    for (const seed of [1, 77, 4242]) {
      const teams = leagueTeams()
      const schedule = generateSchedule(teams, seed)
      expect(schedule).toHaveLength(378)

      const pairCounts = new Map<string, number>()
      for (let day = 1; day <= SEASON_DAYS; day++) {
        const games = schedule.filter((g) => g.day === day)
        expect(games, `day ${day}`).toHaveLength(9)
        const seen = new Set<string>()
        for (const g of games) {
          seen.add(g.homeId)
          seen.add(g.awayId)
          const key = [g.homeId, g.awayId].sort().join('|')
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
        }
        expect(seen.size, `day ${day} participation`).toBe(18)
      }

      const byId = new Map(teams.map((t) => [t.id, t]))
      for (const [key, count] of pairCounts) {
        const [a, b] = key.split('|') as [string, string]
        const sameConf = byId.get(a)!.conference === byId.get(b)!.conference
        expect(count, `${key}`).toBe(sameConf ? 3 : 2)
      }
    }
  })
})

describe('quickSim', () => {
  it('is deterministic per seed and never ties', () => {
    const a: AiRatings = { accuracy: 0.6, swishRate: 0.6, pace: 4, composure: 0.5, streakiness: 0.3, consistency: 0.8 }
    const b: AiRatings = { accuracy: 0.6, swishRate: 0.6, pace: 4, composure: 0.5, streakiness: 0.3, consistency: 0.8 }
    const r1 = quickSimGame(a, b, [1, 'x'])
    const r2 = quickSimGame(a, b, [1, 'x'])
    expect(r1).toEqual(r2)
    for (let s = 0; s < 200; s++) {
      const r = quickSimGame(a, b, [s])
      expect(r.home.points).not.toBe(r.away.points)
    }
  })

  it('better ratings → better records over a season of matchups', () => {
    const strong: AiRatings = { accuracy: 0.75, swishRate: 0.7, pace: 4, composure: 0.7, streakiness: 0.2, consistency: 0.9 }
    const weak: AiRatings = { accuracy: 0.4, swishRate: 0.3, pace: 4, composure: 0.5, streakiness: 0.4, consistency: 0.6 }
    let strongWins = 0
    for (let i = 0; i < 200; i++) {
      const r = quickSimGame(strong, weak, [i, 'sanity'])
      if (r.home.points > r.away.points) strongWins++
    }
    expect(strongWins / 200).toBeGreaterThan(0.75)
  })
})

describe('full season → playoffs → champion (headless)', () => {
  it('sims a whole campaign year and crowns a champion', () => {
    const teams = leagueTeams()
    const season = createSeason(teams, 1, 12345)
    const self = teams.find((t) => t.isPlayer)!.ratings

    while (season.phase === 'regular') {
      expect(playerGameOn(season, season.currentDay, 'player')).not.toBeNull()
      resolveDay(season, teams, 'player', self, null) // player sims their own games
    }
    expect(season.phase).toBe('playoffs')
    expect(season.series).toHaveLength(4)

    // Every game played, standings coherent: total W = total L = 189 each.
    const east = conferenceTable(teams, 'EAST', season.schedule, season.seed)
    const west = conferenceTable(teams, 'WEST', season.schedule, season.seed)
    const totalW = [...east, ...west].reduce((sum, r) => sum + r.w, 0)
    const totalL = [...east, ...west].reduce((sum, r) => sum + r.l, 0)
    expect(totalW).toBe(378)
    expect(totalL).toBe(378)
    expect(east.every((r) => r.w + r.l === 42)).toBe(true)
    expect(east[0]!.seed).toBe(1)

    // Games behind: classic formula — 0 for the leader, non-decreasing down the table.
    const mk = (w: number, l: number) => ({ teamId: 't', w, l, pct: 0, pointsFor: 0, pointsAgainst: 0 })
    expect(gamesBehind(mk(30, 12), mk(30, 12))).toBe(0)
    expect(gamesBehind(mk(30, 12), mk(26, 16))).toBe(4)
    for (const table of [east, west]) {
      const leader = table[0]!
      expect(gamesBehind(leader, leader)).toBe(0)
      let prev = 0
      for (const row of table) {
        const gb = gamesBehind(leader, row)
        expect(gb).toBeGreaterThanOrEqual(prev)
        prev = gb
      }
    }

    // Playoffs: if the player made it, feed live-ish results (simple sims); AI series auto-resolve.
    let guard = 0
    while (season.phase === 'playoffs' && guard++ < 40) {
      const mine = playerSeries(season, 'player')
      if (mine) {
        // Pretend the player always loses 30–40: eliminates quickly, exercise both paths.
        resolvePlayoffStep(season, teams, 'player', {
          playerScore: 30,
          oppScore: 40,
          playerSwishes: 5,
          oppSwishes: 8,
          otRacks: 0,
        })
      } else {
        resolvePlayoffStep(season, teams, 'player', null)
      }
    }
    expect(season.phase).toBe('done')
    expect(season.championId).not.toBeNull()
    // Champion won a real bracket: exists among teams.
    expect(teams.some((t) => t.id === season.championId)).toBe(true)
  })
})
