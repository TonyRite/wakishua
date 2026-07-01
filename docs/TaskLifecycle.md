# Task Lifecycle

```
draft ─▶ published ─▶ wip ─▶ completed ─▶ (archived)
                │
                └─▶ expired   (auto, when expires_at passes)
```

## States
| Status | Meaning | Set by |
|--------|---------|--------|
| `draft` | Created but not published (reserved; current UI publishes immediately). | — |
| `published` | Live and visible to nearby online providers; accepting interest. | `POST /api/tasks/create` |
| `wip` | A provider was selected; private chat open; work in progress. | `POST /api/tasks/:id/select` |
| `completed` | Customer submitted a review; provider stats recalculated. | `POST /api/tasks/:id/review` |
| `expired` | `expires_at` passed before a match; removed from public feeds. | expiration sweep (every 30s) |
| `archived` | Long-term hidden state (future). | — |

## Flow in detail
1. **Publish.** Customer picks a category, fills the 2-step sheet (details → budget/expiry),
   confirms location (GPS pin + reverse-geocoded area name). Task is inserted as `published` with an
   `expires_at`.
2. **Dispatch.** `sendTaskAlertToNearbyProviders` pushes `new_task_alert` over WS to online
   providers whose `services` include the category and who are within their `service_radius`.
3. **Interest.** Providers tap *Interested* → `task_interest` row (`pending`). Customer gets
   `interest_alert` with a live count ("3 helpers interested").
4. **Select.** Customer opens applicants, picks one. Task → `wip`, chosen interest `accepted`,
   others `declined`, a `chat` is created, chosen provider gets `task_selected_alert`. **Only now**
   are contact details unlocked, inside the chat.
5. **Work + chat.** Both parties chat in real time (persisted to `messages`). They settle payment
   off-platform (cash / mobile money) for the MVP — see [Notifications.md](./Notifications.md) and
   the Roadmap for escrow.
6. **Complete + review.** Customer submits rating + review (arrived? completed? hire again?). Task →
   `completed`; provider `rating_avg` and `jobs_completed` recalculated from all their reviews.
7. **Expire.** Any `published` task past `expires_at` is swept to `expired` and drops out of feeds.

## Location through the lifecycle
- Stored: exact `lat`/`lon` + `location_name`/`address`.
- Exposed in public feeds: **approximate area name + distance only**.
- Exposed in full: only to the matched provider, inside the chat (`MapView` + unlocked phone).
