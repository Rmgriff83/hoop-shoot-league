/**
 * Scene builders for the toon court. Everything is chunky, warm, and slightly
 * oversized — cute first. Physics never reads from here.
 */
import * as THREE from 'three'
import {
  BOARD_BOTTOM,
  BOARD_HALF_W,
  BOARD_OFFSET,
  BOARD_TOP,
  COURT_LEN,
  R_RIM,
  R_TUBE,
  RIM_FROM_BASELINE,
  RIM_HEIGHT,
  SHOT_DIST,
} from '../../core/physics/constants'
import { Spring } from '../anim/spring'

export const COLORS = {
  sky: 0x7ec8f3,
  skyDeep: 0x58aee6,
  court: 0xffce8a,
  courtLine: 0xe8a35c,
  rim: 0xff5d3d,
  board: 0xfffaf2,
  boardTrim: 0xff8a3d,
  pole: 0x9aa4bd,
  ball: 0xff8a3d,
  ballSeam: 0xc75d1e,
  net: 0xffffff,
}

export function makeLights(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xffffff, 0.9)
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.1)
  sun.position.set(-6, 14, 10)
  scene.add(ambient, sun)
}

/** Flat cartoon clouds drifting in the sky. */
export function makeClouds(scene: THREE.Scene, span: [number, number]): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
  const puff = new THREE.SphereGeometry(1, 12, 8)
  for (let i = 0; i < 4; i++) {
    const cloud = new THREE.Group()
    for (let p = 0; p < 3; p++) {
      const m = new THREE.Mesh(puff, mat)
      m.position.set(p * 0.9 - 0.9, (p % 2) * 0.25, 0)
      m.scale.set(0.8 + (p % 2) * 0.3, 0.55, 0.5)
      cloud.add(m)
    }
    cloud.position.set(
      span[0] + ((span[1] - span[0]) * (i + 0.5)) / 4,
      6.2 + (i % 2) * 1.4,
      -6 - i,
    )
    cloud.scale.setScalar(0.9 + (i % 3) * 0.35)
    group.add(cloud)
  }
  scene.add(group)
  return group
}

/** Court floor + lines spanning [x0, x1]. */
export function makeFloor(scene: THREE.Scene, x0: number, x1: number): void {
  const w = x1 - x0
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.3, 8),
    new THREE.MeshLambertMaterial({ color: COLORS.court }),
  )
  floor.position.set((x0 + x1) / 2, -0.15, 0)
  scene.add(floor)

  const lineMat = new THREE.MeshLambertMaterial({ color: COLORS.courtLine })
  const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, 0.1), lineMat)
  line.position.set((x0 + x1) / 2, 0.012, 2.2)
  scene.add(line)
}

/**
 * The campaign court's half, exact, in canonical shot space: floor from just
 * past midcourt to just past the baseline (same apron as MatchScreen), with
 * painted baseline + half-court lines. Used by halfcourt modes (time trial).
 */
export function makeHalfCourtFloor(scene: THREE.Scene): void {
  const { CANON_BASELINE_X, CANON_MIDCOURT_X, COURT_APRON } = HALF_COURT
  makeFloor(scene, CANON_MIDCOURT_X - COURT_APRON, CANON_BASELINE_X + COURT_APRON)
  const lineMat = new THREE.MeshLambertMaterial({ color: COLORS.courtLine })
  for (const x of [CANON_BASELINE_X, CANON_MIDCOURT_X]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 8), lineMat)
    line.position.set(x, 0.012, 0)
    scene.add(line)
  }
}

// Derived from the same core constants the campaign court uses — see
// worldMap.ts for the world-space equivalents.
const HALF_COURT = {
  CANON_BASELINE_X: SHOT_DIST + RIM_FROM_BASELINE,
  CANON_MIDCOURT_X: SHOT_DIST + RIM_FROM_BASELINE - COURT_LEN / 2,
  COURT_APRON: 1.5,
}

export interface HoopView {
  group: THREE.Group
  rimGroup: THREE.Group
  /** Kick on rim contact — wobbles the rim+net assembly. */
  wobble: Spring
  update(dt: number): void
}

/**
 * Hoop assembly in canonical orientation: rim circle centered at local (0,0,0),
 * backboard on the +x side (ball arrives traveling +x). Position the group at
 * the rim center world position; rotate PI about Y for a hoop facing the other way.
 */
export function makeHoop(scene: THREE.Scene): HoopView {
  const group = new THREE.Group()

  // Backboard with trim square.
  const boardH = BOARD_TOP - BOARD_BOTTOM
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, boardH, BOARD_HALF_W * 2),
    new THREE.MeshLambertMaterial({ color: COLORS.board }),
  )
  board.position.set(BOARD_OFFSET + 0.028, BOARD_BOTTOM - RIM_HEIGHT + boardH / 2, 0)
  group.add(board)

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.45, 0.59),
    new THREE.MeshLambertMaterial({ color: COLORS.boardTrim }),
  )
  trim.position.set(BOARD_OFFSET + 0.0, BOARD_BOTTOM - RIM_HEIGHT + 0.28, 0)
  group.add(trim)

  // Pole + arm.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, RIM_HEIGHT + 0.9, 10),
    new THREE.MeshLambertMaterial({ color: COLORS.pole }),
  )
  pole.position.set(BOARD_OFFSET + 0.75, (RIM_HEIGHT + 0.9) / 2 - RIM_HEIGHT, 0)
  group.add(pole)
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.08, 0.08),
    new THREE.MeshLambertMaterial({ color: COLORS.pole }),
  )
  arm.position.set(BOARD_OFFSET + 0.37, 0.25, 0)
  group.add(arm)

  // Mounting bracket — the sloped plate between rim and board (also a real
  // collider in the sim; balls shed off it instead of wedging behind the rim).
  const bracketLen = Math.hypot(BOARD_OFFSET - R_RIM + 0.01, 0.15)
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(bracketLen, 0.035, 0.12),
    new THREE.MeshLambertMaterial({ color: COLORS.pole }),
  )
  bracket.position.set((R_RIM - 0.01 + BOARD_OFFSET) / 2, 0.055, 0)
  bracket.rotation.z = Math.atan2(0.15, BOARD_OFFSET - R_RIM + 0.01)
  group.add(bracket)

  // Rim (the real torus, visualized exactly as simulated).
  const rimGroup = new THREE.Group()
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(R_RIM, R_TUBE * 1.6, 10, 32),
    new THREE.MeshLambertMaterial({ color: COLORS.rim }),
  )
  rim.rotation.x = Math.PI / 2
  rimGroup.add(rim)
  group.add(rimGroup)

  scene.add(group)

  const wobble = new Spring(0, 320, 0.28)
  return {
    group,
    rimGroup,
    wobble,
    update(dt: number) {
      wobble.step(dt)
      rimGroup.rotation.z = wobble.value * 0.06
      rimGroup.position.y = -Math.abs(wobble.value) * 0.01
    },
  }
}
