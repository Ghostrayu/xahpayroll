#!/usr/bin/env node

/**
 * Cron Runner: Claim Expired Payment Channels
 *
 * This script is designed to be run by system cron to claim
 * payment channels that have passed their expiration time.
 *
 * Recommended cron schedule: Every hour
 * Example crontab entry:
 * 0 * * * * cd /path/to/xahaupayroll/backend && node jobs/runClaimExpiredChannels.js >> logs/claim-expired-channels.log 2>&1
 */

require('dotenv').config();
const { claimExpiredChannels } = require('./claimExpiredChannels');

// Ensure required environment variables are set
if (!process.env.NGO_WALLET_SEED) {
  console.error('ERROR: NGO_WALLET_SEED environment variable not set');
  console.error('This job requires NGO wallet credentials to claim expired channels');
  process.exit(1);
}

// Run the job
claimExpiredChannels()
  .then(result => {
    console.log('✅ Claim expired channels job completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Claim expired channels job failed:', error.message);
    process.exit(1);
  });
