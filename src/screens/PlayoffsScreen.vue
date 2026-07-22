<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../stores/ui'
import { useCampaignStore } from '../stores/campaign'
import { shooterById } from '../core/data/shooters'
import { PLAYER_TEAM_ID } from '../core/league/leagueBuilder'
import type { PlayoffSeries } from '../core/league/types'

const ui = useUiStore()
const campaign = useCampaignStore()

const series = computed(() => campaign.doc?.season.series ?? [])

const columns = computed(() => [
  { title: 'East QF', items: series.value.filter((s) => s.round === 'quarterfinal' && s.conference === 'EAST') },
  { title: 'East Final', items: series.value.filter((s) => s.round === 'conferenceFinal' && s.conference === 'EAST') },
  { title: '🏆 Championship', items: series.value.filter((s) => s.round === 'championship') },
  { title: 'West Final', items: series.value.filter((s) => s.round === 'conferenceFinal' && s.conference === 'WEST') },
  { title: 'West QF', items: series.value.filter((s) => s.round === 'quarterfinal' && s.conference === 'WEST') },
])

function teamName(id: string): string {
  if (id === PLAYER_TEAM_ID) return campaign.doc?.hometown ?? 'You'
  return shooterById(id)?.hometown ?? id
}

function isMe(id: string): boolean {
  return id === PLAYER_TEAM_ID
}

function winnerSide(s: PlayoffSeries, id: string): boolean {
  return s.winnerId === id
}
</script>

<template>
  <div class="playoffs">
    <header class="top">
      <button class="btn btn--ghost btn--small" @click="ui.go('seasonHub')">← Season</button>
      <h1>Playoff Bracket</h1>
      <span class="spacer" />
    </header>

    <div class="bracket">
      <div v-for="col in columns" :key="col.title" class="col">
        <div class="col-title">{{ col.title }}</div>
        <div v-if="col.items.length === 0" class="tbd card">TBD</div>
        <div v-for="s in col.items" :key="s.id" class="series card" :class="{ done: s.winnerId }">
          <div class="matchup" :class="{ me: isMe(s.highSeedId), won: winnerSide(s, s.highSeedId) }">
            <span class="town">{{ teamName(s.highSeedId) }}</span>
            <span class="wins">{{ s.highWins }}</span>
          </div>
          <div class="matchup" :class="{ me: isMe(s.lowSeedId), won: winnerSide(s, s.lowSeedId) }">
            <span class="town">{{ teamName(s.lowSeedId) }}</span>
            <span class="wins">{{ s.lowWins }}</span>
          </div>
          <div class="bo">Bo{{ s.bestOf }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playoffs {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: linear-gradient(var(--sky) 60%, var(--sky-deep));
  overflow: auto;
}

.top {
  width: min(1000px, 100%);
  display: flex;
  align-items: center;
  gap: 12px;
}

.top h1 {
  color: #fff;
  font-size: 24px;
  text-shadow: 0 2px 0 rgba(53, 64, 92, 0.25);
}

.spacer {
  flex: 1;
}

.bracket {
  display: flex;
  gap: 12px;
  align-items: center;
  width: min(1000px, 100%);
  justify-content: center;
  flex-wrap: wrap;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 170px;
}

.col-title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
  text-align: center;
  text-shadow: 0 1px 0 rgba(53, 64, 92, 0.3);
}

.series {
  padding: 10px 12px;
  position: relative;
}

.series.done {
  opacity: 0.92;
}

.tbd {
  padding: 16px;
  text-align: center;
  color: var(--ink-faint);
  font-weight: 800;
}

.matchup {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-soft);
  padding: 3px 0;
}

.matchup.won {
  color: var(--ink);
}

.matchup.won .wins {
  color: var(--mint);
}

.matchup.me .town {
  color: var(--pop);
}

.wins {
  font-weight: 800;
}

.bo {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 9px;
  color: var(--ink-faint);
  font-weight: 800;
}
</style>
