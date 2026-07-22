<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRef } from 'vue'
import * as THREE from 'three'
import { useUiStore } from '../stores/ui'
import { useMatchStore } from '../stores/match'
import { useCampaignStore } from '../stores/campaign'
import { useThreeScene, type SceneCtx } from '../composables/useThreeScene'
import { useSpringNumber } from '../composables/useSpringNumber'
import { makeClouds, makeFloor, makeHoop, makeLights, COLORS, type HoopView } from '../engine/render/courtScene'
import { BallView } from '../engine/render/ballView'
import { NetView } from '../engine/render/netView'
import { RigView } from '../engine/render/rigView'
import { CameraRig } from '../engine/render/cameraRig'
import { Confetti } from '../engine/render/confetti'
import { TrajectoryPreview } from '../engine/render/trajectoryPreview'
import { canonToWorld, facingOf, hoopWorldX, PLAYER_RELEASE_X, AI_RELEASE_X } from '../engine/render/worldMap'
import { attachDragAim } from '../engine/input/dragAim'
import { MatchEngine, type MatchEvent, type SideId } from '../core/match/matchEngine'
import { COURT_LEN, RIM_HEIGHT, RELEASE_HEIGHT } from '../core/physics/constants'
import { SHOT_CLOCK } from '../core/match/rack'
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
import ShotClock from '../components/ShotClock.vue'
import RackMeter from '../components/RackMeter.vue'

const ui = useUiStore()
const match = useMatchStore()
const campaign = useCampaignStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

const engine = new MatchEngine({
  aiRatings: match.opponent.ratings,
  seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0,
  errorMult: match.leagueGameId ? campaign.errorMult : 1,
})

const hud = reactive({
  playerScore: 0,
  aiScore: 0,
  clock: SHOT_CLOCK,
  aiming: false,
  playerUsed: 0,
  aiUsed: 0,
  rackSize: 25,
  mode: 'AIM' as 'AIM' | 'FULL',
  ot: 0,
  banner: '',
  done: false,
})

const playerScoreDisplay = useSpringNumber(toRef(hud, 'playerScore'))
const aiScoreDisplay = useSpringNumber(toRef(hud, 'aiScore'))
const bannerKey = ref(0)

let cameraRig: CameraRig
let confetti: Confetti
let preview: TrajectoryPreview
const balls: Record<SideId, BallView | null> = { player: null, ai: null }
const nets: Record<SideId, NetView | null> = { player: null, ai: null }
const rigs: Record<SideId, RigView | null> = { player: null, ai: null }
const hoops: Record<SideId, HoopView | null> = { player: null, ai: null }

function showBanner(text: string) {
  hud.banner = text
  bannerKey.value++
}

function volumeFor(side: SideId): number {
  if (side === 'player') return 1
  return hud.mode === 'FULL' ? 0.8 : 0.35
}

function handleEvent(ev: MatchEvent) {
  switch (ev.kind) {
    case 'pickup':
      rigs[ev.side]?.onPickup()
      break
    case 'release':
      rigs[ev.side]?.onRelease()
      break
    case 'contact': {
      const punch = Math.min(ev.contact.speed / 7, 1) * volumeFor(ev.side)
      balls[ev.side]?.kickSquash(punch)
      if (ev.contact.kind === 'rim') {
        hoops[ev.side]?.wobble.kick(punch * 8)
        playRimClang(punch)
      } else if (ev.contact.kind === 'board') playBoardThud(punch)
      else if (ev.contact.kind === 'floor') playBounce(punch * 0.7)
      break
    }
    case 'outcome': {
      const swish = ev.outcome.points === 2
      rigs[ev.side]?.onOutcome(ev.outcome.made, swish)
      if (ev.outcome.made) {
        if (swish) playSwish()
        else playNet()
        if (ev.side === 'player' || hud.mode === 'FULL') playScorePop(swish)
        if (swish) {
          const hx = hoopWorldX(ev.side)
          confetti.burst(hx, RIM_HEIGHT + 0.4, 0, ev.side === 'player' ? 60 : 30)
        }
        if (ev.side === 'player' && swish) showBanner('✨ SWISH +2')
        else if (ev.side === 'player') showBanner('+1')
      } else if (ev.side === 'player') {
        if (ev.outcome.type === 'IN_AND_OUT') showBanner('💔 in and out!')
      }
      break
    }
    case 'violation':
      if (ev.side === 'player') {
        playBuzzer()
        showBanner('⏰ shot clock! ball lost')
      }
      break
    case 'otStart':
      hud.ot = ev.otNumber
      hud.rackSize = 7
      showBanner(`🔥 OVERTIME ${ev.otNumber > 1 ? ev.otNumber : ''}`)
      break
    case 'matchDone': {
      hud.done = true
      const won = ev.winner === 'player'
      if (won) confetti.burst(PLAYER_RELEASE_X, 2.5, 1, 120)
      match.result = {
        won,
        playerScore: engine.player.totals.points,
        aiScore: engine.ai!.totals.points,
        otNumber: engine.otNumber,
        player: engine.player.totals,
        ai: engine.ai!.totals,
        opponent: match.opponent,
      }
      setTimeout(() => ui.go('matchResult'), won ? 2200 : 1400)
      break
    }
    case 'rackDone':
      break
  }
}

useThreeScene(canvasRef, {
  init({ scene, camera }: SceneCtx) {
    scene.background = new THREE.Color(COLORS.sky)
    makeLights(scene)
    makeClouds(scene, [1, COURT_LEN - 1])
    makeFloor(scene, -1.5, COURT_LEN + 1.5)

    // Player hoop (left, faces right) + AI hoop (right, canonical).
    const hoopL = makeHoop(scene)
    hoopL.group.position.set(hoopWorldX('player'), RIM_HEIGHT, 0)
    hoopL.group.rotation.y = Math.PI
    hoops.player = hoopL
    const hoopR = makeHoop(scene)
    hoopR.group.position.set(hoopWorldX('ai'), RIM_HEIGHT, 0)
    hoops.ai = hoopR

    nets.player = new NetView(scene, { x: hoopWorldX('player'), y: RIM_HEIGHT, z: 0 })
    nets.ai = new NetView(scene, { x: hoopWorldX('ai'), y: RIM_HEIGHT, z: 0 })

    balls.player = new BallView(scene)
    balls.ai = new BallView(scene)
    balls.player.update({ x: PLAYER_RELEASE_X, y: RELEASE_HEIGHT, z: 0 }, { x: 0, y: 0, z: 0 }, 0, 0)
    balls.ai.update({ x: AI_RELEASE_X, y: RELEASE_HEIGHT, z: 0 }, { x: 0, y: 0, z: 0 }, 0, 0)

    rigs.player = new RigView(scene, PLAYER_RELEASE_X + 0.45, -1, { jersey: 0xff5d73 })
    rigs.ai = new RigView(scene, AI_RELEASE_X - 0.45, 1, {
      jersey: new THREE.Color(match.opponent.colors.primary).getHex(),
    })

    // Preview lives in a mirrored group anchored at the player's release point.
    const previewGroup = new THREE.Group()
    previewGroup.position.set(PLAYER_RELEASE_X, 0, 0)
    previewGroup.scale.x = -1
    scene.add(previewGroup)
    preview = new TrajectoryPreview(previewGroup)

    confetti = new Confetti(scene)
    cameraRig = new CameraRig(camera, 'AIM')
  },

  frame(dt: number) {
    engine.tick(dt)
    for (const ev of engine.drainEvents()) handleEvent(ev)

    // Ball views follow their sims (world-mapped); hide when no live ball.
    for (const side of ['player', 'ai'] as const) {
      const sideState = side === 'player' ? engine.player : engine.ai!
      const ball = balls[side]!
      if (sideState.ball && !sideState.ball.settled) {
        ball.setVisible(true)
        const w = canonToWorld(side, sideState.ball.pos)
        const wv = { ...sideState.ball.vel }
        if (side === 'player') wv.x = -wv.x
        ball.update(w, wv, sideState.ball.spin, dt)
        nets[side]!.update(Math.min(dt, 1 / 30), w)
      } else {
        ball.setVisible(sideState.rack.phase === 'aiming')
        if (sideState.rack.phase === 'aiming') {
          // Held at the release point while aiming.
          const hold = canonToWorld(side, { x: 0, y: RELEASE_HEIGHT, z: 0 })
          ball.update(hold, { x: 0, y: 0, z: 0 }, 0, dt)
        }
        nets[side]!.update(Math.min(dt, 1 / 30), null)
      }
      hoops[side]!.update(dt)
      rigs[side]!.update(dt)
    }

    cameraRig.update(dt)
    confetti.update(dt)

    // HUD sync.
    hud.playerScore = engine.score('player')
    hud.aiScore = engine.score('ai')
    hud.clock = engine.player.rack.clockRemaining
    hud.aiming = engine.playerAiming
    hud.playerUsed = engine.player.rack.ballIndex
    hud.aiUsed = engine.ai!.rack.ballIndex
    hud.rackSize = engine.player.rack.size
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
        // Press = pickup (clock starts) if a ball is waiting.
        if (engine.player.rack.phase === 'idle') engine.playerPickup()
      },
      onAim: (launch) => {
        if (launch && engine.playerAiming) preview.show(launch)
        else preview.hide()
      },
      onRelease: (launch) => {
        preview.hide()
        if (engine.playerAiming) engine.playerRelease(launch)
      },
      onCancel: () => preview.hide(),
    },
    { facing: facingOf('player') },
  )
  onBeforeUnmount(detach)
})

function toggleZoom() {
  hud.mode = cameraRig.toggle()
}

const ballsLeftPlayer = computed(() => hud.rackSize - hud.playerUsed)
</script>

<template>
  <div class="match">
    <canvas ref="canvasRef" class="scene" />

    <!-- Scoreboard -->
    <div class="scoreboard card">
      <div class="team you">
        <span class="team-name">YOU</span>
        <span class="score">{{ playerScoreDisplay }}</span>
      </div>
      <div class="mid">
        <span v-if="hud.ot" class="ot-tag">OT{{ hud.ot > 1 ? hud.ot : '' }}</span>
        <span v-else class="vs">vs</span>
      </div>
      <div class="team them" :style="{ '--them': match.opponent.colors.primary }">
        <span class="score">{{ aiScoreDisplay }}</span>
        <span class="team-name">{{ match.opponent.name.split(' ')[0]?.toUpperCase() }}</span>
      </div>
    </div>

    <!-- Rack meters -->
    <div class="racks">
      <RackMeter :size="hud.rackSize" :used="hud.playerUsed" />
      <RackMeter :size="hud.rackSize" :used="hud.aiUsed" :color="match.opponent.colors.primary" mirrored />
    </div>

    <!-- Shot clock + balls left -->
    <div class="left-hud">
      <ShotClock :remaining="hud.clock" :active="hud.aiming" />
      <div class="balls-left">🏀 ×{{ ballsLeftPlayer }}</div>
    </div>

    <!-- Banner -->
    <div v-if="hud.banner" :key="bannerKey" class="banner pop-in">{{ hud.banner }}</div>

    <!-- Controls -->
    <div class="controls">
      <button class="btn btn--ghost btn--small" @click="ui.go('title')">✕</button>
      <button class="btn btn--small" @click="toggleZoom">
        {{ hud.mode === 'AIM' ? '🔍 full court' : '🎯 my hoop' }}
      </button>
    </div>

    <div v-if="!hud.aiming && !hud.done && ballsLeftPlayer > 0" class="hint">press &amp; drag back to shoot</div>
  </div>
</template>

<style scoped>
.match {
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

.scoreboard {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 22px;
  pointer-events: none;
}

.team {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.team-name {
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--ink-soft);
}

.you .score {
  color: var(--pop);
}

.them .score {
  color: var(--them, var(--grape));
}

.score {
  font-size: 32px;
  font-weight: 800;
  min-width: 40px;
  text-align: center;
}

.mid .vs {
  font-size: 13px;
  color: var(--ink-faint);
}

.ot-tag {
  font-size: 15px;
  font-weight: 800;
  color: var(--pop);
}

.racks {
  position: absolute;
  top: 78px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 40px;
  pointer-events: none;
}

.left-hud {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.balls-left {
  font-size: 14px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 2px 0 rgba(53, 64, 92, 0.3);
}

.banner {
  position: absolute;
  top: 32%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 40px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 4px 0 rgba(53, 64, 92, 0.3);
  pointer-events: none;
}

.controls {
  position: absolute;
  right: 14px;
  top: 12px;
  display: flex;
  gap: 10px;
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
</style>
