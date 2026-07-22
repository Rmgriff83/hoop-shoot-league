<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useMatchStore } from '../stores/match'
import { useCampaignStore } from '../stores/campaign'

const ui = useUiStore()
const match = useMatchStore()
const campaign = useCampaignStore()
const saving = ref(false)

const r = computed(() => match.result)
const isLeague = computed(() => match.leagueGameId !== null)

function pct(makes: number, shots: number): string {
  if (!shots) return '—'
  return `${Math.round((makes / shots) * 100)}%`
}

function rematch() {
  ui.go('match')
}

async function continueSeason() {
  if (!r.value || saving.value) return
  saving.value = true
  await campaign.applyLiveResult(r.value)
  match.leagueGameId = null
  saving.value = false
  ui.go('seasonHub')
}
</script>

<template>
  <div class="result-screen">
    <div v-if="r" class="card panel pop-in">
      <div class="emoji bob">{{ r.won ? '🏆' : '😤' }}</div>
      <h1 class="headline">{{ r.won ? 'YOU WIN!' : 'TOUGH ONE…' }}</h1>
      <div class="final">
        <span class="you">{{ r.playerScore }}</span>
        <span class="dash">–</span>
        <span class="them">{{ r.aiScore }}</span>
        <span v-if="r.otNumber" class="ot">({{ r.otNumber }}OT)</span>
      </div>
      <div class="opp">vs {{ r.opponent.name }} · {{ r.opponent.hometown }}</div>

      <table class="stats">
        <thead>
          <tr>
            <th>you</th>
            <th></th>
            <th>them</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{{ r.player.makes }}/{{ r.player.shots.length }}</td>
            <th>makes</th>
            <td>{{ r.ai ? `${r.ai.makes}/${r.ai.shots.length}` : '—' }}</td>
          </tr>
          <tr>
            <td>{{ pct(r.player.makes, r.player.shots.length) }}</td>
            <th>shooting</th>
            <td>{{ r.ai ? pct(r.ai.makes, r.ai.shots.length) : '—' }}</td>
          </tr>
          <tr>
            <td>✨ {{ r.player.swishes }}</td>
            <th>swishes</th>
            <td>✨ {{ r.ai?.swishes ?? '—' }}</td>
          </tr>
          <tr>
            <td>{{ r.player.longestStreak }}</td>
            <th>best streak</th>
            <td>{{ r.ai?.longestStreak ?? '—' }}</td>
          </tr>
          <tr v-if="r.player.violations || r.ai?.violations">
            <td>{{ r.player.violations }}</td>
            <th>clock ⏰</th>
            <td>{{ r.ai?.violations ?? '—' }}</td>
          </tr>
        </tbody>
      </table>

      <div class="buttons">
        <button v-if="isLeague" class="btn btn--mint" :disabled="saving" @click="continueSeason">
          Continue season →
        </button>
        <template v-else>
          <button class="btn" @click="rematch">Rematch 🏀</button>
          <button class="btn btn--ghost" @click="ui.go('title')">Title</button>
        </template>
      </div>
    </div>
    <div v-else class="card panel">
      <p>No match played yet.</p>
      <button class="btn" @click="ui.go('title')">Title</button>
    </div>
  </div>
</template>

<style scoped>
.result-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(var(--sky) 60%, var(--sky-deep));
}

.panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 26px 42px;
  max-height: 92vh;
  overflow-y: auto;
}

.emoji {
  font-size: 56px;
}

.headline {
  font-size: 34px;
  font-weight: 800;
  color: var(--ink);
}

.final {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 44px;
  font-weight: 800;
}

.final .you {
  color: var(--pop);
}

.final .them {
  color: var(--grape);
}

.final .dash {
  color: var(--ink-faint);
}

.final .ot {
  font-size: 18px;
  color: var(--ink-soft);
}

.opp {
  font-size: 14px;
  color: var(--ink-soft);
}

.stats {
  border-collapse: collapse;
  margin: 10px 0;
}

.stats th {
  font-size: 12px;
  color: var(--ink-faint);
  padding: 4px 16px;
  font-weight: 700;
}

.stats td {
  font-size: 17px;
  font-weight: 800;
  padding: 4px 16px;
  text-align: center;
  min-width: 74px;
}

.buttons {
  display: flex;
  gap: 12px;
  margin-top: 6px;
}
</style>
