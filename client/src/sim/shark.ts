import { addAiTurtle, CATCH_BONUS_TIME, type GameState } from '../state'
import { clamp, jawPoint, turnToward } from './math'
import type { Rng } from './rng'

export const jawRadius = (jaws: number) => 20 + 8 * jaws

export interface SharkStep {
  timeUp: boolean
  shopChanged: boolean
}

/** Solo shark mode, after the player has moved: countdown, catches, fleeing turtle AI. */
export function stepSharkMode(s: GameState, dt: number, rng: Rng): SharkStep {
  s.timeLeft -= dt
  if (s.timeLeft <= 0) {
    s.timeLeft = 0
    return { timeUp: true, shopChanged: false }
  }
  let shopChanged = false
  const jaw = jawPoint(s.x, s.y, s.angle), jr = jawRadius(s.up.reach)
  for (let i = 0; i < s.turtles.length; i++) {
    const u = s.turtles[i]
    if (Math.hypot(u.x - jaw.x, u.y - jaw.y) < jr) {
      s.coins++
      s.collected++
      s.timeLeft += CATCH_BONUS_TIME
      s.turtles.splice(i, 1)
      addAiTurtle(s, rng)
      shopChanged = true
      i--
      continue
    }
    const ds = Math.hypot(u.x - s.x, u.y - s.y)
    u.burstCooldown -= dt
    if (u.burst > 0) u.burst -= dt
    let w = ds < 300 ? Math.atan2(u.y - s.y, u.x - s.x) : u.angle + Math.sin(s.time + u.phase) * 0.05
    if (ds < 140 && u.burstCooldown <= 0) {
      u.burst = 0.35
      u.burstCooldown = 4 + rng() * 2
    }
    let fx = Math.cos(w), fy = Math.sin(w)
    if (u.x < 110) fx += 1.5
    if (u.x > s.worldW - 110) fx -= 1.5
    if (u.y < 110) fy += 1.5
    if (u.y > s.worldH - 110) fy -= 1.5
    w = Math.atan2(fy, fx)
    u.angle = turnToward(u.angle, w, 4 * dt)
    const v = u.burst > 0 ? 310 : 118 + Math.min(25, s.collected * 2)
    u.x = clamp(u.x + Math.cos(u.angle) * v * dt, 20, s.worldW - 20)
    u.y = clamp(u.y + Math.sin(u.angle) * v * dt, 20, s.worldH - 20)
    u.phase += dt
  }
  return { timeUp: false, shopChanged }
}
