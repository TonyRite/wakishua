import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../database.sqlite');

// Open the SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDb();
  }
});

// Configure WAL mode and performance options
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA synchronous = NORMAL;');
  db.run('PRAGMA foreign_keys = ON;');
  db.run('PRAGMA busy_timeout = 5000;');
});

function initializeDb() {
  db.serialize(() => {
    // 1. Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('customer', 'provider', 'admin')),
        avatar_url TEXT,
        bio TEXT,
        languages TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);

    // 2. Providers table
    db.run(`
      CREATE TABLE IF NOT EXISTS providers (
        user_id TEXT PRIMARY KEY,
        service_radius INTEGER NOT NULL,
        services TEXT NOT NULL, -- JSON array string
        is_available INTEGER DEFAULT 0 CHECK(is_available IN (0, 1)),
        lat REAL,
        lon REAL,
        response_time_mins INTEGER DEFAULT 5,
        verification_status TEXT DEFAULT 'unverified' CHECK(verification_status IN ('unverified', 'pending', 'verified')),
        rating_avg REAL DEFAULT 5.0,
        jobs_completed INTEGER DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_providers_status_coords ON providers(is_available, lat, lon)`);

    // 3. Tasks table
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'published', 'wip', 'completed', 'expired', 'archived')),
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        details TEXT,
        budget_type TEXT NOT NULL CHECK(budget_type IN ('flexible', 'fixed')),
        budget_amount REAL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status_coords ON tasks(status, lat, lon)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id)`);

    // 4. Task Interest table
    db.run(`
      CREATE TABLE IF NOT EXISTS task_interest (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(provider_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(task_id, provider_id)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_interest_task ON task_interest(task_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_interest_provider ON task_interest(provider_id)`);

    // 5. Chats table
    db.run(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(provider_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 6. Messages table
    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at)`);

    // 7. Reviews table
    db.run(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        reviewer_id TEXT NOT NULL,
        reviewee_id TEXT NOT NULL,
        rating INTEGER CHECK(rating BETWEEN 1 AND 5),
        comment TEXT,
        arrived INTEGER DEFAULT 1 CHECK(arrived IN (0, 1)),
        completed INTEGER DEFAULT 1 CHECK(completed IN (0, 1)),
        hire_again INTEGER DEFAULT 1 CHECK(hire_again IN (0, 1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(reviewee_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 8. Audit Logs table
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // 9. Public posts (no-auth MVP): a request ("I need help") or an offer
    //    ("I can help"), with contact details and location shown directly.
    db.run(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        post_type TEXT NOT NULL CHECK(post_type IN ('request', 'offer')),
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
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired')),
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_posts_status_coords ON posts(status, lat, lon)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at)`);

    console.log('Database schemas initialized successfully.');
    migrate();
  });
}

// Idempotent migrations. SQLite lacks "ADD COLUMN IF NOT EXISTS", so we inspect
// the table and only add missing columns. Safe to run on every boot.
function migrate() {
  ensureColumn('tasks', 'location_name', 'TEXT');
  ensureColumn('tasks', 'address', 'TEXT');
}

function ensureColumn(table, column, type) {
  db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
    if (err) {
      console.error(`Migration check failed for ${table}.${column}:`, err.message);
      return;
    }
    const exists = rows.some((r) => r.name === column);
    if (!exists) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (alterErr) => {
        if (alterErr) console.error(`Failed to add ${table}.${column}:`, alterErr.message);
        else console.log(`Migration: added column ${table}.${column}`);
      });
    }
  });
}

// Promisified DB helpers
export const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

export default db;
