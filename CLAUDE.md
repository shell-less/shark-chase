# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Shark Chase: Turtle Escape is a browser game in one file, `Shark Chase_ Turtle Escape.html`. Its HTML, CSS and JS are all inline, and the canvas is drawn by hand. There's no build step, package manager, linter or test suite. To run it, open the file in a browser. The only external resource is the Fredoka font from Google Fonts.

The page was written to run as a claude.ai Artifact. Duel mode needs the Artifact runtime's `window.claude.use('room')` capability. Opened as a local file, solo modes work and Duel shows a "not available here" message.

## Code style

The JS is deliberately minified by hand: short identifiers, dense one-line statements, no comments. Match this style when editing. Don't reformat the file or split it into modules unless asked.

Key short names:
- `s`: current game state (player pos/angle `x,y,a`, time `t`, dash cooldown `dc` / duration `dd` / max cooldown `cdm`, `coins`, `got`, sharks `sh`, pearls `pr`, AI turtles `tu`, upgrade levels `up`, `grace`, `over`)
- `g`: the 2D canvas context; `cv` is the canvas
- `WW/WH`: world size (1800×1300 solo, 1000×760 duel); `VW/VH`: viewport; `Z`: zoom; `CX/CY`: camera offset; `dpr`: device pixel ratio
- `UP`: the active upgrade table. `UPT` is the turtle table, `UPS` the shark table, and duel has none. Each entry is `{n:name, k:key into s.up, max, c:level=>cost}`
- `net`: duel/network state, reset from `NET0`

## Architecture

The global `mode` is one of `'turtle'`, `'shark'` or `'duel'`. Everything branches on it.

- **Lifecycle:** `start(m)` → `reset()` builds `s` for the mode → `loop` (rAF) calls `update(dt)` then `draw()`. `dt` is capped at 0.05. `over()` ends solo games and saves the best score in localStorage (`chase-best` / `shark-best`, wrapped in try/catch). `finish()` ends duel rounds.
- **`update(dt)`:** handles shared player movement (keyboard WASD/arrows, or pointer drag via `tp` in screen coords turned into world coords through `Z`/`CX`/`CY`), dash and bubbles. It then hands off to:
  - turtle mode, inline in `update`: shark AI (steering, lunges, spawned every 14s up to 5 sharks), pearl pickup with the magnet radius, shield hits
  - `updS`: shark mode. Fleeing turtle AI with wall avoidance and bursts, plus the countdown timer (`s.left`); each catch adds time
  - `updD`: duel play. Interpolates the opponent, sends our position over presence, detects the catch or the timeout
  - `updC`: duel countdown before play
- **Rendering:** `draw()` paints the world in world coords (`setTransform` with `Z` and the camera), then the HUD in screen coords. `drawTurtle()` draws at `s.x/s.y`, and `drawTurtleAt` temporarily swaps `s` fields to draw turtles elsewhere. `drawShark(k)` draws a procedural body along a wavy spine (`spine`, `hw`, `bodyPath`), animated by `k.w`.
- **Shop:** `refresh()` rebuilds the `#shop` buttons from `UP`. Call it whenever `coins` or `up` changes. `buy(i)` is bound to keys 1–4.
- **Duel networking:** there's no server code. It all goes through the room's presence:
  - `joinDuel` joins room `duel-<code>`, and `onP` reacts to peer presence changes
  - Presence fields: `base` (the creator's side), `rd` (ready for round N), `x/y/a/dd` (position), `res:{r,w}` (round result)
  - Roles alternate each round through `roleFor()`
  - Each client reports a result through `finish()`, and `net.done` makes sure a round is only counted once
- **Overlay UI:** `#ov` holds the menu and end screens, and its text is swapped in place (`tt`, `mm`, `ds`). `showDuel(state)` toggles the duel panel rows.

## Theming

Colors are CSS tokens on `:root`, with dark-mode overrides keyed on `prefers-color-scheme` and `data-theme`. Most canvas colors are hardcoded in the drawing functions.
