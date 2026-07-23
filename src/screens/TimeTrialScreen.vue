<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRef } from 'vue'
import * as THREE from 'three'
import { useUiStore } from '../stores/ui'
import { useThreeScene, type SceneCtx } from '../composables/useThreeScene'
import { useSpringNumber } from '../composables/useSpringNumber'
import { makeClouds, makeHalfCourtFloor, makeHoop, makeLights, COLORS, type HoopView } from '../engine/render/courtScene'
import { BallView } from '../engine/render/ballView'
import { NetView } from '../engine/render/netView'
import { RigView } from '../engine/render/rigView'
import { Confetti } from '../engine/render/confetti'
import { TrajectoryPreview } from '../engine/render/trajectoryPreview'
import { attachDragAim } from '../engine/input/dragAim'
import { TimeTrial, TIME_TRIAL_SECONDS, type TimeTrialEvent } from '../core/match/timeTrial'
import { HOOP_X, RIM_HEIGHT, RELEASE_HEIGHT } from '../core/physics/constants'
import {
  saveTimeTrialScore,
  topTimeTrialScores,
  type TimeTrialScoreDoc,
} from '../engine/db/TimeTrialRepository'
import {
  unlockAudio,
  playRimClang,
  playBoardThud,
  playBounce,
  playSwish,
  playNet,
  playScorePop,
  playBuzzer,
} from '../engine/sfx'

const ui = useUiStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

const trial = new TimeTrial()

const hud = reactive({
  phase: trial.phase as string,
  countdownLabel: '3',
  timeLeft: TIME_TRIAL_SECONDS,
  score: 0,
  streak: 0,
  banner: '',
})
const bannerKey = ref(0)
const scoreDisplay = useSpringNumber(toRef(hud, 'score'))
const board = ref<TimeTrialScoreDoc[]>([])
const runId = `tt${Date.now().toString(36)}`
const isNewBest = ref(false)
const saving = ref(false)

let hoop: HoopView
let net: NetView
let preview: TrajectoryPreview
let confetti: Confetti
let rig: RigView
let clouds: THREE.Group
let sceneCamera: THREE.PerspectiveCamera | null = null
const ballPool: BallView[] = []
const POOL = 5

// Shooting direction: physics stays canonical (+x toward the hoop); "lefty"
// just views the court from the other side and mirrors the drag input.
const DIR_KEY = 'hsl-shoot-dir'
const shootRight = ref(localStorage.getItem(DIR_KEY) !== 'left')

function applyDirection() {
  if (!sceneCamera) return
  // Exact canonical equivalent of the campaign's AIM framing (cameraRig.ts:
  // world (5.1, 3.2, 18.5) → canon x = 8.815 − 5.1 = 3.715).
  sceneCamera.position.set(3.715, 3.2, shootRight.value ? 18.5 : -18.5)
  sceneCamera.lookAt(3.715, 2.9, 0)
  // Keep the clouds on the far side of the court from the camera.
  clouds.scale.z = shootRight.value ? 1 : -1
}

function toggleDirection() {
  shootRight.value = !shootRight.value
  localStorage.setItem(DIR_KEY, shootRight.value ? 'right' : 'left')
  preview.hide()
  applyDirection()
}

function showBanner(text: string) {
  hud.banner = text
  bannerKey.value++
}

async function finishRun() {
  saving.value = true
  const doc: TimeTrialScoreDoc = {
    id: runId,
    score: trial.score,
    makes: trial.makes,
    swishes: trial.swishes,
    attempts: trial.attempts,
    bestStreak: trial.bestStreak,
    playedAt: Date.now(),
  }
  await saveTimeTrialScore(doc)
  board.value = await topTimeTrialScores(10)
  isNewBest.value = board.value[0]?.id === runId && board.value.length > 1
  if (board.value[0]?.id === runId) confetti.burst(3.6, 3.5, 1, 120)
  saving.value = false
}

function handleEvent(ev: TimeTrialEvent) {
  switch (ev.kind) {
    case 'go':
      showBanner('GO! 🏀')
      break
    case 'pickup':
      rig.onPickup()
      break
    case 'release':
      rig.onRelease()
      break
    case 'contact': {
      const punch = Math.min(ev.contact.speed / 7, 1)
      if (ev.contact.kind === 'rim') {
        hoop.wobble.kick(punch * 8)
        playRimClang(punch)
      } else if (ev.contact.kind === 'board') playBoardThud(punch)
      else if (ev.contact.kind === 'floor') playBounce(punch * 0.6)
      break
    }
    case 'outcome': {
      const swish = ev.outcome.points === 2
      rig.onOutcome(ev.outcome.made, swish)
      if (ev.outcome.made) {
        if (swish) playSwish()
        else playNet()
        playScorePop(swish)
        if (swish) confetti.burst(HOOP_X, RIM_HEIGHT + 0.4, 0, 36)
        if (ev.buzzerBeater) showBanner(`🚨 BUZZER BEATER +${ev.outcome.points}!`)
        else if (swish) showBanner('✨ SWISH +2')
        else if (trial.streak >= 3) showBanner(`🔥 +1 (${trial.streak} straight)`)
        else showBanner('+1')
      } else if (ev.outcome.type === 'IN_AND_OUT') {
        showBanner('💔 in and out!')
      }
      break
    }
    case 'buzzer':
      playBuzzer()
      showBanner('⏰ TIME!')
      break
    case 'done':
      void finishRun()
      break
  }
}

useThreeScene(canvasRef, {
  init({ scene, camera }: SceneCtx) {
    scene.background = new THREE.Color(COLORS.sky)
    makeLights(scene)
    clouds = makeClouds(scene, [-5, 10])
    makeHalfCourtFloor(scene)
    hoop = makeHoop(scene)
    hoop.group.position.set(HOOP_X, RIM_HEIGHT, 0)
    net = new NetView(scene, { x: HOOP_X, y: RIM_HEIGHT, z: 0 })
    rig = new RigView(scene, -0.45, 1, { jersey: 0xff5d73 })
    for (let i = 0; i < POOL; i++) {
      const b = new BallView(scene)
      b.setVisible(false)
      ballPool.push(b)
    }
    preview = new TrajectoryPreview(scene)
    confetti = new Confetti(scene)
    sceneCamera = camera
    applyDirection()
  },

  frame(dt: number) {
    trial.tick(dt)
    for (const ev of trial.drainEvents()) handleEvent(ev)

    // Map in-flight balls (+ the held ball) onto the view pool.
    const flights = trial.balls
    let slot = 0
    for (const state of flights) {
      if (slot >= POOL) break
      const view = ballPool[slot++]!
      view.setVisible(true)
      view.update(state.pos, state.vel, state.spin, dt)
    }
    if (trial.holding && slot < POOL) {
      const view = ballPool[slot++]!
      view.setVisible(true)
      view.update({ x: 0, y: RELEASE_HEIGHT, z: 0 }, { x: 0, y: 0, z: 0 }, 0, dt)
    }
    for (; slot < POOL; slot++) ballPool[slot]!.setVisible(false)

    const nearest = flights[flights.length - 1] ?? null
    net.update(Math.min(dt, 1 / 30), nearest && !nearest.settled ? nearest.pos : null)
    hoop.update(dt)
    rig.update(dt)
    confetti.update(dt)

    hud.phase = trial.phase
    hud.timeLeft = trial.timeLeft
    hud.score = trial.score
    hud.streak = trial.streak
    hud.countdownLabel = trial.countdown > 0.66 ? String(Math.ceil(trial.countdown)) : 'GO!'
  },
})

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const detach = attachDragAim(
    canvas,
    {
      onStart: () => {
        unlockAudio()
        trial.pickup()
      },
      onAim: (launch) => {
        if (launch && trial.holding) preview.show(launch)
        else preview.hide()
      },
      onRelease: (launch) => {
        preview.hide()
        trial.release(launch)
      },
      onCancel: () => preview.hide(),
    },
    { facing: () => (shootRight.value ? 1 : -1) },
  )
  onBeforeUnmount(detach)
})

const urgent = computed(() => hud.phase === 'running' && hud.timeLeft < 10)

function retry() {
  // Simplest reliable reset: remount the screen.
  ui.go('title')
  requestAnimationFrame(() => ui.go('timeTrial'))
}
</script>

<template>
  <div class="trial">
    <canvas ref="canvasRef" class="scene" />

    <!-- Countdown -->
    <div v-if="hud.phase === 'countdown'" :key="hud.countdownLabel" class="countdown pop-in">
      {{ hud.countdownLabel }}
    </div>

    <!-- Timer + score -->
    <div class="topbar">
      <div class="timer card" :class="{ urgent }">
        ⏱ {{ Math.ceil(hud.timeLeft) }}<small>s</small>
      </div>
      <div class="scorebox card">
        <span class="pts">{{ scoreDisplay }}</span>
        <small>pts</small>
        <span v-if="hud.streak >= 3" class="streak wiggle">🔥{{ hud.streak }}</span>
      </div>
    </div>

    <div v-if="hud.banner" :key="bannerKey" class="banner pop-in">{{ hud.banner }}</div>
    <div v-if="hud.phase === 'finishing'" class="waiting">waiting on the last shot…</div>

    <div class="corner">
      <button class="btn btn--ghost btn--small" @click="toggleDirection">
        {{ shootRight ? 'shooting ➡️' : '⬅️ shooting' }}
      </button>
      <button class="btn btn--ghost btn--small" @click="ui.go('title')">✕</button>
    </div>

    <!-- Results + leaderboard -->
    <div v-if="hud.phase === 'done'" class="overlay">
      <div class="card panel pop-in">
        <div class="emoji bob">{{ isNewBest ? '👑' : trial.score >= 20 ? '🎉' : '💪' }}</div>
        <h1 v-if="isNewBest" class="headline best">NEW BEST!</h1>
        <h1 v-else class="headline">TIME!</h1>
        <div class="final">{{ trial.score }} <small>pts</small></div>
        <div class="run-stats">
          {{ trial.makes }}/{{ trial.attempts }} makes · ✨{{ trial.swishes }} · best streak {{ trial.bestStreak }}
        </div>

        <div class="board">
          <div class="board-title">🏆 Leaderboard</div>
          <div v-if="saving" class="board-row">saving…</div>
          <div
            v-for="(row, i) in board"
            :key="row.id"
            class="board-row"
            :class="{ mine: row.id === runId }"
          >
            <span class="pos">{{ i + 1 }}</span>
            <span class="row-score">{{ row.score }} pts</span>
            <span class="row-meta">✨{{ row.swishes }} · {{ new Date(row.playedAt).toLocaleDateString() }}</span>
          </div>
        </div>

        <div class="buttons">
          <button class="btn" @click="retry">Run it back ⏱</button>
          <button class="btn btn--ghost" @click="ui.go('title')">Title</button>
        </div>
      </div>
    </div>

    <div v-if="hud.phase === 'running' && !trial.holding" class="hint">press &amp; drag back to shoot — no shot clock, just the timer!</div>
  </div>
</template>

<style scoped>
.trial {
  position: relative;
  height: 100%;
  width: 100%;
}

.scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.countdown {
  position: absolute;
  top: 34%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 110px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 8px 0 rgba(53, 64, 92, 0.3);
  pointer-events: none;
}

.topbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 14px;
  pointer-events: none;
}

.timer {
  padding: 8px 18px;
  font-size: 26px;
  font-weight: 800;
}

.timer small {
  font-size: 14px;
  color: var(--ink-faint);
}

.timer.urgent {
  color: var(--pop);
  animation: pulse 0.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

.scorebox {
  padding: 8px 18px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.pts {
  font-size: 26px;
  font-weight: 800;
  color: var(--pop);
}

.scorebox small {
  color: var(--ink-faint);
}

.streak {
  font-size: 16px;
  font-weight: 800;
  color: var(--ball-deep);
}

.banner {
  position: absolute;
  top: 30%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 36px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 4px 0 rgba(53, 64, 92, 0.3);
  pointer-events: none;
  white-space: nowrap;
}

.waiting {
  position: absolute;
  bottom: 52px;
  left: 50%;
  transform: translateX(-50%);
  color: #fff;
  font-size: 14px;
  opacity: 0.85;
  text-shadow: 0 2px 0 rgba(53, 64, 92, 0.3);
}

.corner {
  position: absolute;
  top: 12px;
  right: 14px;
  display: flex;
  gap: 8px;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(53, 64, 92, 0.25);
}

.panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 22px 36px;
  max-height: 92vh;
  overflow-y: auto;
  min-width: 340px;
}

.emoji {
  font-size: 46px;
}

.headline {
  font-size: 30px;
  font-weight: 800;
}

.headline.best {
  color: var(--pop);
}

.final {
  font-size: 44px;
  font-weight: 800;
  color: var(--pop);
}

.final small {
  font-size: 16px;
  color: var(--ink-faint);
}

.run-stats {
  font-size: 13px;
  color: var(--ink-soft);
}

.board {
  width: 100%;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.board-title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--ink-faint);
  margin-bottom: 2px;
}

.board-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 8px;
}

.board-row.mine {
  background: #fff1e6;
  outline: 2px solid var(--ball);
}

.pos {
  min-width: 18px;
  font-weight: 800;
  color: var(--ink-faint);
}

.row-score {
  font-weight: 800;
  min-width: 56px;
}

.row-meta {
  font-size: 12px;
  color: var(--ink-faint);
}

.buttons {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.hint {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 14px;
  color: #fff;
  opacity: 0.8;
  pointer-events: none;
  text-shadow: 0 2px 0 rgba(53, 64, 92, 0.3);
}

@media (prefers-reduced-motion: reduce) {
  .timer.urgent {
    animation: none;
  }
}
</style>
