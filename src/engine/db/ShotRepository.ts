/**
 * Per-shot logs + full box scores for the player's LIVE games only
 * (handoff §8: full detail for played games, box-score summaries elsewhere).
 * Enables shot charts and "best shot" replays later.
 */
import type { RackShotRecord } from '../../core/match/rack'
import type { SideTotals } from '../../core/match/matchEngine'
import { getDb } from './GameDatabase'

export interface LiveGameDoc {
  key: string // `${campaignId}:${gameId}`
  campaignId: string
  gameId: string
  year: number
  day: number
  opponentId: string
  player: SideTotals
  ai: SideTotals
  won: boolean
  otRacks: number
  playedAt: number
}

export interface ShotLogDoc {
  key: string // `${campaignId}:${gameId}`
  gameKey: string
  campaignId: string
  gameId: string
  shots: RackShotRecord[]
}

export async function saveLiveGame(doc: LiveGameDoc, shots: RackShotRecord[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['liveGames', 'shots'], 'readwrite')
  await tx.objectStore('liveGames').put(JSON.parse(JSON.stringify(doc)) as LiveGameDoc)
  await tx.objectStore('shots').put(
    JSON.parse(
      JSON.stringify({
        key: doc.key,
        gameKey: doc.key,
        campaignId: doc.campaignId,
        gameId: doc.gameId,
        shots,
      }),
    ) as ShotLogDoc,
  )
  await tx.done
}

export async function loadLiveGames(campaignId: string): Promise<LiveGameDoc[]> {
  const db = await getDb()
  const all = (await db.getAll('liveGames')) as LiveGameDoc[]
  return all.filter((g) => g.campaignId === campaignId)
}

export async function loadShotLog(campaignId: string, gameId: string): Promise<ShotLogDoc | undefined> {
  const db = await getDb()
  return (await db.get('shots', `${campaignId}:${gameId}`)) as ShotLogDoc | undefined
}
