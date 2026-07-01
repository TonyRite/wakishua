# Architecture

## Stack at a glance

| Layer        | Choice                              | Why / trade-off |
|--------------|-------------------------------------|-----------------|
| Frontend     | React 19 + Vite                     | Fast HMR, tiny config, modern React. Single SPA served as a PWA. |
| State        | Local React state + Context (i18n)  | App is small; no Redux needed. Context only for cross-cutting concerns (language). Trade-off: prop-passing in a few places, accepted for simplicity. |
| Backend      | Express (Node, ESM)                 | Minimal, well understood. Trade-off: not the fastest framework, but ample for this scale. |
| Realtime     | `ws` WebSocket server (same HTTP server, `noServer` upgrade) | One process serves HTTP + WS. Simple to deploy. Trade-off: in-memory connection maps don't survive multiple instances — see *Scaling* below. |
| Database     | SQLite (WAL mode)                   | Zero-ops, single file, great for a single-node MVP. WAL gives concurrent readers + one writer. Trade-off: single-writer and single-node; migration path to Postgres documented below. |
| Auth         | JWT in an httpOnly cookie           | Stateless, survives restarts, works for both REST and WS (cookie sent on upgrade). See [Authentication.md](./Authentication.md). |
| Maps/Geo     | Leaflet + OpenStreetMap tiles; Nominatim reverse-geocode (server-proxied, cached) | No API key, no vendor lock-in. Trade-off: OSM usage policy requires a User-Agent + low request rate, handled by our cache + rate limiter. |
| PWA          | Hand-written service worker + manifest | Full control, no build plugin. Trade-off: we maintain the SW cache logic ourselves. |
| i18n         | Hand-rolled dictionary + Context     | EN + SW only; a full i18n library would be overkill. Trade-off: no pluralization engine (not needed yet). |

## Request / data flow

```
Customer (browser/PWA)                      Server (Express + ws)            SQLite
  │  POST /api/tasks/create  ───────────────▶  insert task ───────────────▶  tasks
  │                                            sendTaskAlertToNearbyProviders
  │                                                  │ (WS push)
Provider (online)  ◀──── new_task_alert ────────────┘
  │  POST /api/tasks/:id/interest ──────────▶  insert task_interest ───────▶  task_interest
  │                                            notifyCustomerOfInterest (WS)
Customer ◀──── interest_alert ──────────────────────┘
  │  POST /api/tasks/:id/select ────────────▶  task→wip, create chat ──────▶  chats
  │                                            notifyProviderOfSelection (WS)
Both  ◀────── chat_message (WS, persisted) ──────────────────────────────▶  messages
Customer  POST /api/tasks/:id/review ────────▶  task→completed, recalc ────▶  reviews
```

## Key modules

- `server/server.js` — REST endpoints, JWT middleware, rate limiter, task-expiration interval,
  Nominatim reverse-geocode proxy, static + SPA fallback.
- `server/websocket.js` — WS auth (cookie or message), provider online registry
  (`onlineProviders` map), geo-dispatch of task alerts, chat relay + persistence, heartbeat.
- `server/db.js` — SQLite open, PRAGMAs, schema creation, idempotent migrations, promisified
  `query.{run,get,all}` helpers.
- `src/App.jsx` — top-level orchestration & state; renders views and reusable components.
- `src/components/*` — presentational, reusable building blocks.
- `src/i18n/*` — translation dictionaries + `LanguageProvider`/`useT`.

## Geo-matching

Both feeds use a **bounding-box pre-filter in SQL** (cheap, index-friendly) followed by a precise
**Haversine** distance check and sort in JS. The box is computed from the search radius:
`latOffset = radius/111`, `lonOffset = radius/(111·cos(lat))`. Indexes
`idx_tasks_status_coords` and `idx_providers_status_coords` make the box query fast.

## Scaling to ~5,000 users

What we did for this milestone (single node):
- Bounding-box + `LIMIT` on `providers/nearby` (was: load-all-then-filter in JS).
- WebSocket ping/pong heartbeat to evict dead sockets and keep the connection map clean.
- Reverse-geocode in-memory TTL cache + rate limit so the external dependency can't be a
  bottleneck or get us blocked.
- SQLite WAL + `busy_timeout` + `synchronous=NORMAL` for concurrent reads.

A single Node process comfortably holds a few thousand idle WebSocket connections and SQLite-WAL
serves thousands of light reads/sec, so ~5,000 users on one box is realistic for the MVP. Measured
numbers from `server/load-sim.js` are recorded at the bottom of this file.

### Horizontal scale path (future, not built)
1. **Stateless app tier**: JWT is already stateless, so we can run N app instances behind a load
   balancer. The blocker is the in-memory `onlineProviders` / `activeConnections` maps.
2. **WS fan-out via Redis pub/sub**: each instance subscribes; `sendToUser` / task-alert dispatch
   publishes to Redis, the instance holding that socket delivers. Online-provider registry moves to
   Redis (geo commands `GEOADD`/`GEOSEARCH` replace our bounding-box SQL for presence).
3. **Database**: migrate SQLite → Postgres (+ PostGIS for geo) when write volume or multi-node
   demands it. The promisified `query` layer localizes the change.
4. **Push delivery**: Web Push / SMS workers for notifications when the user is offline.

## Load-test results

> Populated by running `node server/load-sim.js`. Record concurrency, messages/sec and p95 latency
> here after each significant change.

Measured locally with `node server/load-sim.js <providers> <customers> <tasks>` (macOS, single
Node process, SQLite-WAL):

| Date | Concurrent WS clients | Tasks posted | Alerts delivered | Dispatch time | First-alert latency | Notes |
|------|----------------------|--------------|------------------|---------------|---------------------|-------|
| 2026-06-30 | 1,600 | 100 | 16,000 | 162 ms (617 tasks/s) | 162 ms | warm-up run |
| 2026-06-30 | **5,000** | 100 | **50,000** | 426 ms (235 tasks/s) | 427 ms | **target met** — one node held 5,000 live sockets and fanned 100 geo-targeted tasks to 50k deliveries in well under half a second |

**Takeaway:** a single instance comfortably serves the ~5,000-user goal for the MVP. Fan-out cost
scales with *matching providers per task*, not total users, so the bounding-box + category filter in
`sendTaskAlertToNearbyProviders` is what keeps it cheap. Beyond this, move to the Redis fan-out path
above before adding a second app instance (the connection maps are per-process).
