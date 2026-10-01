import { DurableObject } from 'cloudflare:workers'
import { validPatch } from './presence'

/** Kept on each socket with serializeAttachment, so it survives hibernation. Nothing goes to storage. */
interface Player {
  id: string
  presence: Record<string, unknown>
  /** Ids of the two players once both have joined. Only they can (re)join after that. */
  seats: string[]
}

/** Close codes the client maps to an error message. */
export const CLOSE_TAKEN = 4009
export const CLOSE_MISSING = 4004
export const CLOSE_FULL = 4003
export const CLOSE_BAD_REQUEST = 4000
/** Sent to an old socket when the same player reconnects. */
export const CLOSE_REPLACED = 4001
export const CLOSE_TOO_BIG = 1009
export const CLOSE_POLICY = 1008

const MAX_PLAYERS = 2
/** Hibernation tags: players, and sockets accepted only to be closed with a refusal code. */
const PLAYER = 'player', REFUSED = 'refused'
export const MAX_MESSAGE_BYTES = 512
/** Token bucket per socket. The client sends ~20 position updates a second plus the odd event. */
export const RATE_PER_SECOND = 30
export const RATE_BURST = 60

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Codes a browser sends when the player meant to go (Back button, closing the tab). */
const isDeliberate = (code: number) => code === 1000 || code === 1001

/**
 * One duel room: up to two players sharing presence.
 * A room exists while someone is connected, so "create" needs it empty and "join" needs it occupied.
 * A player who drops can reconnect with the same id and takes their seat back.
 *
 * Client → server: `{presence: patch}`, merged into the sender's presence.
 * Server → client: `{you: id}` once per connection, then `{peers: [{id, presence}], left?: id}`
 * whenever anything changes. `left` names a player who left on purpose rather than dropped.
 */
export class DuelRoom extends DurableObject<Env> {
  /** Rate-limit buckets. In memory only, so they reset if the room hibernates, which is fine. */
  private buckets = new Map<WebSocket, { tokens: number; at: number }>()

  async fetch(req: Request): Promise<Response> {
    const q = new URL(req.url).searchParams
    const id = q.get('id') ?? '', create = q.get('create') === '1'
    const sockets = this.ctx.getWebSockets(PLAYER)
    const players = sockets.map(w => w.deserializeAttachment() as Player)
    const others = sockets.filter((_, i) => players[i].id !== id)
    const seats = [...new Set(players.flatMap(p => p.seats))]
    const refuse = !ID.test(id) ? CLOSE_BAD_REQUEST
      : others.length >= MAX_PLAYERS || (seats.length >= MAX_PLAYERS && !seats.includes(id)) ? CLOSE_FULL
      : create && sockets.length ? CLOSE_TAKEN
      : !create && !sockets.length ? CLOSE_MISSING
      : 0
    const [client, server] = Object.values(new WebSocketPair())
    if (refuse) {
      // Accepted only to deliver the close code. Going through acceptWebSocket (tagged, so it never counts as a player)
      // lets the runtime finish the close handshake; a plain accept() logs "Network connection lost" when it does.
      this.ctx.acceptWebSocket(server, [REFUSED])
      server.close(refuse, refuse === CLOSE_FULL ? 'room full' : refuse === CLOSE_TAKEN ? 'code taken' : refuse === CLOSE_MISSING ? 'no such room' : 'bad request')
      return new Response(null, { status: 101, webSocket: client })
    }
    for (const w of sockets) if (!others.includes(w)) w.close(CLOSE_REPLACED, 'reconnected elsewhere')
    this.ctx.acceptWebSocket(server, [PLAYER])
    const me: Player = { id, presence: {}, seats: [] }
    server.serializeAttachment(me)
    if (others.length) {
      const both = [...new Set([...seats, id, ...others.map(w => (w.deserializeAttachment() as Player).id)])]
      for (const w of [...others, server]) {
        const p = w.deserializeAttachment() as Player
        p.seats = both
        w.serializeAttachment(p)
      }
    }
    server.send(JSON.stringify({ you: id }))
    this.broadcast(others.concat(server))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (this.refused(ws) || !this.allow(ws)) return
    const size = typeof msg === 'string' ? msg.length : msg.byteLength
    if (size > MAX_MESSAGE_BYTES) return ws.close(CLOSE_TOO_BIG, 'message too big')
    if (typeof msg !== 'string') return
    let data: unknown
    try {
      data = JSON.parse(msg)
    } catch {
      return
    }
    const patch = (data as { presence?: unknown })?.presence
    if (!validPatch(patch)) return
    const p = ws.deserializeAttachment() as Player
    Object.assign(p.presence, patch)
    ws.serializeAttachment(p)
    // The sender already knows its own presence.
    this.broadcast(this.live(), undefined, ws)
  }

  async webSocketClose(ws: WebSocket, code: number) {
    this.buckets.delete(ws)
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code)
    } catch {}
    if (this.refused(ws)) return
    const p = ws.deserializeAttachment() as Player
    // A replaced socket's player is still here on the new socket.
    if (code === CLOSE_REPLACED) return
    this.broadcast(this.live().filter(w => w !== ws), isDeliberate(code) ? p.id : undefined)
  }

  async webSocketError(ws: WebSocket) {
    this.buckets.delete(ws)
    if (this.refused(ws)) return
    this.broadcast(this.live().filter(w => w !== ws))
  }

  private refused(ws: WebSocket) {
    return this.ctx.getTags(ws).includes(REFUSED)
  }

  private live() {
    return this.ctx.getWebSockets(PLAYER).filter(w => w.readyState === WebSocket.OPEN)
  }

  /** Takes a token from the socket's bucket. Drops when empty, and closes a socket that keeps flooding. */
  private allow(ws: WebSocket) {
    const now = Date.now()
    const b = this.buckets.get(ws) ?? { tokens: RATE_BURST, at: now }
    b.tokens = Math.min(RATE_BURST, b.tokens + ((now - b.at) / 1000) * RATE_PER_SECOND) - 1
    b.at = now
    this.buckets.set(ws, b)
    if (b.tokens < -RATE_BURST) ws.close(CLOSE_POLICY, 'too many messages')
    return b.tokens >= 0
  }

  /** Sends the peer list of `sockets` to each of them except `skip`. */
  private broadcast(sockets: WebSocket[], left?: string, skip?: WebSocket) {
    const peers = sockets.map(w => {
      const { id, presence } = w.deserializeAttachment() as Player
      return { id, presence }
    })
    const msg = JSON.stringify(left ? { peers, left } : { peers })
    for (const w of sockets) {
      if (w === skip) continue
      try {
        w.send(msg)
      } catch {}
    }
  }
}
