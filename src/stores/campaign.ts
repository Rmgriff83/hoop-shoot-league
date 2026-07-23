/**
 * The campaign orchestrator: owns the active CampaignDoc, drives the season
 * (play/sim days, playoffs, season rollover), folds results into careers, and
 * write-through persists to IndexedDB after every mutation.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { hashSeed } from '../core/rng/rng'
import type { Conference } from '../core/league/types'
import { buildLeagueTeams, PLAYER_TEAM_ID, teamsForSeason } from '../core/league/leagueBuilder'
import {
  createSeason,
  gamesOn,
  playerGameOn,
  playerSeries,
  resolveDay,
  resolvePlayoffStep,
  type LiveGameResult,
} from '../core/league/season'
import { computeClinches, conferenceTable } from '../core/league/standings'
import {
  initSelfRatings,
  selfAsAiRatings,
  TIER_ERROR_MULT,
  updateSelfRatings,
  type DifficultyTier,
} from '../core/league/playerRatings'
import { seasonDaysOf } from '../core/league/scheduleGen'
import { shooterById } from '../core/data/shooters'
import {
  getActiveCampaignId,
  listCampaigns,
  loadCampaign,
  saveCampaign,
  setActiveCampaignId,
  type CampaignDoc,
  type SeasonSummary,
} from '../engine/db/CampaignRepository'
import { saveLiveGame } from '../engine/db/ShotRepository'
import { requestPersistentStorage } from '../engine/db/StoragePersistence'
import { useMatchStore, type MatchResult, type OpponentInfo } from './match'

export const useCampaignStore = defineStore('campaign', () => {
  const doc = ref<CampaignDoc | null>(null)
  const allCampaigns = ref<CampaignDoc[]>([])
  const loading = ref(true)

  const teams = computed(() => {
    if (!doc.value) return []
    // Season-aware: legacy seasons that scheduled since-retired shooters keep
    // resolving; fresh seasons build from the active 16-team league.
    return teamsForSeason(doc.value.season, doc.value.conference, doc.value.playerName, selfAsAiRatings(doc.value.selfRatings))
  })

  const season = computed(() => doc.value?.season ?? null)

  const todaysGame = computed(() => {
    if (!doc.value || doc.value.season.phase !== 'regular') return null
    return playerGameOn(doc.value.season, doc.value.season.currentDay, PLAYER_TEAM_ID)
  })

  const currentSeries = computed(() => {
    if (!doc.value || doc.value.season.phase !== 'playoffs') return null
    return playerSeries(doc.value.season, PLAYER_TEAM_ID)
  })

  const opponentIdToday = computed(() => {
    const g = todaysGame.value
    if (g) return g.homeId === PLAYER_TEAM_ID ? g.awayId : g.homeId
    const s = currentSeries.value
    if (s) return s.highSeedId === PLAYER_TEAM_ID ? s.lowSeedId : s.highSeedId
    return null
  })

  const east = computed(() =>
    doc.value ? conferenceTable(teams.value, 'EAST', allSeasonGames(), doc.value.season.seed) : [],
  )
  const west = computed(() =>
    doc.value ? conferenceTable(teams.value, 'WEST', allSeasonGames(), doc.value.season.seed) : [],
  )
  const eastClinches = computed(() =>
    doc.value ? computeClinches(teams.value, 'EAST', allSeasonGames()) : new Map(),
  )
  const westClinches = computed(() =>
    doc.value ? computeClinches(teams.value, 'WEST', allSeasonGames()) : new Map(),
  )

  function allSeasonGames() {
    return doc.value?.season.schedule ?? []
  }

  async function init() {
    loading.value = true
    try {
      allCampaigns.value = await listCampaigns()
      const activeId = await getActiveCampaignId()
      if (activeId) {
        const loaded = await loadCampaign(activeId)
        if (loaded) doc.value = loaded
      }
    } finally {
      loading.value = false
    }
  }

  async function createCampaign(playerName: string, hometown: string, conference: Conference, difficulty: DifficultyTier) {
    void requestPersistentStorage()
    const id = `c${Date.now().toString(36)}`
    const seed = hashSeed(id, playerName, hometown)
    const selfRatings = initSelfRatings(difficulty)
    const newTeams = buildLeagueTeams(conference, playerName, selfAsAiRatings(selfRatings))
    const campaign: CampaignDoc = {
      id,
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      playerName,
      hometown,
      conference,
      difficulty,
      year: 1,
      season: createSeason(newTeams, 1, seed),
      selfRatings,
      career: {
        seasons: [],
        championships: 0,
        totals: { games: 0, wins: 0, losses: 0, points: 0, makes: 0, swishes: 0, shots: 0 },
        highs: { points: 0, swishes: 0, streak: 0 },
      },
      shooterCareers: {},
    }
    doc.value = campaign
    await saveCampaign(campaign)
    await setActiveCampaignId(id)
    allCampaigns.value = await listCampaigns()
  }

  async function selectCampaign(id: string) {
    const loaded = await loadCampaign(id)
    if (loaded) {
      doc.value = loaded
      await setActiveCampaignId(id)
    }
  }

  /** Configure the match store for today's live game (regular or playoff). */
  function setupLiveMatch(): boolean {
    const oppId = opponentIdToday.value
    if (!doc.value || !oppId) return false
    const config = shooterById(oppId)
    if (!config) return false
    const match = useMatchStore()
    const opponent: OpponentInfo = {
      id: config.id,
      name: config.name,
      hometown: config.hometown,
      nickname: config.nickname,
      ratings: config.ratings,
      colors: config.colors,
    }
    match.opponent = opponent
    match.result = null
    match.leagueGameId = todaysGame.value?.id ?? `${currentSeries.value!.id}-g${seriesGameNo()}`
    return true
  }

  function seriesGameNo(): number {
    const s = currentSeries.value
    return s ? s.highWins + s.lowWins + 1 : 1
  }

  const errorMult = computed(() => (doc.value ? TIER_ERROR_MULT[doc.value.difficulty] : 1))

  /** Fold a finished live match back into the season + career + storage. */
  async function applyLiveResult(result: MatchResult) {
    if (!doc.value || !result.ai) return
    const d = doc.value
    const live: LiveGameResult = {
      playerScore: result.playerScore,
      oppScore: result.aiScore,
      playerSwishes: result.player.swishes,
      oppSwishes: result.ai.swishes,
      otRacks: result.otNumber,
    }
    const gameId =
      d.season.phase === 'regular'
        ? (playerGameOn(d.season, d.season.currentDay, PLAYER_TEAM_ID)?.id ?? `y${d.year}-live`)
        : `${currentSeries.value?.id ?? 'series'}-g${seriesGameNo()}`
    const day = d.season.phase === 'regular' ? d.season.currentDay : seasonDaysOf(d.season.schedule) + seriesGameNo()

    if (d.season.phase === 'regular') {
      resolveDay(d.season, teams.value, PLAYER_TEAM_ID, selfAsAiRatings(d.selfRatings), live)
    } else if (d.season.phase === 'playoffs') {
      resolvePlayoffStep(d.season, teams.value, PLAYER_TEAM_ID, live)
    }

    // Self ratings learn from the real performance.
    updateSelfRatings(d.selfRatings, {
      makes: result.player.makes,
      swishes: result.player.swishes,
      shots: result.player.shots.length,
    })

    // Career totals + highs.
    const t = d.career.totals
    t.games++
    if (result.won) t.wins++
    else t.losses++
    t.points += result.playerScore
    t.makes += result.player.makes
    t.swishes += result.player.swishes
    t.shots += result.player.shots.length
    const h = d.career.highs
    h.points = Math.max(h.points, result.playerScore)
    h.swishes = Math.max(h.swishes, result.player.swishes)
    h.streak = Math.max(h.streak, result.player.longestStreak)

    await saveLiveGame(
      {
        key: `${d.id}:${gameId}`,
        campaignId: d.id,
        gameId,
        year: d.year,
        day,
        opponentId: result.opponent.id,
        player: result.player,
        ai: result.ai,
        won: result.won,
        otRacks: result.otNumber,
        playedAt: Date.now(),
      },
      result.player.shots,
    )

    maybeFinishSeason()
    await saveCampaign(d)
  }

  /** Sim today's slate including the player's own game (self-ratings driven). */
  async function simToday() {
    if (!doc.value || doc.value.season.phase !== 'regular') return
    resolveDay(doc.value.season, teams.value, PLAYER_TEAM_ID, selfAsAiRatings(doc.value.selfRatings), null)
    maybeFinishSeason()
    await saveCampaign(doc.value)
  }

  /** Sim every remaining regular-season day at once. */
  async function simRestOfSeason() {
    if (!doc.value) return
    let guard = 0
    while (doc.value.season.phase === 'regular' && guard++ < seasonDaysOf(doc.value.season.schedule) + 1) {
      resolveDay(doc.value.season, teams.value, PLAYER_TEAM_ID, selfAsAiRatings(doc.value.selfRatings), null)
    }
    maybeFinishSeason()
    await saveCampaign(doc.value)
  }

  /** Advance AI-only playoff series when the player is eliminated (or between rounds). */
  async function simPlayoffStep() {
    if (!doc.value || doc.value.season.phase !== 'playoffs') return
    if (currentSeries.value) return // player must play live (handoff §7)
    resolvePlayoffStep(doc.value.season, teams.value, PLAYER_TEAM_ID, null)
    maybeFinishSeason()
    await saveCampaign(doc.value)
  }

  function playerPlayoffResult(): SeasonSummary['playoffResult'] {
    const d = doc.value!
    const mine = d.season.series.filter((s) => s.highSeedId === PLAYER_TEAM_ID || s.lowSeedId === PLAYER_TEAM_ID)
    if (mine.length === 0) return 'missed'
    if (d.season.championId === PLAYER_TEAM_ID) return 'champion'
    const deepest = mine[mine.length - 1]!
    if (deepest.round === 'championship') return 'runnerUp'
    if (deepest.round === 'conferenceFinal') return 'conferenceFinal'
    return 'quarterfinal'
  }

  /** When the bracket completes, fold the season into careers. */
  function maybeFinishSeason() {
    const d = doc.value
    if (!d || d.season.phase !== 'done' || !d.season.championId) return
    // Player summary.
    const table = d.conference === 'EAST' ? east.value : west.value
    const myRow = table.find((r) => r.teamId === PLAYER_TEAM_ID)
    d.career.seasons.push({
      year: d.year,
      w: myRow?.w ?? 0,
      l: myRow?.l ?? 0,
      seed: myRow?.seed ?? null,
      playoffResult: playerPlayoffResult(),
      pointsFor: myRow?.pointsFor ?? 0,
      pointsAgainst: myRow?.pointsAgainst ?? 0,
    })
    if (d.season.championId === PLAYER_TEAM_ID) d.career.championships++
    // Shooter careers (league leaderboards, rivalry history).
    for (const conf of ['EAST', 'WEST'] as const) {
      const rows = conf === 'EAST' ? east.value : west.value
      for (const row of rows) {
        if (row.teamId === PLAYER_TEAM_ID) continue
        const career = (d.shooterCareers[row.teamId] ??= { w: 0, l: 0, championships: 0, seasons: 0 })
        career.w += row.w
        career.l += row.l
        career.seasons++
        if (d.season.championId === row.teamId) career.championships++
      }
    }
  }

  /** Roll into the next season (new schedule, careers persist). Always builds
   *  from the ACTIVE roster — retired shooters don't carry into fresh seasons. */
  async function startNextSeason() {
    const d = doc.value
    if (!d || d.season.phase !== 'done') return
    d.year++
    const freshTeams = buildLeagueTeams(d.conference, d.playerName, selfAsAiRatings(d.selfRatings))
    d.season = createSeason(freshTeams, d.year, hashSeed(d.id, d.year))
    await saveCampaign(d)
  }

  return {
    doc,
    allCampaigns,
    loading,
    teams,
    season,
    todaysGame,
    currentSeries,
    opponentIdToday,
    east,
    west,
    eastClinches,
    westClinches,
    errorMult,
    init,
    createCampaign,
    selectCampaign,
    setupLiveMatch,
    applyLiveResult,
    simToday,
    simRestOfSeason,
    simPlayoffStep,
    startNextSeason,
  }
})
