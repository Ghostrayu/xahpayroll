/**
 * Fix TEMP Channel IDs Script
 *
 * This script queries Xahau ledger for real channel IDs and updates
 * payment_channels table to replace TEMP-* IDs with actual ledger IDs
 *
 * Usage: node scripts/fix-temp-channel-ids.js
 */

// Load environment variables
require('dotenv').config()

const { Client } = require('xrpl')
const { query } = require('../database/db')

// Network configuration
const NETWORK = process.env.XRPL_NETWORK || 'testnet'
const NETWORK_URL = NETWORK === 'mainnet'
  ? 'wss://xahau.network'
  : 'wss://xahau-test.net'

async function fixTempChannelIds() {
  console.log('🔍 Finding payment channels with TEMP IDs...\n')

  // Find all channels with TEMP IDs - JOIN to get wallet addresses
  const result = await query(
    `SELECT
      pc.id,
      pc.channel_id,
      pc.job_name,
      o.escrow_wallet_address as organization_wallet_address,
      e.employee_wallet_address
     FROM payment_channels pc
     JOIN organizations o ON pc.organization_id = o.id
     JOIN employees e ON pc.employee_id = e.id
     WHERE pc.channel_id LIKE 'TEMP-%'
     AND pc.status = 'active'
     ORDER BY pc.created_at ASC`
  )

  if (result.rows.length === 0) {
    console.log('✅ No TEMP channel IDs found - all channels have real ledger IDs!')
    return
  }

  console.log(`Found ${result.rows.length} channel(s) with TEMP IDs:\n`)

  // Connect to Xahau
  const client = new Client(NETWORK_URL)
  await client.connect()
  console.log(`✅ Connected to Xahau ${NETWORK}\n`)

  for (const channel of result.rows) {
    console.log(`Channel: ${channel.job_name}`)
    console.log(`  Database ID: ${channel.id}`)
    console.log(`  Current Channel ID: ${channel.channel_id}`)
    console.log(`  NGO Wallet: ${channel.organization_wallet_address}`)
    console.log(`  Worker Wallet: ${channel.employee_wallet_address}`)

    try {
      // Query account_channels for the NGO wallet
      const channelsResponse = await client.request({
        command: 'account_channels',
        account: channel.organization_wallet_address,
        ledger_index: 'validated'
      })

      if (!channelsResponse.result?.channels || channelsResponse.result.channels.length === 0) {
        console.log(`  ⚠️ No channels found on ledger for this NGO wallet\n`)
        continue
      }

      // Find channel for this specific worker
      const matchingChannel = channelsResponse.result.channels.find(c =>
        c.destination_account === channel.employee_wallet_address
      )

      if (!matchingChannel) {
        console.log(`  ⚠️ No channel found for worker ${channel.employee_wallet_address}\n`)
        continue
      }

      const realChannelId = matchingChannel.channel_id
      console.log(`  ✅ Found real channel ID: ${realChannelId}`)

      // Update database
      await query(
        `UPDATE payment_channels
         SET channel_id = $1
         WHERE id = $2`,
        [realChannelId, channel.id]
      )

      console.log(`  ✅ Updated database with real channel ID\n`)

    } catch (error) {
      console.error(`  ❌ Error processing channel: ${error.message}\n`)
    }
  }

  await client.disconnect()
  console.log('✅ Finished fixing TEMP channel IDs')
}

// Run the script
fixTempChannelIds()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
