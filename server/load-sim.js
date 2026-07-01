// Concurrency load simulation for Wakishua.
//
// Spawns N online providers + M customers over real WebSocket connections in one
// process, then dispatches a batch of tasks and measures real-time alert fan-out
// (count delivered + latency). This exercises the part that actually has to scale:
// holding thousands of sockets and routing geo-targeted alerts.
//
// Usage:  node server/load-sim.js [providers] [customers] [tasks]
//   e.g.  node server/load-sim.js 2500 2500 200
// Defaults are conservative for laptops; bump them to probe ~5000 users.

import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { sendTaskAlertToNearbyProviders } from './websocket.js';

const PROVIDERS = parseInt(process.argv[2]) || 1000;
const CUSTOMERS = parseInt(process.argv[3]) || 1000;
const TASKS = parseInt(process.argv[4]) || 100;

const PORT = process.env.PORT = '3006';
const SECRET = process.env.JWT_SECRET = 'load-sim-secret';
const BASE = { lat: -6.7924, lon: 39.2083 }; // Dar es Salaam
const CATEGORIES = ['cleaning', 'cooking', 'groceries', 'repairs', 'mechanic'];

const sign = (id, role) => jwt.sign({ id, role, name: id }, SECRET, { expiresIn: '1h' });
const jitter = (v, amt = 0.05) => v + (Math.random() - 0.5) * amt;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedUser(id, role, services) {
  await query.run(
    'INSERT OR IGNORE INTO users (id, name, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [id, id, `sim-${id}`, 'x', role]
  );
  if (role === 'provider') {
    await query.run(
      'INSERT OR IGNORE INTO providers (user_id, service_radius, services, is_available, lat, lon) VALUES (?, ?, ?, 0, ?, ?)',
      [id, 15, JSON.stringify(services), jitter(BASE.lat), jitter(BASE.lon)]
    );
  }
}

function connect(id, role) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { cookie: `token=${sign(id, role)}` } });
    ws.on('open', () => resolve(ws));
    ws.on('error', () => resolve(null));
  });
}

async function main() {
  console.log(`\n--- Wakishua load-sim: ${PROVIDERS} providers, ${CUSTOMERS} customers, ${TASKS} tasks ---`);

  // Boot the server in-process so WS connections register in the same maps.
  await import('./server.js');
  await sleep(1500);

  console.log('Seeding users…');
  const provIds = Array.from({ length: PROVIDERS }, (_, i) => `lp-${i}`);
  const custIds = Array.from({ length: CUSTOMERS }, (_, i) => `lc-${i}`);
  // bcrypt one throwaway hash is enough — we sign JWTs directly, no login needed.
  await bcrypt.hash('x', 4).catch(() => {});
  for (const id of provIds) await seedUser(id, 'provider', [CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]]);
  for (const id of custIds) await seedUser(id, 'customer');

  console.log('Opening provider sockets + going online…');
  let alerts = 0;
  let firstAlertAt = null;
  const t0 = Date.now();
  const provSockets = [];
  for (const id of provIds) {
    const ws = await connect(id, 'provider');
    if (!ws) continue;
    ws.on('message', (m) => {
      const d = JSON.parse(m);
      if (d.type === 'new_task_alert') {
        alerts++;
        if (!firstAlertAt) firstAlertAt = Date.now();
      }
    });
    ws.send(JSON.stringify({ type: 'location_update', lat: jitter(BASE.lat), lon: jitter(BASE.lon), is_available: 1 }));
    provSockets.push(ws);
  }
  console.log(`  ${provSockets.length} provider sockets online in ${Date.now() - t0}ms`);

  console.log('Opening customer sockets…');
  const custSockets = [];
  for (const id of custIds) {
    const ws = await connect(id, 'customer');
    if (ws) custSockets.push(ws);
  }
  console.log(`  ${custSockets.length} customer sockets connected`);

  await sleep(500);

  console.log(`Dispatching ${TASKS} task alerts…`);
  const dStart = Date.now();
  for (let i = 0; i < TASKS; i++) {
    sendTaskAlertToNearbyProviders({
      id: `lt-${i}`,
      category: CATEGORIES[i % CATEGORIES.length],
      lat: jitter(BASE.lat),
      lon: jitter(BASE.lon),
      budget_amount: 30000,
      details: 'load-sim task'
    });
  }
  const dispatchMs = Date.now() - dStart;

  await sleep(2500);

  console.log('\n=== RESULTS ===');
  console.log(`Concurrent WS sockets : ${provSockets.length + custSockets.length}`);
  console.log(`Tasks dispatched      : ${TASKS}`);
  console.log(`Alerts delivered      : ${alerts}`);
  console.log(`Dispatch loop time    : ${dispatchMs}ms (${(TASKS / (dispatchMs / 1000)).toFixed(0)} tasks/s)`);
  console.log(`First alert latency   : ${firstAlertAt ? firstAlertAt - dStart : 'n/a'}ms`);
  console.log('================\n');

  provSockets.forEach((ws) => ws.close());
  custSockets.forEach((ws) => ws.close());

  // Clean up sim rows.
  await query.run("DELETE FROM providers WHERE user_id LIKE 'lp-%'");
  await query.run("DELETE FROM users WHERE id LIKE 'lp-%' OR id LIKE 'lc-%'");
  process.exit(0);
}

main().catch((err) => {
  console.error('Load-sim failed:', err);
  process.exit(1);
});
