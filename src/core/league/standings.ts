/**
 * Standings + seeding. Tiebreakers: win% → head-to-head → points diff →
 * seeded coin flip (deterministic per season seed).
 */
import { hashSeed, Rng } from '../rng/rng'
import type { Conference, GameRecord, StandingRow } from './types'
import type { TeamRef } from './scheduleGen'

export function computeStandings(teams: TeamRef[], games: GameRecord[], seasonSeed: number): Map<string, StandingRow> {
  const rows = new Map<string, StandingRow>()
  for (const t of teams) {
    rows.set(t.id, { teamId: t.id, w: 0, l: 0, pct: 0, pointsFor: 0, pointsAgainst: 0 })
  }
  for (const g of games) {
    if (!g.played) continue
    const home = rows.get(g.homeId)
    const away = rows.get(g.awayId)
    if (!home || !away) continue
    home.pointsFor += g.homeScore
    home.pointsAgainst += g.awayScore
    away.pointsFor += g.awayScore
    away.pointsAgainst += g.homeScore
    if (g.homeScore > g.awayScore) {
      home.w++
      away.l++
    } else {
      away.w++
      home.l++
    }
  }
  for (const row of rows.values()) {
    const total = row.w + row.l
    row.pct = total ? row.w / total : 0
  }
  return rows
}

function headToHead(aId: string, bId: string, games: GameRecord[]): number {
  let aWins = 0
  let bWins = 0
  for (const g of games) {
    if (!g.played) continue
    const isPair =
      (g.homeId === aId && g.awayId === bId) || (g.homeId === bId && g.awayId === aId)
    if (!isPair) continue
    const winner = g.homeScore > g.awayScore ? g.homeId : g.awayId
    if (winner === aId) aWins++
    else bWins++
  }
  return bWins - aWins // negative → a ahead
}

/** Classic games-behind: ((leader.w − team.w) + (team.l − leader.l)) / 2. */
export function gamesBehind(leader: StandingRow, row: StandingRow): number {
  return (leader.w - row.w + (row.l - leader.l)) / 2
}

/** Current run of consecutive wins or losses, e.g. { type: 'W', count: 4 }. Null before any game. */
export function currentStreak(teamId: string, games: GameRecord[]): { type: 'W' | 'L'; count: number } | null {
  const mine = games
    .filter((g) => g.played && (g.homeId === teamId || g.awayId === teamId))
    .sort((a, b) => a.day - b.day)
  const last = mine[mine.length - 1]
  if (!last) return null
  const wonGame = (g: GameRecord) => (g.homeScore > g.awayScore ? g.homeId : g.awayId) === teamId
  const type = wonGame(last) ? 'W' : 'L'
  let count = 0
  for (let i = mine.length - 1; i >= 0; i--) {
    if ((wonGame(mine[i]!) ? 'W' : 'L') !== type) break
    count++
  }
  return { type, count }
}

// ---------------------------------------------------------------------------
// Clinch math. A shown clinch must NEVER be wrong: everything derives from
// wins + exact remaining-game counts (the schedule is pre-generated) plus
// tiebreakers that are already settled. Standard magic-number criterion with
// one refinement our data supports: 3 in-conference meetings means head-to-head
// can never tie, so once all meetings are played the h2h edge is immutable.
// ---------------------------------------------------------------------------

export interface ClinchInfo {
  playoffs: boolean
  topSeed: boolean
  eliminated: boolean
}

interface Tally {
  wins: Map<string, number>
  remaining: Map<string, number>
  remainingBetween: Map<string, number>
}

function tally(games: GameRecord[]): Tally {
  const wins = new Map<string, number>()
  const remaining = new Map<string, number>()
  const remainingBetween = new Map<string, number>()
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const g of games) {
    if (g.played) {
      bump(wins, g.homeScore > g.awayScore ? g.homeId : g.awayId)
    } else {
      bump(remaining, g.homeId)
      bump(remaining, g.awayId)
      bump(remainingBetween, [g.homeId, g.awayId].sort().join('|'))
    }
  }
  return { wins, remaining, remainingBetween }
}

function guaranteedAheadWith(t: Tally, games: GameRecord[], aId: string, bId: string): boolean {
  const aWins = t.wins.get(aId) ?? 0
  const bMax = (t.wins.get(bId) ?? 0) + (t.remaining.get(bId) ?? 0)
  if (aWins > bMax) return true
  if (aWins < bMax) return false
  // Worst-case tie at equal wins: decided by head-to-head, which is immutable
  // (and can't tie — 3 meetings) once no games remain between the pair.
  const meetingsLeft = t.remainingBetween.get([aId, bId].sort().join('|')) ?? 0
  return meetingsLeft === 0 && headToHead(aId, bId, games) < 0
}

/** Test-friendly standalone: is `aId` mathematically guaranteed to finish ahead of `bId`? */
export function guaranteedAhead(aId: string, bId: string, games: GameRecord[]): boolean {
  return guaranteedAheadWith(tally(games), games, aId, bId)
}

/**
 * Per-team clinch flags for one conference (top 4 advance):
 *   playoffs   — guaranteed ahead of ≥5 of the 8 rivals
 *   topSeed    — guaranteed ahead of all 8 (implies playoffs)
 *   eliminated — ≥5 rivals are each guaranteed ahead (top 4 impossible)
 * Conservative in exotic multi-team scenarios (may confirm a day late), never wrong.
 */
export function computeClinches(
  teams: TeamRef[],
  conference: Conference,
  games: GameRecord[],
): Map<string, ClinchInfo> {
  const t = tally(games)
  const ids = teams.filter((team) => team.conference === conference).map((team) => team.id)
  const spots = 4
  const out = new Map<string, ClinchInfo>()
  for (const a of ids) {
    let aheadOf = 0
    let behind = 0
    for (const b of ids) {
      if (a === b) continue
      if (guaranteedAheadWith(t, games, a, b)) aheadOf++
      if (guaranteedAheadWith(t, games, b, a)) behind++
    }
    // Clinch: guaranteed ahead of 5 of 8 → at most 3 can finish above → top 4 locked.
    // Eliminate: 4 rivals guaranteed ahead → best possible finish is 5th → out.
    out.set(a, {
      playoffs: aheadOf >= ids.length - spots,
      topSeed: aheadOf === ids.length - 1,
      eliminated: behind >= spots,
    })
  }
  return out
}

/** Sorted conference table with seeds assigned (1 = best). */
export function conferenceTable(
  teams: TeamRef[],
  conference: Conference,
  games: GameRecord[],
  seasonSeed: number,
): StandingRow[] {
  const rows = computeStandings(teams, games, seasonSeed)
  const table = teams
    .filter((t) => t.conference === conference)
    .map((t) => rows.get(t.id)!)
    .sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct
      const h2h = headToHead(a.teamId, b.teamId, games)
      if (h2h !== 0) return h2h
      const diffA = a.pointsFor - a.pointsAgainst
      const diffB = b.pointsFor - b.pointsAgainst
      if (diffB !== diffA) return diffB - diffA
      // Deterministic coin flip.
      return new Rng(hashSeed(seasonSeed, a.teamId, b.teamId)).next() < 0.5 ? -1 : 1
    })
  table.forEach((row, i) => (row.seed = i + 1))
  return table
}
