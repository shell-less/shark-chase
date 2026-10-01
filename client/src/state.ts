import { clamp } from './sim/math'
import type { Rng } from './sim/rng'

export type Mode = 'turtle' | 'shark' | 'duel'
export type Role = 'turtle' | 'shark'
export type UpgradeKey = 'speed' | 'dash' | 'reach' | 'shield' | 'stamina'

export interface Upgrade {
  name: string
  key: UpgradeKey
  max: number
  cost: (level: number) => number
}

export interface Shark {
  x: number
  y: number
  angle: number
  speed: number
  /** Tail-wave phase, also used for drawing. */
  wave: number
  lungeCooldown: number
  lungeTime: number
}

export interface Pearl {
  x: number
  y: number
}

/** A fleeing AI turtle in shark mode. */
export interface AiTurtle {
  x: number
  y: number
  angle: number
  phase: number
  burst: number
  burstCooldown: number
}

export interface Bubble {
  x: number
  y: number
  age: number
}

export interface GameState {
  worldW: number
  worldH: number
  time: number
  x: number
  y: number
  angle: number
  dashCooldown: number
  dashTime: number
  dashCooldownMax: number
  /** Spendable currency: pearls (turtle) or catches (shark). */
  coins: number
  /** Total pearls collected or turtles caught this game. */
  collected: number
  sharks: Shark[]
  pearls: Pearl[]
  turtles: AiTurtle[]
  bubbles: Bubble[]
  nextShark: number
  grace: number
  /** Shark mode countdown. */
  timeLeft: number
  up: Record<UpgradeKey, number>
  over: boolean
}

export const SOLO_WORLD = { w: 1800, h: 1300 }
export const DUEL_WORLD = { w: 1000, h: 760 }

export const PLAYER_SPEED = 150
export const SPEED_PER_LEVEL = 0.1
export const DASH_SPEED = 400
export const PLAYER_MARGIN = 16

export const START_GRACE = 1.5
export const SHARK_SPAWN_INTERVAL = 14
export const MAX_SHARKS = 5
export const START_PEARLS = 4

export const SHARK_MODE_TIME = 40
export const AI_TURTLES = 7
export const CATCH_BONUS_TIME = 5
export const STAMINA_BONUS_TIME = 8

export const DUEL_TIME = 50
export const DUEL_COUNTDOWN = 3
export const DUEL_Y = 380

export const TURTLE_UPGRADES: Upgrade[] = [
  { name: 'Flippers', key: 'speed', max: 5, cost: l => 3 + 2 * l },
  { name: 'Dash', key: 'dash', max: 5, cost: l => 4 + 2 * l },
  { name: 'Magnet', key: 'reach', max: 4, cost: l => 2 + 2 * l },
  { name: 'Shield', key: 'shield', max: 2, cost: () => 6 },
]

export const SHARK_UPGRADES: Upgrade[] = [
  { name: 'Fins', key: 'speed', max: 5, cost: l => 3 + 2 * l },
  { name: 'Lunge', key: 'dash', max: 5, cost: l => 4 + 2 * l },
  { name: 'Jaws', key: 'reach', max: 4, cost: l => 2 + 2 * l },
  { name: 'Stamina', key: 'stamina', max: 3, cost: l => 5 + 2 * l },
]

export const upgradesFor = (mode: Mode): Upgrade[] =>
  mode === 'shark' ? SHARK_UPGRADES : mode === 'duel' ? [] : TURTLE_UPGRADES

/** Where each side starts a duel round. */
export const duelSpawn = (role: Role) =>
  role === 'shark' ? { x: 250, y: DUEL_Y, angle: 0 } : { x: 750, y: DUEL_Y, angle: Math.PI }

export function createState(mode: Mode, rng: Rng, role: Role = 'turtle'): GameState {
  const world = mode === 'duel' ? DUEL_WORLD : SOLO_WORLD
  const s: GameState = {
    worldW: world.w,
    worldH: world.h,
    time: 0,
    x: world.w / 2,
    y: world.h / 2,
    angle: -Math.PI / 2,
    dashCooldown: 0,
    dashTime: 0,
    dashCooldownMax: 2.2,
    coins: 0,
    collected: 0,
    sharks: [],
    pearls: [],
    turtles: [],
    bubbles: [],
    nextShark: SHARK_SPAWN_INTERVAL,
    grace: START_GRACE,
    timeLeft: 0,
    up: { speed: 0, dash: 0, reach: 0, shield: 0, stamina: 0 },
    over: false,
  }
  if (mode === 'duel') {
    const p = duelSpawn(role)
    s.grace = 0
    s.up.speed = role === 'shark' ? 1 : 0
    s.x = p.x
    s.y = p.y
    s.angle = p.angle
  } else if (mode === 'shark') {
    s.timeLeft = SHARK_MODE_TIME
    s.grace = 0
    for (let i = 0; i < AI_TURTLES; i++) addAiTurtle(s, rng)
  } else {
    addShark(s, rng)
    for (let i = 0; i < START_PEARLS; i++) addPearl(s, rng)
  }
  return s
}

/** Spawns a shark 450–650 units from the player, inside the walls. */
export function addShark(s: GameState, rng: Rng) {
  let x: number, y: number, n = 0
  do {
    const an = rng() * 6.28, r = 450 + rng() * 200
    x = s.x + Math.cos(an) * r
    y = s.y + Math.sin(an) * r
    n++
  } while ((x < 30 || x > s.worldW - 30 || y < 30 || y > s.worldH - 30) && n < 30)
  x = clamp(x, 30, s.worldW - 30)
  y = clamp(y, 30, s.worldH - 30)
  s.sharks.push({
    x,
    y,
    angle: Math.atan2(s.y - y, s.x - x),
    speed: 112 + s.sharks.length * 5,
    wave: rng() * 6,
    lungeCooldown: 2 + rng() * 1.5,
    lungeTime: 0,
  })
}

/** Spawns a pearl at least 120 units from the player. */
export function addPearl(s: GameState, rng: Rng) {
  let x: number, y: number
  do {
    x = 40 + rng() * (s.worldW - 80)
    y = 40 + rng() * (s.worldH - 80)
  } while (Math.hypot(x - s.x, y - s.y) < 120)
  s.pearls.push({ x, y })
}

/** Spawns a fleeing turtle at least 450 units from the player. */
export function addAiTurtle(s: GameState, rng: Rng) {
  let x: number, y: number
  do {
    x = 60 + rng() * (s.worldW - 120)
    y = 60 + rng() * (s.worldH - 120)
  } while (Math.hypot(x - s.x, y - s.y) < 450)
  s.turtles.push({ x, y, angle: rng() * 6.28, phase: rng() * 9, burst: 0, burstCooldown: rng() * 3 })
}
