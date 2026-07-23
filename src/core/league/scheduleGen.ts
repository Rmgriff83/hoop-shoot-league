/**
 * Season schedule: each conference rival ×3 + each cross-conference team ×2,
 * one slate per day, everyone plays daily. Length derives from the league
 * size — at 16 teams that's 37 games per team, 296 league games, 37 days.
 *
 * Seeded randomized per-day perfect matching over the remaining demand
 * multigraph, with whole-schedule restarts on dead ends (cheap at this size).
 */
import { Rng } from '../rng/rng'
import type { Conference, GameRecord } from './types'

/** Regular-season length recorded in a schedule (works for legacy lengths too). */
export function seasonDaysOf(schedule: GameRecord[]): number {
  let max = 0
  for (const g of schedule) if (g.day > max) max = g.day
  return max
}

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
  // Total demand ÷ games-per-day must divide evenly for a one-slate-per-day season.
  const totalGames = [...buildDemand(teams).values()].reduce((a, b) => a + b, 0)
  const gamesPerDay = teams.length / 2
  const days = totalGames / gamesPerDay
  if (!Number.isInteger(days) || !Number.isInteger(gamesPerDay)) {
    throw new Error(`league shape doesn't tile into daily slates: ${totalGames} games / ${gamesPerDay} per day`)
  }
  for (let attempt = 0; attempt < 400; attempt++) {
    const demand = buildDemand(teams)
    const games: GameRecord[] = []
    let failed = false
    for (let day = 1; day <= days && !failed; day++) {
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
