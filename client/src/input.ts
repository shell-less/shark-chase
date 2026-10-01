import type { GameState } from './state'
import type { View } from './render'

const keys: Record<string, boolean> = {}
/** Last pointer position in canvas (screen) coords, or null. */
let pointer: { x: number; y: number } | null = null

export const clearPointer = () => (pointer = null)

export interface InputHandlers {
  dash: () => void
  buy: (i: number) => void
  enter: () => void
}

export function bindInput(canvas: HTMLCanvasElement, h: InputHandlers) {
  addEventListener('keydown', e => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const k = e.key.toLowerCase()
    keys[k] = true
    if (k === 'q' || k === ' ') h.dash()
    if (k.length === 1 && '1234'.includes(k)) h.buy(+k - 1)
    if (k === 'enter') h.enter()
  })
  addEventListener('keyup', e => (keys[e.key.toLowerCase()] = false))
  const track = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  canvas.addEventListener('pointerdown', track)
  canvas.addEventListener('pointermove', e => {
    if (e.buttons || e.pointerType === 'mouse') track(e)
  })
}

/**
 * Unit direction the player wants to move, or 0,0. Keys win over the pointer and clear it.
 * The pointer steers toward its world position, so the camera must be current.
 */
export function moveIntent(s: GameState, view: View) {
  let dx = 0, dy = 0
  if (keys.arrowleft || keys.a) dx = -1
  if (keys.arrowright || keys.d) dx = 1
  if (keys.arrowup || keys.w) dy = -1
  if (keys.arrowdown || keys.s) dy = 1
  if (dx || dy) {
    pointer = null
    const l = Math.hypot(dx, dy)
    return { dx: dx / l, dy: dy / l }
  }
  if (pointer) {
    const ex = pointer.x / view.zoom + view.camX - s.x, ey = pointer.y / view.zoom + view.camY - s.y, d = Math.hypot(ex, ey)
    if (d > 6) return { dx: ex / d, dy: ey / d }
  }
  return { dx: 0, dy: 0 }
}
