export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * Canonical shot space: release at (0, RELEASE_HEIGHT, 0), hoop centered at
 * (SHOT_DIST, RIM_HEIGHT, 0), ball travels +x. Player and AI shots both run in
 * this space; the renderer mirrors world coordinates per shooter.
 */
export interface LaunchParams {
  /** Launch angle above horizontal, degrees, in the shot plane. */
  angleDeg: number
  /** Release speed, m/s. */
  speed: number
  /** Lateral velocity (m/s). 0 = dead-on; aim noise feeds this. */
  vz?: number
  /** Backspin, rad/s (positive = backspin for +x travel). Defaults to BACKSPIN_DEFAULT. */
  backspin?: number
}

export type ContactKind = 'rim' | 'board' | 'floor' | 'net'

export interface ContactEvent {
  kind: ContactKind
  t: number
  pos: Vec3
  normal: Vec3
  /** Rim contacts: azimuth of the contact point around the hoop, degrees. 0 = front (shooter side), 90 = side, 180 = back. */
  azimuthDeg?: number
  /** Impact speed (m/s) at the moment of contact — drives sfx/vfx intensity. */
  speed: number
}

export type ShotResultType =
  | 'SWISH'
  | 'MAKE'
  | 'BANK'
  | 'SHOOTERS_ROLL'
  | 'IN_AND_OUT'
  | 'FRONT_RIM'
  | 'BACK_RIM'
  | 'SIDE_RIM'
  | 'BOARD_MISS'
  | 'AIRBALL'

export interface ShotOutcome {
  made: boolean
  points: 0 | 1 | 2
  type: ShotResultType
  /** Downward angle at the rim plane crossing, degrees. null if the ball never crossed inside the cylinder. */
  entryAngleDeg: number | null
  rimContacts: number
  boardContacts: number
  /** Time to first contact or rim entry (s) — cadence/replay timing. */
  flightTime: number
  events: ContactEvent[]
  /** Deepest collider penetration seen (m) — test invariant, stays ~0 unless tunneling. */
  maxPenetration: number
}

export interface BallState {
  t: number
  pos: Vec3
  vel: Vec3
  /** ω about z, rad/s. Positive = backspin for +x travel. */
  spin: number
  /** Ball center is below rim plane inside the cylinder. */
  inCylinder: boolean
  everEntered: boolean
  entryAngleDeg: number | null
  made: boolean
  /** Outcome is determined (made, or provably dead) — headless sims may stop here. */
  resolved: boolean
  /** Ball is fully at rest / off-court — rendering may stop too. */
  settled: boolean
  floorHits: number
  /** Seconds spent nearly motionless while airborne — dead-ball safety net. */
  slowTime: number
  events: ContactEvent[]
  maxPenetration: number
}
