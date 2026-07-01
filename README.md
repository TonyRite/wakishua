# 🌊 Wakishua — Instant Local Help

An **Uber-meets-Fiverr** on-demand platform that connects people who need help *right now* with
trusted helpers nearby. Request help in under 30 seconds — cleaning, cooking, groceries, repairs,
a mechanic, a tutor, and more.

This is **not** a classifieds site. Users don't post "listings" — they say *"I need someone now."*

- **Mobile-first PWA** — installs like a native app, works offline, push-ready.
- **Bilingual** — English + Kiswahili, one-tap toggle, persisted per device.
- **Location-aware** — every task captures GPS + a human-readable area (reverse-geocoded), shown to
  nearby helpers; exact location & contact stay hidden until both sides agree.
- **Real-time** — WebSocket task alerts, interest notifications and private chat.
- **Scales** — validated to 5,000 concurrent live connections on a single node (see
  [`docs/Architecture.md`](docs/Architecture.md)).

## Stack
React 19 + Vite · Express · SQLite (WAL) · `ws` WebSockets · Leaflet + OpenStreetMap.

## Quick start
```bash
npm install
npm run icons      # generate PWA icons from public/icon-source.svg (run once / when it changes)
npm run dev        # API on :3001, client on :5173 (proxied)
```
Open http://localhost:5173. Mock accounts (password `password`):
`+255700000001` (customer), `+255700000002/3/4` (providers).

## Scripts
| Command | What it does |
|---------|--------------|
| `npm run dev` | Run API + client together (hot reload). |
| `npm run server` / `npm run client` | Run either side alone. |
| `npm run icons` | Regenerate PWA PNG icons via `scripts/gen-icons.mjs`. |
| `npm run build` / `npm run preview` | Production build / preview. |
| `node server/test-load.js` | Real-time match integration test. |
| `node server/load-sim.js [P] [C] [T]` | Concurrency load simulation. |

## Documentation
Full design docs live in [`docs/`](docs/) — start with [`Vision.md`](docs/Vision.md) and
[`Architecture.md`](docs/Architecture.md). Notable decisions are in
[`DecisionLog.md`](docs/DecisionLog.md); changes in [`CHANGELOG.md`](docs/CHANGELOG.md).
