import type { Peer, Presence, Room } from './room'

export type JoinFailure = 'taken' | 'missing' | 'full' | 'unavailable'

export class RoomJoinError extends Error {
  constructor(readonly reason: JoinFailure) {
    super(reason)
  }
}

/** Close codes from the DuelRoom Durable Object. */
const CLOSE_REASONS: Record<number, JoinFailure> = { 4009: 'taken', 4004: 'missing', 4003: 'full' }

const ROOM_URL = import.meta.env.VITE_ROOM_URL

/** Duels need a room server, configured at build time. */
export const roomsAvailable = () => !!ROOM_URL

/** Position updates go out at most this often; everything else is sent at once. */
const SEND_INTERVAL_MS = 50
const POSITION_KEYS = new Set(['x', 'y', 'a', 'dd'])

/** Connects to room `code` on the Worker. `create` fails if the code is in use, joining fails if it isn't. */
export function joinRoom(code: string, create: boolean): Promise<Room> {
  return new Promise((resolve, reject) => {
    const url = new URL('room/' + code, ROOM_URL!.replace(/^http/, 'ws').replace(/\/?$/, '/'))
    if (create) url.searchParams.set('create', '1')
    const ws = new WebSocket(url)
    let myId = ''
    const mine: Presence = {}
    let others: Peer[] = []
    let listener: (() => void) | null = null
    let pending: Presence | null = null, lastSent = 0, timer = 0

    const flush = () => {
      clearTimeout(timer)
      timer = 0
      if (pending && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ presence: pending }))
      pending = null
      lastSent = performance.now()
    }

    const room: Room = {
      presence(patch) {
        Object.assign(mine, patch)
        pending = { ...pending, ...patch }
        const wait = SEND_INTERVAL_MS - (performance.now() - lastSent)
        if (wait <= 0 || Object.keys(patch).some(k => !POSITION_KEYS.has(k))) flush()
        else if (!timer) timer = setTimeout(flush, wait)
      },
      onPeers(cb) {
        listener = cb
        if (others.length) cb()
      },
      peers: () => [{ isMe: true, presence: mine }, ...others],
      leave() {
        clearTimeout(timer)
        ws.close(1000)
      },
    }

    ws.onmessage = e => {
      let m: { you?: string; peers?: { id: string; presence: Presence }[] }
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      if (m.you) {
        myId = m.you
        resolve(room)
      } else if (m.peers) {
        others = m.peers.filter(p => p.id !== myId).map(p => ({ isMe: false, presence: p.presence }))
        listener?.()
      }
    }
    ws.onclose = e => {
      clearTimeout(timer)
      if (!myId) reject(new RoomJoinError(CLOSE_REASONS[e.code] ?? 'unavailable'))
    }
  })
}
