/**
 * All physics in real-world meters (handoff §3 — validated numbers, do not tweak
 * the first block). The second block is the game-feel tuning surface.
 */

// ---- Validated spec numbers (handoff §3) ----
export const G = 9.81 // m/s²
export const RIM_HEIGHT = 3.05 // m
export const RELEASE_HEIGHT = 2.1 // m
export const SHOT_DIST = 7.24 // m, horizontal, release point → rim center

// ---- Regulation geometry ----
export const R_RIM = 0.2286 // rim inner radius (45.72 cm diameter)
export const R_TUBE = 0.016 // rim tube radius
export const R_BALL = 0.121 // ball radius (~24 cm diameter)
export const BOARD_OFFSET = 0.3796 // rim center → backboard face
export const BOARD_BOTTOM = 2.9 // m
export const BOARD_TOP = 3.95 // m
export const BOARD_HALF_W = 0.915 // m

// Canonical shot space: release at (0, RELEASE_HEIGHT, 0), ball travels +x.
export const HOOP_X = SHOT_DIST
export const HOOP_Y = RIM_HEIGHT
export const BOARD_X = HOOP_X + BOARD_OFFSET

// Rim mounting bracket: fills the 13.5 cm shelf between the back rim tube and
// the board face — otherwise a square back-rim miss can wedge there and rest
// (rim pushes forward, board pushes back). Modeled as a steeply sloped ribbon
// rising rim→board (~45°): anything landing on it slides forward onto the back
// rim and resolves naturally. Physics ribbon is wider than the visible bracket
// so off-axis wedge spots are covered too.
export const BRACKET_X0 = HOOP_X + R_RIM - 0.01 // just behind the rim circle
export const BRACKET_X1 = BOARD_X
export const BRACKET_Y0 = RIM_HEIGHT // top edge at the rim
export const BRACKET_Y1 = RIM_HEIGHT + 0.15 // top edge at the board
export const BRACKET_HALF_W = 0.2 // covers every azimuth where rim+board can co-trap

// ---- Simulation ----
export const SIM_DT = 1 / 240 // fixed timestep; ~3.8 cm/step at 9 m/s vs ~14 cm contact window
export const MAX_SHOT_TIME = 7 // s, hard stop
export const BACKSPIN_DEFAULT = 15 // rad/s ≈ 2.4 rev/s — every shot gets shooter's backspin

// ---- Materials / game feel (tuning surface — sandbox-validated) ----
export const E_RIM = 0.32 // rim restitution — real rims are dead (spring-mounted, absorb energy)
export const MU_RIM = 0.12 // tangential slip removed per rim contact — grazes keep rolling in
export const SPIN_KICK = 0.25 // how much backspin surface-slip feeds the friction impulse
export const SPIN_DECAY_RIM = 0.55 // spin retained per rim contact
export const E_BOARD = 0.68
export const MU_BOARD = 0.2
export const SPIN_DECAY_BOARD = 0.7
export const E_FLOOR = 0.62
export const MU_FLOOR = 0.15
export const NET_DRAG = 2.6 // 1/s velocity decay while inside the net cylinder
export const E_NET_WALL = 0.08 // net "catches" a ball rattling sideways below the rim plane

// Make/dead-ball thresholds
export const MAKE_DEPTH = 0.22 // m below rim plane, still in cylinder → made
export const NET_EXIT_Y = RIM_HEIGHT - 0.6 // made ball is visually through the net here

// ---- Court layout (render/world mapping; physics never uses these) ----
export const COURT_LEN = 28.65
export const COURT_WIDTH = 15.24
export const RIM_FROM_BASELINE = 1.575
/** Left hoop rim center x (player shoots toward −x world at this hoop). */
export const HOOP_LEFT_X = RIM_FROM_BASELINE
/** Right hoop rim center x (AI shoots toward +x world at this hoop). */
export const HOOP_RIGHT_X = COURT_LEN - RIM_FROM_BASELINE
