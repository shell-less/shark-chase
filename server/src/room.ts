import { DurableObject } from 'cloudflare:workers'

/** Kept on each socket with serializeAttachment, so it survives hibernation. Nothing goes to storage. */
interface Player {
  id: string
  presence: Record<string, unknown>
}

/** Close codes the client maps to an error message. */
export const CLOSE_TAKEN = 4009
export const CLOSE_MISSING = 4004
export const CLOSE_FULL = 4003

const MAX_PLAYERS = 2

/**
 * One duel room: up to two sockets sharing presence.
 * A room exists while someone is connected, so "create" needs it empty and "join" needs it occupied.
 *
 * Client → server: `{presence: patch}`, merged into the sender's presence.
 * Server → client: `{you: id}` once on connect, then `{peers: [{id, presence}]}` whenever anything changes.
 */
export class DuelRoom extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const create = new URL(req.url).searchParams.get('create') === '1'
    const open = this.ctx.getWebSockets().length
    const [client, server] = Object.values(new WebSocketPair())
    const refuse = open >= MAX_PLAYERS ? CLOSE_FULL : create && open ? CLOSE_TAKEN : !create && !open ? CLOSE_MISSING : 0
    if (refuse) {
      server.accept()
      server.close(refuse, refuse === CLOSE_FULL ? 'room full' : refuse === CLOSE_TAKEN ? 'code taken' : 'no such room')
      return new Response(null, { status: 101, webSocket: client })
    }
    const me: Player = { id: crypto.randomUUID(), presence: {} }
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(me)
    server.send(JSON.stringify({ you: me.id }))
    this.broadcast()
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (typeof msg !== 'string') return
    let data: unknown
    try {
      data = JSON.parse(msg)
    } catch {
      return
    }
    const patch = (data as { presence?: unknown })?.presence
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return
    const p = ws.deserializeAttachment() as Player
    Object.assign(p.presence, patch)
    ws.serializeAttachment(p)
    // The sender already knows its own presence.
    this.broadcast(undefined, ws)
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code)
    } catch {}
    this.broadcast(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast(ws)
  }

  /** Sends the peer list to everyone, leaving out a socket that's `gone` and not sending to `skip`. */
  private broadcast(gone?: WebSocket, skip?: WebSocket) {
    const sockets = this.ctx.getWebSockets().filter(w => w !== gone)
    const msg = JSON.stringify({ peers: sockets.map(w => w.deserializeAttachment() as Player) })
    for (const w of sockets) {
      if (w === skip) continue
      try {
        w.send(msg)
      } catch {}
    }
  }
}
