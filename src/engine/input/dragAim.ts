/**
 * Pointer-capture drag gesture → aim callbacks. EMA-smooths the pull vector to
 * kill finger jitter (3-sample-ish time constant) without adding sluggish lag.
 */
import { DEAD_ZONE_PX, dragToLaunch } from '../../core/shot/aim'
import type { LaunchParams } from '../../core/physics/types'

export interface DragAimHandlers {
  /** Finger down — shot clock consumers care about this. */
  onStart?: () => void
  /** Live aim while dragging (null = inside dead zone). */
  onAim?: (launch: LaunchParams | null) => void
  /** Finger up with a valid aim — shoot. */
  onRelease?: (launch: LaunchParams) => void
  /** Finger up inside the dead zone, or pointer lost — no shot. */
  onCancel?: () => void
}

export interface DragAimOptions {
  /** +1 when screen-right is toward the hoop, −1 when the shooter faces left. A getter makes it live-swappable. */
  facing?: 1 | -1 | (() => 1 | -1)
  /** Fraction of the viewport diagonal that counts as a full-power drag. */
  dragScale?: number
  enabled?: () => boolean
}

const SMOOTH = 0.45 // EMA factor per move event ≈ 3-sample settle

export function attachDragAim(el: HTMLElement, handlers: DragAimHandlers, opts: DragAimOptions = {}): () => void {
  const facing = (): 1 | -1 => {
    const f = opts.facing ?? 1
    return typeof f === 'function' ? f() : f
  }
  const dragScale = opts.dragScale ?? 0.42
  let active = false
  let startX = 0
  let startY = 0
  let emaDx = 0
  let emaDy = 0

  const dMax = () => Math.hypot(el.clientWidth, el.clientHeight) * dragScale

  const currentLaunch = (): LaunchParams | null =>
    dragToLaunch({ dx: emaDx * facing(), dy: emaDy, dMax: dMax() })

  const down = (e: PointerEvent) => {
    if (opts.enabled && !opts.enabled()) return
    active = true
    startX = e.clientX
    startY = e.clientY
    emaDx = 0
    emaDy = 0
    el.setPointerCapture(e.pointerId)
    handlers.onStart?.()
  }

  const move = (e: PointerEvent) => {
    if (!active) return
    // Pull vector: press point minus finger (slingshot), +y up in world terms.
    const dx = startX - e.clientX
    const dy = e.clientY - startY
    emaDx += (dx - emaDx) * SMOOTH
    emaDy += (dy - emaDy) * SMOOTH
    handlers.onAim?.(currentLaunch())
  }

  const up = () => {
    if (!active) return
    active = false
    const launch = currentLaunch()
    if (launch) handlers.onRelease?.(launch)
    else handlers.onCancel?.()
  }

  const cancel = () => {
    if (!active) return
    active = false
    handlers.onCancel?.()
  }

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', cancel)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', cancel)
  }
}

export { DEAD_ZONE_PX }
