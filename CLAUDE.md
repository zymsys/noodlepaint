# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NoodlePaint is a standalone iPhone painting PWA: Vite + strict TypeScript + Canvas2D, with no runtime dependencies. It is deployed to GitHub Pages at https://zymsys.github.io/noodlepaint/ (repo zymsys/noodlepaint). README.md describes the gesture contract and install flow, DESIGN.md the visual intent (palette, 48px targets, single bottom tray), and QA.md the last verification run and what is still untested on a physical iPhone.

## Commands

Node 22.12+ or 24.

- `npm run dev`: Vite dev server on 127.0.0.1; `npm run dev:lan` exposes it on the LAN (no service worker on iOS over HTTP)
- `npm run phone`: build and serve the production PWA over LAN HTTPS at `https://vics-macbook-pro.local:4173/` (mkcert cert in gitignored `.certs/`; the iPhone trusts the mkcert root CA). Keep it running, `npm run build` in another terminal, then foreground the app to test the update path.
- `npm run release`: tests, `npm version patch`, push the tag. **Only tags deploy** to Pages; pushes to `main` just run CI.
- `npm test`: unit tests (`tsx --test tests/*.test.ts`, node:test + `fake-indexeddb`)
- Single test: `npx tsx --test --test-name-pattern='width is deterministic' tests/engine.test.ts`
- `npm run build`: `tsc --noEmit`, then `vite build`, then `scripts/sw-build.mjs` (writes `dist/sw.js`). TypeScript errors fail the build.
- `npm run test:browser` (`node scripts/browser-qa.mjs`): Playwright end-to-end checks. **Run `npm run build` first**, because it serves `dist/` on :4178 for the service-worker and offline checks, and also starts a Vite dev server on :4177. It never downloads browsers. Instead it uses hard-coded executables under `~/Library/Caches/ms-playwright/` (`chromium-1234`, `webkit-2336`), and Chromium can be overridden with `CHROME_PATH`. Its screenshot goes to `test-results/`.
- `scripts/icons.mjs` renders the `public/icon-*.png` files with the same Chromium.

## Architecture

- `src/engine.ts`: pure, DOM-free state machine and the core of the app. The `Drawing` model (fixed 900×1600 world, strokes of `{x,y,w}` samples) plus pointer-role logic. The first touch becomes `steer` and moves the cursor by relative deltas divided by the render scale. A second touch becomes `pressure`: it begins a stroke, and its vertical travel changes width (clamped to 2–120). Mouse and pen draw with a single pointer. `blocked` stops a leftover contact from taking over after the steering contact lifts. `history` holds stroke-array snapshots for session-local undo and clear. `revision` increments on every change and drives saving. `validate()` is the single gate for anything read from IndexedDB or imported from a backup.
- `src/main.ts`: DOM wiring. It translates PointerEvents (including `getCoalescedEvents`) into engine calls. It calls `engine.suspend()` whenever a gesture must end safely: on cancel, lost capture, resize, a tap outside the canvas, or blur. It also handles status text, backup export/import, service-worker registration and the explicit "Update app" flow. In dev builds it exposes `window.__noodlepaint = {engine, renderer, queue}`, which the browser QA script depends on.
- `src/storage.ts`: `SketchStore` stores one IndexedDB record (`noodlepaint` DB, `sketch` store, key `drawing`). `SaveQueue` serializes writes and only advances `savedRevision` after a transaction commits. Checkpoints happen every 500 ms while dirty, and immediately at stroke end, `pagehide` and `visibilitychange`. If the initial read fails, `loadFailed` blocks all writes so existing data is never overwritten.
- `src/palette.ts` and `src/mixer.ts`: the four tray swatches are user-editable. Tap selects; a 450 ms press-and-hold (or `contextmenu`) opens the `#mixer` dialog (HSV shade pad plus hue range). `palette.ts` is pure (hex↔HSV, validated parse) and unit-tested. Swatch colours persist in `localStorage` (`noodlepaint-palette`) as a per-device convenience that falls back to defaults on any failure. The active stroke colour lives in the `Drawing`, so it must stay lowercase `#rrggbb` to pass `validate()`.
- `src/render.ts`: fits the world into the canvas without stretching (`scale`/`ox`/`oy`) and draws variable-width strokes as tangent-hull segments plus dots, with an offscreen cache for completed strokes.
- `src/sw-template.js` → `dist/sw.js`: `sw-build.mjs` replaces `__VERSION__` with a content hash of the shell and `__SHELL__` with the asset list. The worker caches only the exact app shell (it rejects redirects and wrong content types so auth-gate pages never get cached), serves navigations network-first, and waits for an `ACTIVATE` message instead of auto-activating. Don't add `skipWaiting` or automatic reloads, because an update must never land mid-stroke.
- All paths are relative (`base: './'` in `vite.config.ts`, `./manifest.webmanifest`, `./sw.js`, scope `./`) because Pages serves the app under `/noodlepaint/`. Never introduce root-absolute URLs.
- Deploy: `.github/workflows/pages.yml` runs on `v*` tags (`npm ci`, `npm test`, `npm run build`, then upload `dist/`). Installed apps call `registration.update()` when they return to the foreground and show a dot on the tray's ? button (`#help[data-badge]`: `update` or `alert`). The `#status` text is visually hidden, but tests still read it. `__APP_VERSION__` (from `vite.config.ts`) is shown in Help; local builds are tagged `-local (sha)`.

## Conventions

- Source is written in a dense, semicolon-joined style with very few comments. Match it when editing.
- Keep gesture behaviour in `engine.ts` so it stays unit-testable without a DOM. Gesture and storage invariants (no cursor jump on first down, role retention, safe cancellation, and never writing after a failed load) each have a test. Update the test alongside any behaviour change.
