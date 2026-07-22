import { easeOutCubic, type Easing } from './easings'

/**
 * Minimal dt-stepped tween runner (no global RAF of its own — the owning render
 * loop steps it, so pausing/slow-mo just works).
 */
interface ActiveTween {
  elapsed: number
  duration: number
  ease: Easing
  onUpdate: (t: number) => void
  onDone?: (() => void) | undefined
}

export class TweenRunner {
  private tweens: ActiveTween[] = []

  run(duration: number, onUpdate: (t: number) => void, ease: Easing = easeOutCubic, onDone?: () => void): void {
    this.tweens.push({ elapsed: 0, duration, ease, onUpdate, onDone })
  }

  step(dt: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]!
      tw.elapsed += dt
      const t = Math.min(1, tw.elapsed / tw.duration)
      tw.onUpdate(tw.ease(t))
      if (t >= 1) {
        this.tweens.splice(i, 1)
        tw.onDone?.()
      }
    }
  }

  clear(): void {
    this.tweens = []
  }
}
