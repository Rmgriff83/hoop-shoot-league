/**
 * Season schedule (handoff §7): 18 teams, each conference rival ×3 (24 games)
 * + each cross-conference team ×2 (18) = 42 games per team, 378 league games,
 * 42 days × 9-game slates, everyone plays every day.
 *
 * Seeded randomized per-day perfect matching over the remaining demand
 * multigraph, with whole-schedule restarts on dead ends (42×18 nodes — cheap).
 */
import { Rng } from '../rng/rng'
import type { Conference, GameRecord } from './types'

export const SEASON_DAYS = 42
export const GAMES_PER_DAY = 9

export interface TeamRef {
  id: string
  conference: Conference
}

/** Remaining games demanded between each unordered pair. */
type Demand = Map<string, number>

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function buildDemand(teams: TeamRef[]): Demand {
  const demand: Demand = new Map()
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i]!
      const b = teams[j]!
      demand.set(pairKey(a.id, b.id), a.conference === b.conference ? 3 : 2)
    }
  }
  return demand
}

/** Backtracking perfect matching over teams with remaining pair demand. */
function matchDay(teamIds: string[], demand: Demand, rng: Rng): [string, string][] | null {
  const order = rng.shuffle([...teamIds])
  const used = new Set<string>()
  const picks: [string, string][] = []

  function backtrack(): boolean {
    const a = order.find((t) => !used.has(t))
    if (!a) return true
    used.add(a)
    const partners = rng.shuffle(order.filter((b) => !used.has(b) && (demand.get(pairKey(a, b)) ?? 0) > 0))
    for (const b of partners) {
      used.add(b)
      picks.push([a, b])
      const key = pairKey(a, b)
      demand.set(key, demand.get(key)! - 1)
      if (backtrack()) return true
      demand.set(key, demand.get(key)! + 1)
      picks.pop()
      used.delete(b)
    }
    used.delete(a)
    return false
  }

  return backtrack() ? picks : null
}

/**
 * Generate the full season. Deterministic per seed. Throws only if 400
 * restarts all dead-end (never observed — see the property test).
 */
export function generateSchedule(teams: TeamRef[], seed: number): GameRecord[] {
  const rng = new Rng(seed)
  for (let attempt = 0; attempt < 400; attempt++) {
    const demand = buildDemand(teams)
    const games: GameRecord[] = []
    let failed = false
    for (let day = 1; day <= SEASON_DAYS && !failed; day++) {
      let matched: [string, string][] | null = null
      for (let tries = 0; tries < 40 && !matched; tries++) {
        matched = matchDay(
          teams.map((t) => t.id),
          demand,
          rng,
        )
      }
      if (!matched) {
        failed = true
        break
      }
      for (const [a, b] of matched) {
        // Home/away is cosmetic here; alternate by day parity for variety.
        const [home, away] = day % 2 === 0 ? [a, b] : [b, a]
        games.push({
          id: `g${day}-${home}-${away}`,
          day,
          homeId: home,
          awayId: away,
          homeScore: 0,
          awayScore: 0,
          homeSwishes: 0,
          awaySwishes: 0,
          otRacks: 0,
          playedLive: false,
          played: false,
        })
      }
    }
    if (!failed) return games
  }
  throw new Error('schedule generation failed after 400 restarts')
}
