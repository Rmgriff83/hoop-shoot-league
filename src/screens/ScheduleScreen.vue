<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useCampaignStore } from '../stores/campaign'
import { shooterById } from '../core/data/shooters'
import { PLAYER_TEAM_ID } from '../core/league/leagueBuilder'
import type { GameRecord, PlayoffSeries } from '../core/league/types'

const ui = useUiStore()
const campaign = useCampaignStore()
const todayRef = ref<HTMLElement | null>(null)

interface ScheduleRow {
  key: string
  label: string // "Day 7" or "Conf Quarterfinal · G2"
  opponentId: string
  home: boolean // player is home → "vs", else "@"
  played: boolean
  playedLive: boolean
  won: boolean
  myScore: number
  oppScore: number
  mySwishes: number
  oppSwishes: number
  otRacks: number
  isToday: boolean
}

const ROUND_LABELS: Record<PlayoffSeries['round'], string> = {
  quarterfinal: 'Conf Quarterfinal',
  conferenceFinal: 'Conference Final',
  championship: '🏆 Championship',
}

function toRow(g: GameRecord, label: string, isToday: boolean): ScheduleRow {
  const home = g.homeId === PLAYER_TEAM_ID
  const myScore = home ? g.homeScore : g.awayScore
  const oppScore = home ? g.awayScore : g.homeScore
  return {
    key: g.id,
    label,
    opponentId: home ? g.awayId : g.homeId,
    home,
    played: g.played,
    playedLive: g.playedLive,
    won: g.played && myScore > oppScore,
    myScore,
    oppScore,
    mySwishes: home ? g.homeSwishes : g.awaySwishes,
    oppSwishes: home ? g.awaySwishes : g.homeSwishes,
    otRacks: g.otRacks,
    isToday,
  }
}

const regularRows = computed<ScheduleRow[]>(() => {
  const d = campaign.doc
  if (!d) return []
  const today = d.season.phase === 'regular' ? d.season.currentDay : -1
  return d.season.schedule
    .filter((g) => g.homeId === PLAYER_TEAM_ID || g.awayId === PLAYER_TEAM_ID)
    .sort((a, b) => a.day - b.day)
    .map((g) => toRow(g, `Day ${g.day}`, g.day === today))
})

const playoffRows = computed<ScheduleRow[]>(() => {
  const d = campaign.doc
  if (!d || d.season.series.length === 0) return []
  const rows: ScheduleRow[] = []
  for (const s of d.season.series) {
    if (s.highSeedId !== PLAYER_TEAM_ID && s.lowSeedId !== PLAYER_TEAM_ID) continue
    s.games.forEach((g, i) => {
      rows.push(toRow(g, `${ROUND_LABELS[s.round]} · G${i + 1}`, false))
    })
    // The next, not-yet-played series game (playoffs are always live).
    if (!s.winnerId && campaign.currentSeries?.id === s.id) {
      const gameNo = s.highWins + s.lowWins + 1
      rows.push({
        key: `${s.id}-next`,
        label: `${ROUND_LABELS[s.round]} · G${gameNo}`,
        opponentId: s.highSeedId === PLAYER_TEAM_ID ? s.lowSeedId : s.highSeedId,
        home: s.highSeedId === PLAYER_TEAM_ID,
        played: false,
        playedLive: false,
        won: false,
        myScore: 0,
        oppScore: 0,
        mySwishes: 0,
        oppSwishes: 0,
        otRacks: 0,
        isToday: true,
      })
    }
  }
  return rows
})

const record = computed(() => {
  let w = 0
  let l = 0
  for (const r of [...regularRows.value, ...playoffRows.value]) {
    if (!r.played) continue
    if (r.won) w++
    else l++
  }
  return { w, l }
})

function opponentOf(row: ScheduleRow) {
  const s = shooterById(row.opponentId)
  return {
    town: s?.hometown ?? row.opponentId,
    name: s?.name ?? '',
    color: s?.colors.primary ?? 'var(--grape)',
  }
}

onMounted(() => {
  todayRef.value?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <div class="schedule">
    <header class="top">
      <button class="btn btn--ghost btn--small" @click="ui.go('seasonHub')">← Season</button>
      <h1>Schedule</h1>
      <span class="rec">{{ record.w }}–{{ record.l }}</span>
    </header>

    <div class="list card pop-in">
      <template v-for="(rows, section) in { regular: regularRows, playoffs: playoffRows }" :key="section">
        <div v-if="rows.length && section === 'playoffs'" class="section-title">🏆 Playoffs</div>
        <div
          v-for="row in rows"
          :key="row.key"
          :ref="row.isToday ? (el) => (todayRef = el as HTMLElement) : undefined"
          class="row"
          :class="{ today: row.isToday, upcoming: !row.played && !row.isToday }"
        >
          <span class="day">{{ row.label }}</span>
          <span class="matchup">
            <span class="chip" :style="{ background: opponentOf(row).color }" />
            <span class="ha">{{ row.home ? 'vs' : '@' }}</span>
            <span class="town">
              <b>{{ opponentOf(row).town }}</b>
              <small>{{ opponentOf(row).name }}</small>
            </span>
          </span>

          <span v-if="row.played" class="result">
            <span class="badge" :class="row.won ? 'win' : 'loss'">{{ row.won ? 'W' : 'L' }}</span>
            <span class="score">
              {{ row.myScore }}–{{ row.oppScore }}
              <small v-if="row.otRacks">{{ row.otRacks }}OT</small>
            </span>
            <span class="extras">
              <span v-if="row.playedLive" title="played live">🏀</span>
              <small>✨{{ row.mySwishes }}</small>
            </span>
          </span>
          <span v-else-if="row.isToday" class="result">
            <span class="today-tag">TODAY</span>
          </span>
          <span v-else class="result">
            <small class="soon">upcoming</small>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.schedule {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: linear-gradient(var(--sky) 60%, var(--sky-deep));
  overflow: hidden;
}

.top {
  width: min(640px, 100%);
  display: flex;
  align-items: center;
  gap: 12px;
}

.top h1 {
  color: #fff;
  font-size: 24px;
  text-shadow: 0 2px 0 rgba(53, 64, 92, 0.25);
  flex: 1;
}

.rec {
  font-size: 18px;
  font-weight: 800;
  color: var(--sun);
  text-shadow: 0 2px 0 rgba(53, 64, 92, 0.25);
}

.list {
  width: min(640px, 100%);
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--ink-faint);
  padding: 12px 6px 6px;
  text-transform: uppercase;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 14px;
}

.row.upcoming {
  opacity: 0.55;
}

.row.today {
  background: #fff1e6;
  outline: 3px solid var(--ball);
  animation: today-pulse 1.6s ease-in-out infinite;
}

@keyframes today-pulse {
  0%,
  100% {
    outline-color: var(--ball);
  }
  50% {
    outline-color: var(--sun);
  }
}

.day {
  min-width: 132px;
  font-weight: 800;
  color: var(--ink-faint);
  font-size: 12px;
}

.matchup {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ha {
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 800;
  min-width: 18px;
}

.town b {
  display: block;
  line-height: 1.05;
}

.town small {
  font-size: 11px;
  color: var(--ink-faint);
  font-weight: 600;
}

.result {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 128px;
  justify-content: flex-end;
}

.badge {
  width: 22px;
  height: 22px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.badge.win {
  background: var(--mint);
}

.badge.loss {
  background: var(--pop);
}

.score {
  font-weight: 800;
  min-width: 52px;
  text-align: right;
}

.score small {
  color: var(--ink-faint);
  font-size: 10px;
}

.extras {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.extras small {
  color: var(--ink-faint);
  font-weight: 700;
}

.today-tag {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--ball-deep);
}

.soon {
  font-size: 11px;
  color: var(--ink-faint);
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .row.today {
    animation: none;
  }
}
</style>
