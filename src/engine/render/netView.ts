/**
 * Cosmetic verlet net — strands hang from the rim circle, ripple when the ball
 * threads them. Never feeds back into physics (the sim's NET_DRAG handles feel).
 */
import * as THREE from 'three'
import { R_BALL, R_RIM } from '../../core/physics/constants'
import type { Vec3 } from '../../core/physics/types'
import { COLORS } from './courtScene'

const STRANDS = 10
const SEGS = 5
const NET_LEN = 0.42
const BOTTOM_R = 0.1

interface Node {
  x: number
  y: number
  z: number
  px: number
  py: number
  pz: number
}

export class NetView {
  readonly lines: THREE.LineSegments
  private readonly nodes: Node[] = []
  private readonly positions: Float32Array

  /** rimCenter in the LOCAL space this net renders in (usually the hoop group's parent). */
  constructor(scene: THREE.Object3D, private rimCenter: Vec3) {
    for (let s = 0; s < STRANDS; s++) {
      const a = (s / STRANDS) * Math.PI * 2
      for (let i = 0; i <= SEGS; i++) {
        const f = i / SEGS
        const r = R_RIM * (1 - f) + BOTTOM_R * f
        this.nodes.push({
          x: rimCenter.x + Math.cos(a) * r,
          y: rimCenter.y - NET_LEN * f,
          z: rimCenter.z + Math.sin(a) * r,
          px: rimCenter.x + Math.cos(a) * r,
          py: rimCenter.y - NET_LEN * f,
          pz: rimCenter.z + Math.sin(a) * r,
        })
      }
    }

    // Segments: vertical strand links + diagonal cross-links between neighbors.
    const segCount = STRANDS * SEGS * 2
    this.positions = new Float32Array(segCount * 2 * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: COLORS.net, transparent: true, opacity: 0.9 }),
    )
    scene.add(this.lines)
    this.writePositions()
  }

  private node(s: number, i: number): Node {
    return this.nodes[((s % STRANDS) + STRANDS) % STRANDS * (SEGS + 1) + i]!
  }

  update(dt: number, ball: Vec3 | null): void {
    const damp = 0.96
    const g = 4.5 * dt * dt
    // Verlet integrate (skip pinned top row i=0).
    for (let s = 0; s < STRANDS; s++) {
      for (let i = 1; i <= SEGS; i++) {
        const n = this.node(s, i)
        const vx = (n.x - n.px) * damp
        const vy = (n.y - n.py) * damp
        const vz = (n.z - n.pz) * damp
        n.px = n.x
        n.py = n.y
        n.pz = n.z
        n.x += vx
        n.y += vy - g
        n.z += vz
        // Ball push-out.
        if (ball) {
          const dx = n.x - ball.x
          const dy = n.y - ball.y
          const dz = n.z - ball.z
          const d = Math.hypot(dx, dy, dz)
          const min = R_BALL + 0.015
          if (d < min && d > 1e-6) {
            const push = (min - d) / d
            n.x += dx * push
            n.y += dy * push
            n.z += dz * push
          }
        }
      }
    }
    // Distance constraints, few iterations.
    const restV = NET_LEN / SEGS
    for (let iter = 0; iter < 2; iter++) {
      for (let s = 0; s < STRANDS; s++) {
        for (let i = 0; i < SEGS; i++) {
          this.constrain(this.node(s, i), this.node(s, i + 1), restV, i === 0)
        }
      }
    }
    this.writePositions()
  }

  private constrain(a: Node, b: Node, rest: number, aPinned: boolean): void {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const d = Math.hypot(dx, dy, dz)
    if (d < 1e-9) return
    const diff = (d - rest) / d
    if (aPinned) {
      b.x -= dx * diff
      b.y -= dy * diff
      b.z -= dz * diff
    } else {
      const half = diff / 2
      a.x += dx * half
      a.y += dy * half
      a.z += dz * half
      b.x -= dx * half
      b.y -= dy * half
      b.z -= dz * half
    }
  }

  private writePositions(): void {
    let o = 0
    const put = (n: Node) => {
      this.positions[o++] = n.x
      this.positions[o++] = n.y
      this.positions[o++] = n.z
    }
    for (let s = 0; s < STRANDS; s++) {
      for (let i = 0; i < SEGS; i++) {
        // Vertical link.
        put(this.node(s, i))
        put(this.node(s, i + 1))
        // Diagonal to the next strand — gives the classic diamond weave.
        put(this.node(s, i))
        put(this.node(s + 1, i + 1))
      }
    }
    this.lines.geometry.attributes.position!.needsUpdate = true
  }
}
