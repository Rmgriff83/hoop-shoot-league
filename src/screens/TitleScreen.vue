<script setup lang="ts">
import { useUiStore } from '../stores/ui'
import { useMatchStore } from '../stores/match'
import { useCampaignStore } from '../stores/campaign'

const ui = useUiStore()
const match = useMatchStore()
const campaign = useCampaignStore()

function quickMatch() {
  match.setupQuickMatch()
  ui.go('match')
}

function playSeason() {
  ui.go(campaign.doc ? 'seasonHub' : 'campaignCreate')
}
</script>

<template>
  <div class="title-screen">
    <div class="art bob">🏀</div>
    <h1 class="logo pop-in">
      <span class="logo-hoop">HOOP&nbsp;SHOOT</span>
      <span class="logo-league">LEAGUE</span>
    </h1>
    <div class="menu">
      <button class="btn" @click="playSeason">
        {{ campaign.doc ? `Continue Season ${campaign.doc.year} 🏆` : 'Start a Season 🏆' }}
      </button>
      <button class="btn" @click="quickMatch">Quick Match 🏀</button>
      <button class="btn" @click="ui.go('timeTrial')">Time Trial ⏱</button>
      <button class="btn btn--mint" @click="ui.go('sandbox')">Shot Sandbox</button>
      <button v-if="campaign.doc" class="btn btn--ghost btn--small" @click="ui.go('campaignCreate')">
        + new campaign
      </button>
    </div>
  </div>
</template>

<style scoped>
.title-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  background: linear-gradient(var(--sky) 60%, var(--sky-deep));
}

.art {
  font-size: 84px;
  filter: drop-shadow(0 10px 0 rgba(53, 64, 92, 0.15));
}

.logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 0.95;
  text-align: center;
}

.logo-hoop {
  font-size: 52px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 5px 0 rgba(53, 64, 92, 0.25);
  letter-spacing: 2px;
}

.logo-league {
  font-size: 30px;
  font-weight: 800;
  color: var(--sun);
  text-shadow: 0 4px 0 rgba(53, 64, 92, 0.25);
  letter-spacing: 12px;
  margin-left: 12px;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 10px;
}
</style>
