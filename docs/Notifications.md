# Notifications

## Channels
| Channel | Status | Notes |
|---------|--------|-------|
| In-app toasts | ✅ built | Tappable, deep-link into the relevant view. |
| Real-time WebSocket events | ✅ built | Drive the toasts and live UI updates while the app is open. |
| Web Push / PWA push | ⏳ scaffold | Service worker is registered and ready to receive `push` events; subscription + a push server (VAPID) are future work. |
| Email | ⛔ future | Transactional provider needed. |
| SMS | ⛔ future (optional) | Useful where data is intermittent; via an SMS gateway. |

## Events (server → client, over WS)
- `new_task_alert` — to matching online providers when a task is published.
- `interest_alert` — to the customer when a provider shows interest (includes count).
- `task_selected_alert` — to the chosen provider when the customer selects them.
- `chat_message` — to the other participant on each message (also echoed to sender).
- `status_synced` — confirms a provider's availability toggle.

## Why WebSocket first (not push) for the MVP
The high-value moments (a task appears, a helper is interested, you've been chosen, a new message)
happen while users are actively in the app, so in-app realtime delivers the core experience without
the operational cost of a push backend. Web Push matters most for *re-engagement when the app is
closed* — valuable, but a fast-follow rather than MVP.

## Delivering when the app is closed (future)
1. On permission grant, the SW subscribes via the Push API (VAPID keys).
2. The subscription is stored server-side per user.
3. The same dispatch points that emit WS events also enqueue Web Push payloads; a worker delivers
   them. The SW's `push` handler shows the notification and deep-links on click.

See [PWA.md](./PWA.md) for the service-worker side and [Roadmap.md](./Roadmap.md) for sequencing.
