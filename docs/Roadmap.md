# Roadmap

## Shipped (this milestone)
- Bilingual UI (English + Swahili) with persisted toggle.
- Working PWA: real icons, registered service worker, offline shell, install on Android/iOS.
- Location tracking of job postings: GPS + Leaflet pin + reverse-geocoded, editable area name;
  approximate area shown in feeds, exact location unlocked only after match.
- UI refinement: rotating funny hero, full category grid + "View All", reusable components,
  skeleton loaders, richer profiles, accessibility passes.
- Scale work: bounding-box SQL + limits on provider search, WS heartbeat, geocode cache, load-sim.

## Next (fast-follow)
- **Phone OTP verification** (trust + anti-spam) — highest priority before public launch.
- **Web Push** delivery (VAPID) for re-engagement when the app is closed.
- Provider onboarding polish: photos, verification document upload + review queue.
- Scheduled tasks ("Tomorrow 9am") and recurring tasks.
- Saved addresses / favourite helpers.

## Later
- **Payments**: escrow, platform commission, wallet, mobile-money integration.
- **Multi-node scale**: Redis pub/sub for WS fan-out + shared rate limiting; Postgres + PostGIS.
- Live location tracking of an en-route helper.
- AI task categorization and voice task creation.
- Boosted/subscription profiles, referral & loyalty programs.
- Corporate accounts, team providers, scheduling calendar.
- Emergency services lane, insurance, identity verification partners.

## Guiding principle
Sequence by **trust and speed-to-help** first (verification, reliability, realtime), monetization
second (payments, boosts). Each item should preserve the "I need someone now, in under 30 seconds"
core. See [Vision.md](./Vision.md).
