import { addPearl, addShark, MAX_SHARKS, SHARK_SPAWN_INTERVAL, START_GRACE, type GameState } from '../state'
import { jawPoint, turnToward } from './math'
import type { Rng } from './rng'

export const LUNGE_RANGE = 170
export const SHARK_BITE = 20
export const SHARK_BODY = 22

export const pearlRadius = (magnet: number) => 22 + 18 * magnet

export interface TurtleStep {
  caught: boolean
  shopChanged: boolean
}

/** Solo turtle mode, after the player has moved: shark AI, shield hits, pearl pickup. */
export function stepTurtleMode(s: GameState, dt: number, rng: Rng): TurtleStep {
  let shopChanged = false
  s.nextShark -= dt
  if (s.nextShark <= 0 && s.sharks.length < MAX_SHARKS) {
    addShark(s, rng)
    s.nextShark = SHARK_SPAWN_INTERVAL
  }
  for (const k of s.sharks) {
    const dist = Math.hypot(s.x - k.x, s.y - k.y)
    k.lungeCooldown -= dt
    if (k.lungeTime > 0) k.lungeTime -= dt
    else if (dist < LUNGE_RANGE && k.lungeCooldown <= 0 && s.grace <= 0) {
      k.lungeTime = 0.45
      k.lungeCooldown = 3.2 + rng() * 1.5
    }
    const lunging = k.lungeTime > 0
    k.angle = turnToward(k.angle, Math.atan2(s.y - k.y, s.x - k.x), (lunging ? 0.9 : 2.1) * dt)
    const v = k.speed * (lunging ? 2.3 : 1) * (1 + Math.min(0.25, s.time * 0.003))
    k.x += Math.cos(k.angle) * v * dt
    k.y += Math.sin(k.angle) * v * dt
    k.wave += dt * (lunging ? 13 : 5)
    const jaw = jawPoint(k.x, k.y, k.angle)
    if (s.grace <= 0 && (Math.hypot(jaw.x - s.x, jaw.y - s.y) < SHARK_BITE || dist < SHARK_BODY)) {
      if (s.up.shield <= 0) return { caught: true, shopChanged }
      s.up.shield--
      s.grace = START_GRACE
      k.lungeCooldown = 3
      k.lungeTime = 0
      const an = Math.atan2(k.y - s.y, k.x - s.x)
      k.x = s.x + Math.cos(an) * 120
      k.y = s.y + Math.sin(an) * 120
      k.angle = an + Math.PI
      shopChanged = true
    }
  }
  const pr = pearlRadius(s.up.reach)
  const before = s.pearls.length
  s.pearls = s.pearls.filter(p => Math.hypot(p.x - s.x, p.y - s.y) >= pr)
  for (let n = before - s.pearls.length; n > 0; n--) {
    s.coins++
    s.collected++
    addPearl(s, rng)
    shopChanged = true
  }
  return { caught: false, shopChanged }
}
