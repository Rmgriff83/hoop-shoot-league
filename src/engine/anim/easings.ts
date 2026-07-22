/** Shared easing curves — hand-rolled, no tween lib (house style). */
export type Easing = (t: number) => number

export const linear: Easing = (t) => t
export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t)
export const easeInQuad: Easing = (t) => t * t
export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)

/** Overshooting pop — the signature cute arrival. */
export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

/** Bouncy landing. */
export const easeOutBounce: Easing = (t) => {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
  return n1 * (t -= 2.625 / d1) * t + 0.984375
}
