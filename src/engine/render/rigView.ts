/**
 * Placeholder shooter — capsule mannequin with bouncy procedural animation:
 * anticipation squash on pickup, release stretch, celebrate hop, despair slump.
 * Driven ONLY by { state changes / shot events }, so a real cute character
 * model can swap in behind the same API later without touching callers.
 */
import * as THREE from 'three'
import { Spring } from '../anim/spring'

export interface RigColors {
  jersey: number
  skin?: number
}

export class RigView {
  readonly group: THREE.Group
  private readonly body: THREE.Group
  private readonly armGroup: THREE.Group
  private readonly squash = new Spring(1, 220, 0.5) // scale Y, bouncy
  private readonly hop = new Spring(0, 170, 0.55) // y offset
  private readonly lean = new Spring(0, 140, 0.8) // z-rotation (radians)
  private readonly armRaise = new Spring(0.4, 200, 0.7)
  private bobT = Math.random() * Math.PI * 2

  constructor(scene: THREE.Scene, x: number, facing: 1 | -1, colors: RigColors) {
    this.group = new THREE.Group()
    this.body = new THREE.Group()
    this.group.add(this.body)

    const jersey = new THREE.MeshLambertMaterial({ color: colors.jersey })
    const skin = new THREE.MeshLambertMaterial({ color: colors.skin ?? 0xffd9b3 })

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.75, 6, 12), jersey)
    torso.position.y = 1.05
    this.body.add(torso)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), skin)
    head.position.y = 1.85
    this.body.add(head)

    // Legs — stubby cylinders, cute proportions.
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.35, 4, 8), jersey)
      leg.position.set(0, 0.32, side * 0.13)
      this.body.add(leg)
    }

    // Shooting arms — a single group that raises on release.
    this.armGroup = new THREE.Group()
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 4, 8), skin)
    arm.position.set(0.28, 0, 0)
    arm.rotation.z = Math.PI / 2
    this.armGroup.add(arm)
    this.armGroup.position.y = 1.45
    this.body.add(this.armGroup)

    this.group.position.set(x, 0, 0)
    this.group.scale.x = facing // mirror to face the hoop
    scene.add(this.group)
  }

  /** Anticipation — crouch with the ball. */
  onPickup(): void {
    this.squash.target = 0.86
    this.armRaise.target = 0.7
  }

  /** Release — stretch tall, arm follows through. */
  onRelease(): void {
    this.squash.target = 1
    this.squash.kick(2.6)
    this.armRaise.target = 2.3
    this.hop.kick(1.6)
  }

  /** Result reaction. */
  onOutcome(made: boolean, swish: boolean): void {
    this.armRaise.target = 0.4
    if (swish) {
      this.hop.kick(4.2)
      this.squash.kick(3)
    } else if (made) {
      this.hop.kick(2.6)
    } else {
      this.lean.kick(1.4) // dejected little slump wobble
      this.squash.target = 0.94
      setTimeoutSafe(() => (this.squash.target = 1), 450)
    }
  }

  update(dt: number): void {
    this.bobT += dt
    this.squash.step(dt)
    this.hop.step(dt)
    this.lean.step(dt)
    this.armRaise.step(dt)

    const idleBob = Math.sin(this.bobT * 2.1) * 0.02
    const sy = Math.max(this.squash.value + idleBob, 0.6)
    this.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy))
    this.body.position.y = Math.max(this.hop.value, 0) * 0.22
    this.body.rotation.z = this.lean.value * 0.12
    this.armGroup.rotation.z = -this.armRaise.value * 0.55
  }
}

function setTimeoutSafe(fn: () => void, ms: number): void {
  if (typeof setTimeout !== 'undefined') setTimeout(fn, ms)
}
