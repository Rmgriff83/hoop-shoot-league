<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useCampaignStore } from '../stores/campaign'
import type { Conference } from '../core/league/types'
import type { DifficultyTier } from '../core/league/playerRatings'

const ui = useUiStore()
const campaign = useCampaignStore()

const name = ref('')
const hometown = ref('')
const conference = ref<Conference>('EAST')
const difficulty = ref<DifficultyTier>('pro')
const creating = ref(false)

const TIERS: { id: DifficultyTier; label: string; blurb: string }[] = [
  { id: 'rookie', label: '🐣 Rookie', blurb: 'rivals miss a lot' },
  { id: 'pro', label: '🏀 Pro', blurb: 'a fair fight' },
  { id: 'allstar', label: '⭐ All-Star', blurb: 'they rarely miss' },
  { id: 'legend', label: '👑 Legend', blurb: 'bring a mop for your tears' },
]

async function start() {
  if (!name.value.trim() || !hometown.value.trim() || creating.value) return
  creating.value = true
  await campaign.createCampaign(name.value.trim(), hometown.value.trim(), conference.value, difficulty.value)
  creating.value = false
  ui.go('seasonHub')
}
</script>

<template>
  <div class="create-screen">
    <div class="card panel pop-in">
      <h1 class="title">New Campaign</h1>

      <label class="field">
        <span>Your name</span>
        <input v-model="name" maxlength="18" placeholder="Ace Bucketworth" />
      </label>

      <label class="field">
        <span>Hometown <small>(that's your team!)</small></span>
        <input v-model="hometown" maxlength="18" placeholder="Splashville" />
      </label>

      <div class="field">
        <span>Conference</span>
        <div class="seg">
          <button class="seg-btn" :class="{ on: conference === 'EAST' }" @click="conference = 'EAST'">EAST</button>
          <button class="seg-btn" :class="{ on: conference === 'WEST' }" @click="conference = 'WEST'">WEST</button>
        </div>
      </div>

      <div class="field">
        <span>Difficulty</span>
        <div class="tiers">
          <button
            v-for="t in TIERS"
            :key="t.id"
            class="tier"
            :class="{ on: difficulty === t.id }"
            @click="difficulty = t.id"
          >
            <b>{{ t.label }}</b>
            <small>{{ t.blurb }}</small>
          </button>
        </div>
      </div>

      <div class="buttons">
        <button class="btn" :disabled="!name.trim() || !hometown.trim() || creating" @click="start">
          Tip off! 🏀
        </button>
        <button class="btn btn--ghost" @click="ui.go('title')">Back</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.create-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(var(--sky) 60%, var(--sky-deep));
  overflow-y: auto;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px 34px;
  width: min(480px, 92vw);
  max-height: 92vh;
  overflow-y: auto;
}

.title {
  font-size: 28px;
  text-align: center;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--ink-soft);
  font-weight: 700;
}

.field small {
  color: var(--ink-faint);
  font-weight: 600;
}

.field input {
  font: inherit;
  font-size: 18px;
  padding: 10px 14px;
  border: 3px solid var(--rule);
  border-radius: 14px;
  background: var(--panel-soft);
  color: var(--ink);
  outline: none;
  user-select: text;
  -webkit-user-select: text;
}

.field input:focus {
  border-color: var(--pop);
}

.seg {
  display: flex;
  gap: 8px;
}

.seg-btn {
  flex: 1;
  padding: 10px;
  border-radius: 12px;
  background: var(--panel-soft);
  font-weight: 800;
  font-size: 16px;
  color: var(--ink-faint);
  border: 3px solid var(--rule);
}

.seg-btn.on {
  background: var(--pop);
  color: #fff;
  border-color: var(--pop-deep);
}

.tiers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tier {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--panel-soft);
  border: 3px solid var(--rule);
  color: var(--ink);
}

.tier small {
  color: var(--ink-faint);
  font-weight: 600;
}

.tier.on {
  border-color: var(--mint);
  background: #e9fbf4;
}

.buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 4px;
}
</style>
