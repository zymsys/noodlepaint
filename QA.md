# Verification — 2026-10-11 (NoodlePaint rebrand + swatch mixer)

- TypeScript strict check and production Vite build passed using Node 24.12.0. Production client JS is approximately 16.9 kB (6.4 kB gzip); no React or runtime packages.
- 28 unit tests passed (3 new: HSV roundtrip, mixed hex passes drawing validation, palette storage fallback): no down jump, scaled relative deltas, pressure start/end, width bounds, both lift orders, ignored third contacts, cancellation of either role, toolbar/resize suspension, blur reset, edge reversal, undo/clear, immutable active snapshot, restore, mouse, duplicate down, repeated strokes, corrupt input, IndexedDB roundtrip, failed writes and serialized acknowledgements.
- 24 automated browser checks passed (new: swatch tap selects, touch hold and right-click open the mixer, Escape cancels, mixed ink persists across reload, Reset restores the default) with an existing Chromium installation plus an existing WebKit installation. Chromium CDP dispatched simulated multiple touch contacts through real PointerEvent handlers. Coalesced batches were tested with an injected two-sample event; aggregate duplication was rejected. Active work was read back from IndexedDB while the stroke remained down.
- Browser checks cover real handler cancellation, capture loss, blur, controls during gestures, portrait/landscape resize, clear undo, reload restore, quota-style write failure, corrupt/unavailable storage, production manifest/icon metadata, service worker activation and cache completeness, offline navigation and drawing reload, waiting update during a stroke, explicit safe activation, and failed auth-redirected asset install preserving the current cache.
- WebKit separately passed rendering, mouse drawing, IndexedDB reload and service-worker cache readiness. No new browser was installed. Chromium recorded no page exceptions.
- Visual screenshot: `test-results/noodlepaint-mobile.png` (390×844 CSS pixels, 2× raster). This is a simulated phone viewport, not a physical iPhone screenshot.

The harness starts two temporary loopback servers and closes them on completion. It uses isolated browser profiles; test drawings do not ship in the app.

## Limits and device check

GitHub Pages headers and service-worker behaviour on the live origin need checking after the first deploy; localhost tests do not prove origin-specific properties. Physical iPhone installation, finger latency, edge/system-gesture cancellation and cold offline standalone launch have not been tested here.

On the iPhone: open https://zymsys.github.io/noodlepaint/ in Safari, install using Share → Add to Home Screen (enable Open as Web App when shown), launch online, verify Help says Offline ready, draw, close, turn on airplane mode, and cold-launch again. Safari installation transfers cookies on supported iOS versions but not IndexedDB/cache. Use editable backup export/import if moving sketches between Safari and the installed app. Storage is local and may be evicted. A committed checkpoint protects earlier samples; sudden process death can lose the last unfinished checkpoint. Multiple simultaneous editing tabs are not merged (last completed save wins).
