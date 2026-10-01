import { DASH_SPEED, PLAYER_MARGIN, PLAYER_SPEED, SPEED_PER_LEVEL, type GameState } from '../state'
import { clamp } from './math'
import type { Rng } from './rng'

/** Dash duration and cooldown for a dash upgrade level. Turtles dash shorter but recover slower. */
export function dashStats(turtle: boolean, level: number) {
  return {
    duration: 0.28 + (turtle ? 0.015 : 0.03) * level,
    cooldown: (turtle ? 3.2 : 2.2) - (turtle ? 0.12 : 0.25) * level,
  }
}

/** Starts a dash if it's off cooldown. Returns whether it started. */
export function startDash(s: GameState, turtle: boolean): boolean {
  if (s.over || s.dashCooldown > 0) return false
  const d = dashStats(turtle, s.up.dash)
  s.dashTime = d.duration
  s.dashCooldownMax = d.cooldown
  s.dashCooldown = d.cooldown
  return true
}

export function tickTimers(s: GameState, dt: number) {
  s.time += dt
  if (s.grace > 0) s.grace -= dt
  if (s.dashCooldown > 0) s.dashCooldown -= dt
}

/** Moves the player along a unit direction (or not at all for 0,0), then updates bubbles. */
export function movePlayer(s: GameState, dx: number, dy: number, dt: number, rng: Rng) {
  const sp = s.dashTime > 0 ? DASH_SPEED : PLAYER_SPEED * (1 + SPEED_PER_LEVEL * s.up.speed)
  if (s.dashTime > 0) s.dashTime -= dt
  if (dx || dy) {
    s.x += dx * sp * dt
    s.y += dy * sp * dt
    s.angle = Math.atan2(dy, dx)
  }
  s.x = clamp(s.x, PLAYER_MARGIN, s.worldW - PLAYER_MARGIN)
  s.y = clamp(s.y, PLAYER_MARGIN, s.worldH - PLAYER_MARGIN)
  if (rng() < dt * 6) s.bubbles.push({ x: s.x, y: s.y, age: 0 })
  for (const b of s.bubbles) {
    b.age += dt
    b.y -= 25 * dt
  }
  s.bubbles = s.bubbles.filter(b => b.age < 1)
}
