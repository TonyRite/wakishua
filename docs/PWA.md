# PWA

Goal: Wakishua installs like a native app, launches offline to a usable shell, and is ready for
push.

## Pieces
- **`public/manifest.json`** — name, theme/background colours (ocean navy `#0B1E36` / soft
  `#F4F7FA`), `display:standalone`, `orientation:portrait`, `lang`, icons (192/512 + maskable),
  and app `shortcuts` (Create Task, Find Helper).
- **Icons** — generated from `public/icon-source.svg` by `scripts/gen-icons.mjs` (sharp) into
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png`.
  Run `npm run icons` whenever the source SVG changes. **This was the install blocker before:** the
  manifest referenced PNGs that didn't exist.
- **Registration** — `src/main.jsx` registers `/sw.js` on `window.load` (guarded by
  `'serviceWorker' in navigator`).
- **`index.html`** — viewport (with safe-area), `theme-color`, `apple-mobile-web-app-capable`,
  `apple-touch-icon`, `mobile-web-app-capable`, description.
- **`public/sw.js`** — service worker.

## Service worker strategy
- **Pre-cache** the app shell on install (`/`, `/index.html`, `/manifest.json`, offline fallback).
- **Network-only** for `/api`, `/ws`, and Vite HMR (`@vite`, `node_modules`) — never cache dynamic
  or socket traffic.
- **Cache-first** for static assets, with runtime caching of successful `GET`s (Vite emits hashed
  filenames, so stale assets aren't a concern).
- **Navigation fallback**: if the network fails on a navigation, serve the cached shell so the app
  still opens offline.
- **Versioned cache** (`wakishua-cache-vN`); old caches are purged on `activate`. Bump the version
  to force-refresh the shell after a release.

## Testing installability
1. `npm run build && npm run preview` (or `npm run dev`), open in Chrome.
2. DevTools → Application → **Manifest**: icons resolve, no errors, "Add to home screen" available.
3. DevTools → Application → **Service Workers**: activated. Toggle "Offline" and reload — shell
   still renders.
4. Lighthouse → PWA category: installability checks pass.
5. iOS Safari: Share → Add to Home Screen shows the apple-touch icon and launches standalone.

## Notes / trade-offs
We hand-write the SW instead of using a Workbox/Vite plugin for full control and zero build-time
magic; the cost is that cache logic is our responsibility (kept deliberately small). Push delivery
is scaffolded but not wired — see [Notifications.md](./Notifications.md).
