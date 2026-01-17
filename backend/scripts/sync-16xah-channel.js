#!/usr/bin/env node

/**
 * Sync 16 XAH Orphaned Payment Channel
 *
 * Channel Details (from ledger):
 * - Channel ID: 48EB0AEF1D38FB087C7713083D8AA2EACFA1062B7165CE7361A3E281A66FC935
 * - Amount: 16 XAH
 * - Destination: rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS (DONALD TRUMP)
 * - Source: ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW (GOOD MONEY COLLECTIVE)
 * - Settle Delay: 3600 seconds
 *
 * This channel was created BEFORE the website/description column fix
 */

const { Pool } = require('pg');
const { Client } = require('xrpl');

// Database configuration
// IMPORTANT: Set DATABASE_URL environment variable with production connection string
// Format: postgresql://username:password@host:port/database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.your_user:your_password@your-host.pooler.supabase.com:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function syncChannel() {
  const dbClient = await pool.connect();
  const xrplClient = new Client('wss://xahau.network');

  try {
    console.log('🔌 Connecting to Xahau mainnet...');
    await xrplClient.connect();

    // Query ledger for channel details
    console.log('🔍 Querying ledger for channel details...');
    const channelsResponse = await xrplClient.request({
      command: 'account_channels',
      account: 'ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW',
      ledger_index: 'validated'
    });

    const targetChannel = channelsResponse.result.channels?.find(
      ch => ch.channel_id === '48EB0AEF1D38FB087C7713083D8AA2EACFA1062B7165CE7361A3E281A66FC935'
    );

    if (!targetChannel) {
      throw new Error('Channel 48EB0AEF... not found on ledger');
    }

    console.log('✅ Channel found on ledger:');
    console.log(`   Channel ID: ${targetChannel.channel_id}`);
    console.log(`   Amount: ${parseInt(targetChannel.amount) / 1000000} XAH`);
    console.log(`   Balance: ${parseInt(targetChannel.balance || '0') / 1000000} XAH`);
    console.log(`   Settle Delay: ${targetChannel.settle_delay} seconds`);
    console.log(`   Public Key: ${targetChannel.public_key}`);

    await xrplClient.disconnect();
    console.log('🔌 Disconnected from Xahau');

    // Connect to database
    console.log('\n🔌 Connected to production database');

    const organizationWallet = 'ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW';
    const workerWallet = 'rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS';
    const realChannelId = '48EB0AEF1D38FB087C7713083D8AA2EACFA1062B7165CE7361A3E281A66FC935';

    // Get organization ID
    console.log('\n🔍 Looking up organization...');
    const orgResult = await dbClient.query(
      'SELECT id, organization_name FROM organizations WHERE escrow_wallet_address = $1',
      [organizationWallet]
    );

    if (orgResult.rows.length === 0) {
      throw new Error(`Organization not found for wallet: ${organizationWallet}`);
    }

    const organization = orgResult.rows[0];
    console.log(`   ✅ Found organization: ${organization.organization_name} (ID: ${organization.id})`);

    // Get employee
    console.log('\n🔍 Looking up employee...');
    const employeeResult = await dbClient.query(
      'SELECT id, full_name FROM employees WHERE employee_wallet_address = $1 AND organization_id = $2',
      [workerWallet, organization.id]
    );

    if (employeeResult.rows.length === 0) {
      throw new Error(`Employee not found for wallet: ${workerWallet}`);
    }

    const employee = employeeResult.rows[0];
    console.log(`   ✅ Found employee: ${employee.full_name} (ID: ${employee.id})`);

    // Check if channel already exists
    console.log('\n🔍 Checking for existing channel...');
    const existingChannel = await dbClient.query(
      'SELECT id, channel_id FROM payment_channels WHERE channel_id = $1',
      [realChannelId]
    );

    if (existingChannel.rows.length > 0) {
      console.log('   ⚠️  Channel already exists in database!');
      console.log(`   Channel ID: ${existingChannel.rows[0].channel_id}`);
      console.log(`   Database ID: ${existingChannel.rows[0].id}`);
      return { alreadyExists: true, channelId: existingChannel.rows[0].id };
    }

    console.log('   ✅ No existing channel found. Safe to insert.');

    // Insert payment channel
    console.log('\n💾 Inserting payment channel...');
    const amountXAH = parseInt(targetChannel.amount) / 1000000;
    const balanceXAH = parseInt(targetChannel.balance || '0') / 1000000;

    const insertResult = await dbClient.query(
      `INSERT INTO payment_channels (
        organization_id,
        employee_id,
        channel_id,
        job_name,
        hourly_rate,
        balance_update_frequency,
        escrow_funded_amount,
        on_chain_balance,
        off_chain_accumulated_balance,
        hours_accumulated,
        max_daily_hours,
        settle_delay,
        public_key,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, channel_id, status`,
      [
        organization.id,
        employee.id,
        realChannelId,
        'TESTING (16 XAH)',  // Job name - user can update if needed
        15.00,  // Hourly rate - default from frontend
        'hourly',
        amountXAH,
        balanceXAH,  // on_chain_balance
        0,  // off_chain_accumulated_balance
        0,  // hours_accumulated
        8.00,
        targetChannel.settle_delay,
        targetChannel.public_key,
        'active',
        '2026-01-11T00:00:00.000Z',  // Approximate creation time
        new Date()
      ]
    );

    const newChannel = insertResult.rows[0];
    console.log('   ✅ Payment channel inserted successfully!');
    console.log(`   Database ID: ${newChannel.id}`);
    console.log(`   Channel ID: ${newChannel.channel_id}`);
    console.log(`   Status: ${newChannel.status}`);

    return {
      success: true,
      channelId: newChannel.id,
      ledgerChannelId: newChannel.channel_id
    };

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    if (xrplClient.isConnected()) {
      await xrplClient.disconnect();
    }
    dbClient.release();
    await pool.end();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the script
syncChannel()
  .then(result => {
    if (result.alreadyExists) {
      console.log('\n✅ Channel already exists in database (no action needed)');
      console.log('   The NGO dashboard should already display this channel');
      process.exit(0);
    } else if (result.success) {
      console.log('\n✅ SUCCESS - Orphaned channel recovered!');
      console.log(`   Database ID: ${result.channelId}`);
      console.log(`   Ledger Channel ID: ${result.ledgerChannelId}`);
      console.log('\n🎯 Next Steps:');
      console.log('   1. Refresh NGO dashboard to verify channel appears');
      console.log('   2. Channel should show: 16 XAH escrow, 0 XAH balance');
      console.log('   3. Worker can now start logging hours');
      process.exit(0);
    }
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  });
