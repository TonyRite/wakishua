# Changelog

All notable changes to Wakishua. Newest first.

## [0.3.0] — 2026-07-01

### Changed — product pivot to a no-auth public board
- **Removed the login requirement, in-app chat, provider dashboard, my-tasks and messages** from the
  UI. The app is now a single public board where **anyone can post without an account**.
- Two post types: **"I need help"** (request) and **"I can help"** (offer, e.g. "I will clean").
- Posts carry the poster's **name + phone + location directly on the card**; a 📞 `tel:` call link
  replaces chat. Phone/name are remembered in `localStorage` for faster re-posting.
- **Custom (free-text) posts**: a title field + optional category — users no longer must pick a
  predefined category. Predefined categories remain as one-tap shortcuts.
- New bottom nav: **Home / Browse**, plus a floating **＋** post button.
- Browse feed filters by type (All / Needs help / Offers) and category, sorted by distance.

### Added
- `posts` table + indexes; expiration sweep now also expires posts.
- Public endpoints `POST /api/posts` (rate-limited) and `GET /api/posts` (bounding-box geo feed).
- `PostCard` component; segmented filter control, offer card, and FAB styles.
- New EN/SW strings for the posting/browsing flow.
- **Vercel + Turso deployment**: serverless functions (`api/posts.js`, `api/geocode/reverse.js`) on
  libSQL (`lib/turso.js`), `vercel.json`, `.env.example`, and [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md).
  Serverless-safe per-IP rate limit (`ip_hash`) and opportunistic expiry sweep. See DecisionLog D-009.

### Fixed
- **Content hidden behind the bottom navigation** (the reported bug): `#app-content` now reserves
  `96px + safe-area-inset-bottom` of bottom padding instead of the desktop shell's `16px`.
- **PWA install prompt never appeared**: modern Chrome no longer auto-shows the install banner and
  iOS Safari never fires `beforeinstallprompt`. Added an `InstallPrompt` component that captures
  `beforeinstallprompt` and shows an **Install app** button (Android/Chrome/desktop) or manual
  **Add to Home Screen** instructions (iOS Safari), dismissible + hidden once installed. SW cache
  bumped to `v3`; manifest shortcuts updated to Post/Browse.

> ⚠️ This intentionally **drops contact protection** (phones are public) per product direction. The
> auth/task/match/chat backend is retained but unused — see DecisionLog **D-008**.

## [0.2.0] — 2026-06-30

### Added
- **Documentation suite** under `docs/` (Vision, Architecture, UX-Principles, Database, API,
  Components, Authentication, Security, Roadmap, TaskLifecycle, Notifications, PWA, CHANGELOG,
  DecisionLog).
- **Bilingual UI (English + Swahili)**: hand-rolled i18n (`src/i18n/`), `LanguageProvider`/`useT`,
  persisted EN/SW toggle in the header and profile, full string extraction, rotating funny hero
  prompts per language.
- **Location tracking of job postings**: `tasks.location_name` + `tasks.address` columns
  (idempotent migration), server-proxied + cached + rate-limited reverse-geocode endpoint
  `GET /api/geocode/reverse` (OpenStreetMap Nominatim), Leaflet `MapPicker` (draggable pin) in task
  creation and read-only `MapView` for approximate area. Feeds now return `location_name`; provider
  cards show approximate area + distance, exact location stays hidden until matched.
- **PWA install + offline**: registered the service worker (`src/main.jsx`), generated real PNG
  icons (`scripts/gen-icons.mjs` + `npm run icons`) from a themed `public/icon-source.svg`, fixed
  `manifest.json` (valid icons, maskable, shortcuts), added iOS/apple-touch meta, hardened `sw.js`
  (versioned cache, navigation fallback, push-ready).
- **Reusable components** (`src/components/`): `BottomSheet`, `TaskCard`, `ProviderCard`,
  `CategoryCard`, `StarRating`, `Skeleton`, `Toast`, `LanguageToggle`, `MapPicker`, `MapView`;
  shared formatters in `src/utils/format.js`.
- **Full category catalogue** with a "View all" toggle (plumbing, electrical, gardening, tutoring,
  beauty, pet care, …) and a 3-step task wizard (details → location → budget).
- **Scale tooling**: `server/load-sim.js` concurrency simulation (validated **5,000 live sockets**,
  100 tasks → 50,000 alerts in 426 ms — see Architecture.md).

### Changed
- Tone refreshed to **playful-but-inclusive** (removed "Rich Kid" framing).
- `GET /api/providers/nearby` now uses a **bounding-box SQL pre-filter + LIMIT/offset** instead of
  loading all available providers into memory; `tasks/nearby` gained LIMIT/offset.
- WebSocket server now runs a **ping/pong heartbeat** to evict dead sockets.
- Skeleton loaders replace blank waits on feeds; richer provider profile (rating/jobs/response/
  verification); live "N helpers interested" badge.

### Fixed
- Invalid `class=` attributes on the logo (now `className=`), which triggered React warnings.
- PWA install previously failed silently (unregistered SW + manifest pointing at non-existent icons).

---

> Entries are appended as each implementation phase lands. See
> [DecisionLog.md](./DecisionLog.md) for the reasoning behind notable choices.
