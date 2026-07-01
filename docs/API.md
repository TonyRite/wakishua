# API

Base URL: same origin. JSON in/out. Auth via `token` httpOnly cookie (JWT). Rate limits are
per-IP, in-memory.

## Conventions
- `401` = not authenticated, `403` = authenticated but not allowed, `409` = conflict (duplicate),
  `429` = rate limited, `400` = bad input.
- Guests (no cookie) may read public feeds but customer identity / contact is masked.

## Public posts (no-auth MVP)

The default surface as of v0.3. No cookie required — anyone can post and browse. Contact details
(name + phone) are returned **in the clear** by design.

### POST `/api/posts` — rate 8/min/IP
Body: `{ post_type: "request"|"offer", title, category?, details?, contact_name?, contact_phone,
lat, lon, location_name?, address?, budget_type?, budget_amount?, expiry_mins? }`
→ `201 { success, id }`. `400` if `post_type`, `title`, `contact_phone` or coordinates are missing.
`expiry_mins` defaults to 1440 (24h).

### GET `/api/posts`
Query: `lat?, lon?, radius_km?(=25), type?("request"|"offer"), category?, limit?(=100), offset?`.
Returns active, non-expired posts. When `lat`/`lon` are supplied, results are bounding-box
pre-filtered, annotated with `distance_km`, and sorted nearest-first; otherwise newest-first.

## Auth

> The endpoints below back the original protected task/match/chat flow. They remain functional but
> are **not used by the current UI** (see DecisionLog D-008).

### POST `/api/auth/register`  — rate 15/min
Body: `{ name, phone, password, role: "customer"|"provider", service_radius?, services?[] }`
→ `201 { success, user }` and sets cookie. `409` if phone taken.

### POST `/api/auth/login` — rate 10/min
Body: `{ phone, password }` → `200 { success, user }` + cookie. Logs failed attempts to `audit_logs`.

### POST `/api/auth/logout` → clears cookie.

### GET `/api/auth/me` → `{ authenticated, user? }`.

## Geocoding

### GET `/api/geocode/reverse?lat&lon` — rate 30/min, cached
Server-side proxy to OpenStreetMap Nominatim. Returns
`{ location_name, address }` where `location_name` is a short area label (suburb/city) and
`address` is the fuller display string. Results are cached in-memory (coords rounded to ~100 m,
TTL) to respect OSM policy and to stay fast under load. On upstream failure returns a graceful
`{ location_name: null, address: null }`.

## Tasks

### POST `/api/tasks/create` — auth (customer), rate 5/min
Body: `{ category, lat, lon, details, budget_type, budget_amount?, expiry_mins?, location_name?, address? }`
→ `201 { success, task }`. Publishes immediately and pushes `new_task_alert` over WS to matching
nearby online providers.

### GET `/api/tasks/nearby?lat&lon&radius_km&limit&offset`
Public. Bounding-box + Haversine. Returns open, unexpired tasks with `distance_km` and
`location_name` (approximate area). Customer name masked for guests. Contact never included.

### POST `/api/tasks/:id/interest` — auth (provider)
Registers interest (`pending`). `409` if already interested, `400` if task closed/expired.
Pushes `interest_alert` (with count) to the customer.

### GET `/api/tasks/:id/interests` — auth (task owner)
Lists interested providers with rating / jobs / response time. Owner only.

### POST `/api/tasks/:id/select` — auth (task owner)
Body: `{ provider_id }`. Transitions task → `wip`, marks chosen interest `accepted` / others
`declined`, creates the chat, pushes `task_selected_alert` to the chosen provider.
→ `{ success, chat_id }`.

### POST `/api/tasks/:id/review` — auth (customer)
Body: `{ rating(1–5), comment?, arrived?, completed?, hire_again? }`. Saves review, task →
`completed`, recalculates provider `rating_avg` + `jobs_completed`.

### GET `/api/my-tasks` — auth
Customer: their tasks (+ `chat_id`, `location_name`). Provider: tasks they've shown interest in
(+ `interest_status`, `chat_id`).

## Providers

### GET `/api/providers/nearby?lat&lon&category?&radius_km&limit&offset`
Public. Bounding-box + Haversine over **available** providers, sorted by distance, `LIMIT`-ed.
Returns name, services, rating, jobs, response time, verification, distance.

### GET `/api/providers/:id`
Public profile. `phone` is masked unless authenticated.

## Chats

### GET `/api/chats/:id/messages` — auth (participant only)
Returns ordered message history. Live messages arrive via WebSocket.

## WebSocket  `/ws`

Authenticated by cookie on upgrade, or by an initial `{ type:"auth", token }` message.
Server keeps `activeConnections` (userId→socket) and `onlineProviders` (presence/geo).

Client → server: `auth`, `location_update {lat,lon,is_available}`, `chat_message {chat_id,text}`.
Server → client: `auth_success`, `status_synced`, `new_task_alert`, `interest_alert`,
`task_selected_alert`, `chat_message`, `error`. Heartbeat ping/pong evicts dead sockets.
