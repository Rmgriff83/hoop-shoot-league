/**
 * Turn a finished ball state into a scored, named outcome. Nothing here decides
 * physics — it only reads the event log the sim produced. Swish is emergent:
 * 2 points strictly means the ball touched nothing on the way in.
 */
import type { BallState, ShotOutcome, ShotResultType } from '../physics/types'

export function classifyShot(s: BallState): ShotOutcome {
  const rim = s.events.filter((e) => e.kind === 'rim')
  const board = s.events.filter((e) => e.kind === 'board')
  const rimContacts = rim.length
  const boardContacts = board.length

  let type: ShotResultType
  if (s.made) {
    if (rimContacts === 0 && boardContacts === 0) type = 'SWISH'
    else if (boardContacts > 0) type = 'BANK'
    else if (rimContacts >= 3) type = 'SHOOTERS_ROLL'
    else type = 'MAKE'
  } else if (s.everEntered) {
    type = 'IN_AND_OUT'
  } else if (rimContacts > 0) {
    const az = rim[0]?.azimuthDeg ?? 0
    type = az < 55 ? 'FRONT_RIM' : az > 125 ? 'BACK_RIM' : 'SIDE_RIM'
  } else if (boardContacts > 0) {
    type = 'BOARD_MISS'
  } else {
    type = 'AIRBALL'
  }

  const points: 0 | 1 | 2 = s.made ? (type === 'SWISH' ? 2 : 1) : 0

  const firstEventT = s.events[0]?.t
  const flightTime = firstEventT ?? (s.entryAngleDeg !== null ? s.t : s.t)

  return {
    made: s.made,
    points,
    type,
    entryAngleDeg: s.entryAngleDeg,
    rimContacts,
    boardContacts,
    flightTime,
    events: s.events,
    maxPenetration: s.maxPenetration,
  }
}
