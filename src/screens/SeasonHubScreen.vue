<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useCampaignStore } from '../stores/campaign'
import { useMatchStore } from '../stores/match'
import { shooterById } from '../core/data/shooters'
import { SEASON_DAYS } from '../core/league/scheduleGen'
import { PLAYER_TEAM_ID } from '../core/league/leagueBuilder'

const ui = useUiStore()
const campaign = useCampaignStore()
const match = useMatchStore()
const busy = ref(false)

const d = computed(() => campaign.doc)
const phase = computed(() => d.value?.season.phase)

const myRow = computed(() => {
  if (!d.value) return null
  const table = d.value.conference === 'EAST' ? campaign.east : campaign.west
  return table.find((r) => r.teamId === PLAYER_TEAM_ID) ?? null
})

const opponent = computed(() => {
  const id = campaign.opponentIdToday
  return id ? shooterById(id) : undefined
})

const seriesLine = computed(() => {
  const s = campaign.currentSeries
  if (!s || !d.value) return null
  const meHigh = s.highSeedId === PLAYER_TEAM_ID
  const myWins = meHigh ? s.highWins : s.lowWins
  const theirWins = meHigh ? s.lowWins : s.highWins
  const roundName =
    s.round === 'quarterfinal' ? 'Conference Quarterfinal' : s.round === 'conferenceFinal' ? 'Conference Final' : 'CHAMPIONSHIP'
  return { roundName, myWins, theirWins, bestOf: s.bestOf, gameNo: s.highWins + s.lowWins + 1 }
})

const champName = computed(() => {
  const id = d.value?.season.championId
  if (!id) return null
  if (id === PLAYER_TEAM_ID) return d.value?.playerName ?? 'You'
  return shooterById(id)?.name ?? id
})

const playerIsChamp = computed(() => d.value?.season.championId === PLAYER_TEAM_ID)

function playLive() {
  if (campaign.setupLiveMatch()) ui.go('match')
}

async function simDay() {
  busy.value = true
  await campaign.simToday()
  busy.value = false
}

async function simRest() {
  busy.value = true
  await campaign.simRestOfSeason()
  busy.value = false
}

async function advancePlayoffs() {
  busy.value = true
  await campaign.simPlayoffStep()
  busy.value = false
}

async function nextSeason() {
  busy.value = true
  await campaign.startNextSeason()
  busy.value = false
}

function accStars(v: number): string {
  return '●'.repeat(Math.round(v * 5)).padEnd(5, '○')
}
</script>

<template>
  <div class="hub">
    <div v-if="!d" class="card center-card">
      <p>No campaign loaded.</p>
      <button class="btn" @click="ui.go('campaignCreate')">New Campaign</button>
      <button class="btn btn--ghost" @click="ui.go('title')">Title</button>
    </div>

    <template v-else>
      <header class="top">
        <button class="btn btn--ghost btn--small" @click="ui.go('title')">← Title</button>
        <div class="who">
          <b>{{ d.playerName }}</b> · {{ d.hometown }} · {{ d.conference }}
          <span class="record" v-if="myRow"> {{ myRow.w }}–{{ myRow.l }}</span>
        </div>
        <div class="nav">
          <button class="btn btn--ghost btn--small" @click="ui.go('schedule')">Schedule 📅</button>
          <button class="btn btn--ghost btn--small" @click="ui.go('standings')">Standings 📊</button>
        </div>
      </header>

      <!-- Regular season -->
      <div v-if="phase === 'regular'" class="main card pop-in">
        <div class="day-tag">Season {{ d.year }} · Day {{ d.season.currentDay }} / {{ SEASON_DAYS }}</div>
        <template v-if="opponent">
          <div class="opp-card" :style="{ '--opp': opponent.colors.primary }">
            <div class="opp-jersey">#{{ opponent.number }}</div>
            <div class="opp-info">
              <div class="opp-name">{{ opponent.name }} <small>“{{ opponent.nickname }}”</small></div>
              <div class="opp-town">{{ opponent.hometown }}</div>
              <div class="opp-rating">shooting {{ accStars(opponent.ratings.accuracy) }} · arc {{ accStars(opponent.ratings.swishRate) }}</div>
              <div class="opp-bio">{{ opponent.bio }}</div>
            </div>
          </div>
          <div class="actions">
            <button class="btn" :disabled="busy" @click="playLive">Play 🏀</button>
            <button class="btn btn--ghost" :disabled="busy" @click="simDay">Sim day</button>
            <button class="btn btn--ghost" :disabled="busy" @click="simRest">Sim rest of season ⏩</button>
          </div>
        </template>
      </div>

      <!-- Playoffs -->
      <div v-else-if="phase === 'playoffs'" class="main card pop-in">
        <div class="day-tag">🏆 Season {{ d.year }} Playoffs</div>
        <template v-if="seriesLine && opponent">
          <div class="round-name">{{ seriesLine.roundName }}</div>
          <div class="series-score">
            <span class="you">{{ seriesLine.myWins }}</span>
            <span class="dash">–</span>
            <span class="them">{{ seriesLine.theirWins }}</span>
            <small>best of {{ seriesLine.bestOf }}</small>
          </div>
          <div class="opp-card" :style="{ '--opp': opponent.colors.primary }">
            <div class="opp-jersey">#{{ opponent.number }}</div>
            <div class="opp-info">
              <div class="opp-name">{{ opponent.name }} <small>“{{ opponent.nickname }}”</small></div>
              <div class="opp-town">{{ opponent.hometown }}</div>
            </div>
          </div>
          <div class="actions">
            <button class="btn" @click="playLive">Play Game {{ seriesLine.gameNo }} 🏀</button>
            <button class="btn btn--ghost" @click="ui.go('playoffs')">Bracket</button>
          </div>
          <div class="forced-note">playoff games are always played live — no simming your way to a ring</div>
        </template>
        <template v-else>
          <p class="eliminated">You're out of the running — the league plays on.</p>
          <div class="actions">
            <button class="btn" :disabled="busy" @click="advancePlayoffs">Advance league ⏩</button>
            <button class="btn btn--ghost" @click="ui.go('playoffs')">Bracket</button>
          </div>
        </template>
      </div>

      <!-- Season done -->
      <div v-else class="main card pop-in">
        <div class="champ" :class="{ mine: playerIsChamp }">
          <div class="champ-emoji bob">{{ playerIsChamp ? '🏆🎉' : '🏆' }}</div>
          <div class="champ-line">
            <b>{{ champName }}</b> {{ playerIsChamp ? '— THAT’S YOU! CHAMPION!' : `wins the Season ${d.year} title` }}
          </div>
        </div>
        <div class="actions">
          <button class="btn" :disabled="busy" @click="nextSeason">Start Season {{ d.year + 1 }} →</button>
          <button class="btn btn--ghost" @click="ui.go('playoffs')">Final bracket</button>
        </div>
      </div>

      <footer class="career" v-if="d.career.totals.games > 0">
        career: {{ d.career.totals.wins }}W–{{ d.career.totals.losses }}L played live · {{ d.career.championships }} 💍 ·
        high {{ d.career.highs.points }} pts · best streak {{ d.career.highs.streak }}
      </footer>
    </template>
  </div>
</template>

<style scoped>
.hub {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: linear-gradient(var(--sky) 60%, var(--sky-deep));
  overflow-y: auto;
}

.center-card {
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.top {
  width: min(720px, 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.who {
  font-size: 15px;
  color: #fff;
  text-shadow: 0 2px 0 rgba(53, 64, 92, 0.25);
}

.record {
  font-weight: 800;
  color: var(--sun);
}

.nav {
  display: flex;
  gap: 8px;
}

.main {
  width: min(720px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
}

.day-tag {
  font-size: 14px;
  color: var(--ink-faint);
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.opp-card {
  display: flex;
  gap: 16px;
  align-items: center;
  background: var(--panel-soft);
  border-radius: var(--radius);
  padding: 14px;
  border-left: 8px solid var(--opp, var(--grape));
}

.opp-jersey {
  font-size: 30px;
  font-weight: 800;
  color: var(--opp, var(--grape));
  min-width: 66px;
  text-align: center;
}

.opp-name {
  font-size: 20px;
  font-weight: 800;
}

.opp-name small {
  color: var(--ink-soft);
  font-weight: 700;
}

.opp-town {
  font-size: 13px;
  color: var(--ink-soft);
}

.opp-rating {
  font-size: 12px;
  color: var(--ink-faint);
  letter-spacing: 1px;
}

.opp-bio {
  font-size: 13px;
  color: var(--ink-soft);
  margin-top: 4px;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.round-name {
  font-size: 22px;
  font-weight: 800;
}

.series-score {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 38px;
  font-weight: 800;
}

.series-score .you {
  color: var(--pop);
}

.series-score .them {
  color: var(--grape);
}

.series-score small {
  font-size: 13px;
  color: var(--ink-faint);
}

.forced-note {
  font-size: 12px;
  color: var(--ink-faint);
}

.eliminated {
  font-size: 15px;
  color: var(--ink-soft);
}

.champ {
  display: flex;
  align-items: center;
  gap: 16px;
}

.champ-emoji {
  font-size: 44px;
}

.champ-line {
  font-size: 18px;
}

.champ.mine .champ-line {
  color: var(--pop);
  font-weight: 800;
}

.career {
  font-size: 13px;
  color: #fff;
  opacity: 0.85;
  text-shadow: 0 1px 0 rgba(53, 64, 92, 0.3);
}
</style>
