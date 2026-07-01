import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import {
  initializeWebSocketServer,
  sendTaskAlertToNearbyProviders,
  notifyCustomerOfInterest,
  notifyProviderOfSelection
} from './websocket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'wakishua-default-secret';

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../dist')));

// Simple In-Memory Rate Limiter to prevent abuse
const rateLimits = new Map();
function rateLimiter(limit, windowMs) {
  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    if (!rateLimits.has(ip)) {
      rateLimits.set(ip, []);
    }
    const timestamps = rateLimits.get(ip).filter(t => now - t < windowMs);
    timestamps.push(now);
    rateLimits.set(ip, timestamps);

    if (timestamps.length > limit) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Session Authentication Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired session' });
    }
    req.user = user;
    next();
  });
}

// Seed Mock Accounts if database is empty
async function seedMockData() {
  try {
    const userCount = await query.get('SELECT COUNT(*) as cnt FROM users');
    if (userCount.cnt === 0) {
      console.log('Database empty. Seeding mock user accounts for Wakishua...');
      const passwordHash = await bcrypt.hash('password', 10);
      
      const mockUsers = [
        { id: 'c-1', name: 'Tony Wakishua', phone: '+255700000001', role: 'customer' },
        { id: 'p-1', name: 'Jane Cleaner', phone: '+255700000002', role: 'provider' },
        { id: 'p-2', name: 'Juma Cook', phone: '+255700000003', role: 'provider' },
        { id: 'p-3', name: 'John Repair', phone: '+255700000004', role: 'provider' }
      ];

      for (const u of mockUsers) {
        await query.run(
          'INSERT INTO users (id, name, phone, password_hash, role, bio) VALUES (?, ?, ?, ?, ?, ?)',
          [u.id, u.name, u.phone, passwordHash, u.role, `Hello! I am ${u.name}.`]
        );
      }

      // Seed Provider details
      await query.run(
        'INSERT INTO providers (user_id, service_radius, services, is_available, lat, lon, jobs_completed, rating_avg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['p-1', 10, JSON.stringify(['cleaning', 'laundry']), 1, -6.7924, 39.2083, 92, 4.9]
      );
      await query.run(
        'INSERT INTO providers (user_id, service_radius, services, is_available, lat, lon, jobs_completed, rating_avg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['p-2', 10, JSON.stringify(['cooking']), 1, -6.7824, 39.2183, 45, 4.8]
      );
      await query.run(
        'INSERT INTO providers (user_id, service_radius, services, is_available, lat, lon, jobs_completed, rating_avg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['p-3', 15, JSON.stringify(['repairs']), 1, -6.8024, 39.1983, 14, 4.7]
      );
      
      console.log('Seeding mock data complete. Use phone number and password "password" to test.');
    }
  } catch (err) {
    console.error('Failed to seed mock data:', err);
  }
}

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------

app.post('/api/auth/register', rateLimiter(15, 60000), async (req, res) => {
  const { name, phone, password, role, service_radius, services } = req.body;

  if (!name || !phone || !password || !role) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (!['customer', 'provider'].includes(role)) {
    return res.status(400).json({ error: 'Invalid user role' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

    // Save to users table
    await query.run(
      'INSERT INTO users (id, name, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [userId, name, phone, passwordHash, role]
    );

    // If provider, create provider profile details
    if (role === 'provider') {
      const radius = service_radius ? parseInt(service_radius) : 5;
      const parsedServices = Array.isArray(services) ? JSON.stringify(services) : JSON.stringify([]);
      await query.run(
        'INSERT INTO providers (user_id, service_radius, services) VALUES (?, ?, ?)',
        [userId, radius, parsedServices]
      );
    }

    // Set cookie session
    const token = jwt.sign({ id: userId, role, name }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });

    res.status(201).json({ success: true, user: { id: userId, name, role } });
  } catch (err) {
    console.error('Registration failed:', err);
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    res.status(500).json({ error: 'Database transaction error' });
  }
});

app.post('/api/auth/login', rateLimiter(10, 60000), async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Missing phone or password' });
  }

  try {
    const user = await query.get('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      // Log failed attempt
      await query.run('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)', [
        Math.random().toString(36).substring(2),
        user.id,
        'auth_login_fail',
        'Incorrect password'
      ]);
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });

    res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server validation error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.json({ authenticated: false });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.json({ authenticated: false });
    res.json({ authenticated: true, user });
  });
});

// -------------------------------------------------------------
// Geocoding (reverse) — server-proxied, cached, rate-limited
// -------------------------------------------------------------

// In-memory cache: key = rounded "lat,lon", value = { data, at }. TTL keeps it fresh
// while shielding the OSM Nominatim service (per its usage policy) under load.
const geocodeCache = new Map();
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const GEOCODE_CACHE_MAX = 5000;

function pickAreaName(addr = {}) {
  return (
    addr.suburb || addr.neighbourhood || addr.quarter || addr.village ||
    addr.town || addr.city_district || addr.city || addr.county || addr.state || null
  );
}

app.get('/api/geocode/reverse', rateLimiter(30, 60000), async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  // ~100m precision cache key.
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.at < GEOCODE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Wakishua/0.1 (local-help-platform)',
        'Accept-Language': 'en,sw'
      }
    });
    if (!upstream.ok) throw new Error(`Nominatim ${upstream.status}`);
    const body = await upstream.json();
    const data = {
      location_name: pickAreaName(body.address) || (body.display_name ? body.display_name.split(',')[0] : null),
      address: body.display_name || null
    };

    if (geocodeCache.size > GEOCODE_CACHE_MAX) geocodeCache.clear();
    geocodeCache.set(key, { data, at: Date.now() });
    res.json(data);
  } catch (err) {
    console.warn('Reverse geocode failed:', err.message);
    // Graceful fallback so the UI never blocks on geocoding.
    res.json({ location_name: null, address: null });
  }
});

// -------------------------------------------------------------
// Public Posts (no-auth MVP) — requests & offers with contact + location
// -------------------------------------------------------------

// Create a post. No authentication: anyone can post a request or an offer.
// Rate-limited per IP to curb spam.
app.post('/api/posts', rateLimiter(8, 60000), async (req, res) => {
  const {
    post_type, category, title, details,
    contact_name, contact_phone,
    lat, lon, location_name, address,
    budget_type, budget_amount, expiry_mins
  } = req.body;

  if (!['request', 'offer'].includes(post_type)) {
    return res.status(400).json({ error: 'Invalid post type' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'A title is required' });
  }
  if (!contact_phone || !contact_phone.trim()) {
    return res.status(400).json({ error: 'A contact phone number is required' });
  }
  if (lat === undefined || lon === undefined) {
    return res.status(400).json({ error: 'Location is required' });
  }

  try {
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    const mins = expiry_mins ? parseInt(expiry_mins) : 1440;
    const expiresAt = new Date(Date.now() + mins * 60000).toISOString().replace('T', ' ').substring(0, 19);

    await query.run(
      `INSERT INTO posts
        (id, post_type, category, title, details, contact_name, contact_phone, lat, lon, location_name, address, budget_type, budget_amount, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        id, post_type, category || null, title.trim(), (details || '').trim(),
        (contact_name || '').trim() || null, contact_phone.trim(),
        lat, lon, location_name || null, address || null,
        budget_type || 'flexible', budget_amount || null, expiresAt
      ]
    );

    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('Create post failed:', err);
    res.status(500).json({ error: 'Failed to publish post' });
  }
});

// Browse active posts near a location. Public; contact details are intentionally visible.
app.get('/api/posts', async (req, res) => {
  const { lat, lon, radius_km, type, category } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const conditions = ["status = 'active'", 'expires_at > CURRENT_TIMESTAMP'];
    const params = [];
    if (type === 'request' || type === 'offer') {
      conditions.push('post_type = ?');
      params.push(type);
    }
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    // Optional geo filter (bounding box) when coordinates are supplied.
    let hasGeo = false;
    let userLat, userLon, searchRad;
    if (lat && lon) {
      hasGeo = true;
      userLat = parseFloat(lat);
      userLon = parseFloat(lon);
      searchRad = radius_km ? parseFloat(radius_km) : 25;
      const latOffset = searchRad / 111;
      const lonOffset = searchRad / (111 * Math.cos(userLat * Math.PI / 180));
      conditions.push('lat BETWEEN ? AND ?', 'lon BETWEEN ? AND ?');
      params.push(userLat - latOffset, userLat + latOffset, userLon - lonOffset, userLon + lonOffset);
    }

    const rows = await query.all(
      `SELECT * FROM posts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
      params
    );

    let results = rows.map((p) => {
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
      if (hasGeo) out.distance_km = parseFloat(getDistanceKM(userLat, userLon, p.lat, p.lon).toFixed(2));
      return out;
    });

    if (hasGeo) {
      results = results
        .filter((p) => p.distance_km <= searchRad)
        .sort((a, b) => a.distance_km - b.distance_km);
    }

    res.json(results.slice(offset, offset + limit));
  } catch (err) {
    console.error('Fetch posts failed:', err);
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// -------------------------------------------------------------
// Tasks Endpoints
// -------------------------------------------------------------

app.post('/api/tasks/create', authenticateToken, rateLimiter(5, 60000), async (req, res) => {
  if (req.user.role !== 'customer') {
    return res.status(403).json({ error: 'Only customers can request help' });
  }

  const { category, lat, lon, details, budget_type, budget_amount, expiry_mins, location_name, address } = req.body;

  if (!category || lat === undefined || lon === undefined || !budget_type) {
    return res.status(400).json({ error: 'Missing task parameters' });
  }

  try {
    const taskId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    const mins = expiry_mins ? parseInt(expiry_mins) : 60;
    const expiresAt = new Date(Date.now() + mins * 60000).toISOString().replace('T', ' ').substring(0, 19);

    await query.run(
      'INSERT INTO tasks (id, customer_id, category, status, lat, lon, location_name, address, details, budget_type, budget_amount, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, req.user.id, category, 'published', lat, lon, location_name || null, address || null, details || '', budget_type, budget_amount || null, expiresAt]
    );

    const task = { id: taskId, category, lat, lon, budget_amount, details };
    
    // Notify nearby providers via WebSockets
    sendTaskAlertToNearbyProviders(task);

    res.status(201).json({ success: true, task: { id: taskId, status: 'published' } });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to publish task' });
  }
});

// Get tasks nearby (Providers browse active boards)
app.get('/api/tasks/nearby', async (req, res) => {
  const { lat, lon, radius_km } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing location details' });
  }

  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);
  const searchRad = radius_km ? parseFloat(radius_km) : 10;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  // Rough bounding box filtering to leverage indices
  const latOffset = searchRad / 111; // 1 degree latitude ~ 111 km
  const lonOffset = searchRad / (111 * Math.cos(userLat * Math.PI / 180));

  const minLat = userLat - latOffset;
  const maxLat = userLat + latOffset;
  const minLon = userLon - lonOffset;
  const maxLon = userLon + lonOffset;

  try {
    // Exclude expired/completed tasks
    const tasks = await query.all(
      `SELECT t.*, u.name as customer_name 
       FROM tasks t 
       JOIN users u ON t.customer_id = u.id 
       WHERE t.status = 'published' 
         AND t.lat BETWEEN ? AND ? 
         AND t.lon BETWEEN ? AND ?
         AND t.expires_at > CURRENT_TIMESTAMP`,
      [minLat, maxLat, minLon, maxLon]
    );

    // Filter using precise Haversine distance, and mask customer info for guests
    const authenticated = !!req.cookies.token;
    
    const results = tasks
      .map(t => {
        const dist = getDistanceKM(userLat, userLon, t.lat, t.lon);
        return {
          id: t.id,
          category: t.category,
          details: t.details,
          budget_type: t.budget_type,
          budget_amount: t.budget_amount,
          distance_km: parseFloat(dist.toFixed(2)),
          location_name: t.location_name || null,
          expires_at: t.expires_at,
          customer_name: authenticated ? t.customer_name : 'Hidden (Login required)'
        };
      })
      .filter(t => t.distance_km <= searchRad)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(offset, offset + limit);

    res.json(results);
  } catch (err) {
    console.error('Fetch tasks nearby error:', err);
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// Express interest in a task (Providers)
app.post('/api/tasks/:id/interest', authenticateToken, async (req, res) => {
  if (req.user.role !== 'provider') {
    return res.status(403).json({ error: 'Only providers can apply for tasks' });
  }

  const taskId = req.params.id;
  const providerId = req.user.id;

  try {
    const task = await query.get('SELECT customer_id, status, expires_at FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'published') {
      return res.status(400).json({ error: 'Task is no longer accepting applications' });
    }

    if (new Date(task.expires_at.replace(' ', 'T') + 'Z') < new Date()) {
      return res.status(400).json({ error: 'Task has expired' });
    }

    const interestId = Math.random().toString(36).substring(2);
    await query.run(
      'INSERT INTO task_interest (id, task_id, provider_id, status) VALUES (?, ?, ?, ?)',
      [interestId, taskId, providerId, 'pending']
    );

    // Get count of interested providers
    const countRow = await query.get('SELECT COUNT(*) as cnt FROM task_interest WHERE task_id = ?', [taskId]);
    const interestedCount = countRow.cnt;

    // Notify customer via WebSocket
    notifyCustomerOfInterest(task.customer_id, taskId, interestedCount);

    res.json({ success: true, status: 'pending', interested_count: interestedCount });
  } catch (err) {
    console.error('Interest declaration failed:', err);
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Already expressed interest in this task' });
    }
    res.status(500).json({ error: 'Database transaction error' });
  }
});

// View interested providers (Customers check applicants)
app.get('/api/tasks/:id/interests', authenticateToken, async (req, res) => {
  const taskId = req.params.id;

  try {
    const task = await query.get('SELECT customer_id FROM tasks WHERE id = ?', [taskId]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (task.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const interests = await query.all(
      `SELECT ti.status, u.id as provider_id, u.name, u.phone, p.rating_avg, p.jobs_completed, p.response_time_mins 
       FROM task_interest ti
       JOIN users u ON ti.provider_id = u.id
       JOIN providers p ON u.id = p.user_id
       WHERE ti.task_id = ?`,
      [taskId]
    );

    res.json(interests);
  } catch (err) {
    console.error('Fetch interests failed:', err);
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// Select a provider (Customers match)
app.post('/api/tasks/:id/select', authenticateToken, async (req, res) => {
  const taskId = req.params.id;
  const { provider_id } = req.body;

  if (!provider_id) {
    return res.status(400).json({ error: 'Missing provider selection' });
  }

  try {
    const task = await query.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (task.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (task.status !== 'published') {
      return res.status(400).json({ error: 'Task is already matched or completed' });
    }

    // Begin match transaction: Update task status, update interest statuses, create chat
    await query.run("UPDATE tasks SET status = 'wip' WHERE id = ?", [taskId]);
    
    await query.run(
      "UPDATE task_interest SET status = 'accepted' WHERE task_id = ? AND provider_id = ?",
      [taskId, provider_id]
    );
    await query.run(
      "UPDATE task_interest SET status = 'declined' WHERE task_id = ? AND provider_id != ?",
      [taskId, provider_id]
    );

    const chatId = Math.random().toString(36).substring(2);
    await query.run(
      'INSERT INTO chats (id, task_id, customer_id, provider_id) VALUES (?, ?, ?, ?)',
      [chatId, taskId, req.user.id, provider_id]
    );

    // Notify selected provider via WebSocket
    notifyProviderOfSelection(provider_id, taskId, chatId);

    res.json({ success: true, chat_id: chatId });
  } catch (err) {
    console.error('Selection match error:', err);
    res.status(500).json({ error: 'Transaction matching failed' });
  }
});

// -------------------------------------------------------------
// Chats & Reviews Endpoints
// -------------------------------------------------------------

app.get('/api/chats/:id/messages', authenticateToken, async (req, res) => {
  const chatId = req.params.id;

  try {
    const chat = await query.get(
      'SELECT * FROM chats WHERE id = ? AND (customer_id = ? OR provider_id = ?)',
      [chatId, req.user.id, req.user.id]
    );

    if (!chat) return res.status(403).json({ error: 'Access denied or chat room not found' });

    const messages = await query.all(
      'SELECT sender_id, text, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
      [chatId]
    );

    res.json(messages);
  } catch (err) {
    console.error('Fetch chat messages failed:', err);
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

app.post('/api/tasks/:id/review', authenticateToken, async (req, res) => {
  const taskId = req.params.id;
  const { rating, comment, arrived, completed, hire_again } = req.body;

  if (rating === undefined || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Invalid rating. Must be between 1 and 5.' });
  }

  try {
    const chat = await query.get('SELECT * FROM chats WHERE task_id = ?', [taskId]);
    if (!chat) return res.status(404).json({ error: 'Active task matching chat not found' });

    if (chat.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Only customers can review providers' });
    }

    // Verify task is WIP
    const task = await query.get('SELECT status FROM tasks WHERE id = ?', [taskId]);
    if (task.status !== 'wip') {
      return res.status(400).json({ error: 'Task is not in a reviewable state' });
    }

    const reviewId = Math.random().toString(36).substring(2);
    
    // Save review
    await query.run(
      'INSERT INTO reviews (id, task_id, reviewer_id, reviewee_id, rating, comment, arrived, completed, hire_again) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        reviewId,
        taskId,
        req.user.id,
        chat.provider_id,
        rating,
        comment || '',
        arrived === false ? 0 : 1,
        completed === false ? 0 : 1,
        hire_again === false ? 0 : 1
      ]
    );

    // Complete task status
    await query.run("UPDATE tasks SET status = 'completed' WHERE id = ?", [taskId]);

    // Recalculate provider reviews stats
    const stats = await query.get(
      'SELECT COUNT(*) as jobs, AVG(rating) as avg_rating FROM reviews WHERE reviewee_id = ?',
      [chat.provider_id]
    );

    await query.run(
      'UPDATE providers SET jobs_completed = ?, rating_avg = ? WHERE user_id = ?',
      [stats.jobs, parseFloat(stats.avg_rating.toFixed(2)), chat.provider_id]
    );

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Post review failed:', err);
    res.status(500).json({ error: 'Database transaction error' });
  }
});

// Helper coordinate distance
function getDistanceKM(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// -------------------------------------------------------------
// Provider Profiles & Active Searches
// -------------------------------------------------------------

app.get('/api/providers/nearby', async (req, res) => {
  const { lat, lon, category, radius_km } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing coordinates parameter' });
  }

  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);
  const searchRad = radius_km ? parseFloat(radius_km) : 10;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  // Bounding-box pre-filter so we don't scan every available provider in JS.
  // Uses idx_providers_status_coords (is_available, lat, lon). See docs/Architecture.md.
  const latOffset = searchRad / 111;
  const lonOffset = searchRad / (111 * Math.cos(userLat * Math.PI / 180));
  const minLat = userLat - latOffset;
  const maxLat = userLat + latOffset;
  const minLon = userLon - lonOffset;
  const maxLon = userLon + lonOffset;

  try {
    const providers = await query.all(
      `SELECT p.*, u.name, u.avatar_url, u.bio, u.languages
       FROM providers p
       JOIN users u ON p.user_id = u.id
       WHERE p.is_available = 1
         AND p.lat BETWEEN ? AND ?
         AND p.lon BETWEEN ? AND ?`,
      [minLat, maxLat, minLon, maxLon]
    );

    const results = providers
      .map(p => {
        const dist = getDistanceKM(userLat, userLon, p.lat, p.lon);
        const services = JSON.parse(p.services);
        return {
          id: p.user_id,
          name: p.name,
          avatar_url: p.avatar_url,
          bio: p.bio,
          languages: p.languages,
          distance_km: parseFloat(dist.toFixed(2)),
          services,
          rating_avg: p.rating_avg,
          jobs_completed: p.jobs_completed,
          response_time_mins: p.response_time_mins,
          verification_status: p.verification_status
        };
      })
      .filter(p => {
        const inRadius = p.distance_km <= searchRad;
        const matchesCategory = category ? p.services.includes(category) : true;
        return inRadius && matchesCategory;
      })
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(offset, offset + limit);

    res.json(results);
  } catch (err) {
    console.error('Fetch nearby providers failed:', err);
    res.status(500).json({ error: 'Database transaction error' });
  }
});

// Single Provider Profile Detail
app.get('/api/providers/:id', async (req, res) => {
  const providerId = req.params.id;

  try {
    const profile = await query.get(
      `SELECT p.*, u.name, u.avatar_url, u.bio, u.languages, u.phone 
       FROM providers p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = ?`,
      [providerId]
    );

    if (!profile) return res.status(404).json({ error: 'Provider not found' });

    const authenticated = !!req.cookies.token;
    
    // Mask phone number for guest browsers
    const result = {
      id: profile.user_id,
      name: profile.name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      languages: profile.languages,
      services: JSON.parse(profile.services),
      rating_avg: profile.rating_avg,
      jobs_completed: profile.jobs_completed,
      response_time_mins: profile.response_time_mins,
      verification_status: profile.verification_status,
      phone: authenticated ? profile.phone : 'Hidden (Login required)'
    };

    res.json(result);
  } catch (err) {
    console.error('Fetch provider profile failed:', err);
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// User tasks endpoint (Home lists)
app.get('/api/my-tasks', authenticateToken, async (req, res) => {
  try {
    let tasks;
    if (req.user.role === 'customer') {
      tasks = await query.all(
        `SELECT t.*, c.id as chat_id 
         FROM tasks t 
         LEFT JOIN chats c ON t.id = c.task_id 
         WHERE t.customer_id = ? 
         ORDER BY t.created_at DESC`,
        [req.user.id]
      );
    } else {
      // Return jobs where this provider expressed interest or was accepted
      tasks = await query.all(
        `SELECT t.*, ti.status as interest_status, c.id as chat_id 
         FROM tasks t
         JOIN task_interest ti ON t.id = ti.task_id
         LEFT JOIN chats c ON t.id = c.task_id
         WHERE ti.provider_id = ?
         ORDER BY t.created_at DESC`,
        [req.user.id]
      );
    }
    res.json(tasks);
  } catch (err) {
    console.error('Fetch my tasks failed:', err);
    res.status(500).json({ error: 'Database transaction error' });
  }
});

// Periodic Job: Task Expiration Scheduler
setInterval(async () => {
  try {
    const expired = await query.all(
      "SELECT id FROM tasks WHERE status = 'published' AND expires_at < CURRENT_TIMESTAMP"
    );
    if (expired.length > 0) {
      const ids = expired.map(e => e.id);
      const placeholders = ids.map(() => '?').join(',');
      await query.run(
        `UPDATE tasks SET status = 'expired' WHERE id IN (${placeholders})`,
        ids
      );
      console.log(`Expired ${expired.length} open tasks. IDs:`, ids);
    }

    // Expire public posts too.
    const postRes = await query.run(
      "UPDATE posts SET status = 'expired' WHERE status = 'active' AND expires_at < CURRENT_TIMESTAMP"
    );
    if (postRes.changes > 0) console.log(`Expired ${postRes.changes} public posts.`);
  } catch (err) {
    console.error('Failed to expire tasks/posts:', err);
  }
}, 30000);

// Initialize Websockets and start listening
initializeWebSocketServer(server);

// Seed Mock Data
seedMockData();

// Serve compiled index.html for React Router fallbacks in production
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`Wakishua Server boot-up on HTTP port ${PORT}`);
});
