import { SOLO_WORLD, type GameState, type Mode, type Role } from './state'
import { clamp } from './sim/math'
import type { Opponent } from './sim/duel'

export interface View {
  /** Viewport size in CSS pixels. */
  w: number
  h: number
  zoom: number
  dpr: number
  /** Top-left of the camera in world coords. */
  camX: number
  camY: number
}

export const view: View = { w: 360, h: 540, zoom: 1, dpr: 1, camX: 0, camY: 0 }

/** Duel info the renderer needs; absent outside duels. */
export interface DuelScene {
  role: Role
  opponent: Opponent | null
  left: number
  me: number
  opp: number
  countdown: number | null
  /** Connection trouble to show under the score, if any. */
  notice: string | null
}

export interface Scene {
  mode: Mode
  s: GameState
  duel: DuelScene | null
}

type Ctx = CanvasRenderingContext2D

const specks = Array.from({ length: 500 }, () => ({
  x: Math.random() * SOLO_WORLD.w,
  y: Math.random() * SOLO_WORLD.h,
  r: Math.random() * 1.6 + 0.4,
}))

export function resize(cv: HTMLCanvasElement) {
  view.dpr = Math.min(2, devicePixelRatio || 1)
  view.w = cv.clientWidth
  view.h = cv.clientHeight
  cv.width = view.w * view.dpr
  cv.height = view.h * view.dpr
  view.zoom = clamp(Math.min(view.w, view.h) / 560, 0.7, 1.15)
}

/** Centres the camera on the player, or centres the world when it fits on screen. */
export function updateCamera(s: GameState) {
  const vw = view.w / view.zoom, vh = view.h / view.zoom
  view.camX = vw >= s.worldW ? (s.worldW - vw) / 2 : clamp(s.x - vw / 2, 0, s.worldW - vw)
  view.camY = vh >= s.worldH ? (s.worldH - vh) / 2 : clamp(s.y - vh / 2, 0, s.worldH - vh)
}

function drawTurtle(g: Ctx, x: number, y: number, a: number, t: number, fast: boolean, shields: number) {
  g.save(); g.translate(x + 5, y + 7); g.rotate(a + Math.PI / 2)
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(0, 0, 24, 28, 0, 0, 7); g.fill(); g.restore()
  g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2)
  const fl = Math.sin(t * (fast ? 26 : 10)) * 0.45
  g.fillStyle = '#5fa86a'
  for (const sd of [-1, 1]) {
    g.save(); g.translate(sd * 14, -8); g.rotate(sd * (0.7 - fl * sd)); g.beginPath(); g.ellipse(sd * 9, 0, 14, 5, 0, 0, 7); g.fill(); g.restore()
    g.save(); g.translate(sd * 10, 16); g.rotate(sd * (-0.5 - fl * 0.5)); g.beginPath(); g.ellipse(sd * 6, 0, 8, 4, 0, 0, 7); g.fill(); g.restore()
  }
  g.beginPath(); g.ellipse(0, -22, 9, 10, 0, 0, 7); g.fill()
  g.fillStyle = '#0d2a30'; g.beginPath(); g.arc(-4, -25, 1.8, 0, 7); g.arc(4, -25, 1.8, 0, 7); g.fill()
  const sg = g.createRadialGradient(-4, -4, 2, 0, 2, 24)
  sg.addColorStop(0, '#c49a58'); sg.addColorStop(1, '#7a5a2c')
  g.fillStyle = sg; g.beginPath(); g.ellipse(0, 2, 17, 21, 0, 0, 7); g.fill()
  g.strokeStyle = '#5a4020'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, 2, 17, 21, 0, 0, 7)
  g.moveTo(-10, -7); g.lineTo(10, -7); g.moveTo(-12, 9); g.lineTo(12, 9); g.moveTo(0, -19); g.lineTo(0, 22)
  g.moveTo(-10, -7); g.lineTo(-12, 9); g.moveTo(10, -7); g.lineTo(12, 9); g.stroke()
  g.restore()
  for (let i = 0; i < shields; i++) {
    g.strokeStyle = 'rgba(160,230,255,' + (0.55 + Math.sin(t * 5) * 0.15) + ')'; g.lineWidth = 2
    g.beginPath(); g.arc(x, y, 28 + i * 5, 0, 7); g.stroke()
  }
}

interface SharkPose {
  x: number
  y: number
  angle: number
  wave: number
}

const BODY_LEN = 96, SEGMENTS = 16

/** Half-width of the shark body at u (0 = nose, 1 = tail). */
function halfWidth(u: number) {
  return u < 0.3 ? 14 * Math.pow(Math.sin(u / 0.3 * Math.PI / 2), 0.6) : 14 - 11.5 * Math.pow((u - 0.3) / 0.7, 0.9)
}

/** Point on the wavy spine at u, in the shark's local frame. */
function spine(k: SharkPose, u: number) {
  return { x: 38 - u * BODY_LEN, y: Math.sin(k.wave - u * 3.2) * u * u * 10 }
}

function bodyPath(g: Ctx, k: SharkPose, f: number) {
  g.beginPath()
  for (let i = 0; i <= SEGMENTS; i++) {
    const u = i / SEGMENTS, p = spine(k, u), h = halfWidth(u) * f
    if (i) g.lineTo(p.x, p.y - h); else g.moveTo(p.x, p.y - h)
  }
  for (let i = SEGMENTS; i >= 0; i--) {
    const u = i / SEGMENTS, p = spine(k, u), h = halfWidth(u) * f
    g.lineTo(p.x, p.y + h)
  }
  g.closePath()
}

function drawShark(g: Ctx, k: SharkPose) {
  g.save(); g.translate(k.x + 9, k.y + 12); g.rotate(k.angle); g.fillStyle = 'rgba(0,0,0,.2)'; bodyPath(g, k, 1); g.fill(); g.restore()
  g.save(); g.translate(k.x, k.y); g.rotate(k.angle)
  const t = spine(k, 1)
  g.fillStyle = '#3a4852'
  for (const sd of [-1, 1]) {
    const p = spine(k, 0.3), h = halfWidth(0.3)
    g.beginPath(); g.moveTo(p.x + 4, p.y + sd * (h - 2)); g.lineTo(p.x - 26, p.y + sd * (h + 22)); g.lineTo(p.x - 16, p.y + sd * (h - 1)); g.closePath(); g.fill()
    const q = spine(k, 0.62)
    g.beginPath(); g.moveTo(q.x, q.y + sd * (halfWidth(0.62) - 1)); g.lineTo(q.x - 12, q.y + sd * (halfWidth(0.62) + 8)); g.lineTo(q.x - 8, q.y + sd * (halfWidth(0.62) - 1)); g.closePath(); g.fill()
  }
  g.save(); g.translate(t.x, t.y); g.rotate(Math.sin(k.wave - 3.2) * 0.45)
  g.beginPath(); g.moveTo(5, 0); g.quadraticCurveTo(-8, -6, -30, -26); g.quadraticCurveTo(-19, -5, -14, 0); g.quadraticCurveTo(-18, 9, -20, 17); g.quadraticCurveTo(-6, 7, 5, 0); g.fill(); g.restore()
  g.fillStyle = '#4a5a66'; bodyPath(g, k, 1); g.fill()
  g.fillStyle = '#37444e'; bodyPath(g, k, 0.5); g.fill()
  g.strokeStyle = 'rgba(200,215,225,.3)'; g.lineWidth = 1.5; bodyPath(g, k, 1); g.stroke()
  g.strokeStyle = '#2a353d'; g.lineWidth = 1.3
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
    const u = 0.2 + i * 0.03, p = spine(k, u), h = halfWidth(u)
    g.beginPath(); g.moveTo(p.x, p.y + sd * (h - 1)); g.lineTo(p.x - 2, p.y + sd * (h - 6)); g.stroke()
  }
  const dp = spine(k, 0.4)
  g.fillStyle = '#2e3a43'; g.beginPath(); g.moveTo(dp.x + 3, dp.y); g.lineTo(dp.x - 16, dp.y + 2); g.lineTo(dp.x - 6, dp.y - 2); g.closePath(); g.fill()
  g.fillStyle = '#0a1418'
  const e = spine(k, 0.09)
  for (const sd of [-1, 1]) { g.beginPath(); g.arc(e.x, e.y + sd * halfWidth(0.09) * 0.8, 1.9, 0, 7); g.fill() }
  g.restore()
}

/** The player as a shark, with its tail speeding up while dashing. */
const playerShark = (s: GameState): SharkPose => ({ x: s.x, y: s.y, angle: s.angle, wave: s.time * (s.dashTime > 0 ? 13 : 5) })

export function draw(g: Ctx, { mode, s, duel }: Scene) {
  const { w: VW, h: VH, zoom: Z, dpr } = view
  updateCamera(s)
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#020d11'; g.fillRect(0, 0, VW, VH)
  g.setTransform(dpr * Z, 0, 0, dpr * Z, -view.camX * dpr * Z, -view.camY * dpr * Z)
  const WW = s.worldW, WH = s.worldH

  const gr = g.createLinearGradient(0, 0, 0, WH)
  gr.addColorStop(0, '#16707a'); gr.addColorStop(1, '#06303c')
  g.fillStyle = gr; g.fillRect(0, 0, WW, WH)
  g.fillStyle = 'rgba(210,225,215,.09)'
  for (const p of specks) { g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill() }
  g.fillStyle = 'rgba(255,255,255,.035)'
  for (let i = 0; i < 22; i++) {
    g.beginPath(); g.ellipse((i * 167 + s.time * (8 + i % 5 * 2)) % (WW + 80) - 40, (i * 241 + s.time * 5) % (WH + 40), 60, 18, 0.4, 0, 7); g.fill()
  }
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 10; g.strokeRect(0, 0, WW, WH)
  for (const b of s.bubbles) {
    g.strokeStyle = 'rgba(255,255,255,' + (0.5 - b.age * 0.5) + ')'; g.lineWidth = 1.3
    g.beginPath(); g.arc(b.x, b.y, 2 + b.age * 3, 0, 7); g.stroke()
  }
  for (const p of s.pearls) {
    const r = 8 + Math.sin(s.time * 4) * 1.2
    const pg = g.createRadialGradient(p.x, p.y, 2, p.x, p.y, 22)
    pg.addColorStop(0, 'rgba(255,240,200,.45)'); pg.addColorStop(1, 'rgba(255,240,200,0)')
    g.fillStyle = pg; g.beginPath(); g.arc(p.x, p.y, 22, 0, 7); g.fill()
    g.fillStyle = '#fbf3e2'; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill()
    g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x - 3, p.y - 3, 2.4, 0, 7); g.fill()
  }
  for (const k of s.sharks) drawShark(g, k)

  if (mode === 'duel' && duel) {
    const o = duel.opponent
    if (duel.role === 'turtle') {
      if (o) drawShark(g, { x: o.x, y: o.y, angle: o.angle, wave: s.time * (o.dashing ? 13 : 5) })
      drawTurtle(g, s.x, s.y, s.angle, s.time, s.dashTime > 0, s.up.shield)
    } else {
      if (o) drawTurtle(g, o.x, o.y, o.angle, s.time, o.dashing, 0)
      drawShark(g, playerShark(s))
    }
  } else if (mode === 'shark') {
    for (const u of s.turtles) drawTurtle(g, u.x, u.y, u.angle, u.phase, u.burst > 0, 0)
    drawShark(g, playerShark(s))
  } else if (!(s.grace > 0 && Math.floor(s.grace * 8) % 2)) {
    drawTurtle(g, s.x, s.y, s.angle, s.time, s.dashTime > 0, s.up.shield)
  }

  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  let near = 999
  for (const k of s.sharks) near = Math.min(near, Math.hypot(k.x - s.x, k.y - s.y))
  const R = Math.hypot(VW, VH) / 2
  const vg = g.createRadialGradient(VW / 2, VH / 2, R * 0.45, VW / 2, VH / 2, R)
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,10,14,.55)')
  g.fillStyle = vg; g.fillRect(0, 0, VW, VH)
  if (near < 140) {
    const a = (1 - near / 140) * 0.28
    const rg = g.createRadialGradient(VW / 2, VH / 2, R * 0.4, VW / 2, VH / 2, R)
    rg.addColorStop(0, 'rgba(160,20,20,0)'); rg.addColorStop(1, 'rgba(160,20,20,' + a + ')')
    g.fillStyle = rg; g.fillRect(0, 0, VW, VH)
  }

  g.fillStyle = '#e9efe6'; g.font = '700 20px Fredoka,sans-serif'
  const timeText = duel ? Math.ceil(Math.max(0, duel.left)) + 's, ' + duel.role
    : mode === 'shark' ? Math.ceil(s.timeLeft) + 's left' : Math.floor(s.time) + 's'
  const scoreText = duel ? 'You ' + duel.me + ' - ' + duel.opp + ' Friend'
    : (mode === 'shark' ? 'Turtles ' : 'Pearls ') + s.coins
  g.fillText(timeText, 14, 36)
  g.fillText(scoreText, 14, 60)
  if (duel?.notice) g.fillText(duel.notice, 14, 84)
  if (duel && duel.countdown !== null) {
    g.font = '700 80px Fredoka,sans-serif'; g.textAlign = 'center'
    g.fillText(String(Math.max(1, Math.ceil(duel.countdown))), VW / 2, VH / 2)
    g.font = '700 22px Fredoka,sans-serif'
    g.fillText('You are the ' + duel.role, VW / 2, VH / 2 + 44); g.textAlign = 'left'
  }
  g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(VW - 112, 28, 96, 8)
  g.fillStyle = s.dashCooldown <= 0 ? '#e9784a' : '#e9efe6'
  g.fillRect(VW - 112, 28, 96 * (1 - Math.max(0, s.dashCooldown) / s.dashCooldownMax), 8)
}
