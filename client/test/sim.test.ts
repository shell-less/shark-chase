import { describe, expect, it } from 'vitest'
import { createState, SHARK_UPGRADES, TURTLE_UPGRADES, upgradesFor, type GameState, type Shark } from '../src/state'
import { mulberry32 } from '../src/sim/rng'
import { dashStats, movePlayer, startDash } from '../src/sim/player'
import { pearlRadius, stepTurtleMode } from '../src/sim/turtle'
import { jawRadius, stepSharkMode } from '../src/sim/shark'
import { createOpponent, duelWinner, flip, roleFor, type Opponent } from '../src/sim/duel'
import { tryBuy } from '../src/shop'

const rng = () => mulberry32(42)
const costs = (u: { max: number; cost: (l: number) => number }) => Array.from({ length: u.max }, (_, l) => u.cost(l))

/** Turtle-mode state with no sharks or pearls, player centred and out of grace. */
function turtleState(): GameState {
  const s = createState('turtle', rng())
  s.sharks = []
  s.pearls = []
  s.grace = 0
  return s
}

const sharkAt = (x: number, y: number, angle = 0): Shark => ({ x, y, angle, speed: 0, wave: 0, lungeCooldown: 99, lungeTime: 0 })

describe('createState', () => {
  it('is deterministic for a seed', () => {
    expect(createState('turtle', mulberry32(7))).toEqual(createState('turtle', mulberry32(7)))
    expect(createState('shark', mulberry32(7))).toEqual(createState('shark', mulberry32(7)))
  })

  it('sets up turtle mode', () => {
    const s = createState('turtle', rng())
    expect([s.worldW, s.worldH]).toEqual([1800, 1300])
    expect(s.sharks).toHaveLength(1)
    expect(s.pearls).toHaveLength(4)
    expect(s.grace).toBe(1.5)
    for (const k of s.sharks) expect(Math.hypot(k.x - s.x, k.y - s.y)).toBeGreaterThanOrEqual(450)
    for (const p of s.pearls) expect(Math.hypot(p.x - s.x, p.y - s.y)).toBeGreaterThanOrEqual(120)
  })

  it('sets up shark mode', () => {
    const s = createState('shark', rng())
    expect(s.turtles).toHaveLength(7)
    expect(s.timeLeft).toBe(40)
    expect(s.grace).toBe(0)
    for (const u of s.turtles) expect(Math.hypot(u.x - s.x, u.y - s.y)).toBeGreaterThanOrEqual(450)
  })

  it('places duel players by role', () => {
    const sh = createState('duel', rng(), 'shark'), tu = createState('duel', rng(), 'turtle')
    expect([sh.worldW, sh.worldH]).toEqual([1000, 760])
    expect([sh.x, sh.y, sh.angle, sh.up.speed]).toEqual([250, 380, 0, 1])
    expect([tu.x, tu.y, tu.angle, tu.up.speed]).toEqual([750, 380, Math.PI, 0])
  })
})

describe('upgrades', () => {
  it('match the original cost tables', () => {
    expect(TURTLE_UPGRADES.map(u => [u.name, u.max, costs(u)])).toEqual([
      ['Flippers', 5, [3, 5, 7, 9, 11]],
      ['Dash', 5, [4, 6, 8, 10, 12]],
      ['Magnet', 4, [2, 4, 6, 8]],
      ['Shield', 2, [6, 6]],
    ])
    expect(SHARK_UPGRADES.map(u => [u.name, u.max, costs(u)])).toEqual([
      ['Fins', 5, [3, 5, 7, 9, 11]],
      ['Lunge', 5, [4, 6, 8, 10, 12]],
      ['Jaws', 4, [2, 4, 6, 8]],
      ['Stamina', 3, [5, 7, 9]],
    ])
    expect(upgradesFor('duel')).toEqual([])
  })

  it('buys only when affordable and not maxed', () => {
    const s = turtleState()
    s.coins = 2
    expect(tryBuy(s, TURTLE_UPGRADES, 0)).toBe(false)
    s.coins = 3
    expect(tryBuy(s, TURTLE_UPGRADES, 0)).toBe(true)
    expect([s.coins, s.up.speed]).toEqual([0, 1])
    s.coins = 100
    while (tryBuy(s, TURTLE_UPGRADES, 3));
    expect([s.up.shield, s.coins]).toEqual([2, 88])
  })

  it('stamina adds 8 seconds', () => {
    const s = createState('shark', rng())
    s.coins = 5
    expect(tryBuy(s, SHARK_UPGRADES, 3)).toBe(true)
    expect(s.timeLeft).toBe(48)
  })

  it('refuses after game over and ignores missing slots', () => {
    const s = turtleState()
    s.coins = 100
    expect(tryBuy(s, [], 0)).toBe(false)
    s.over = true
    expect(tryBuy(s, TURTLE_UPGRADES, 0)).toBe(false)
  })
})

describe('player', () => {
  it('dash stats per side and level', () => {
    expect(dashStats(true, 0)).toEqual({ duration: 0.28, cooldown: 3.2 })
    expect(dashStats(false, 0)).toEqual({ duration: 0.28, cooldown: 2.2 })
    // Turtle Dash: 10% further per level, up to +50% at level 5, and the cooldown stays put.
    for (let l = 0; l <= 5; l++) {
      expect(dashStats(true, l).duration).toBeCloseTo(0.28 * (1 + 0.1 * l))
      expect(dashStats(true, l).cooldown).toBe(3.2)
    }
    expect(dashStats(false, 5).duration).toBeCloseTo(0.43)
    expect(dashStats(false, 5).cooldown).toBeCloseTo(0.95)
  })

  it('dash needs the cooldown to have run out', () => {
    const s = turtleState()
    expect(startDash(s, true)).toBe(true)
    expect(startDash(s, true)).toBe(false)
  })

  it('moves at base, upgraded and dash speed, and stays inside the walls', () => {
    const s = turtleState(), x0 = s.x
    movePlayer(s, 1, 0, 0.1, rng())
    expect(s.x - x0).toBeCloseTo(15)
    s.up.speed = 2
    movePlayer(s, 1, 0, 0.1, rng())
    expect(s.x - x0).toBeCloseTo(33)
    s.dashTime = 1
    movePlayer(s, 1, 0, 0.1, rng())
    expect(s.x - x0).toBeCloseTo(73)
    s.x = 5
    s.y = 5000
    movePlayer(s, 0, 0, 0.01, rng())
    expect([s.x, s.y]).toEqual([16, s.worldH - 16])
  })
})

describe('turtle mode collisions', () => {
  it('a shark biting the turtle ends the game', () => {
    const s = turtleState()
    s.sharks = [sharkAt(s.x - 30, s.y)]
    expect(stepTurtleMode(s, 0.001, rng()).caught).toBe(true)
  })

  it('a shark just out of reach does not', () => {
    const s = turtleState()
    s.sharks = [sharkAt(s.x - 50, s.y)]
    expect(stepTurtleMode(s, 0.001, rng()).caught).toBe(false)
  })

  it('grace protects the turtle', () => {
    const s = turtleState()
    s.grace = 1
    s.sharks = [sharkAt(s.x - 30, s.y)]
    expect(stepTurtleMode(s, 0.001, rng()).caught).toBe(false)
  })

  it('a shield absorbs the hit and knocks the shark back', () => {
    const s = turtleState()
    s.up.shield = 1
    s.sharks = [sharkAt(s.x - 30, s.y)]
    const r = stepTurtleMode(s, 0.001, rng())
    expect(r).toEqual({ caught: false, shopChanged: true })
    expect(s.up.shield).toBe(0)
    expect(s.grace).toBe(1.5)
    expect(Math.hypot(s.sharks[0].x - s.x, s.sharks[0].y - s.y)).toBeCloseTo(120)
  })

  it('collects pearls within the magnet radius', () => {
    const s = turtleState()
    s.pearls = [{ x: s.x + 30, y: s.y }]
    expect(stepTurtleMode(s, 0.001, rng()).shopChanged).toBe(false)
    s.up.reach = 1
    expect(pearlRadius(1)).toBe(40)
    expect(stepTurtleMode(s, 0.001, rng()).shopChanged).toBe(true)
    expect([s.coins, s.collected]).toEqual([1, 1])
    expect(s.pearls).toHaveLength(1)
    expect(Math.hypot(s.pearls[0].x - s.x, s.pearls[0].y - s.y)).toBeGreaterThanOrEqual(120)
  })

  it('spawns a new shark every 14s up to 5', () => {
    const s = turtleState()
    s.nextShark = 0.001
    s.x = s.y = 10_000 // far from any new shark
    stepTurtleMode(s, 0.01, rng())
    expect([s.sharks.length, s.nextShark]).toEqual([1, 14])
  })
})

describe('shark mode', () => {
  it('jaws catch a turtle, add 5s and respawn it far away', () => {
    const s = createState('shark', rng())
    s.turtles = [{ x: s.x + 24 + jawRadius(0) - 1, y: s.y, angle: 0, phase: 0, burst: 0, burstCooldown: 9 }]
    s.angle = 0
    const r = stepSharkMode(s, 0.001, rng())
    expect(r.shopChanged).toBe(true)
    expect([s.coins, s.collected]).toEqual([1, 1])
    expect(s.timeLeft).toBeCloseTo(45)
    expect(s.turtles).toHaveLength(1)
    expect(Math.hypot(s.turtles[0].x - s.x, s.turtles[0].y - s.y)).toBeGreaterThanOrEqual(450)
  })

  it('ends when time runs out', () => {
    const s = createState('shark', rng())
    s.timeLeft = 0.01
    expect(stepSharkMode(s, 0.02, rng()).timeUp).toBe(true)
    expect(s.timeLeft).toBe(0)
  })
})

describe('duel', () => {
  it('roles alternate from the creator side', () => {
    expect([1, 2, 3, 4].map(r => roleFor(r, 'turtle'))).toEqual(['turtle', 'shark', 'turtle', 'shark'])
    expect([1, 2, 3, 4].map(r => roleFor(r, 'shark'))).toEqual(['shark', 'turtle', 'shark', 'turtle'])
    expect(flip('shark')).toBe('turtle')
  })

  it('starts the opponent on the other spawn', () => {
    expect(createOpponent('shark')).toMatchObject({ x: 750, y: 380, angle: Math.PI })
    expect(createOpponent('turtle')).toMatchObject({ x: 250, y: 380, angle: 0 })
  })

  const at = (x: number, y: number): Opponent => ({ x, y, tx: x, ty: y, angle: 0, targetAngle: 0, dashing: false })

  it('the shark wins on a bite, only from its own side', () => {
    const s = createState('duel', rng(), 'shark')
    expect(duelWinner(s, at(s.x + 40, s.y), 'shark', 10)).toBe('shark')
    expect(duelWinner(s, at(s.x + 60, s.y), 'shark', 10)).toBeNull()
    expect(duelWinner(s, at(s.x + 40, s.y), 'turtle', 10)).toBeNull()
  })

  it('the turtle wins at time out, the shark waits 1.5s for its report', () => {
    const s = createState('duel', rng(), 'turtle'), o = at(0, 0)
    expect(duelWinner(s, o, 'turtle', 0)).toBe('turtle')
    expect(duelWinner(s, o, 'shark', -1)).toBeNull()
    expect(duelWinner(s, o, 'shark', -1.6)).toBe('turtle')
  })
})
