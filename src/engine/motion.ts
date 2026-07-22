// Reactive prefers-reduced-motion flag, shared by render loops and any component
// that needs to gate JS-driven motion. CSS animations should use
// @media (prefers-reduced-motion: reduce) blocks directly instead.
import { reactive } from 'vue'

export const motion = reactive({ reduced: false })

const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
if (mq) {
  motion.reduced = mq.matches
  mq.addEventListener('change', (e) => (motion.reduced = e.matches))
}
