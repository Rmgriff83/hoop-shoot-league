/**
 * Damped spring — the workhorse of all bouncy motion (camera rig, score
 * count-ups, ball squash settle, rim wobble). Step it from a render loop with
 * real dt; it is framerate-independent.
 */
export class Spring {
  value: number
  velocity = 0
  target: number

  constructor(
    value = 0,
    /** Stiffness (1/s²). Higher = snappier. */
    public stiffness = 170,
    /** Damping ratio: 1 = critically damped, <1 = bouncy overshoot. */
    public dampingRatio = 1,
  ) {
    this.value = value
    this.target = value
  }

  /** Kick adds velocity — great for impact reactions (rim wobble, squash). */
  kick(impulse: number): void {
    this.velocity += impulse
  }

  set(value: number): void {
    this.value = value
    this.target = value
    this.velocity = 0
  }

  step(dt: number): number {
    // Semi-implicit Euler on m x'' = -k (x - target) - c x', clamped substeps for stability.
    const c = 2 * this.dampingRatio * Math.sqrt(this.stiffness)
    let remaining = dt
    while (remaining > 0) {
      const h = Math.min(remaining, 1 / 120)
      const accel = -this.stiffness * (this.value - this.target) - c * this.velocity
      this.velocity += accel * h
      this.value += this.velocity * h
      remaining -= h
    }
    return this.value
  }

  get settled(): boolean {
    return Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-4
  }
}

/** 3-channel spring for positions/scales. */
export class Spring3 {
  x: Spring
  y: Spring
  z: Spring

  constructor(x = 0, y = 0, z = 0, stiffness = 170, dampingRatio = 1) {
    this.x = new Spring(x, stiffness, dampingRatio)
    this.y = new Spring(y, stiffness, dampingRatio)
    this.z = new Spring(z, stiffness, dampingRatio)
  }

  setTarget(x: number, y: number, z: number): void {
    this.x.target = x
    this.y.target = y
    this.z.target = z
  }

  set(x: number, y: number, z: number): void {
    this.x.set(x)
    this.y.set(y)
    this.z.set(z)
  }

  step(dt: number): void {
    this.x.step(dt)
    this.y.step(dt)
    this.z.step(dt)
  }
}
