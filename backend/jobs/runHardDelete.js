#!/usr/bin/env node
/**
 * Standalone Hard Delete Job Runner
 *
 * Designed to run as a true cron job, independent of the backend server.
 *
 * Usage:
 *   node jobs/runHardDelete.js
 *
 * Crontab entry (runs every hour):
 *   0 * * * * cd /path/to/backend && node jobs/runHardDelete.js >> logs/hard-delete.log 2>&1
 *
 * Features:
 * - Independent execution (doesn't require server to be running)
 * - Comprehensive logging with timestamps
 * - Graceful error handling and exit codes
 * - Database connection cleanup
 * - Production-ready with monitoring support
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { processHardDeletes } = require('./hardDelete');
const { pool, query } = require('../database/db');

/**
 * Main execution function
 */
async function main() {
  const startTime = new Date();
  console.log('========================================');
  console.log(`[CRON] Hard Delete Job Started`);
  console.log(`[CRON] Timestamp: ${startTime.toISOString()}`);
  console.log(`[CRON] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');

  try {
    // Test database connection
    console.log('[CRON] Testing database connection...');
    await query('SELECT NOW()');
    console.log('[CRON] ✅ Database connection successful');

    // Execute hard delete process
    console.log('[CRON] Starting hard delete process...');
    const results = await processHardDeletes();

    // Report results
    const endTime = new Date();
    const duration = endTime - startTime;

    console.log('========================================');
    console.log('[CRON] Hard Delete Job Completed');
    console.log(`[CRON] Duration: ${duration}ms`);
    console.log(`[CRON] Results:`);
    console.log(`[CRON]   - Successful deletions: ${results.success}`);
    console.log(`[CRON]   - Failed deletions: ${results.failed}`);

    if (results.errors.length > 0) {
      console.log(`[CRON]   - Errors:`);
      results.errors.forEach(error => {
        console.log(`[CRON]     * ${error.wallet_address}: ${error.error}`);
      });
    }

    console.log(`[CRON] Finished: ${endTime.toISOString()}`);
    console.log('========================================');

    // Exit with appropriate code
    if (results.failed > 0) {
      console.error('[CRON] ⚠️  Job completed with errors');
      await cleanup();
      process.exit(1);
    } else {
      console.log('[CRON] ✅ Job completed successfully');
      await cleanup();
      process.exit(0);
    }

  } catch (error) {
    console.error('========================================');
    console.error('[CRON] ❌ FATAL ERROR');
    console.error(`[CRON] Error: ${error.message}`);
    console.error(`[CRON] Stack: ${error.stack}`);
    console.error('========================================');

    await cleanup();
    process.exit(1);
  }
}

/**
 * Cleanup database connections
 */
async function cleanup() {
  try {
    console.log('[CRON] Cleaning up database connections...');
    await pool.end();
    console.log('[CRON] ✅ Cleanup complete');
  } catch (error) {
    console.error('[CRON] ⚠️  Cleanup error:', error.message);
  }
}

/**
 * Handle process signals
 */
process.on('SIGTERM', async () => {
  console.log('[CRON] Received SIGTERM signal');
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[CRON] Received SIGINT signal');
  await cleanup();
  process.exit(0);
});

// Execute main function
main();
