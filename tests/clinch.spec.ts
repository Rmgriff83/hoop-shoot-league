import { describe, expect, it } from 'vitest'
import { computeClinches, conferenceTable, currentStreak, guaranteedAhead } from '../src/core/league/standings'
import type { TeamRef } from '../src/core/league/scheduleGen'
import type { GameRecord } from '../src/core/league/types'
import { ACTIVE_SHOOTERS } from '../src/core/data/shooters'
import { createSeason, resolveDay, type LeagueTeam } from '../src/core/league/season'

function east9(): TeamRef[] {
  return 'ABCDEFGHI'.split('').map((id) => ({ id, conference: 'EAST' as const }))
}

let gid = 0
function g(homeId: string, awayId: string, homeScore: number, awayScore: number, played = true): GameRecord {
  return {
    id: `t${gid++}`,
    day: 1,
    homeId,
    awayId,
    homeScore,
    awayScore,
    homeSwishes: 0,
    awaySwishes: 0,
    otRacks: 0,
    playedLive: false,
    played,
  }
}

describe('guaranteedAhead (pairwise clinch relation)', () => {
  it('insurmountable lead: wins exceed rival max wins', () => {
    const games = [g('A', 'B', 30, 20), g('A', 'B', 30, 20)]
    expect(guaranteedAhead('A', 'B', games)).toBe(true)
    expect(guaranteedAhead('B', 'A', games)).toBe(false)
  })

  it('equal max wins with meetings remaining → NOT clinched (h2h could flip)', () => {
    const games = [
      g('A', 'B', 30, 20),
      g('A', 'B', 30, 20),
      g('A', 'B', 0, 0, false), // one meeting left
      g('B', 'C', 0, 0, false), // B can reach 2 wins
    ]
    // A.w=2, B.maxW=2, meeting remains → tiebreak not settled.
    expect(guaranteedAhead('A', 'B', games)).toBe(false)
  })

  it('equal max wins, all meetings played, h2h settled → clinched (the refinement)', () => {
    const games = [
      g('A', 'B', 30, 20),
      g('A', 'B', 30, 20),
      g('B', 'A', 30, 20), // series done: A leads h2h 2–1
      g('B', 'C', 0, 0, false), // B.maxW = 1 + 1 = 2 = A.w
    ]
    expect(guaranteedAhead('A', 'B', games)).toBe(true)
    expect(guaranteedAhead('B', 'A', games)).toBe(false)
  })
})

describe('computeClinches (conference flags)', () => {
  it('dominant team clinches playoffs + top seed; tied pack stays unmarked', () => {
    // A 12-0 against B..E, season otherwise over.
    const games: GameRecord[] = []
    for (const opp of ['B', 'C', 'D', 'E']) {
      for (let i = 0; i < 3; i++) games.push(g('A', opp, 30, 20))
    }
    const clinches = computeClinches(east9(), 'EAST', games)
    expect(clinches.get('A')).toEqual({ playoffs: true, topSeed: true, eliminated: false })
    // Everyone else is tied at ≤0 net with unsettled ordering — no flags.
    for (const id of ['B', 'C', 'F', 'I']) {
      const c = clinches.get(id)!
      expect(c.playoffs).toBe(false)
      expect(c.eliminated).toBe(false)
    }
  })

  it('team mathematically out → eliminated', () => {
    // Z(=I) lost to five different teams; nobody has games left.
    const games = ['A', 'B', 'C', 'D', 'E'].map((winner) => g(winner, 'I', 30, 20))
    const clinches = computeClinches(east9(), 'EAST', games)
    expect(clinches.get('I')!.eliminated).toBe(true)
    expect(clinches.get('I')!.playoffs).toBe(false)
    expect(clinches.get('A')!.eliminated).toBe(false)
  })
})

describe('currentStreak', () => {
  it('reads the trailing run in day order, regardless of array order', () => {
    const games = [
      { ...g('A', 'B', 30, 20), day: 3 }, // W
      { ...g('A', 'B', 20, 30), day: 1 }, // L
      { ...g('B', 'A', 10, 25), day: 4 }, // W (away win)
      { ...g('A', 'B', 30, 20), day: 2 }, // W
      { ...g('A', 'B', 0, 0, false), day: 5 }, // unplayed — ignored
    ]
    expect(currentStreak('A', games)).toEqual({ type: 'W', count: 3 })
    expect(currentStreak('B', games)).toEqual({ type: 'L', count: 3 })
    expect(currentStreak('C', games)).toBeNull()
  })
})

describe('clinches over a real season (dynamic accuracy)', () => {
  function leagueTeams(): LeagueTeam[] {
    const teams: LeagueTeam[] = ACTIVE_SHOOTERS.map((s) => ({
      id: s.id,
      conference: s.flex ? 'WEST' : s.conference,
      name: s.name,
      ratings: s.ratings,
      isPlayer: false,
    }))
    teams.push({
      id: 'player',
      conference: 'EAST',
      name: 'You',
      ratings: { accuracy: 0.55, swishRate: 0.5, pace: 4, composure: 0.6, streakiness: 0.4, consistency: 0.75 },
      isPlayer: true,
    })
    return teams
  }

  it('flags are monotonic, mutually exclusive, and never wrong', () => {
    const teams = leagueTeams()
    const season = createSeason(teams, 1, 991)
    const self = teams.find((t) => t.isPlayer)!.ratings

    const everClinched = new Set<string>()
    const everEliminated = new Set<string>()

    while (season.phase === 'regular') {
      resolveDay(season, teams, 'player', self, null)
      for (const conf of ['EAST', 'WEST'] as const) {
        const clinches = computeClinches(teams, conf, season.schedule)
        for (const [id, c] of clinches) {
          expect(c.playoffs && c.eliminated, `${id} both clinched and eliminated`).toBe(false)
          if (c.topSeed) expect(c.playoffs, `${id} topSeed implies playoffs`).toBe(true)
          // Monotonic: once shown, never retracted.
          if (everClinched.has(id)) expect(c.playoffs, `${id} clinch retracted`).toBe(true)
          if (everEliminated.has(id)) expect(c.eliminated, `${id} elimination retracted`).toBe(true)
          if (c.playoffs) everClinched.add(id)
          if (c.eliminated) everEliminated.add(id)
        }
      }
    }

    // Season over: flags must be exact, and every mid-season flag must have come true.
    for (const conf of ['EAST', 'WEST'] as const) {
      const table = conferenceTable(teams, conf, season.schedule, season.seed)
      const clinches = computeClinches(teams, conf, season.schedule)
      const top4 = new Set(table.slice(0, 4).map((r) => r.teamId))
      let inCount = 0
      let outCount = 0
      let topSeedCount = 0
      for (const [id, c] of clinches) {
        if (c.playoffs) inCount++
        if (c.eliminated) outCount++
        if (c.topSeed) {
          topSeedCount++
          expect(id, 'top seed matches table').toBe(table[0]!.teamId)
        }
        // Accuracy: a flag ever shown mid-season must match the final outcome.
        if (everClinched.has(id)) expect(top4.has(id), `${id} clinched but missed playoffs`).toBe(true)
        if (everEliminated.has(id)) expect(top4.has(id), `${id} eliminated but made playoffs`).toBe(false)
      }
      // 8-team conferences: top 4 in, bottom 4 out.
      expect(inCount).toBe(4)
      expect(outCount).toBe(4)
      expect(topSeedCount).toBe(1)
    }
  })
})
