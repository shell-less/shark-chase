import { createState, upgradesFor, type GameState, type Mode, type Upgrade } from './state'
import { movePlayer, startDash, tickTimers } from './sim/player'
import { stepTurtleMode } from './sim/turtle'
import { stepSharkMode } from './sim/shark'
import { draw as drawScene, resize, updateCamera, view } from './render'
import { bindInput, clearKeys, clearPointer, moveIntent } from './input'
import { renderShop, tryBuy } from './shop'
import { duelFrozen, duelScene, initDuel, net, stepCountdown, stepDuel } from './duel'
import { MENU_TEXT, hideOverlay, overlayVisible, showMainMenu, showOverlay, ui } from './ui'
import { bestScore, recordScore } from './scores'

const g = ui.canvas.getContext('2d')!
const rng = Math.random

let mode: Mode = 'turtle'
let s: GameState
let upgrades: Upgrade[] = []
let raf = 0, last = 0
let paused = false

function reset() {
  s = createState(mode, rng, net.role)
  clearPointer()
  upgrades = upgradesFor(mode)
  refresh()
}

const refresh = () => renderShop(ui.shop, upgrades, s, mode, buy)

function buy(i: number) {
  if (!paused && tryBuy(s, upgrades, i)) refresh()
}

const draw = () => drawScene(g, { mode, s, duel: mode === 'duel' ? duelScene() : null })

function start(m: Mode) {
  mode = m
  reset()
  paused = false
  ui.pauseRow.hidden = true
  hideOverlay()
  ui.dash.disabled = false
  ui.pause.hidden = m === 'duel'
  last = performance.now()
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(loop)
}

/** Stops the loop on the final frame. */
function halt() {
  cancelAnimationFrame(raf)
  s.over = true
  ui.dash.disabled = true
  ui.pause.hidden = true
  draw()
}

/** Freezes a running solo game behind the overlay. Duels can't pause: the other player keeps going. */
function pause() {
  if (mode === 'duel' || s.over || paused || overlayVisible()) return
  paused = true
  cancelAnimationFrame(raf)
  clearKeys()
  ui.pause.hidden = true
  ui.title.textContent = 'Paused'
  ui.message.textContent = 'Take a breather. Press P or Resume to carry on.'
  ui.soloRow.hidden = true
  ui.pauseRow.hidden = false
  showOverlay()
  ui.resume.focus()
}

function resume() {
  if (!paused) return
  paused = false
  ui.pauseRow.hidden = true
  ui.soloRow.hidden = false
  hideOverlay()
  ui.pause.hidden = false
  last = performance.now()
  raf = requestAnimationFrame(loop)
}

/** Abandons the paused game without recording a score. */
function quit() {
  paused = false
  halt()
  ui.pauseRow.hidden = true
  ui.soloRow.hidden = false
  showMainMenu()
  ui.playTurtle.focus()
}

function dash() {
  if (paused || (mode === 'duel' && duelFrozen())) return
  startDash(s, mode === 'turtle' || (mode === 'duel' && net.role === 'turtle'))
}

function update(dt: number) {
  updateCamera(s)
  if (mode === 'duel' && duelFrozen()) {
    s.time += dt
    return stepCountdown(dt)
  }
  const { dx, dy } = moveIntent(s, view)
  tickTimers(s, dt)
  movePlayer(s, dx, dy, dt, rng)
  if (mode === 'duel') return stepDuel(s, dt)
  if (mode === 'shark') {
    const r = stepSharkMode(s, dt, rng)
    if (r.shopChanged) refresh()
    if (r.timeUp) over()
    return
  }
  const r = stepTurtleMode(s, dt, rng)
  if (r.shopChanged) refresh()
  if (r.caught) over()
}

/** Ends a solo game and records the best score. */
function over() {
  halt()
  const sk = mode === 'shark', sc = sk ? s.collected : Math.floor(s.time) + s.collected * 5
  const nb = recordScore(sk ? 'shark' : 'turtle', sc), pb = bestScore(sk ? 'shark' : 'turtle')
  ui.title.textContent = sk ? "Time's up" : 'Caught after ' + Math.floor(s.time) + 's'
  ui.message.textContent = (sk ? 'You caught ' + s.collected + ' turtles. ' : 'Score ' + sc + ' (' + s.collected + ' pearls at 5 each, plus 1 per second). ') + (nb ? 'New best!' : 'Best: ' + pb + '.')
  ui.playTurtle.textContent = 'Play as turtle'
  showOverlay()
  ui.tip.textContent = MENU_TEXT
  ui.tip.hidden = false
  ui.playTurtle.focus()
}

function loop(n: number) {
  const dt = Math.min(0.05, (n - last) / 1000)
  last = n
  update(dt)
  if (!s.over) {
    draw()
    raf = requestAnimationFrame(loop)
  }
}

ui.playTurtle.onclick = () => start('turtle')
ui.playShark.onclick = () => start('shark')
ui.dash.addEventListener('pointerdown', e => {
  e.stopPropagation()
  dash()
})
bindInput(ui.canvas, {
  dash,
  buy,
  enter: () => {
    if (paused) resume()
    else if (overlayVisible() && ui.duelPanel.hidden && !net.room) start('turtle')
  },
  pause: () => (paused ? resume() : pause()),
})
ui.pause.onclick = pause
ui.resume.onclick = resume
ui.quit.onclick = quit
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause()
})
initDuel({ start, halt, leave: () => (mode = 'turtle') })
addEventListener('resize', () => {
  resize(ui.canvas)
  draw()
})

reset()
resize(ui.canvas)
draw()
showMainMenu()
