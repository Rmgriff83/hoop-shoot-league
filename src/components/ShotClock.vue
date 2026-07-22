<script setup lang="ts">
import { computed } from 'vue'
import { SHOT_CLOCK } from '../core/match/rack'

const props = defineProps<{
  remaining: number
  active: boolean
}>()

const R = 20
const CIRC = 2 * Math.PI * R

const frac = computed(() => Math.max(props.remaining / SHOT_CLOCK, 0))
const dash = computed(() => `${frac.value * CIRC} ${CIRC}`)
const urgent = computed(() => props.active && props.remaining < 1)
const color = computed(() => (urgent.value ? 'var(--pop)' : frac.value < 0.55 ? 'var(--sun)' : 'var(--mint)'))
</script>

<template>
  <div class="shot-clock" :class="{ active, urgent }">
    <svg viewBox="0 0 48 48">
      <circle cx="24" cy="24" :r="R" fill="var(--panel)" opacity="0.9" />
      <circle
        cx="24"
        cy="24"
        :r="R"
        fill="none"
        :stroke="color"
        stroke-width="5"
        stroke-linecap="round"
        :stroke-dasharray="dash"
        transform="rotate(-90 24 24)"
      />
    </svg>
    <span class="digits">{{ active ? remaining.toFixed(1) : SHOT_CLOCK.toFixed(1) }}</span>
  </div>
</template>

<style scoped>
.shot-clock {
  position: relative;
  width: 58px;
  height: 58px;
  opacity: 0.45;
  transition: opacity 0.15s ease-out;
}

.shot-clock.active {
  opacity: 1;
}

.shot-clock.urgent {
  animation: pulse 0.4s ease-in-out infinite;
}

svg {
  width: 100%;
  height: 100%;
}

.digits {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
  color: var(--ink);
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shot-clock.urgent {
    animation: none;
  }
}
</style>
