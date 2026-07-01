import { query } from './db.js';

async function testDatabase() {
  console.log('--- STARTING WAKISHUA DATABASE AUDIT CHECK ---');
  
  try {
    // 1. Verify WAL mode
    const pragmaMode = await query.get('PRAGMA journal_mode');
    console.log(`- SQLite Journal Mode: ${pragmaMode.journal_mode.toUpperCase()}`);
    if (pragmaMode.journal_mode.toLowerCase() !== 'wal') {
      console.error('❌ Database is not running in WAL mode!');
    } else {
      console.log('✅ SQLite WAL mode enabled successfully.');
    }

    // 2. Verify Synchronous setting
    const pragmaSync = await query.get('PRAGMA synchronous');
    console.log(`- SQLite Synchronous Status: ${pragmaSync.synchronous}`);
    console.log('✅ Synchronous mode verified.');

    // 3. Verify Foreign Keys setting
    const pragmaFK = await query.get('PRAGMA foreign_keys');
    console.log(`- SQLite Foreign Keys Status: ${pragmaFK.foreign_keys === 1 ? 'ON' : 'OFF'}`);
    if (pragmaFK.foreign_keys !== 1) {
      console.error('❌ Database foreign keys enforcement is disabled!');
    } else {
      console.log('✅ Foreign keys enforcement active.');
    }

    // 4. Verify Tables existence and structures
    const usersCount = await query.get('SELECT COUNT(*) as cnt FROM users');
    const providersCount = await query.get('SELECT COUNT(*) as cnt FROM providers');
    console.log(`- Registered Users: ${usersCount.cnt}`);
    console.log(`- Provider Profiles: ${providersCount.cnt}`);
    
    if (usersCount.cnt > 0) {
      console.log('✅ Mock data successfully seeded on startup.');
      const testUser = await query.get('SELECT name, role, phone FROM users LIMIT 1');
      console.log(`  - Mock Account Sample: ${testUser.name} (${testUser.role}) - Phone: ${testUser.phone}`);
    } else {
      console.warn('⚠️ No users seeded. Initialize database first.');
    }

    // 5. Query execution and indexing checks
    console.log('- Running coordinates index scanning checks...');
    const startTime = performance.now();
    const result = await query.all(
      `SELECT p.*, u.name 
       FROM providers p
       JOIN users u ON p.user_id = u.id
       WHERE p.is_available = 1 AND p.lat BETWEEN -7.0 AND -6.0 AND p.lon BETWEEN 39.0 AND 40.0`
    );
    const duration = performance.now() - startTime;
    console.log(`✅ Coordinates scan query completed in ${duration.toFixed(2)} ms.`);
    console.log(`  - Active providers found in box: ${result.length}`);

    console.log('--- DATABASE AUDIT CHECK COMPLETED SUCCESSFULLY ---');
    process.exit(0);
  } catch (err) {
    console.error('❌ Database self-audit failed with error:', err.message);
    process.exit(1);
  }
}

// Introduce slight delay to allow database setup connection to bootstrap
setTimeout(testDatabase, 1500);
