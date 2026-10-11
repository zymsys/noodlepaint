# NoodlePaint

A Vite + TypeScript + Canvas2D two-finger painting PWA for iPhone. Live at https://zymsys.github.io/noodlepaint/.

One touch steers by relative client-coordinate deltas. A second touch lowers the brush and changes width by −0.35 world units per vertical world unit. Width is clamped to 2–120. Tap a swatch to pick an ink; press and hold (or right-click) a swatch to mix a new colour for it. Pointer IDs retain roles; a held extra contact never takes over. If the steering contact ends, all remaining contacts must leave before another gesture. Pressure lift leaves the driver hovering. Cancellation, capture loss, backgrounding, resize and controls end the current stroke safely.

Artwork has fixed 900×1600 coordinates, fitted without stretching. Editable x/y/width samples and color are stored in IndexedDB, including active checkpoints every 500 ms and immediate stroke-end/lifecycle checkpoints. Save state advances only after a committed transaction. A failed initial read locks out writes to protect existing data; backups can be exported/imported. Abrupt process termination can still lose work since the last committed checkpoint. Undo is session-local; restored strokes can be undone individually. Clear is undoable.

## Develop
Use Node 22.12+ or 24. `npm ci`, `npm test`, `npm run build`, `npm run dev`. Build emits a revisioned service worker and relative manifest/scope. No browser download is required: point tests at existing browser executables. `npm run build` runs TypeScript first. Vite uses `base: './'`, so the build works under any sub-path.

Phone testing: `npm run dev:lan` serves the dev build on the LAN (UI only; iOS refuses service workers over plain HTTP). `npm run phone` builds and serves the production PWA for on-device install/update testing. Rebuild with `npm run build` while it runs, then foreground the app to receive the update. Help → Version shows `x.y.z-local (sha)` for local builds.

## Release
`npm run release` runs the tests, bumps the patch version, and pushes a `v*` tag; `.github/workflows/pages.yml` then builds and publishes `dist/` to GitHub Pages. Pushes to `main` only run CI (`ci.yml`). Each build gets a new content-hashed service worker, so installed apps pick up the update in the background.

## Install
Open https://zymsys.github.io/noodlepaint/ in iPhone Safari. Share (or More, then Share) → Add to Home Screen → enable Open as Web App if shown → Add. Launch the installed app online and wait for Offline ready in Help. Safari and standalone storage may be separate; use Save editable backup / Open backup to transfer a drawing. Browser storage can be evicted. Offline readiness requires a controlling worker and a complete app-shell cache, checked separately per installation.

Updates cache a new shell and wait. The app checks for one whenever it returns to the foreground; a dot appears on the ? button in the tray, and Help’s Update app button saves first, then deliberately activates and reloads. No automatic reload midstroke. Drawings live in a separate IndexedDB database and survive updates. Device cold launch must be verified on actual iPhone.

## Validation
28 unit tests cover the gesture engine, corruption validation, IndexedDB, save serialization and colour/palette maths. `node scripts/browser-qa.mjs` uses already installed Chromium/WebKit (override CHROME_PATH if needed); it covers real browser-dispatched simulated touch contacts, mouse, keyboard, resize, storage failure, offline shell, delayed worker updates, auth redirect rejection and the swatch mixer (tap vs. hold, cancel, persistence, reset). These are desktop browser simulations, not physical iPhone validation.

Primary iPhone references: https://webkit.org/blog/14787/webkit-features-in-safari-17-2/ (installation copies cookies, not other local storage); https://webkit.org/blog/14403/updates-to-storage-policy/ (quota/eviction and persistence); Apple iPhone Safari Add to Home Screen guidance.
