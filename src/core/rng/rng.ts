/**
 * Seedable deterministic RNG (mulberry32).
 *
 * The whole core is deterministic on purpose: same seed ⇒ identical shot outcomes,
 * contact logs, schedules, and season sims. Never use Math.random() in core — thread
 * an Rng through instead, so fixtures and property tests are reproducible.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    // Coerce to a 32-bit unsigned integer state.
    this.state = seed >>> 0
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n)
  }

  /** Standard normal via Box–Muller. */
  normal(): number {
    let u = 0
    while (u === 0) u = this.next()
    const v = this.next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo)
  }

  /** Pick a random element. Assumes non-empty. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T
  }

  /** In-place Fisher–Yates shuffle, returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      const tmp = items[i] as T
      items[i] = items[j] as T
      items[j] = tmp
    }
    return items
  }
}

/** Small string/number mixer for deriving stable sub-seeds (fnv1a-ish). */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5
  for (const part of parts) {
    const s = String(part)
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    h ^= 0x9e3779b9
  }
  return h >>> 0
}
