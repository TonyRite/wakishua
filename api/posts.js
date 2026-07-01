// Public posts endpoint (no auth) — Vercel serverless function.
//   GET  /api/posts   → browse active posts near a location (bounding-box feed)
//   POST /api/posts   → publish a request or an offer with contact + location
import crypto from 'crypto';
import { db, ensureSchema, haversineKm, clientIp } from '../lib/turso.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const c = db();

    if (req.method === 'POST') return createPost(req, res, c);
    if (req.method === 'GET') return listPosts(req, res, c);
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('posts handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function createPost(req, res, c) {
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const {
    post_type, category, title, details,
    contact_name, contact_phone,
    lat, lon, location_name, address,
    budget_type, budget_amount, expiry_mins
  } = b;

  if (!['request', 'offer'].includes(post_type)) return res.status(400).json({ error: 'Invalid post type' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'A title is required' });
  if (!contact_phone || !contact_phone.trim()) return res.status(400).json({ error: 'A contact phone number is required' });
  if (lat === undefined || lon === undefined) return res.status(400).json({ error: 'Location is required' });

  // Lightweight per-IP rate limit (8 posts / 60s) using the DB — serverless-safe.
  const ipHash = crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 32);
  const recent = await c.execute({
    sql: `SELECT COUNT(*) AS n FROM posts WHERE ip_hash = ? AND created_at > datetime('now', '-60 seconds')`,
    args: [ipHash]
  });
  if (Number(recent.rows[0].n) >= 8) {
    return res.status(429).json({ error: 'Too many posts — please slow down.' });
  }

  const id = crypto.randomUUID();
  const mins = expiry_mins ? parseInt(expiry_mins) : 1440;
  const expiresAt = new Date(Date.now() + mins * 60000).toISOString().replace('T', ' ').substring(0, 19);

  await c.execute({
    sql: `INSERT INTO posts
      (id, post_type, category, title, details, contact_name, contact_phone, lat, lon, location_name, address, budget_type, budget_amount, status, ip_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    args: [
      id, post_type, category || null, title.trim(), (details || '').trim(),
      (contact_name || '').trim() || null, contact_phone.trim(),
      lat, lon, location_name || null, address || null,
      budget_type || 'flexible', budget_amount || null, ipHash, expiresAt
    ]
  });

  return res.status(201).json({ success: true, id });
}

async function listPosts(req, res, c) {
  const { lat, lon, radius_km, type, category } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  const offset = parseInt(req.query.offset) || 0;

  // Opportunistic expiry sweep (cheap, keeps the feed clean without a cron).
  await c.execute(`UPDATE posts SET status = 'expired' WHERE status = 'active' AND expires_at < datetime('now')`);

  const conditions = ["status = 'active'"];
  const args = [];
  if (type === 'request' || type === 'offer') { conditions.push('post_type = ?'); args.push(type); }
  if (category) { conditions.push('category = ?'); args.push(category); }

  let hasGeo = false;
  let userLat, userLon, searchRad;
  if (lat && lon) {
    hasGeo = true;
    userLat = parseFloat(lat);
    userLon = parseFloat(lon);
    searchRad = radius_km ? parseFloat(radius_km) : 25;
    const latOffset = searchRad / 111;
    const lonOffset = searchRad / (111 * Math.cos((userLat * Math.PI) / 180));
    conditions.push('lat BETWEEN ? AND ?', 'lon BETWEEN ? AND ?');
    args.push(userLat - latOffset, userLat + latOffset, userLon - lonOffset, userLon + lonOffset);
  }

  const result = await c.execute({
    sql: `SELECT * FROM posts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
    args
  });

  let results = result.rows.map((p) => {
    const out = {
      id: p.id,
      post_type: p.post_type,
      category: p.category,
      title: p.title,
      details: p.details,
      contact_name: p.contact_name,
      contact_phone: p.contact_phone,
      location_name: p.location_name,
      budget_type: p.budget_type,
      budget_amount: p.budget_amount,
      expires_at: p.expires_at,
      created_at: p.created_at
    };
    if (hasGeo) out.distance_km = parseFloat(haversineKm(userLat, userLon, p.lat, p.lon).toFixed(2));
    return out;
  });

  if (hasGeo) {
    results = results.filter((p) => p.distance_km <= searchRad).sort((a, b) => a.distance_km - b.distance_km);
  }

  return res.json(results.slice(offset, offset + limit));
}
