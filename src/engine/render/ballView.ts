/**
 * The hero ball — squash-and-stretch aligned to velocity, spin roll, and an
 * impact squash spring kicked by contact events. Pure cosmetics over sim state.
 */
import * as THREE from 'three'
import { R_BALL } from '../../core/physics/constants'
import type { Vec3 } from '../../core/physics/types'
import { Spring } from '../anim/spring'
import { COLORS } from './courtScene'

const UP = new THREE.Vector3(0, 1, 0)

export class BallView {
  readonly group: THREE.Group
  private readonly stretchGroup: THREE.Group
  private readonly rollGroup: THREE.Group
  private readonly squash = new Spring(0, 480, 0.35)
  private rollAngle = 0

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group()
    this.stretchGroup = new THREE.Group()
    this.rollGroup = new THREE.Group()

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(R_BALL, 24, 18),
      new THREE.MeshLambertMaterial({ color: COLORS.ball }),
    )
    this.rollGroup.add(ball)

    // Seams — two thin torus rings make the roll readable.
    const seamMat = new THREE.MeshLambertMaterial({ color: COLORS.ballSeam })
    for (const rot of [0, Math.PI / 2]) {
      const seam = new THREE.Mesh(new THREE.TorusGeometry(R_BALL * 1.001, 0.004, 6, 32), seamMat)
      seam.rotation.y = rot
      this.rollGroup.add(seam)
    }

    this.stretchGroup.add(this.rollGroup)
    this.group.add(this.stretchGroup)
    scene.add(this.group)
  }

  /** Impact reaction — call with intensity ~ impactSpeed / 8. */
  kickSquash(intensity: number): void {
    this.squash.kick(Math.min(intensity, 1.4) * 8)
  }

  update(pos: Vec3, vel: Vec3, spin: number, dt: number): void {
    this.group.position.set(pos.x, pos.y, pos.z)

    // Stretch along travel: subtle at cruise, obvious at launch speed.
    const speed = Math.hypot(vel.x, vel.y, vel.z)
    this.squash.step(dt)
    const stretch = THREE.MathUtils.clamp(1 + speed * 0.014 - this.squash.value * 0.06, 0.72, 1.22)
    const w = 1 / Math.sqrt(stretch)
    this.stretchGroup.scale.set(w, stretch, w)

    // Point the stretch axis (local Y) along velocity.
    if (speed > 0.5) {
      const dir = new THREE.Vector3(vel.x, vel.y, vel.z).normalize()
      this.stretchGroup.quaternion.setFromUnitVectors(UP, dir)
    }

    // Backspin roll (visual): counter-rotate about z relative to travel.
    this.rollAngle += spin * dt
    this.rollGroup.rotation.z = this.rollAngle
  }

  setVisible(v: boolean): void {
    this.group.visible = v
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group)
  }
}
