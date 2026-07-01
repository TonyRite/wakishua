# Database

SQLite (WAL mode), single file `database.sqlite`. Schema is created on boot in
`server/db.js → initializeDb()`. Idempotent migrations run in `migrate()` after creation.

## PRAGMAs
`journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000` — concurrent
readers + one writer, durable enough for the MVP, no blocking on transient locks.

## Tables

### posts  _(v0.3 — no-auth public board)_
`id` (uuid, PK), `post_type` (`request|offer`), `category` (nullable — free-text posts allowed),
`title`, `details`, `contact_name` (nullable), `contact_phone`, `lat`, `lon`, `location_name`,
`address`, `budget_type`, `budget_amount`, `status` (`active|expired`), `expires_at`, `created_at`.
Indexes: `idx_posts_status_coords (status, lat, lon)` powers the bounding-box feed;
`idx_posts_created` for recency ordering. No FK to `users` — posts are intentionally anonymous.
Expired by the same 30s sweep that expires `tasks`.

### users
`id` (uuid, PK), `name`, `phone` (unique), `password_hash` (bcrypt), `role`
(`customer|provider|admin`), `avatar_url`, `bio`, `languages`, `created_at`.
Index: `idx_users_phone`.

### providers
`user_id` (PK → users.id), `service_radius` (km), `services` (JSON array string), `is_available`
(0/1), `lat`, `lon`, `response_time_mins`, `verification_status`
(`unverified|pending|verified`), `rating_avg`, `jobs_completed`.
Index: `idx_providers_status_coords (is_available, lat, lon)` — powers the bounding-box presence query.

### tasks
`id` (uuid, PK), `customer_id` → users.id, `category`, `status`
(`draft|published|wip|completed|expired|archived`), `lat`, `lon`,
**`location_name`** (human-readable area, nullable), **`address`** (fuller reverse-geocoded string,
nullable), `details`, `budget_type` (`flexible|fixed`), `budget_amount`, `expires_at`,
`created_at`, `updated_at`.
Indexes: `idx_tasks_status_coords (status, lat, lon)`, `idx_tasks_customer (customer_id)`.

### task_interest
`id` (PK), `task_id` → tasks, `provider_id` → users, `status`
(`pending|accepted|declined`), `created_at`. `UNIQUE(task_id, provider_id)`.
Indexes: `idx_interest_task`, `idx_interest_provider`.

### chats
`id` (PK), `task_id` (unique) → tasks, `customer_id`, `provider_id`, `created_at`.
One chat per task, created only on match.

### messages
`id` (PK), `chat_id` → chats, `sender_id`, `text`, `created_at`.
Index: `idx_messages_chat (chat_id, created_at)`.

### reviews
`id` (PK), `task_id`, `reviewer_id`, `reviewee_id`, `rating` (1–5), `comment`, `arrived` (0/1),
`completed` (0/1), `hire_again` (0/1), `created_at`.

### audit_logs
`id` (PK), `user_id`, `action`, `details`, `created_at`. Used for failed-login records and other
security-relevant events.

## Migrations

SQLite cannot `ADD COLUMN IF NOT EXISTS`, so `migrate()` reads `PRAGMA table_info(<table>)` and only
runs `ALTER TABLE ... ADD COLUMN` when the column is absent. This is **idempotent** and safe to run
on every boot.

### Migration log

| Date | Change | Notes |
|------|--------|-------|
| 2026-06-30 | `tasks.location_name TEXT`, `tasks.address TEXT` added | Backfill not required — existing rows keep `NULL`; feeds fall back to "Nearby area" when null. Adds human-readable location tracking for job postings. |

## Why SQLite (and when to leave it)

Zero-ops and a single file make iteration fast and deployment trivial. WAL handles the
read-heavy, low-write profile of this app well. Leave for **Postgres (+ PostGIS)** when we need
multiple app instances writing concurrently or server-side geo queries beyond a bounding box — see
[Architecture.md](./Architecture.md#horizontal-scale-path-future-not-built).
