/**
 * Claim Expired Payment Channels Job
 *
 * This job processes payment channels in 'closing' status that have passed
 * their expiration_time. On XRPL, channels with Expiration set don't
 * automatically close - they must be claimed after expiration.
 *
 * Schedule: Every hour via cron
 * Command: node backend/jobs/runClaimExpiredChannels.js
 */

const { Client } = require('xrpl');
const { query } = require('../database/db');

/**
 * Convert Ripple epoch timestamp to Unix timestamp
 * Ripple epoch: 946684800 seconds since Unix epoch (2000-01-01 00:00:00 UTC)
 */
function rippleToUnixTime(rippleTime) {
  const RIPPLE_EPOCH = 946684800;
  return (rippleTime + RIPPLE_EPOCH) * 1000; // Convert to milliseconds
}

/**
 * Main job execution function
 */
async function claimExpiredChannels() {
  const client = new Client(
    process.env.XRPL_NETWORK === 'mainnet'
      ? 'wss://xahau.network'
      : 'wss://xahau-test.net'
  );

  console.log('\n=== CLAIM EXPIRED CHANNELS JOB STARTED ===');
  console.log('Time:', new Date().toISOString());
  console.log('Network:', process.env.XRPL_NETWORK || 'testnet');

  try {
    // ============================================
    // STEP 1: FIND EXPIRED CHANNELS IN DATABASE
    // ============================================
    const expiredChannelsResult = await query(
      `SELECT
        channel_id,
        escrow_wallet_address,
        employee_wallet_address,
        expiration_time,
        off_chain_accumulated_balance,
        closure_tx_hash
      FROM payment_channels
      WHERE status = 'closing'
        AND expiration_time IS NOT NULL
        AND expiration_time < NOW()
      ORDER BY expiration_time ASC`,
      []
    );

    if (expiredChannelsResult.rows.length === 0) {
      console.log('✅ No expired channels found.');
      return { processed: 0, claimed: 0, errors: 0 };
    }

    console.log(`\n📋 Found ${expiredChannelsResult.rows.length} expired channel(s) to process:`);
    expiredChannelsResult.rows.forEach((ch, idx) => {
      console.log(`  ${idx + 1}. Channel: ${ch.channel_id}`);
      console.log(`     Expired: ${ch.expiration_time}`);
      console.log(`     Balance: ${ch.off_chain_accumulated_balance || 0} XAH`);
    });

    // ============================================
    // STEP 2: CONNECT TO XAHAU
    // ============================================
    await client.connect();
    console.log('\n🔗 Connected to Xahau ledger');

    let claimed = 0;
    let errors = 0;

    // ============================================
    // STEP 3: PROCESS EACH EXPIRED CHANNEL
    // ============================================
    for (const channel of expiredChannelsResult.rows) {
      console.log(`\n--- Processing: ${channel.channel_id} ---`);

      try {
        // Verify channel still exists on ledger
        const accountChannelsResponse = await client.request({
          command: 'account_channels',
          account: channel.escrow_wallet_address
        });

        const ledgerChannel = accountChannelsResponse.result.channels?.find(
          ch => ch.channel_id === channel.channel_id
        );

        if (!ledgerChannel) {
          console.log('⚠️  Channel already removed from ledger (external closure)');
          console.log('   Updating database to closed status...');

          // Update database to reflect ledger state
          await query(
            `UPDATE payment_channels
             SET
               status = 'closed',
               closed_at = NOW(),
               off_chain_accumulated_balance = 0,
               last_ledger_sync = NOW(),
               updated_at = NOW()
             WHERE channel_id = $1`,
            [channel.channel_id]
          );

          console.log('✅ Database updated to match ledger state');
          claimed++;
          continue;
        }

        console.log('✓ Channel exists on ledger - proceeding with claim');

        // Check if expiration has actually passed on ledger
        const now = Date.now();
        const channelExpirationMs = rippleToUnixTime(ledgerChannel.expiration);
        const hoursExpired = Math.floor((now - channelExpirationMs) / 1000 / 3600);

        console.log(`  Expiration: ${new Date(channelExpirationMs).toISOString()}`);
        console.log(`  Expired: ${hoursExpired} hours ago`);

        if (channelExpirationMs > now) {
          console.log('⚠️  Channel not yet expired on ledger (clock skew?)');
          console.log('   Skipping for now...');
          continue;
        }

        // ============================================
        // STEP 4: SUBMIT FINAL CLAIM TRANSACTION
        // ============================================
        console.log('📤 Submitting final PaymentChannelClaim...');

        // IMPORTANT: Use NGO wallet credentials from environment
        // In production, this should use a secure wallet management system
        const ngoWallet = client.wallet.fromSeed(process.env.NGO_WALLET_SEED);

        const claimTx = {
          TransactionType: 'PaymentChannelClaim',
          Account: channel.escrow_wallet_address,
          Channel: channel.channel_id,
          Flags: 0x00020000, // tfClose flag
          // Do NOT include Balance field - we're just finalizing the scheduled closure
        };

        const prepared = await client.autofill(claimTx);
        const signed = ngoWallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        console.log('Transaction Result:', result.result.meta.TransactionResult);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
          console.log('✅ Channel successfully closed on ledger');
          console.log('   Transaction Hash:', result.result.hash);

          // Update database
          await query(
            `UPDATE payment_channels
             SET
               status = 'closed',
               closed_at = NOW(),
               closure_tx_hash = $1,
               off_chain_accumulated_balance = 0,
               last_ledger_sync = NOW(),
               updated_at = NOW()
             WHERE channel_id = $2`,
            [result.result.hash, channel.channel_id]
          );

          console.log('✅ Database updated to closed status');
          claimed++;
        } else {
          console.error('❌ Transaction failed:', result.result.meta.TransactionResult);
          errors++;
        }

      } catch (error) {
        console.error('❌ Error processing channel:', error.message);
        errors++;
      }
    }

    // ============================================
    // STEP 5: SUMMARY
    // ============================================
    console.log('\n=== JOB SUMMARY ===');
    console.log(`Total Processed: ${expiredChannelsResult.rows.length}`);
    console.log(`Successfully Claimed: ${claimed}`);
    console.log(`Errors: ${errors}`);
    console.log('Completed:', new Date().toISOString());

    return {
      processed: expiredChannelsResult.rows.length,
      claimed,
      errors
    };

  } catch (error) {
    console.error('❌ JOB FAILED:', error.message);
    throw error;
  } finally {
    if (client.isConnected()) {
      await client.disconnect();
      console.log('🔌 Disconnected from Xahau ledger\n');
    }
  }
}

// Export for use in cron runner
module.exports = { claimExpiredChannels };

// Allow direct execution for testing
if (require.main === module) {
  claimExpiredChannels()
    .then(result => {
      console.log('\n✅ Job completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Job failed:', error);
      process.exit(1);
    });
}
