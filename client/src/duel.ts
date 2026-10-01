import { DUEL_COUNTDOWN, DUEL_TIME, duelSpawn, type GameState, type Mode, type Role } from './state'
import { createOpponent, duelWinner, flip, roleFor, stepOpponent, type Opponent } from './sim/duel'
import { joinRoom, roomsAvailable, RoomJoinError, type JoinFailure } from './net/cfRoom'
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
  /** When our socket dropped, or null while connected. */
  offlineSince: number | null
  /** When the opponent disappeared without saying goodbye, or null. */
  missingSince: number | null
}

const NET0: NetState = {
  phase: 'menu', round: 1, me: 0, opp: 0, left: DUEL_TIME, countdown: DUEL_COUNTDOWN, opponent: null,
  role: 'turtle', base: null, host: false, room: null, ready: 0, done: 0, code: '', offlineSince: null, missingSince: null,
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
  ui.message.innerHTML = '<b>How duels work</b><br>1. One player creates a room as turtle or shark and sends the 4-letter code.<br>2. The other player opens this page, presses Duel a friend, types the code and joins. They get the other side.<br>3. Both press I\'m ready. After a 3-second countdown the round starts.<br>The shark wins by catching the turtle. The turtle wins by surviving 50 seconds. Sides swap every round.<br>Drag or use arrow keys to move, Q to dash.'
  ui.duelStatus.textContent = ''
  showDuel('menu')
}

/** Returns to the main menu. */
function leaveDuel() {
  attempt++
  clearInterval(watchdog)
  ui.duelNotice.hidden = true
  net.room?.leave()
  resetNet()
  ui.duelPanel.hidden = true
  ui.soloRow.hidden = false
  ui.title.textContent = 'Shark Chase'
  ui.message.textContent = MENU_TEXT
}

const makeCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('')

const JOIN_ERRORS: Record<JoinFailure, (code: string) => string> = {
  missing: code => 'There is no room ' + code + '. Check the code with your friend.',
  full: code => 'Room ' + code + ' already has two players.',
  taken: () => 'Could not find a free room code. Try again.',
  unavailable: () => 'Could not reach the duel server. Try again in a moment.',
}

/** Bumped on every connect and on leaving, so a stale connect can tell it was abandoned. */
let attempt = 0
const CREATE_TRIES = 5

/** Creates a room with a fresh code when `base` is set, otherwise joins room `code`. */
async function joinDuel(code: string | null, base: Role | null) {
  if (net.room) return
  const mine = ++attempt
  ui.duelStatus.textContent = 'Connecting...'
  let room: Room | null = null, c = ''
  for (let i = 0; !room && i < (base ? CREATE_TRIES : 1); i++) {
    c = code ?? makeCode()
    try {
      room = await joinRoom(c, !!base)
    } catch (e) {
      const reason = e instanceof RoomJoinError ? e.reason : 'unavailable'
      if (mine !== attempt) return
      if (reason === 'taken' && i < CREATE_TRIES - 1) continue
      ui.duelStatus.textContent = JOIN_ERRORS[reason](c)
      return
    }
  }
  if (!room) return
  if (mine !== attempt) return room.leave()
  resetNet({ room, code: c, base, host: !!base, phase: 'wait' })
  room.presence({ base: base || null })
  showDuel('wait')
  ui.duelStatus.textContent = base ? 'Room ' + c + '. Send this code to your friend and keep this page open.' : 'Joined room ' + c + '.'
  room.onPeers(onPeers)
  room.onStatus(st => {
    if (st === 'lost') endDuel('lost')
    else if (st === 'reconnecting') net.offlineSince ??= performance.now()
    else net.offlineSince = null
  })
  room.onPeerLeft(() => {
    if (net.phase !== 'wait') endDuel('left')
  })
  watchdog = setInterval(watch, 250)
}

/** How long a dropped connection, ours or theirs, gets to come back before the duel ends. */
export const DROP_GRACE_MS = 5000
let watchdog = 0

/** Ends the duel when either side has been gone too long, and keeps the drop notice current. */
function watch() {
  const now = performance.now()
  if (net.offlineSince !== null && now - net.offlineSince > DROP_GRACE_MS) return endDuel('lost')
  if (net.phase !== 'wait' && net.offlineSince === null) {
    if (peerOf()) net.missingSince = null
    else if (net.missingSince === null) net.missingSince = now
    else if (now - net.missingSince > DROP_GRACE_MS) return endDuel('left')
  }
  const n = notice()
  ui.duelNotice.hidden = !n
  ui.duelNotice.textContent = n ?? ''
}

const notice = () =>
  net.offlineSince !== null ? 'Connection dropped. Reconnecting...' : net.missingSince !== null ? 'Your friend dropped. Waiting for them...' : null

/** Ends the whole duel and returns to the main menu. A friend leaving mid-round forfeits it. */
function endDuel(reason: 'left' | 'lost') {
  if (!net.room) return
  const inRound = net.phase === 'count' || net.phase === 'play'
  if (inRound) {
    if (reason === 'left') net.me++
    hooks.halt()
  }
  const score = net.me + net.opp ? ' Final score: you ' + net.me + ', friend ' + net.opp + '.' : ''
  const why = reason === 'left'
    ? inRound ? 'Your friend left mid-round, so you win it.' : 'Your friend left the duel.'
    : inRound ? 'Your connection dropped and did not come back in time.' : 'Your connection to the duel dropped.'
  leaveDuel()
  hooks.leave()
  ui.title.textContent = reason === 'left' ? 'Your friend left' : 'Connection lost'
  ui.message.textContent = why + score
  showOverlay()
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
  notice: notice(),
  role: net.role,
  opponent: net.opponent,
  left: net.left,
  me: net.me,
  opp: net.opp,
  countdown: net.phase === 'count' ? net.countdown : null,
})

export function initDuel(h: DuelHooks) {
  hooks = h
  // Hidden when the build has no room server configured.
  ui.duel.hidden = !roomsAvailable()
  ui.duel.onclick = openDuelMenu
  ui.createTurtle.onclick = () => joinDuel(null, 'turtle')
  ui.createShark.onclick = () => joinDuel(null, 'shark')
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
