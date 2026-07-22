/**
 * Instanced-quad confetti bursts — swishes, wins, celebrations. Cheap: one
 * InstancedMesh, recycled particles, no allocations per burst.
 */
import * as THREE from 'three'

const COUNT = 140
const COLORS = [0xff5d73, 0xffd93d, 0x43d9a3, 0x9d7bff, 0xff8a3d, 0xffffff]

interface Particle {
  alive: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  rot: THREE.Euler
  rotVel: THREE.Vector3
  life: number
}

export class Confetti {
  private readonly mesh: THREE.InstancedMesh
  private readonly particles: Particle[] = []
  private readonly dummy = new THREE.Object3D()

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(0.09, 0.14)
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false })
    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    const color = new THREE.Color()
    for (let i = 0; i < COUNT; i++) {
      this.mesh.setColorAt(i, color.setHex(COLORS[i % COLORS.length]!))
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        life: 0,
      })
    }
    this.hideAll()
    scene.add(this.mesh)
  }

  burst(x: number, y: number, z: number, count = 50): void {
    let spawned = 0
    for (const p of this.particles) {
      if (spawned >= count) break
      if (p.alive) continue
      p.alive = true
      spawned++
      p.pos.set(x, y, z)
      const a = Math.random() * Math.PI * 2
      const up = 2.5 + Math.random() * 3
      const out = 0.6 + Math.random() * 1.6
      p.vel.set(Math.cos(a) * out, up, Math.sin(a) * out * 0.5)
      p.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      p.rotVel.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4)
      p.life = 1.3 + Math.random() * 0.7
    }
  }

  update(dt: number): void {
    let dirty = false
    this.particles.forEach((p, i) => {
      if (!p.alive) return
      dirty = true
      p.life -= dt
      p.vel.y -= 5.5 * dt
      p.vel.multiplyScalar(1 - 0.9 * dt)
      p.pos.addScaledVector(p.vel, dt)
      p.rot.x += p.rotVel.x * dt
      p.rot.y += p.rotVel.y * dt
      p.rot.z += p.rotVel.z * dt
      const s = Math.min(p.life, 1)
      if (p.life <= 0 || p.pos.y < 0) {
        p.alive = false
        this.dummy.scale.setScalar(0.0001)
      } else {
        this.dummy.scale.setScalar(Math.max(s, 0.0001))
      }
      this.dummy.position.copy(p.pos)
      this.dummy.rotation.copy(p.rot)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    })
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true
  }

  private hideAll(): void {
    this.dummy.scale.setScalar(0.0001)
    this.dummy.updateMatrix()
    for (let i = 0; i < COUNT; i++) this.mesh.setMatrixAt(i, this.dummy.matrix)
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
