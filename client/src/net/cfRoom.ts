import type { Peer, Presence, Room, RoomStatus } from './room'

export type JoinFailure = 'taken' | 'missing' | 'full' | 'unavailable'

export class RoomJoinError extends Error {
  constructor(readonly reason: JoinFailure) {
    super(reason)
  }
}

/** Close codes from the DuelRoom Durable Object. */
const CLOSE_REASONS: Record<number, JoinFailure> = { 4009: 'taken', 4004: 'missing', 4003: 'full' }
/** Closes after which reconnecting can't help: refused, replaced by a newer connection, or kicked for abuse. */
const FINAL_CLOSES = new Set([4000, 4001, 4003, 4004, 4009, 1008, 1009])

const ROOM_URL = import.meta.env.VITE_ROOM_URL

/** Duels need a room server, configured at build time. */
export const roomsAvailable = () => !!ROOM_URL

/** Position updates go out at most this often; everything else is sent at once. */
const SEND_INTERVAL_MS = 50
const POSITION_KEYS = new Set(['x', 'y', 'a', 'dd'])
/** Reconnect backoff: 250ms doubling up to 2s, until the duel gives up or we leave. */
export const retryDelay = (attempt: number) => Math.min(2000, 250 * 2 ** attempt)

/**
 * Connects to room `code` on the Worker. `create` fails if the code is in use, joining fails if it isn't.
 * After that, a dropped socket reconnects on its own with the same player id and resends our presence.
 */
export function joinRoom(code: string, create: boolean): Promise<Room> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const base = ROOM_URL!.replace(/^http/, 'ws').replace(/\/?$/, '/')
    const mine: Presence = {}
    let ws: WebSocket
    let joined = false, left = false, retries = 0, retryTimer = 0
    let others: Peer[] = []
    let onPeers: (() => void) | null = null, onStatus: ((s: RoomStatus) => void) | null = null, onPeerLeft: (() => void) | null = null
    let pending: Presence | null = null, lastSent = 0, sendTimer = 0

    const flush = () => {
      clearTimeout(sendTimer)
      sendTimer = 0
      if (!pending || ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ presence: pending }))
      pending = null
      lastSent = performance.now()
    }

    const room: Room = {
      presence(patch) {
        Object.assign(mine, patch)
        pending = { ...pending, ...patch }
        const wait = SEND_INTERVAL_MS - (performance.now() - lastSent)
        if (wait <= 0 || Object.keys(patch).some(k => !POSITION_KEYS.has(k))) flush()
        else if (!sendTimer) sendTimer = setTimeout(flush, wait)
      },
      onPeers(cb) {
        onPeers = cb
        if (others.length) cb()
      },
      peers: () => [{ isMe: true, presence: mine }, ...others],
      onStatus: cb => (onStatus = cb),
      onPeerLeft: cb => (onPeerLeft = cb),
      leave() {
        left = true
        clearTimeout(sendTimer)
        clearTimeout(retryTimer)
        ws.close(1000)
      },
    }

    const connect = () => {
      const url = new URL('room/' + code, base)
      url.searchParams.set('id', id)
      if (create && !joined) url.searchParams.set('create', '1')
      ws = new WebSocket(url)
      ws.onmessage = e => {
        let m: { you?: string; peers?: { id: string; presence: Presence }[]; left?: string }
        try {
          m = JSON.parse(e.data)
        } catch {
          return
        }
        if (m.you) {
          retries = 0
          if (!joined) {
            joined = true
            return resolve(room)
          }
          // Back after a drop: the server forgot our presence with the old socket.
          pending = { ...mine }
          flush()
          onStatus?.('connected')
        } else if (m.peers) {
          others = m.peers.filter(p => p.id !== id).map(p => ({ isMe: false, presence: p.presence }))
          onPeers?.()
          if (m.left && m.left !== id) onPeerLeft?.()
        }
      }
      ws.onclose = e => {
        clearTimeout(sendTimer)
        sendTimer = 0
        if (left) return
        if (!joined) return reject(new RoomJoinError(CLOSE_REASONS[e.code] ?? 'unavailable'))
        if (FINAL_CLOSES.has(e.code)) return onStatus?.('lost')
        onStatus?.('reconnecting')
        retryTimer = setTimeout(connect, retryDelay(retries++))
      }
    }
    connect()
  })
}
