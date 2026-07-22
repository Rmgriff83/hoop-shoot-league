<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../stores/ui'
import { useCampaignStore } from '../stores/campaign'
import { shooterById } from '../core/data/shooters'
import { PLAYER_TEAM_ID } from '../core/league/leagueBuilder'
import type { StandingRow } from '../core/league/types'
import { currentStreak, gamesBehind, type ClinchInfo } from '../core/league/standings'
import { SEASON_DAYS } from '../core/league/scheduleGen'

const ui = useUiStore()
const campaign = useCampaignStore()

const tables = computed(() => [
  { name: 'EASTERN', rows: campaign.east, clinches: campaign.eastClinches as Map<string, ClinchInfo> },
  { name: 'WESTERN', rows: campaign.west, clinches: campaign.westClinches as Map<string, ClinchInfo> },
])

function clinchOf(t: { clinches: Map<string, ClinchInfo> }, row: StandingRow): ClinchInfo {
  return t.clinches.get(row.teamId) ?? { playoffs: false, topSeed: false, eliminated: false }
}

function streakOf(row: StandingRow): { label: string; hot: boolean; cold: boolean } {
  const s = currentStreak(row.teamId, campaign.doc?.season.schedule ?? [])
  if (!s) return { label: '—', hot: false, cold: false }
  return { label: `${s.type}${s.count}`, hot: s.type === 'W' && s.count >= 3, cold: s.type === 'L' && s.count >= 3 }
}

function gbLabel(t: { rows: StandingRow[] }, row: StandingRow): string {
  const leader = t.rows[0]
  if (!leader || row.teamId === leader.teamId) return '—'
  const gb = gamesBehind(leader, row)
  return Number.isInteger(gb) ? String(gb) : gb.toFixed(1)
}

function teamLabel(row: StandingRow): { town: string; name: string } {
  if (row.teamId === PLAYER_TEAM_ID) {
    return { town: campaign.doc?.hometown ?? 'You', name: campaign.doc?.playerName ?? '' }
  }
  const s = shooterById(row.teamId)
  return { town: s?.hometown ?? row.teamId, name: s?.name ?? '' }
}
</script>

<template>
  <div class="standings">
    <header class="top">
      <button class="btn btn--ghost btn--small" @click="ui.go('seasonHub')">← Season</button>
      <h1>Standings</h1>
      <span class="spacer" />
    </header>

    <div class="tables">
      <div v-for="t in tables" :key="t.name" class="card conf">
        <h2>{{ t.name }}</h2>
        <table>
          <thead>
            <tr>
              <th class="rank">#</th>
              <th class="team">team</th>
              <th>W</th>
              <th>L</th>
              <th>pct</th>
              <th>GB</th>
              <th>left</th>
              <th>strk</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in t.rows"
              :key="row.teamId"
              :class="{
                me: row.teamId === PLAYER_TEAM_ID,
                playoff: (row.seed ?? 9) <= 4,
                out: clinchOf(t, row).eliminated,
              }"
            >
              <td class="rank">{{ row.seed }}</td>
              <td class="team">
                <span class="team-line">
                  <b>{{ teamLabel(row).town }}</b>
                  <span v-if="clinchOf(t, row).topSeed" class="clinch top pop-in" title="clinched #1 seed">★1</span>
                  <span v-else-if="clinchOf(t, row).playoffs" class="clinch in pop-in" title="clinched playoff berth">✓</span>
                  <span v-else-if="clinchOf(t, row).eliminated" class="clinch elim pop-in" title="eliminated from playoff contention">✗</span>
                </span>
                <small>{{ teamLabel(row).name }}</small>
              </td>
              <td>{{ row.w }}</td>
              <td>{{ row.l }}</td>
              <td>{{ (row.pct * 100).toFixed(0) }}</td>
              <td class="gb">{{ gbLabel(t, row) }}</td>
              <td class="gb">{{ SEASON_DAYS - row.w - row.l }}</td>
              <td class="streak" :class="{ hot: streakOf(row).hot, cold: streakOf(row).cold }">
                {{ streakOf(row).label }}<span v-if="streakOf(row).hot" class="flame">🔥</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="legend">top 4 make the playoffs · <b class="lg-in">✓</b> clinched berth · <b class="lg-top">★1</b> clinched top seed · <b class="lg-elim">✗</b> eliminated</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.standings {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: linear-gradient(var(--sky) 60%, var(--sky-deep));
  overflow-y: auto;
}

.top {
  width: min(880px, 100%);
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

.tables {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: center;
  width: min(880px, 100%);
}

.conf {
  flex: 1;
  min-width: 320px;
  padding: 16px;
}

.conf h2 {
  font-size: 15px;
  letter-spacing: 2px;
  color: var(--ink-faint);
  margin-bottom: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th {
  font-size: 11px;
  color: var(--ink-faint);
  text-align: center;
  padding: 4px 6px;
}

td {
  text-align: center;
  padding: 5px 6px;
  font-weight: 700;
}

.team {
  text-align: left;
}

.team small {
  display: block;
  font-size: 11px;
  color: var(--ink-faint);
  font-weight: 600;
}

tr.playoff td.rank {
  color: var(--mint);
}

td.gb {
  color: var(--ink-soft);
}

td.streak {
  color: var(--ink-soft);
  white-space: nowrap;
}

td.streak.hot {
  color: var(--mint);
}

td.streak.cold {
  color: var(--pop);
}

.flame {
  font-size: 11px;
  margin-left: 1px;
}

tr.me {
  background: #fff1e6;
  border-radius: 8px;
}

tr.me .team b {
  color: var(--pop);
}

.legend {
  margin-top: 8px;
  font-size: 11px;
  color: var(--ink-faint);
}

.team-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.clinch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
}

.clinch.in {
  background: var(--mint);
}

.clinch.top {
  background: var(--sun);
  color: var(--ink);
}

.clinch.elim {
  background: rgba(53, 64, 92, 0.22);
}

tr.out td {
  opacity: 0.55;
}

.lg-in {
  color: var(--mint);
}

.lg-top {
  color: #d9ae1a;
}

.lg-elim {
  color: var(--ink-faint);
}
</style>
