# Decision Log

Architecture and product decisions with their reasoning and trade-offs. Newest first.

## D-008 — Pivot the MVP to a no-auth public "posts" board (requests + offers)
**Decision:** Add a second, simpler model alongside the auth/match/chat system. Anyone — with no
account — can publish a **request** ("I need help") or an **offer** ("I will clean") that carries
the poster's **name + phone number + location directly on the card**. Browsing is a single public
feed filterable by type and category, and a phone `tel:` link replaces in-app chat. This is now the
default (and only) UI surface; the login screen, chat window, provider dashboard, my-tasks and
messages views are removed from navigation.
- New table `posts` (`post_type`, `title`, `details`, `contact_name`, `contact_phone`, `lat/lon`,
  `location_name`, `budget_*`, `expires_at`, `status`) — see [Database.md](./Database.md).
- New public endpoints `POST /api/posts` (rate-limited 8/min/IP) and `GET /api/posts` (bounding-box
  geo feed) — see [API.md](./API.md).
- Free-text **custom** posts: a title field + optional category means users are **not** forced to
  pick a predefined category.

**Why:** The product owner wants the lowest-friction path to value: "let people post a task with a
phone number and location, no login, no chat." Forcing sign-up and gating contact details behind a
match flow was the biggest barrier to the "I need someone now" goal.

**Trade-off:** This **drops contact protection** — phone numbers are public on every post — and
removes spam/abuse defenses that auth provided. We mitigate with per-IP rate limiting, short default
expiry, and server-side validation, and we **kept** the auth/task/chat code and endpoints intact
(unused by the UI) so the protected flow can be switched back on later without a rewrite. Reviews,
ratings and verification are dormant under this model.

**Also fixed here:** content was being hidden behind the fixed bottom nav — `#app-content` now
reserves `96px + safe-area` of bottom padding (was a desktop-shell `16px` override).

## D-007 — Pragmatic in-place refactor over full feature-split
**Decision:** Keep `App.jsx` as the stateful orchestrator; extract i18n + a handful of
presentational components rather than splitting into feature folders.
**Why:** The app works today. A full rewrite risks regressing the task/chat/match flows for limited
near-term benefit. **Trade-off:** `App.jsx` stays large; revisit a feature-based split if it keeps
growing.

## D-006 — Leaflet + OpenStreetMap for maps
**Decision:** Use Leaflet with OSM tiles for the location pin and approximate-area views.
**Why:** No API key, no vendor lock-in, ~40kb, good mobile UX. **Trade-off:** OSM tile/Nominatim
usage policy requires a descriptive User-Agent and low request rate — handled by server-side
proxying + caching + rate limiting.

## D-005 — Hybrid location capture (auto reverse-geocode + editable)
**Decision:** Auto-suggest the area name from GPS via a server-proxied Nominatim call; let the
customer edit it. Store both `location_name` (short) and `address` (full) on the task.
**Why:** "Track location" needs a human-readable, trustworthy area, but GPS alone is opaque and pure
manual entry is slow. **Trade-off:** dependency on an external service — mitigated by caching, rate
limiting, and graceful null fallback ("Nearby area").

## D-004 — Server-proxied, cached reverse geocoding
**Decision:** The browser never calls Nominatim directly; it calls our `/api/geocode/reverse`,
which caches by rounded coords and rate-limits.
**Why:** Protects the third-party from our traffic (keeps us within policy), keeps the User-Agent
correct, hides the dependency, and makes it fast/cheap under load. **Trade-off:** a little server
work and memory for the cache.

## D-003 — Hand-rolled i18n instead of a library
**Decision:** A small `{ en, sw }` dictionary + React Context (`useT`).
**Why:** Only two languages, simple strings; an i18n framework would add weight and config for no
real gain. **Trade-off:** no built-in pluralization/interpolation engine — we add tiny helpers only
where needed.

## D-002 — Fix PWA by generating real icons + registering the SW
**Decision:** Generate PNG icons from one source SVG (sharp) and register `sw.js` in `main.jsx`.
**Why:** Install was silently failing because the manifest pointed at non-existent PNGs and the SW
was never registered. **Trade-off:** an extra (dev-only) build dependency, `sharp`, and an icon
generation step.

## D-001 — Playful-but-inclusive tone
**Decision:** Keep humour (rotating hero prompts, cheeky microcopy) but remove the "Rich Kid"
framing for customers.
**Why:** The brief wants the product to feel fun and enjoyable, but the audience is everyone who
needs help, not a niche. **Trade-off:** slightly less edgy; we judge broad warmth as the better fit
for a trust-driven services app.

---
_Earlier foundational choices (SQLite/WAL, JWT-cookie auth, single-process WS, bounding-box geo) are
documented in [Architecture.md](./Architecture.md) and [Authentication.md](./Authentication.md)._
