import { defineConfig } from '@playwright/test'

// Optional smoke test, not run in CI: `npm run e2e`. Starts wrangler dev and Vite unless they're already running.
// Uses Playwright's Chromium (`npx playwright install chromium`), or set PW_CHANNEL=chrome to use an installed Chrome.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173/shark-chase/',
    viewport: { width: 800, height: 600 },
    channel: process.env.PW_CHANNEL,
  },
  webServer: [
    { command: 'npm run dev -w server', port: 8787, cwd: '..', reuseExistingServer: true, timeout: 120_000 },
    { command: 'npm run dev -w client', url: 'http://localhost:5173/shark-chase/', cwd: '..', reuseExistingServer: true, timeout: 120_000 },
  ],
})
