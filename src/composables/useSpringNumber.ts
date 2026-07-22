/**
 * A displayed number that springs to its target — scores count up with a
 * satisfying overshoot instead of snapping.
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { Spring } from '../engine/anim/spring'
import { motion } from '../engine/motion'

export function useSpringNumber(source: Ref<number>, opts: { stiffness?: number } = {}): Ref<number> {
  const display = ref(source.value)
  const spring = new Spring(source.value, opts.stiffness ?? 90, 0.75)
  let raf = 0
  let last = 0

  const step = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    spring.step(dt)
    display.value = Math.round(spring.value)
    if (!spring.settled) raf = requestAnimationFrame(step)
    else {
      display.value = spring.target
      raf = 0
    }
  }

  watch(source, (v) => {
    spring.target = v
    if (motion.reduced) {
      spring.set(v)
      display.value = v
      return
    }
    if (!raf) {
      last = performance.now()
      raf = requestAnimationFrame(step)
    }
  })

  onBeforeUnmount(() => cancelAnimationFrame(raf))
  return display
}
