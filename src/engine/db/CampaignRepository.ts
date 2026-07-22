/**
 * Campaign documents: one doc per campaign holding identity, current season
 * state (incl. the 378-game schedule — ~50 KB, fine inline), self ratings,
 * and career aggregates. Per-shot logs live in ShotRepository (§8 volume note).
 */
import type { Conference, SeasonState } from '../../core/league/types'
import type { DifficultyTier, PlayerSelfRatings } from '../../core/league/playerRatings'
import { getDb } from './GameDatabase'

export interface SeasonSummary {
  year: number
  w: number
  l: number
  seed: number | null
  playoffResult: 'missed' | 'quarterfinal' | 'conferenceFinal' | 'runnerUp' | 'champion'
  pointsFor: number
  pointsAgainst: number
}

export interface ShooterCareer {
  w: number
  l: number
  championships: number
  seasons: number
}

export interface CampaignDoc {
  id: string
  createdAt: number
  lastPlayedAt: number
  playerName: string
  hometown: string
  conference: Conference
  difficulty: DifficultyTier
  year: number
  season: SeasonState
  selfRatings: PlayerSelfRatings
  career: {
    seasons: SeasonSummary[]
    championships: number
    totals: { games: number; wins: number; losses: number; points: number; makes: number; swishes: number; shots: number }
    highs: { points: number; swishes: number; streak: number }
  }
  shooterCareers: Record<string, ShooterCareer>
}

export async function saveCampaign(doc: CampaignDoc): Promise<void> {
  const db = await getDb()
  doc.lastPlayedAt = Date.now()
  await db.put('campaigns', JSON.parse(JSON.stringify(doc)) as CampaignDoc)
}

export async function loadCampaign(id: string): Promise<CampaignDoc | undefined> {
  const db = await getDb()
  return (await db.get('campaigns', id)) as CampaignDoc | undefined
}

export async function listCampaigns(): Promise<CampaignDoc[]> {
  const db = await getDb()
  const all = (await db.getAll('campaigns')) as CampaignDoc[]
  return all.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
}

export async function deleteCampaign(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('campaigns', id)
}

export async function setActiveCampaignId(id: string | null): Promise<void> {
  const db = await getDb()
  await db.put('meta', { key: 'activeCampaign', id })
}

export async function getActiveCampaignId(): Promise<string | null> {
  const db = await getDb()
  const row = (await db.get('meta', 'activeCampaign')) as { id: string | null } | undefined
  return row?.id ?? null
}
