# Dayframe M8.2 — PWA checkpoint

**Status:** source staged; actual browser installation and offline tests remain unrun.

- `web/public/manifest.webmanifest` installs Dayframe in the `/planner/` scope.
- Actual 192px and 512px PNG install icons, SVG icon and Apple touch icon are committed.
- `web/public/offline.html` explains the need to reconnect for account data.
- `web/public/sw.js` caches public static assets and the offline fallback only. Private API/auth responses, navigation HTML and writes are never cached.
- `web/src/pwa.ts` registers an optional worker and shows an explicit update prompt. The update respects the unsaved-document state forwarded from `legacy.ts`.
- Generic payload-free Web Push handling remains.
- `tests/pwa-worker.test.mjs` covers cache privacy, offline navigation, push and activation; `scripts/check-dist.mjs` verifies install artifacts.

**Not promised:** offline document reading/editing, offline writes or background sync. Safari/mobile install, push permission, offline behavior and update lifecycle still require actual device and browser verification. The current public Pages assets are unchanged.
