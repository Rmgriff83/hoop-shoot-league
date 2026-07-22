/**
 * The 40% tapering dotted trajectory preview (handoff §1 — THE balance lever).
 * Shows launch angle + initial velocity only; apex and descent stay judgment.
 * Do not extend the fraction. Custom point shader for per-dot opacity taper.
 */
import * as THREE from 'three'
import { arcPoint, flightTime, speedForAngle } from '../../core/physics/ballistics'
import type { LaunchParams } from '../../core/physics/types'

export const PREVIEW_FRACTION = 0.4
const DOTS = 22

const VERT = /* glsl */ `
attribute float alpha;
varying float vAlpha;
uniform float uSize;
void main() {
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (140.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`

const FRAG = /* glsl */ `
varying float vAlpha;
uniform vec3 uColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(uColor, vAlpha);
}`

export class TrajectoryPreview {
  readonly points: THREE.Points
  private readonly positions: Float32Array

  constructor(scene: THREE.Object3D) {
    this.positions = new Float32Array(DOTS * 3)
    const alphas = new Float32Array(DOTS)
    for (let i = 0; i < DOTS; i++) {
      // Opacity 1 → 0 taper toward the preview's end.
      const f = i / (DOTS - 1)
      alphas[i] = (1 - f) ** 1.4
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0xffffff) },
          uSize: { value: 9 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
      }),
    )
    this.points.frustumCulled = false
    this.points.visible = false
    scene.add(this.points)
  }

  /**
   * Lay dots along the first PREVIEW_FRACTION of the arc. Time horizon: flight
   * time to the rim for this angle at the *ideal* speed — so the preview length
   * reads power honestly (hot shots show a longer, flatter first stretch).
   */
  show(launch: LaunchParams): void {
    const idealSpeed = speedForAngle(launch.angleDeg)
    const horizon = flightTime(launch.angleDeg, idealSpeed ?? launch.speed)
    const tMax = horizon * PREVIEW_FRACTION
    for (let i = 0; i < DOTS; i++) {
      const t = (tMax * i) / (DOTS - 1)
      const p = arcPoint(launch, t)
      this.positions[i * 3] = p.x
      this.positions[i * 3 + 1] = p.y
      this.positions[i * 3 + 2] = p.z
    }
    this.points.geometry.attributes.position!.needsUpdate = true
    this.points.visible = true
  }

  hide(): void {
    this.points.visible = false
  }
}
