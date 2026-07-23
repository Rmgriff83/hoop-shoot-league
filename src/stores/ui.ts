import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Screen =
  | 'title'
  | 'sandbox'
  | 'campaignCreate'
  | 'seasonHub'
  | 'match'
  | 'matchResult'
  | 'standings'
  | 'schedule'
  | 'timeTrial'
  | 'playoffs'
  | 'shooterCard'

/** Screen switcher — the game has no router; screens are full-viewport SFCs. */
export const useUiStore = defineStore('ui', () => {
  const screen = ref<Screen>('title')

  function go(next: Screen) {
    screen.value = next
  }

  return { screen, go }
})
