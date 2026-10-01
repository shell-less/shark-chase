# Upgrade plan

Goal: turn the single-file prototype (`Shark Chase_ Turtle Escape.html`) into a proper project, hosted on GitHub Pages, with duel multiplayer backed by Cloudflare Durable Objects. Gameplay, layout and mechanics stay unchanged.

## Key constraint

The game already goes through a small room API: `join`, `presence(patch)`, `onPeers(cb)`, `peers()`, `leave()`. A Cloudflare-backed class that offers this same interface lets the duel logic (`onP`, `beginRound`, `finish` and the rest) stay unchanged.

## Target structure

```
shark-chase/
├─ client/                 Vite + TypeScript, static build → GitHub Pages
│  ├─ index.html           markup + CSS moved from the current file
│  └─ src/
│     ├─ main.ts           bootstrapping, loop, overlay/menu wiring
│     ├─ state.ts          game state, reset(), constants (WW/WH, speeds, upgrade tables)
│     ├─ input.ts          keyboard + pointer → movement intent
│     ├─ sim/turtle.ts     solo turtle mode (shark AI, pearls, shield)
│     ├─ sim/shark.ts      solo shark mode (fleeing turtle AI, timer)
│     ├─ sim/duel.ts       duel round flow (today's onP/beginRound/finish)
│     ├─ render.ts         draw(), drawTurtle, drawShark, HUD
│     ├─ shop.ts           refresh()/buy()
│     └─ net/
│        ├─ room.ts        Room interface (the current presence API)
│        └─ cfRoom.ts      WebSocket client to the Worker
├─ server/                 Cloudflare Worker + Durable Object
│  ├─ src/index.ts         Worker: routes /room/:code → DO
│  ├─ src/room.ts          DuelRoom Durable Object
│  └─ wrangler.jsonc
└─ .github/workflows/      pages.yml, worker.yml
```

The two halves are npm workspaces with one root `package.json`.

## Phases

### 0. Repo hygiene
- [x] Add a `.gitignore` (`.DS_Store`, `.idea/`, `node_modules`, `dist`, `.wrangler`)
- [x] Commit the original HTML as-is so there's a baseline to compare against

### 1. Faithful port (no behavior changes)
- [x] Split the minified script into the modules above with readable names. Keep every constant, speed, cost and timing identical.
- [x] Leave the `window.claude` room path working for now (`net/claudeRoom.ts`), so duels can still be tested before the server exists.
- [ ] Done when every mode plays the same as the original side by side. Solo modes and the duel menu are smoke-tested in headless Chrome; a duel needs a manual test on claude.ai.
- [x] Pull the pure sim functions out so they can take a seeded RNG.
- [x] Add Vitest for the sim logic: collisions, upgrade costs, role swapping (`roleFor`).
- [x] Update `CLAUDE.md`, because the hand-minified style rule no longer applies.

Deviations from the target structure: the duel flow and its UI live in `src/duel.ts`, with only the pure parts in `sim/duel.ts`. Shared movement is in `sim/player.ts`, DOM lookups are in `ui.ts`, and `cfRoom.ts` waits for phase 3.

Found during the port:
- **Pearls never respawned** in the prototype. Its respawn pushed onto the array it was filtering, so each new pearl was discarded and a turtle game had only 4 pearls. Fixed in the port: every collected pearl is replaced. This is the one intended gameplay difference from the prototype.
- **Keys 1–4 in a duel** threw a TypeError in the prototype, because the duel upgrade table is empty. The port ignores them instead.

### 2. GitHub Pages
- [x] Set `base: '/shark-chase/'` in the Vite config.
- [x] The workflow (`.github/workflows/pages.yml`) tests, builds `client/` and publishes it with `actions/upload-pages-artifact` + `actions/deploy-pages` on every push to `main`.
- [x] Solo modes go live here. Duel stays hidden until phase 3: the button only shows when `window.claude` exists (`claudeRoomsAvailable`).
- [x] One-time repo setting: Settings → Pages → Source: **GitHub Actions**. Live at https://shell-less.github.io/shark-chase/

### 3. Durable Objects multiplayer
- [x] **Worker** (`server/src/index.ts`):
  - `GET /room/:code` upgrades to a WebSocket and forwards to `env.DUEL_ROOM.idFromName(code)`.
  - Checks `Origin` against the Pages domain (`ALLOWED_ORIGIN` in `wrangler.jsonc`) and `localhost`.
- [x] **DuelRoom DO** (`server/src/room.ts`):
  - Uses the WebSocket Hibernation API (`ctx.acceptWebSocket`, `webSocketMessage`, `webSocketClose`).
  - Keeps each connection's presence with `serializeAttachment`. It needs no storage.
  - Allows at most 2 players and rejects a third with "room full".
  - On each presence patch, it merges the patch and broadcasts `{peers:[{id, presence}]}` to the other player. Joins and leaves go to everyone. Each socket first gets `{you:id}`.
  - Configured with `new_sqlite_classes` in the migrations (works on the Workers Free plan).
  - Already drops non-JSON and non-object patches. Size and rate caps are still phase 4.
- [x] **Client `cfRoom.ts`:**
  - Implements the same `Room` interface over the WebSocket.
  - Sends position updates at about 20 Hz instead of every frame. Anything else (ready, results) goes out at once.
- [x] **Create vs. join:** refusals arrive as WebSocket close codes: 4009 code taken, 4004 no such room, 4003 room full.
  - Creating a room fails if the code is already in use. The client retries with a new code, up to 5 times.
  - Joining fails if the room doesn't exist.
- [x] **Config:**
  - The server URL comes from `VITE_ROOM_URL` at build time. On Pages it's the `ROOM_URL` repo variable, and Duel stays hidden while that's unset. Locally it's `client/.env.development`.
  - The worker deploys with `cloudflare/wrangler-action` (`.github/workflows/worker.yml`) using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets, on pushes that touch `server/`.
  - `npm run dev` runs `wrangler dev` and `vite` together.
- [x] Remove the claude.ai-specific code path and the "signed in to claude.ai" wording.
- [ ] First deploy: push, take the Worker URL from the deploy log, set it as the `ROOM_URL` repo variable, then re-run the Pages workflow. Play one duel on the live site.

### 4. Hardening
- **Opponent leaves mid-round:** today the game waits forever. Show a message and return to the menu.
- **Reconnects:** add backoff and retry. A dropped socket during a round counts as a forfeit after a few seconds.
- **Abuse limits:** cap message size and rate in the DO, and drop malformed patches.
- **Tests:** cover the DO with `@cloudflare/vitest-pool-workers`. Add an optional Playwright smoke test that plays a duel across two pages.

## Deliberately deferred

- **Server-side outcomes:** clients still decide results. The shark reports its own catch and the turtle reports its own survival, so a modified client could cheat. Next step: move catch detection and the timer into the DO.
- **Out of scope for now:** matchmaking, accounts, leaderboards, more than 2 players, visual or gameplay changes.

## Assumed decisions

- **TypeScript + Vite** for the client.
- **Default URLs:** GitHub Pages at `<user>.github.io/shark-chase` and the worker on `*.workers.dev`. A custom domain can be added later.
