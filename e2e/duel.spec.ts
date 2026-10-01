import { expect, test, type Browser, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test'

const overlayShown = (p: Page) => p.waitForFunction(() => document.getElementById('ov')!.style.display === 'flex', null, { timeout: 20_000 })
const overlayHidden = (p: Page) => p.waitForFunction(() => document.getElementById('ov')!.style.display === 'none')

async function open(browser: Browser, before?: (ctx: BrowserContext) => Promise<unknown>) {
  const ctx = await browser.newContext()
  await before?.(ctx)
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('.')
  return { page, errors }
}

/** A creates a room as turtle, B joins as shark, both press ready and the round starts. */
async function startDuel(a: Page, b: Page) {
  await a.click('#bd')
  await a.click('#dct')
  await expect(a.locator('#ds')).toHaveText(/^Room [A-Z]{4}\./)
  const code = (await a.locator('#ds').textContent())!.slice(5, 9)
  await b.click('#bd')
  await b.fill('#ci', code)
  await b.click('#dj')
  await expect(a.locator('#ds')).toHaveText('Friend joined. Round 1: you are the turtle.')
  await expect(b.locator('#ds')).toHaveText('Friend joined. Round 1: you are the shark.')
  await a.click('#dr')
  await b.click('#dr')
  await overlayHidden(a)
  await overlayHidden(b)
  await b.waitForTimeout(3300) // countdown
  return code
}

/**
 * Proxies the page's room socket so the test can cut it. `cut()` drops the current connection
 * the way a network failure would; with `block`, reconnects are refused too.
 */
function cuttable() {
  let current: { page: WebSocketRoute; server: WebSocketRoute } | null = null
  let blocked = false, connections = 0
  return {
    /** Pass to open() so the route is in place before the page loads. */
    install: (ctx: BrowserContext) =>
      ctx.routeWebSocket(/\/room\//, ws => {
        connections++
        if (blocked) return ws.close({ code: 1011 })
        current = { page: ws, server: ws.connectToServer() }
      }),
    connections: () => connections,
    async cut(block = false) {
      blocked = block
      await current!.server.close({ code: 4100 })
      await current!.page.close({ code: 1011 })
    },
  }
}

test('a full round: the shark catches the turtle and sides swap', async ({ browser }) => {
  const A = await open(browser), B = await open(browser)
  await startDuel(A.page, B.page)
  await B.page.keyboard.down('d')
  await overlayShown(A.page)
  await overlayShown(B.page)
  await B.page.keyboard.up('d')
  await expect(A.page.locator('#t')).toHaveText('You lose this round')
  await expect(B.page.locator('#t')).toHaveText('You win this round')
  await expect(B.page.locator('#m')).toHaveText('The shark caught the turtle. Score: you 1, friend 0.')
  await A.page.click('#dr')
  await B.page.click('#dr')
  await overlayHidden(A.page)
  expect([...A.errors, ...B.errors]).toEqual([])
})

test('a third player and a wrong code get clear messages', async ({ browser }) => {
  const A = await open(browser), B = await open(browser), C = await open(browser)
  await C.page.click('#bd')
  await C.page.fill('#ci', 'ZZZZ')
  await C.page.click('#dj')
  await expect(C.page.locator('#ds')).toHaveText('There is no room ZZZZ. Check the code with your friend.')
  const code = await startDuel(A.page, B.page)
  await C.page.fill('#ci', code)
  await C.page.click('#dj')
  await expect(C.page.locator('#ds')).toHaveText(`Room ${code} already has two players.`)
})

test('a friend leaving mid-round forfeits it', async ({ browser }) => {
  const A = await open(browser), B = await open(browser)
  await startDuel(A.page, B.page)
  await B.page.close()
  await overlayShown(A.page)
  await expect(A.page.locator('#t')).toHaveText('Your friend left')
  await expect(A.page.locator('#m')).toHaveText('Your friend left mid-round, so you win it. Final score: you 1, friend 0.')
  await expect(A.page.locator('#b')).toBeVisible()
})

test('a dropped socket reconnects and the round carries on', async ({ browser }) => {
  const net = cuttable()
  const A = await open(browser), B = await open(browser, net.install)
  await startDuel(A.page, B.page)
  await net.cut()
  await expect.poll(net.connections).toBe(2)
  await B.page.keyboard.down('d')
  await overlayShown(A.page)
  await overlayShown(B.page)
  await B.page.keyboard.up('d')
  await expect(A.page.locator('#t')).toHaveText('You lose this round')
  await expect(B.page.locator('#t')).toHaveText('You win this round')
  expect([...A.errors, ...B.errors]).toEqual([])
})

test('a socket that stays down ends the duel on both sides after the grace period', async ({ browser }) => {
  const net = cuttable()
  const A = await open(browser), B = await open(browser, net.install)
  await startDuel(A.page, B.page)
  const t0 = Date.now()
  await net.cut(true)
  await overlayShown(B.page)
  await overlayShown(A.page)
  expect(Date.now() - t0).toBeGreaterThan(4500)
  await expect(B.page.locator('#t')).toHaveText('Connection lost')
  await expect(A.page.locator('#t')).toHaveText('Your friend left')
  await expect(A.page.locator('#m')).toHaveText('Your friend left mid-round, so you win it. Final score: you 1, friend 0.')
})
