export { DuelRoom } from './room'

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

const originAllowed = (origin: string | null, env: Env) => !!origin && (origin === env.ALLOWED_ORIGIN || LOCALHOST.test(origin))

export default {
  async fetch(req, env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/room\/([A-Z]{4})$/)
    if (!m) return new Response('Not found', { status: 404 })
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
    if (!originAllowed(req.headers.get('Origin'), env)) return new Response('Forbidden', { status: 403 })
    return env.DUEL_ROOM.get(env.DUEL_ROOM.idFromName(m[1])).fetch(req)
  },
} satisfies ExportedHandler<Env>
