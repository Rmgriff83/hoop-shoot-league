/**
 * The zoom toggle (handoff §5 — core feature). Two named framings:
 *   AIM  — the player's half, optimal for aiming
 *   FULL — the whole court, watch the AI genuinely shooting alongside you
 * Spring-tweened swaps (slightly underdamped = a cute little settle).
 */
import type * as THREE from 'three'
import { COURT_LEN } from '../../core/physics/constants'
import { Spring3 } from '../anim/spring'
import { motion } from '../motion'

export type CameraMode = 'AIM' | 'FULL'

interface Framing {
  pos: [number, number, number]
  target: [number, number, number]
}

const FRAMINGS: Record<CameraMode, Framing> = {
  AIM: { pos: [5.1, 3.2, 18.5], target: [5.1, 2.9, 0] },
  FULL: { pos: [COURT_LEN / 2, 4.2, 47], target: [COURT_LEN / 2, 3.2, 0] },
}

export class CameraRig {
  mode: CameraMode = 'AIM'
  private readonly pos: Spring3
  private readonly target: Spring3

  constructor(private camera: THREE.PerspectiveCamera, initial: CameraMode = 'AIM') {
    const f = FRAMINGS[initial]
    this.mode = initial
    this.pos = new Spring3(...f.pos, 42, 0.82)
    this.target = new Spring3(...f.target, 42, 0.82)
    this.apply()
  }

  set(mode: CameraMode): void {
    this.mode = mode
    const f = FRAMINGS[mode]
    this.pos.setTarget(...f.pos)
    this.target.setTarget(...f.target)
    if (motion.reduced) {
      this.pos.set(...f.pos)
      this.target.set(...f.target)
    }
  }

  toggle(): CameraMode {
    this.set(this.mode === 'AIM' ? 'FULL' : 'AIM')
    return this.mode
  }

  update(dt: number): void {
    this.pos.step(dt)
    this.target.step(dt)
    this.apply()
  }

  private apply(): void {
    this.camera.position.set(this.pos.x.value, this.pos.y.value, this.pos.z.value)
    this.camera.lookAt(this.target.x.value, this.target.y.value, this.target.z.value)
  }
}
