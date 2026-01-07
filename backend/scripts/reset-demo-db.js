/**
 * DEMO DATABASE RESET SCRIPT
 *
 * Purpose: Clear all demo data from database while preserving schema
 * Use: Weekly/monthly maintenance for public demo on Render.com
 *
 * CAUTION: This script DELETES ALL DATA. Only use on demo environments!
 */

require('dotenv').config();
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Reset demo database by truncating all tables
 */
async function resetDemoDatabase() {
  console.log('🔄 STARTING DEMO DATABASE RESET...\n');

  // Safety check: Confirm environment
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
    console.error('❌ ERROR: This script should only run in production demo environment');
    console.error('   Set NODE_ENV=production to proceed');
    process.exit(1);
  }

  // Safety check: Require explicit confirmation
  const args = process.argv.slice(2);
  if (!args.includes('--confirm')) {
    console.error('❌ SAFETY CHECK REQUIRED');
    console.error('   This script will DELETE ALL DATA from the database.');
    console.error('   To proceed, run: node reset-demo-db.js --confirm');
    process.exit(1);
  }

  try {
    // Connect to database
    const client = await pool.connect();
    console.log('✅ DATABASE CONNECTION SUCCESSFUL\n');

    // Get table counts before reset
    console.log('📊 CURRENT DATABASE STATE:');
    const beforeCounts = await getTableCounts(client);
    displayTableCounts(beforeCounts);

    // Confirm reset with user (if running interactively)
    if (!args.includes('--force')) {
      console.log('\n⚠️  WARNING: YOU ARE ABOUT TO DELETE ALL DATA');
      console.log('   Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
      await sleep(5000);
    }

    // Execute reset
    console.log('🗑️  TRUNCATING TABLES...\n');

    await client.query('BEGIN');

    // Truncate tables in correct order (respecting foreign key constraints)
    const truncateQuery = `
      TRUNCATE TABLE
        work_sessions,
        payments,
        payment_channels,
        employees,
        organizations,
        sessions,
        users,
        notifications,
        worker_notifications,
        profile_deletion_requests,
        worker_activity,
        ngo_activity
      RESTART IDENTITY CASCADE;
    `;

    await client.query(truncateQuery);
    await client.query('COMMIT');

    console.log('✅ ALL TABLES TRUNCATED\n');

    // Get table counts after reset
    console.log('📊 DATABASE STATE AFTER RESET:');
    const afterCounts = await getTableCounts(client);
    displayTableCounts(afterCounts);

    // Calculate statistics
    const totalRecordsCleared = Object.values(beforeCounts).reduce((sum, count) => sum + count, 0);
    console.log(`\n✅ DEMO DATABASE RESET COMPLETE`);
    console.log(`   📋 Total records cleared: ${totalRecordsCleared}`);
    console.log(`   🗂️  Schema preserved: All tables intact`);
    console.log(`   🔄 Identity sequences reset to 1\n`);

    client.release();
    pool.end();

  } catch (error) {
    console.error('\n❌ ERROR DURING DATABASE RESET:');
    console.error(error.message);
    console.error('\nStack trace:', error.stack);
    pool.end();
    process.exit(1);
  }
}

/**
 * Get row counts for all tables
 */
async function getTableCounts(client) {
  const tables = [
    'users',
    'sessions',
    'organizations',
    'employees',
    'payment_channels',
    'work_sessions',
    'payments',
    'notifications',
    'worker_notifications',
    'profile_deletion_requests',
    'worker_activity',
    'ngo_activity'
  ];

  const counts = {};

  for (const table of tables) {
    try {
      const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      counts[table] = parseInt(result.rows[0].count);
    } catch (error) {
      counts[table] = 0; // Table might not exist
    }
  }

  return counts;
}

/**
 * Display table counts in formatted output
 */
function displayTableCounts(counts) {
  const tableNames = Object.keys(counts);
  const maxLength = Math.max(...tableNames.map(name => name.length));

  for (const [table, count] of Object.entries(counts)) {
    const padding = ' '.repeat(maxLength - table.length);
    console.log(`   ${table}${padding}: ${count.toLocaleString()} records`);
  }
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run reset
resetDemoDatabase();
