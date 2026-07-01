# Deployment

Production topology: **Vercel** (static frontend + `/api` serverless functions) backed by
**Turso** (libSQL — SQLite-compatible cloud DB). This is serverless and autoscales, comfortably
covering the ~5,000-user target for the public posts model (no WebSocket needed).

```
Browser ──▶ Vercel static (Vite dist/)
        └─▶ /api/posts, /api/geocode/reverse  (Vercel functions) ──▶ Turso (libSQL)
```

> The Express server in `server/` is the **local dev / legacy** backend (auth, tasks, chat, WS on
> SQLite). Vercel does **not** run it. The public posts feature is served in production by the
> functions in `api/`, which implement the same behaviour on Turso. See DecisionLog **D-008**.

---

## 1. Create the Turso database (one-time, your account)

```bash
# Install the CLI (macOS)
brew install tursodatabase/tap/turso
turso auth signup            # or: turso auth login

turso db create wakishua
turso db show wakishua --url            # → TURSO_DATABASE_URL  (libsql://…turso.io)
turso db tokens create wakishua         # → TURSO_AUTH_TOKEN
```

Schema is created automatically on first request (`ensureSchema()` in `lib/turso.js`), so no manual
migration step is required. To pre-create it: `turso db shell wakishua < schema.sql` (optional).

## 2. Deploy to Vercel

**Option A — Dashboard (easiest):**
1. Go to vercel.com → **Add New… → Project** → import `TonyRite/wakishua` from GitHub.
2. Framework preset auto-detects **Vite** (build `vite build`, output `dist`). Leave as-is.
3. **Settings → Environment Variables**, add for *Production* (and Preview):
   - `TURSO_DATABASE_URL` = the libsql URL from step 1
   - `TURSO_AUTH_TOKEN` = the token from step 1
4. **Deploy**.

**Option B — CLI:**
```bash
vercel login
vercel link
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
vercel --prod
```

## 3. Verify
```bash
curl "https://<your-app>.vercel.app/api/posts?lat=-6.7924&lon=39.2083&radius_km=25"   # → []
```
Then open the site, post a request, and confirm it appears under **Browse**. On Android/desktop
Chrome an **Install app** banner appears; on iOS Safari use Share → **Add to Home Screen**.

---

## Local development
`npm run dev` runs the **Express** backend (`server/`, SQLite) + Vite client with a `/api` proxy —
no Turso needed. To exercise the **serverless** functions locally against Turso instead:
```bash
vercel dev            # serves api/ functions; set TURSO_* in .env (or uses file:local.db)
```

## Notes & limits
- **No contact protection**: phone numbers are public on every post (product decision D-008).
  Mitigations in the functions: per-IP rate limit (8 posts/min via `ip_hash`), short default expiry,
  server-side validation. Consider adding a captcha / phone verification before heavy promotion.
- Reverse geocoding proxies OpenStreetMap **Nominatim**; heavy traffic should move to a paid geocoder
  or self-hosted Nominatim (their policy asks ≤1 req/s). Results are cached per warm instance + via
  Vercel `s-maxage`.
- Expiry is swept opportunistically on each `GET /api/posts`; add a Vercel Cron for guaranteed
  cleanup if the feed goes quiet.
