import { exports } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { validPatch } from '../src/presence'
import { CLOSE_FULL, CLOSE_MISSING, CLOSE_POLICY, CLOSE_REPLACED, CLOSE_TAKEN, CLOSE_TOO_BIG, MAX_MESSAGE_BYTES, RATE_BURST } from '../src/room'

type Msg = { you?: string; peers?: { id: string; presence: Record<string, unknown> }[]; left?: string }

interface Client {
  id: string
  ws: WebSocket
  msgs: Msg[]
  closed: number | null
  last: () => Msg
}

const ORIGIN = 'http://localhost:5173'
let n = 0
/** A fresh room code per test, so rooms never leak between tests. */
const code = () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(n / 23) % 23] + 'ABCDEFGHJKMNPQRSTUVWXYZ'[n++ % 23] + 'QQ'

const request = (path: string, headers: Record<string, string> = { Upgrade: 'websocket', Origin: ORIGIN }) =>
  exports.default.fetch(new Request('https://rooms.test' + path, { headers }))

async function connect(room: string, opts: { create?: boolean; id?: string } = {}): Promise<Client> {
  const id = opts.id ?? crypto.randomUUID()
  const res = await request(`/room/${room}?id=${id}${opts.create ? '&create=1' : ''}`)
  const ws = res.webSocket!
  const c: Client = { id, ws, msgs: [], closed: null, last: () => c.msgs[c.msgs.length - 1] }
  ws.addEventListener('message', e => {
    c.msgs.push(JSON.parse(e.data as string))
  })
  ws.addEventListener('close', e => {
    c.closed = e.code
  })
  ws.accept()
  await vi.waitFor(() => expect(c.msgs.length || c.closed).toBeTruthy())
  return c
}

const send = (c: Client, presence: unknown) => c.ws.send(JSON.stringify({ presence }))
const ids = (m: Msg) => m.peers!.map(p => p.id).sort()
const settle = () => new Promise(r => setTimeout(r, 30))

describe('Worker routing', () => {
  it('rejects unknown paths, plain requests and foreign origins', async () => {
    expect((await request('/nope')).status).toBe(404)
    expect((await request('/room/abcd')).status).toBe(404)
    expect((await request('/room/ABCD', { Origin: ORIGIN })).status).toBe(426)
    expect((await request('/room/ABCD', { Upgrade: 'websocket', Origin: 'https://evil.example' })).status).toBe(403)
    expect((await request('/room/ABCD', { Upgrade: 'websocket' })).status).toBe(403)
  })

  it('allows the Pages origin and any localhost port', async () => {
    for (const Origin of ['https://shell-less.github.io', 'http://localhost:4173', 'http://127.0.0.1:5173'])
      expect((await request(`/room/${code()}?id=${crypto.randomUUID()}&create=1`, { Upgrade: 'websocket', Origin })).status).toBe(101)
  })
})

describe('create and join', () => {
  it('joining a room nobody created fails', async () => {
    expect((await connect(code())).closed).toBe(CLOSE_MISSING)
  })

  it('creating a code in use fails', async () => {
    const r = code()
    await connect(r, { create: true })
    expect((await connect(r, { create: true })).closed).toBe(CLOSE_TAKEN)
  })

  it('a missing or malformed player id is refused', async () => {
    const res = await request(`/room/${code()}?create=1&id=nope`)
    const ws = res.webSocket!
    let closed = 0
    ws.addEventListener('close', e => {
      closed = e.code
    })
    ws.accept()
    await vi.waitFor(() => expect(closed).toBe(4000))
  })

  it('two players see each other and a third is turned away', async () => {
    const r = code()
    const a = await connect(r, { create: true })
    expect(a.msgs[0]).toEqual({ you: a.id })
    const b = await connect(r)
    await vi.waitFor(() => expect(ids(a.last())).toEqual([a.id, b.id].sort()))
    expect(ids(b.last())).toEqual([a.id, b.id].sort())
    expect((await connect(r)).closed).toBe(CLOSE_FULL)
  })
})

describe('presence', () => {
  it('relays a patch to the other player without echoing it', async () => {
    const r = code()
    const a = await connect(r, { create: true }), b = await connect(r)
    await settle()
    const before = a.msgs.length
    send(a, { base: 'turtle', x: 10, y: 20, a: 1.5, dd: 0 })
    send(a, { rd: 1, res: null })
    await vi.waitFor(() => expect(b.last().peers!.find(p => p.id === a.id)!.presence).toEqual({ base: 'turtle', x: 10, y: 20, a: 1.5, dd: 0, rd: 1, res: null }))
    expect(a.msgs.length).toBe(before)
  })

  it('drops malformed patches whole', async () => {
    const r = code()
    const a = await connect(r, { create: true }), b = await connect(r)
    await settle()
    const before = b.msgs.length
    a.ws.send('not json')
    a.ws.send(JSON.stringify({ hello: 1 }))
    send(a, [1, 2])
    send(a, { x: 1, evil: true })
    send(a, { x: 'far' })
    send(a, { res: { r: 1, w: 'dolphin' } })
    await settle()
    expect(b.msgs.length).toBe(before)
    expect(a.closed).toBeNull()
  })
})

describe('leaving and reconnecting', () => {
  it('a deliberate close is announced as left', async () => {
    const r = code()
    const a = await connect(r, { create: true }), b = await connect(r)
    await settle()
    b.ws.close(1000)
    await vi.waitFor(() => expect(a.last()).toEqual({ peers: [{ id: a.id, presence: {} }], left: b.id }))
  })

  it('a dropped player can take their seat back, a stranger cannot', async () => {
    const r = code()
    const a = await connect(r, { create: true }), b = await connect(r)
    send(b, { role: 'shark' })
    await settle()
    b.ws.close(4100) // anything but 1000/1001 counts as a drop
    await vi.waitFor(() => expect(ids(a.last())).toEqual([a.id]))
    expect(a.last().left).toBeUndefined()
    expect((await connect(r)).closed).toBe(CLOSE_FULL)
    const back = await connect(r, { id: b.id })
    expect(back.msgs[0]).toEqual({ you: b.id })
    await vi.waitFor(() => expect(ids(a.last())).toEqual([a.id, b.id].sort()))
  })

  it('reconnecting while the old socket is still open replaces it', async () => {
    const r = code()
    const a = await connect(r, { create: true }), b = await connect(r)
    const again = await connect(r, { id: b.id })
    expect(again.closed).toBeNull()
    await vi.waitFor(() => expect(b.closed).toBe(CLOSE_REPLACED))
    await vi.waitFor(() => expect(ids(a.last())).toEqual([a.id, b.id].sort()))
  })
})

describe('abuse limits', () => {
  it('closes on an oversized message', async () => {
    const a = await connect(code(), { create: true })
    a.ws.send(JSON.stringify({ presence: { x: 1 }, pad: 'x'.repeat(MAX_MESSAGE_BYTES) }))
    await vi.waitFor(() => expect(a.closed).toBe(CLOSE_TOO_BIG))
  })

  it('drops messages past the burst, then closes a flooding socket', async () => {
    const r = code()
    const a = await connect(r, { create: true }), b = await connect(r)
    await settle()
    const before = b.msgs.length
    for (let i = 0; i < RATE_BURST + 10; i++) send(a, { x: i })
    await vi.waitFor(() => expect(b.msgs.length - before).toBeGreaterThanOrEqual(RATE_BURST - 5))
    await settle()
    expect(b.msgs.length - before).toBeLessThan(RATE_BURST + 10)
    for (let i = 0; i < RATE_BURST * 2; i++) send(a, { x: i })
    await vi.waitFor(() => expect(a.closed).toBe(CLOSE_POLICY))
  })
})

describe('validPatch', () => {
  it('accepts every field the game sends', () => {
    for (const p of [{ base: 'turtle' }, { base: null }, { rd: 3, res: null }, { res: { r: 2, w: 'shark' } }, { x: 250, y: 380, a: -3.14, dd: 1, role: 'shark' }])
      expect(validPatch(p)).toBe(true)
  })

  it('rejects anything else', () => {
    for (const p of [null, 'x', [], {}, { z: 1 }, { x: NaN }, { x: 1e9 }, { dd: 2 }, { rd: -1 }, { rd: 1.5 }, { role: 'whale' }, { res: { r: 1 } }, { res: { r: 1, w: 'shark', extra: 1 } }])
      expect(validPatch(p)).toBe(false)
  })
})
