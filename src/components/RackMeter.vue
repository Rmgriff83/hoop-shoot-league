<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  size: number
  used: number
  /** CSS color for the remaining balls. */
  color?: string
  mirrored?: boolean
}>()

const balls = computed(() =>
  Array.from({ length: props.size }, (_, i) => ({
    spent: props.mirrored ? i >= props.size - props.used : i < props.used,
  })),
)
</script>

<template>
  <div class="rack-meter" :class="{ ot: size <= 7 }">
    <span
      v-for="(b, i) in balls"
      :key="i"
      class="dot"
      :class="{ spent: b.spent }"
      :style="{ background: b.spent ? undefined : (color ?? 'var(--ball)') }"
    />
  </div>
</template>

<style scoped>
.rack-meter {
  display: grid;
  grid-template-columns: repeat(13, 9px);
  gap: 3px;
}

.rack-meter.ot {
  grid-template-columns: repeat(7, 9px);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  transition:
    transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.4),
    opacity 0.25s ease-out;
}

.dot.spent {
  background: rgba(53, 64, 92, 0.18);
  transform: scale(0.6);
}
</style>
