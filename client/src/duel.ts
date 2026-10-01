import { DUEL_COUNTDOWN, DUEL_TIME, duelSpawn, type GameState, type Mode, type Role } from './state'
import { createOpponent, duelWinner, flip, roleFor, stepOpponent, type Opponent } from './sim/duel'
import { claudeRoomsAvailable, joinClaudeRoom } from './net/claudeRoom'
import type { Presence, Room } from './net/room'
import type { DuelScene } from './render'
import { MENU_TEXT, showOverlay, ui } from './ui'

type Phase = 'menu' | 'wait' | 'ready' | 'count' | 'play' | 'end'

interface NetState {
  phase: Phase
  round: number
  /** Rounds won by us and by the opponent. */
  me: number
  opp: number
  left: number
  countdown: number
  opponent: Opponent | null
  role: Role
  /** The creator's side for round 1; null until we know it. */
  base: Role | null
  host: boolean
  room: Room | null
  /** Round we pressed ready for. */
  ready: number
  /** Last round whose result we counted. */
  done: number
  code: string
}

const NET0: NetState = {
  phase: 'menu', round: 1, me: 0, opp: 0, left: DUEL_TIME, countdown: DUEL_COUNTDOWN, opponent: null,
  role: 'turtle', base: null, host: false, room: null, ready: 0, done: 0, code: '',
}

export const net: NetState = { ...NET0 }
const resetNet = (patch: Partial<NetState> = {}) => Object.assign(net, NET0, patch)

export interface DuelHooks {
  start: (mode: Mode) => void
  /** Ends the running game: marks it over, stops the loop, redraws once. */
  halt: () => void
  /** Called after leaving the duel menu, to switch back to solo. */
  leave: () => void
}

let hooks: DuelHooks

const role = () => roleFor(net.round, net.base as Role)
const peerOf = () => net.room?.peers().find(p => !p.isMe)

type PanelState = 'menu' | 'wait' | 'ready' | 'next'

function showDuel(st: PanelState) {
  showOverlay()
  ui.soloRow.hidden = true
  ui.duelPanel.hidden = false
  ui.createRow.hidden = ui.joinRow.hidden = st !== 'menu'
  ui.ready.hidden = !(st === 'ready' || st === 'next')
  ui.ready.disabled = false
  ui.ready.textContent = st === 'next' ? 'Next round (sides swap)' : "I'm ready"
}

function openDuelMenu() {
  ui.title.textContent = 'Duel a friend'
  ui.message.innerHTML = '<b>How duels work</b><br>1. One player creates a room as turtle or shark and sends the 4-letter code.<br>2. The other player opens this page, presses Duel a friend, types the code and joins. They get the other side.<br>3. Both press I\'m ready. After a 3-second countdown the round starts.<br>The shark wins by catching the turtle. The turtle wins by surviving 50 seconds. Sides swap every round.<br>Drag or use arrow keys to move, Q to dash. Your friend must open this page signed in to claude.ai.'
  ui.duelStatus.textContent = ''
  showDuel('menu')
}

/** Returns to the main menu. */
function leaveDuel() {
  net.room?.leave()
  resetNet()
  ui.duelPanel.hidden = true
  ui.soloRow.hidden = false
  ui.title.textContent = 'Shark Chase'
  ui.message.textContent = MENU_TEXT
}

const makeCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('')

async function joinDuel(code: string, base: Role | null) {
  ui.duelStatus.textContent = 'Connecting...'
  let room: Room | null = null
  try {
    room = await joinClaudeRoom('duel-' + code.toLowerCase())
  } catch {}
  if (!room) {
    ui.duelStatus.textContent = 'Duels are not available here. You and your friend both need to open this page signed in to claude.ai.'
    return
  }
  resetNet({ room, code, base, host: !!base, phase: 'wait' })
  room.presence({ base: base || null })
  room.onPeers(onPeers)
  showDuel('wait')
  ui.duelStatus.textContent = base ? 'Room ' + code + '. Send this code to your friend and keep this page open.' : 'Looking for room ' + code + '. Check the code if nothing happens.'
}

function onPeers() {
  const op = peerOf()
  if (!op) return
  const pr = op.presence
  if (!net.base && pr.base) net.base = flip(pr.base)
  if (!net.base) return
  if (net.phase === 'wait') {
    net.phase = 'ready'
    net.role = role()
    ui.duelStatus.textContent = 'Friend joined. Round 1: you are the ' + net.role + '.'
    showDuel('ready')
  }
  if (net.phase === 'play') {
    if (net.opponent && typeof pr.x === 'number') {
      net.opponent.tx = pr.x
      net.opponent.ty = pr.y as number
      net.opponent.targetAngle = pr.a as number
      net.opponent.dashing = !!pr.dd
    }
    if (pr.res && pr.res.r === net.round) finish(pr.res.w, false)
  }
  checkStart(pr)
}

function checkStart(pr: Presence) {
  if (net.phase === 'ready' && net.ready === net.round && pr.rd === net.round) beginRound()
}

function onReady() {
  if (net.phase === 'end') {
    net.round++
    net.phase = 'ready'
  }
  net.role = role()
  net.ready = net.round
  net.room!.presence({ rd: net.round, res: null })
  ui.ready.disabled = true
  ui.duelStatus.textContent = 'Round ' + net.round + ': you are the ' + net.role + '. Waiting for your friend...'
  const op = peerOf()
  if (op) checkStart(op.presence)
}

function beginRound() {
  net.role = role()
  net.left = DUEL_TIME
  net.countdown = DUEL_COUNTDOWN
  net.phase = 'count'
  net.opponent = createOpponent(net.role)
  const p = duelSpawn(net.role)
  net.room!.presence({ x: p.x, y: p.y, a: p.angle, dd: 0, role: net.role })
  hooks.start('duel')
}

/** True while the pre-round countdown runs; the player can't move or dash yet. */
export const duelFrozen = () => net.phase !== 'play'

export function stepCountdown(dt: number) {
  if (net.phase === 'count') {
    net.countdown -= dt
    if (net.countdown <= 0) net.phase = 'play'
  }
}

/** Duel play, after the player has moved: smooth the opponent, share our position, check the outcome. */
export function stepDuel(s: GameState, dt: number) {
  net.left -= dt
  const o = net.opponent
  if (o) stepOpponent(o, dt)
  net.room!.presence({ x: Math.round(s.x), y: Math.round(s.y), a: +s.angle.toFixed(2), dd: s.dashTime > 0 ? 1 : 0 })
  const w = duelWinner(s, o, net.role, net.left)
  if (w) finish(w, true)
}

/** Ends the round once. `announce` shares the result when this client detected it. */
function finish(w: Role, announce: boolean) {
  if (net.done === net.round) return
  net.done = net.round
  if (announce) net.room!.presence({ res: { r: net.round, w } })
  if (w === net.role) net.me++
  else net.opp++
  net.phase = 'end'
  hooks.halt()
  ui.title.textContent = w === net.role ? 'You win this round' : 'You lose this round'
  ui.message.textContent = (w === 'shark' ? 'The shark caught the turtle. ' : 'The turtle survived. ') + 'Score: you ' + net.me + ', friend ' + net.opp + '.'
  ui.duelStatus.textContent = ''
  showDuel('next')
}

export const duelScene = (): DuelScene => ({
  role: net.role,
  opponent: net.opponent,
  left: net.left,
  me: net.me,
  opp: net.opp,
  countdown: net.phase === 'count' ? net.countdown : null,
})

export function initDuel(h: DuelHooks) {
  hooks = h
  // Hidden where duels can't connect (e.g. GitHub Pages) until the Cloudflare rooms land.
  ui.duel.hidden = !claudeRoomsAvailable()
  ui.duel.onclick = openDuelMenu
  ui.createTurtle.onclick = () => joinDuel(makeCode(), 'turtle')
  ui.createShark.onclick = () => joinDuel(makeCode(), 'shark')
  ui.join.onclick = () => {
    const c = ui.codeInput.value.trim().toUpperCase()
    if (!/^[A-Z]{4}$/.test(c)) {
      ui.duelStatus.textContent = 'Enter the 4 letter code.'
      return
    }
    joinDuel(c, null)
  }
  ui.back.onclick = () => {
    leaveDuel()
    hooks.leave()
  }
  ui.ready.onclick = onReady
}
