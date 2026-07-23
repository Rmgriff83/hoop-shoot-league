<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useUiStore } from './stores/ui'
import { useCampaignStore } from './stores/campaign'
import TitleScreen from './screens/TitleScreen.vue'
import SandboxScreen from './screens/SandboxScreen.vue'
import MatchScreen from './screens/MatchScreen.vue'
import MatchResultScreen from './screens/MatchResultScreen.vue'
import CampaignCreateScreen from './screens/CampaignCreateScreen.vue'
import SeasonHubScreen from './screens/SeasonHubScreen.vue'
import StandingsScreen from './screens/StandingsScreen.vue'
import PlayoffsScreen from './screens/PlayoffsScreen.vue'
import ScheduleScreen from './screens/ScheduleScreen.vue'
import TimeTrialScreen from './screens/TimeTrialScreen.vue'

const ui = useUiStore()
const campaign = useCampaignStore()

onMounted(() => void campaign.init())

const screens: Partial<Record<string, unknown>> = {
  title: TitleScreen,
  sandbox: SandboxScreen,
  match: MatchScreen,
  matchResult: MatchResultScreen,
  campaignCreate: CampaignCreateScreen,
  seasonHub: SeasonHubScreen,
  standings: StandingsScreen,
  playoffs: PlayoffsScreen,
  schedule: ScheduleScreen,
  timeTrial: TimeTrialScreen,
}

const current = computed(() => screens[ui.screen] ?? TitleScreen)
</script>

<template>
  <component :is="current" :key="ui.screen" />
  <!-- Landscape game — friendly nudge on portrait phones. Capacitor's
       screen-orientation lock replaces this on device (Phase 8). -->
  <div class="rotate-nudge">
    <div class="rotate-inner">
      <div class="rotate-emoji">📱↻</div>
      <p>turn your phone sideways!</p>
    </div>
  </div>
</template>

<style scoped>
.rotate-nudge {
  display: none;
}

@media (orientation: portrait) and (max-width: 600px) {
  .rotate-nudge {
    position: fixed;
    inset: 0;
    z-index: 99;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--sky);
  }

  .rotate-inner {
    text-align: center;
    color: #fff;
    font-size: 20px;
    font-weight: 800;
    text-shadow: 0 2px 0 rgba(53, 64, 92, 0.3);
  }

  .rotate-emoji {
    font-size: 64px;
    margin-bottom: 10px;
  }
}
</style>
