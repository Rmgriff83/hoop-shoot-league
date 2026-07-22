/**
 * Playoffs (handoff §7): top 4 per conference. Quarterfinals Bo3 (1v4, 2v3),
 * Conference Finals Bo5, Championship Bo5. Max championship run: 13 games.
 */
import type { Conference, PlayoffSeries, SeriesRound, StandingRow } from './types'

export function neededWins(series: PlayoffSeries): number {
  return Math.floor(series.bestOf / 2) + 1
}

function makeSeries(
  id: string,
  round: SeriesRound,
  conference: Conference | null,
  highSeedId: string,
  lowSeedId: string,
  bestOf: 3 | 5,
): PlayoffSeries {
  return { id, round, conference, highSeedId, lowSeedId, bestOf, highWins: 0, lowWins: 0, winnerId: null, games: [] }
}

/** Top-4 seeding: 1v4 and 2v3 in each conference. */
export function buildQuarterfinals(east: StandingRow[], west: StandingRow[]): PlayoffSeries[] {
  const series: PlayoffSeries[] = []
  for (const [conf, table] of [
    ['EAST', east],
    ['WEST', west],
  ] as const) {
    series.push(makeSeries(`${conf}-qf-1v4`, 'quarterfinal', conf, table[0]!.teamId, table[3]!.teamId, 3))
    series.push(makeSeries(`${conf}-qf-2v3`, 'quarterfinal', conf, table[1]!.teamId, table[2]!.teamId, 3))
  }
  return series
}

/** Record one series game result. Returns true when the series just ended. */
export function recordSeriesGame(series: PlayoffSeries, highSeedScore: number, lowSeedScore: number): boolean {
  if (series.winnerId) return false
  if (highSeedScore > lowSeedScore) series.highWins++
  else series.lowWins++
  const need = neededWins(series)
  if (series.highWins >= need) series.winnerId = series.highSeedId
  else if (series.lowWins >= need) series.winnerId = series.lowSeedId
  return series.winnerId !== null
}

/**
 * Create next-round series whenever both feeders are decided. Conference
 * finals pair the two QF winners; the championship pairs conference champions.
 * Returns any newly created series.
 */
export function advanceBracket(series: PlayoffSeries[]): PlayoffSeries[] {
  const created: PlayoffSeries[] = []
  for (const conf of ['EAST', 'WEST'] as const) {
    const qfs = series.filter((s) => s.round === 'quarterfinal' && s.conference === conf)
    const cf = series.find((s) => s.round === 'conferenceFinal' && s.conference === conf)
    if (!cf && qfs.length === 2 && qfs.every((s) => s.winnerId)) {
      // The 1v4 winner is the "high seed" side of the conference final.
      const one = qfs.find((s) => s.id.endsWith('1v4'))!
      const two = qfs.find((s) => s.id.endsWith('2v3'))!
      created.push(makeSeries(`${conf}-final`, 'conferenceFinal', conf, one.winnerId!, two.winnerId!, 5))
    }
  }
  const finals = series.filter((s) => s.round === 'conferenceFinal')
  const chip = series.find((s) => s.round === 'championship')
  if (!chip && finals.length === 2 && finals.every((s) => s.winnerId)) {
    const east = finals.find((s) => s.conference === 'EAST')!
    const west = finals.find((s) => s.conference === 'WEST')!
    created.push(makeSeries('championship', 'championship', null, east.winnerId!, west.winnerId!, 5))
  }
  return created
}
