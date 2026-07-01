// Shared libSQL / Turso client for the Vercel serverless functions.
//
// In production, set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (Turso cloud).
// With no env vars it falls back to a local file DB so `vercel dev` works offline.
import { createClient } from '@libsql/client';

let _client;
export function db() {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
    const authToken = process.env.TURSO_AUTH_TOKEN;
    _client = createClient(authToken ? { url, authToken } : { url });
  }
  return _client;
}

let _schemaReady;
// Idempotent — safe to await on every (cold) invocation.
export function ensureSchema() {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const c = db();
      await c.execute(`
        CREATE TABLE IF NOT EXISTS posts (
          id TEXT PRIMARY KEY,
          post_type TEXT NOT NULL,
          category TEXT,
          title TEXT NOT NULL,
          details TEXT,
          contact_name TEXT,
          contact_phone TEXT NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          location_name TEXT,
          address TEXT,
          budget_type TEXT,
          budget_amount REAL,
          status TEXT NOT NULL DEFAULT 'active',
          ip_hash TEXT,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await c.execute(`CREATE INDEX IF NOT EXISTS idx_posts_status_coords ON posts(status, lat, lon)`);
      await c.execute(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at)`);
    })();
  }
  return _schemaReady;
}

// Haversine distance in kilometres.
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Client IP from Vercel's forwarding headers.
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
