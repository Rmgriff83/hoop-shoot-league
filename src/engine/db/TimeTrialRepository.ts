/**
 * Device-level time-trial leaderboard. Lives on the user, not on any campaign —
 * scores survive campaign deletion and span all of them.
 */
import { getDb } from './GameDatabase'

export interface TimeTrialScoreDoc {
  id: string
  score: number
  makes: number
  swishes: number
  attempts: number
  bestStreak: number
  playedAt: number
}

export async function saveTimeTrialScore(doc: TimeTrialScoreDoc): Promise<void> {
  const db = await getDb()
  await db.put('timeTrialScores', JSON.parse(JSON.stringify(doc)) as TimeTrialScoreDoc)
}

/** Top scores, best first; earlier run wins ties (first to set the mark keeps it). */
export async function topTimeTrialScores(limit = 10): Promise<TimeTrialScoreDoc[]> {
  const db = await getDb()
  const all = (await db.getAll('timeTrialScores')) as TimeTrialScoreDoc[]
  return all
    .sort((a, b) => b.score - a.score || a.playedAt - b.playedAt)
    .slice(0, limit)
}
