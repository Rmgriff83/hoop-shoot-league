/**
 * Owns a Three.js renderer + RAF loop bound to a canvas (spyops useGlobe
 * pattern): create on mount, resize with the element, dispose on unmount.
 * The frame callback receives real dt; callers run their own fixed-step
 * accumulators — rendering never advances physics.
 */
import * as THREE from 'three'
import { onBeforeUnmount, onMounted, type Ref } from 'vue'

export interface SceneCtx {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
}

export function useThreeScene(
  canvasRef: Ref<HTMLCanvasElement | null>,
  hooks: {
    init: (ctx: SceneCtx) => void
    frame: (dt: number, ctx: SceneCtx) => void
  },
): void {
  let renderer: THREE.WebGLRenderer | null = null
  let raf = 0

  onMounted(() => {
    const canvas = canvasRef.value
    if (!canvas) return
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 200)
    const ctx: SceneCtx = { scene, camera, renderer }

    const resize = () => {
      const el = canvas.parentElement ?? canvas
      const w = el.clientWidth
      const h = el.clientHeight
      renderer!.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement ?? canvas)

    hooks.init(ctx)

    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      hooks.frame(dt, ctx)
      renderer!.render(scene, camera)
    }
    raf = requestAnimationFrame(loop)

    onBeforeUnmount(() => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      renderer?.dispose()
    })
  })
}
