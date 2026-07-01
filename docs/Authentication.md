# Authentication

## Mechanism
Phone number + password. Passwords are hashed with **bcrypt** (cost 10). On register/login the
server issues a **JWT** (`{ id, role, name }`, 7-day expiry) stored in an **httpOnly cookie**
named `token` (`sameSite=lax`, `secure` in production).

### Why httpOnly cookie (not localStorage)
- Not readable by JS → mitigates XSS token theft.
- Automatically sent on the WebSocket upgrade request, so the same session authenticates both REST
  and WS without extra plumbing.
- Trade-off: CSRF surface. Mitigated by `sameSite=lax` and the fact that all state-changing
  endpoints require the cookie *and* are JSON POSTs. A CSRF token can be added if we ever accept
  form-encoded cross-site posts.

## Middleware
`authenticateToken` (`server/server.js`) verifies the cookie JWT and attaches `req.user`. Missing
token → `401`, invalid/expired → `403`.

## WebSocket auth
On upgrade the server parses the cookie and verifies the JWT. As a fallback the client may send
`{ type:"auth", token }` as its first message (used by tests and reconnect). Unauthenticated
sockets are closed after a 10s timeout, and any non-auth message before auth is rejected.

## Roles & gating
`customer`, `provider`, `admin`. Guests (no token) may read public feeds but cannot create tasks,
express interest, chat, or see contact info. Role checks are enforced **server-side** on every
sensitive endpoint (e.g. only customers create tasks, only providers express interest, only the
task owner views interests / selects).

## Audit
Failed logins are written to `audit_logs`. Extend this for lockout/anomaly detection later.

## Future
OTP/SMS verification of the phone number, optional social login, refresh-token rotation, and
account lockout after repeated failures (see [Security.md](./Security.md)).
