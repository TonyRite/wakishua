# Security

## Threat model (MVP)
Untrusted clients, public internet. Primary risks: account takeover, contact harvesting/spam,
abuse of free actions (task spam, geocode abuse), and leaking exact location before consent.

## Controls in place
- **Contact protection.** Phone numbers and exact location are never returned to guests, and only
  unlocked between a customer and provider **after a match** (chat created). Feeds expose
  approximate area + distance only.
- **AuthN/AuthZ.** bcrypt passwords, JWT httpOnly cookie, server-side role checks on every
  sensitive endpoint. See [Authentication.md](./Authentication.md).
- **Rate limiting.** Per-IP in-memory limiter on register (15/min), login (10/min), task create
  (5/min), reverse-geocode (30/min). Blunt but effective against scripted abuse; move to a shared
  store (Redis) when multi-node.
- **Input validation.** Required-field and enum checks on every endpoint; rating bounded 1–5;
  budget parsed numerically; parameterized SQL everywhere (no string concatenation) → no SQLi.
- **Task expiration.** Tasks auto-expire (background sweep every 30s) so stale requests and their
  attached data don't linger in public feeds.
- **Audit logs.** Failed logins recorded; table ready for more event types.
- **WS hardening.** Unauthenticated sockets dropped after 10s; chat messages authorized against
  chat membership before persist/relay; heartbeat evicts dead sockets.
- **Geocode safety.** Reverse-geocode is server-proxied (the browser never calls OSM directly),
  cached, and rate-limited, with a descriptive User-Agent per OSM policy.

## Known gaps / TODO
- Rate limiter and online-provider registry are per-instance (in-memory) → move to Redis for
  multi-node. Until then, deploy single-node or sticky-session.
- No CSRF token yet (mitigated by `sameSite=lax` + JSON-only mutations).
- No phone-number verification (OTP) — anyone can register any number. High priority before launch.
- Secrets: `JWT_SECRET` must be set via env in production (a default exists only for local dev).
- No content moderation on chat/details; add reporting + filters before scale.

## Operational notes
- Set `JWT_SECRET`, `NODE_ENV=production` (enables `secure` cookies) and serve over HTTPS.
- Keep `database.sqlite*` (incl. `-wal`/`-shm`) out of version control (already in `.gitignore`).
