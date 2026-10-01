# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Shark Chase: Turtle Escape is a canvas browser game. The game lives in `client/` as a Vite + TypeScript app. The repo root is an npm workspace, and `docs/PLAN.md` is the upgrade plan, organized in phases.

`Shark Chase_ Turtle Escape.html` is the original single-file prototype. It's kept as the behavioral reference, so leave it alone: the port should play exactly like it.

## Commands

From the repo root:
- `npm install`
- `npm run dev`: Vite dev server
- `npm test`: Vitest (sim logic only, runs in node)
- `npm run build`: typecheck, then build to `client/dist`
- `npm run typecheck`

To pass Vite flags like `--port`, run `npx vite ...` inside `client/`. The root script doesn't forward them.

## Architecture

`mode` (`'turtle' | 'shark' | 'duel'`) in `main.ts` decides everything else.

- **`src/state.ts`:** types, tuning constants, upgrade tables (`TURTLE_UPGRADES`, `SHARK_UPGRADES`, none for duel), `createState(mode, rng, role)`, and the spawn helpers.
- **`src/sim/`:** pure game logic with no DOM access. Every function that needs randomness takes an `Rng`. The game passes `Math.random`, and tests pass `mulberry32(seed)`.
  - `player.ts`: movement, dash, bubbles (shared by all modes)
  - `turtle.ts`: solo turtle mode (shark AI, lunges, shields, pearls)
  - `shark.ts`: solo shark mode (fleeing turtles, countdown)
  - `duel.ts`: `roleFor`, opponent smoothing, `duelWinner`
  - Step functions return flags (`caught`, `timeUp`, `shopChanged`). `main.ts` reacts to them, so the sim never touches the UI.
- **`src/main.ts`:** lifecycle. `start(m)` → `reset()` → `loop` (rAF, `dt` capped at 0.05) → `update(dt)` then `draw()`. `over()` ends solo games and keeps best scores in localStorage (`chase-best` / `shark-best`). `halt()` stops the loop on the final frame.
- **`src/render.ts`:** `draw(g, scene)` paints the world in world coords, then the HUD in screen coords. `view` holds the viewport, zoom, dpr and camera. Canvas colors are hardcoded here.
- **`src/input.ts`:** keyboard and pointer. `moveIntent(s, view)` turns them into a unit direction. Keys override the pointer.
- **`src/shop.ts`:** `tryBuy` (pure) and `renderShop`. Re-render whenever coins or upgrade levels change.
- **`src/duel.ts`:** duel round flow and its UI (`net` state, `onPeers`, `beginRound`, `finish`). Roles alternate each round. Each client reports the result it sees, and `net.done` makes sure a round is only counted once.
- **`src/net/room.ts`:** the `Room` interface (shared presence). `claudeRoom.ts` implements it on the claude.ai Artifact runtime (`window.claude.use('room')`). Phase 3 of the plan replaces it with a Cloudflare client behind the same interface. Presence field names (`base`, `rd`, `res`, `x/y/a/dd`) are the wire format.
- **`src/ui.ts`:** DOM element lookups and overlay helpers. The markup and CSS live in `client/index.html`.

## Conventions

- Readable names and normal formatting. The prototype was hand-minified; the port isn't. The dense one-line canvas calls in `render.ts` are the one exception, since splitting them hurts readability more than it helps.
- Keep gameplay numbers the same as the prototype unless a change is asked for. Tunables live as named constants in `state.ts` and the `sim/` files.
- New sim logic stays pure and gets a test in `client/test/`.

## Theming

Colors are CSS tokens on `:root` in `index.html`, with dark-mode overrides keyed on `prefers-color-scheme` and `data-theme`.
