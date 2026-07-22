<script setup lang="ts">
import { reactive, ref } from 'vue'
import * as THREE from 'three'
import { useUiStore } from '../stores/ui'
import { useThreeScene, type SceneCtx } from '../composables/useThreeScene'
import { makeClouds, makeFloor, makeHoop, makeLights, COLORS, type HoopView } from '../engine/render/courtScene'
import { BallView } from '../engine/render/ballView'
import { NetView } from '../engine/render/netView'
import { TrajectoryPreview } from '../engine/render/trajectoryPreview'
import { createShot, stepShot } from '../core/physics/shotSim'
import { classifyShot } from '../core/shot/classify'
import { speedForAngle, arcPoint, flightTime } from '../core/physics/ballistics'
import { HOOP_X, RIM_HEIGHT, RELEASE_HEIGHT, SIM_DT } from '../core/physics/constants'
import type { BallState, ShotOutcome } from '../core/physics/types'
import { unlockAudio, playRimClang, playBoardThud, playBounce, playSwish, playNet, playScorePop } from '../engine/sfx'
import { attachDragAim } from '../engine/input/dragAim'
import { onBeforeUnmount, onMounted } from 'vue'
import type { LaunchParams } from '../core/physics/types'

const ui = useUiStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const aiming = ref(false)

const controls = reactive({
  angle: 52,
  speed: 9.03,
  vz: 0,
  slowmo: false,
  ghostArc: false,
})

const lastOutcome = ref<ShotOutcome | null>(null)
const shotCount = ref(0)

let shot: BallState | null = null
let seenEvents = 0
let madeAnnounced = false
let accumulator = 0

let ball: BallView
let hoop: HoopView
let net: NetView
let preview: TrajectoryPreview
let ghost: THREE.Line

const RESULT_LABELS: Record<string, string> = {
  SWISH: '✨ SWISH! +2',
  MAKE: '✅ Bucket +1',
  BANK: '🎯 Bank! +1',
  SHOOTERS_ROLL: "🌀 Shooter's roll +1",
  IN_AND_OUT: '💔 In and out…',
  FRONT_RIM: '🧱 Front rim — short',
  BACK_RIM: '🧱 Back rim — long',
  SIDE_RIM: '🧱 Side rim',
  BOARD_MISS: '🪧 Off the glass',
  AIRBALL: '💨 Airball',
}

function perfectSpeed() {
  const v = speedForAngle(controls.angle)
  if (v) controls.speed = Math.round(v * 100) / 100
}

function shoot(launch?: LaunchParams) {
  unlockAudio()
  const params = launch ?? { angleDeg: controls.angle, speed: controls.speed, vz: controls.vz }
  if (launch) {
    controls.angle = Math.round(launch.angleDeg * 10) / 10
    controls.speed = Math.round(launch.speed * 100) / 100
  }
  shot = createShot(params)
  seenEvents = 0
  madeAnnounced = false
  lastOutcome.value = null
  shotCount.value++
  preview.hide()
}

// Drag-to-aim on the scene itself — the real game gesture (slingshot).
onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const detach = attachDragAim(canvas, {
    onStart: () => {
      unlockAudio()
      aiming.value = true
    },
    onAim: (launch) => {
      if (launch) preview.show(launch)
      else preview.hide()
    },
    onRelease: (launch) => {
      aiming.value = false
      shoot(launch)
    },
    onCancel: () => {
      aiming.value = false
      preview.hide()
    },
  })
  onBeforeUnmount(detach)
})

function updateGhost() {
  if (!controls.ghostArc) {
    ghost.visible = false
    return
  }
  const pts: THREE.Vector3[] = []
  const launch = { angleDeg: controls.angle, speed: controls.speed, vz: controls.vz }
  const tEnd = flightTime(controls.angle, controls.speed) * 1.15
  for (let i = 0; i <= 40; i++) {
    const p = arcPoint(launch, (tEnd * i) / 40)
    pts.push(new THREE.Vector3(p.x, p.y, p.z))
  }
  ghost.geometry.setFromPoints(pts)
  ghost.visible = true
}

useThreeScene(canvasRef, {
  init({ scene, camera }: SceneCtx) {
    scene.background = new THREE.Color(COLORS.sky)
    makeLights(scene)
    makeClouds(scene, [-2, 10])
    makeFloor(scene, -3, 10.5)
    hoop = makeHoop(scene)
    hoop.group.position.set(HOOP_X, RIM_HEIGHT, 0)
    net = new NetView(scene, { x: HOOP_X, y: RIM_HEIGHT, z: 0 })
    ball = new BallView(scene)
    ball.update({ x: 0, y: RELEASE_HEIGHT, z: 0 }, { x: 0, y: 0, z: 0 }, 0, 0)
    preview = new TrajectoryPreview(scene)

    ghost = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
    )
    ghost.visible = false
    scene.add(ghost)

    camera.position.set(3.6, 3.4, 21)
    camera.lookAt(3.6, 3.1, 0)
  },

  frame(dt: number) {
    const simDt = controls.slowmo ? dt * 0.15 : dt
    if (shot && !shot.settled) {
      accumulator += simDt
      while (accumulator >= SIM_DT) {
        stepShot(shot)
        accumulator -= SIM_DT
        if (shot.settled) break
      }
      // New contact events → sfx + vfx kicks.
      while (seenEvents < shot.events.length) {
        const ev = shot.events[seenEvents++]!
        const punch = Math.min(ev.speed / 7, 1)
        ball.kickSquash(punch)
        if (ev.kind === 'rim') {
          hoop.wobble.kick(punch * (ev.normal.x >= 0 ? 8 : -8))
          playRimClang(punch)
        } else if (ev.kind === 'board') playBoardThud(punch)
        else if (ev.kind === 'floor') playBounce(punch)
      }
      if (shot.made && !madeAnnounced) {
        madeAnnounced = true
        const out = classifyShot(shot)
        if (out.type === 'SWISH') playSwish()
        else playNet()
        playScorePop(out.type === 'SWISH')
      }
      if (shot.resolved && !lastOutcome.value) lastOutcome.value = classifyShot(shot)
      ball.update(shot.pos, shot.vel, shot.spin, simDt)
    }
    hoop.update(simDt)
    net.update(Math.min(simDt, 1 / 30), shot && !shot.settled ? shot.pos : null)
    updateGhost()
  },
})
</script>

<template>
  <div class="sandbox">
    <canvas ref="canvasRef" class="scene" />

    <div class="hud-top">
      <button class="btn btn--ghost btn--small" @click="ui.go('title')">← Title</button>
      <div v-if="lastOutcome" :key="shotCount" class="result card pop-in">
        <div class="result-label">{{ RESULT_LABELS[lastOutcome.type] }}</div>
        <div class="result-meta">
          <span v-if="lastOutcome.entryAngleDeg !== null">entry {{ lastOutcome.entryAngleDeg.toFixed(1) }}°</span>
          <span>rim ×{{ lastOutcome.rimContacts }}</span>
          <span v-if="lastOutcome.boardContacts">glass ×{{ lastOutcome.boardContacts }}</span>
        </div>
      </div>
    </div>

    <div v-if="!aiming" class="drag-hint">drag anywhere to aim — pull back, release to shoot</div>

    <div class="panel card">
      <label class="row">
        <span>Angle <b>{{ controls.angle.toFixed(1) }}°</b></span>
        <input v-model.number="controls.angle" type="range" min="25" max="72" step="0.1" />
      </label>
      <label class="row">
        <span>Power <b>{{ controls.speed.toFixed(2) }} m/s</b></span>
        <input v-model.number="controls.speed" type="range" min="7" max="11.5" step="0.01" />
      </label>
      <label class="row">
        <span>Lateral <b>{{ controls.vz.toFixed(2) }}</b></span>
        <input v-model.number="controls.vz" type="range" min="-0.5" max="0.5" step="0.01" />
      </label>
      <div class="row buttons">
        <button class="btn btn--small" @click="shoot()">Shoot 🏀</button>
        <button class="btn btn--ghost btn--small" @click="perfectSpeed">Perfect v</button>
        <button class="btn btn--ghost btn--small" :class="{ on: controls.slowmo }" @click="controls.slowmo = !controls.slowmo">
          🐢 {{ controls.slowmo ? 'on' : 'off' }}
        </button>
        <button class="btn btn--ghost btn--small" :class="{ on: controls.ghostArc }" @click="controls.ghostArc = !controls.ghostArc">
          Ghost arc
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sandbox {
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
}

.hud-top {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
}

.hud-top .btn {
  pointer-events: auto;
}

.result {
  padding: 12px 18px;
  text-align: right;
}

.result-label {
  font-size: 22px;
  font-weight: 800;
}

.result-meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--ink-soft);
  justify-content: flex-end;
}

.drag-hint {
  position: absolute;
  bottom: 18px;
  right: 18px;
  font-size: 13px;
  color: #fff;
  opacity: 0.75;
  pointer-events: none;
}

.panel {
  position: absolute;
  left: 14px;
  bottom: 14px;
  width: 330px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  color: var(--ink-soft);
}

.row b {
  color: var(--ink);
}

.row input[type='range'] {
  width: 100%;
  accent-color: var(--pop);
}

.buttons {
  flex-direction: row;
  gap: 8px;
  flex-wrap: wrap;
}

.btn.on {
  outline: 3px solid var(--mint);
}
</style>
