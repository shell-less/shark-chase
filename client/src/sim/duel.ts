import { duelSpawn, type GameState, type Role } from '../state'
import { jawPoint } from './math'

export const flip = (r: Role): Role => (r === 'turtle' ? 'shark' : 'turtle')

/** Odd rounds play the creator's chosen side, even rounds swap. */
export const roleFor = (round: number, base: Role): Role => (round % 2 ? base : flip(base))

/** The other player, smoothed toward the last position they sent. */
export interface Opponent {
  x: number
  y: number
  tx: number
  ty: number
  angle: number
  targetAngle: number
  dashing: boolean
}

export function createOpponent(myRole: Role): Opponent {
  const p = duelSpawn(flip(myRole))
  return { x: p.x, y: p.y, tx: p.x, ty: p.y, angle: p.angle, targetAngle: p.angle, dashing: false }
}

export function stepOpponent(o: Opponent, dt: number) {
  const k = Math.min(1, dt * 14)
  o.x += (o.tx - o.x) * k
  o.y += (o.ty - o.y) * k
  o.angle = o.targetAngle
}

export const DUEL_BITE = 22
export const DUEL_BODY = 24
/** How long past zero the shark waits for the turtle to report its own survival. */
export const SHARK_TIMEOUT_SLACK = 1.5

/** Who this client says won, or null if the round goes on. Each side only reports what it can see. */
export function duelWinner(s: GameState, o: Opponent | null, role: Role, left: number): Role | null {
  if (role === 'shark' && o) {
    const jaw = jawPoint(s.x, s.y, s.angle)
    if (Math.hypot(jaw.x - o.x, jaw.y - o.y) < DUEL_BITE || Math.hypot(s.x - o.x, s.y - o.y) < DUEL_BODY) return 'shark'
  }
  if (left <= 0 && (role === 'turtle' || left < -SHARK_TIMEOUT_SLACK)) return 'turtle'
  return null
}
