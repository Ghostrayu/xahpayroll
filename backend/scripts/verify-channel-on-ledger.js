/**
 * Verify Payment Channel on XAH Ledger
 *
 * This script queries the XAH Ledger to check if a payment channel actually exists
 * and compares it with the database state.
 *
 * Usage:
 *   node scripts/verify-channel-on-ledger.js <worker_wallet_address>
 */

const { Client } = require('xrpl')
const { query } = require('../database/db')

// Network configuration
const NETWORK = process.env.XRPL_NETWORK || 'testnet'
const WEBSOCKET_URL = NETWORK === 'mainnet'
  ? 'wss://xahau.network'
  : 'wss://xahau-test.net'

async function verifyChannelsOnLedger(workerWalletAddress) {
  const client = new Client(WEBSOCKET_URL)

  try {
    console.log('\n=========================================')
    console.log('  PAYMENT CHANNEL LEDGER VERIFICATION')
    console.log('=========================================\n')
    console.log(`Network: ${NETWORK}`)
    console.log(`Worker: ${workerWalletAddress}\n`)

    // Connect to ledger
    console.log('🔗 Connecting to XAH Ledger...')
    await client.connect()
    console.log('✅ Connected\n')

    // Step 1: Get channels from database
    console.log('📊 STEP 1: Checking database records...\n')
    const dbResult = await query(
      `SELECT
        pc.id,
        pc.channel_id,
        pc.job_name,
        pc.status,
        pc.accumulated_balance,
        pc.escrow_funded_amount,
        pc.closure_tx_hash,
        pc.closed_at,
        pc.created_at,
        o.escrow_wallet_address,
        o.organization_name
       FROM payment_channels pc
       JOIN employees e ON pc.employee_id = e.id
       JOIN organizations o ON pc.organization_id = o.id
       WHERE e.employee_wallet_address = $1
       ORDER BY pc.created_at DESC`,
      [workerWalletAddress]
    )

    if (dbResult.rows.length === 0) {
      console.log('❌ No payment channels found in database\n')
      return
    }

    console.log(`Found ${dbResult.rows.length} channel(s) in database:\n`)
    dbResult.rows.forEach((ch, idx) => {
      console.log(`${idx + 1}. Channel ID: ${ch.channel_id}`)
      console.log(`   Job: ${ch.job_name}`)
      console.log(`   Status (DB): ${ch.status}`)
      console.log(`   Balance: ${ch.accumulated_balance} XAH`)
      console.log(`   Funded: ${ch.escrow_funded_amount} XAH`)
      console.log(`   Closure TX: ${ch.closure_tx_hash || 'N/A'}`)
      console.log(`   Employer: ${ch.organization_name}`)
      console.log(`   Escrow Wallet: ${ch.escrow_wallet_address}\n`)
    })

    // Step 2: Query ledger for each channel
    console.log('🔍 STEP 2: Querying XAH Ledger for channel status...\n')

    for (const dbChannel of dbResult.rows) {
      console.log(`\n--- Checking Channel: ${dbChannel.channel_id} ---`)

      try {
        // Query the ledger for this specific channel
        const accountChannelsResponse = await client.request({
          command: 'account_channels',
          account: dbChannel.escrow_wallet_address,
          destination_account: workerWalletAddress,
          ledger_index: 'validated'
        })

        // Find the specific channel by ID
        const ledgerChannel = accountChannelsResponse.result.channels?.find(
          ch => ch.channel_id === dbChannel.channel_id
        )

        if (ledgerChannel) {
          console.log('✅ CHANNEL EXISTS ON LEDGER')
          console.log(`   Amount: ${ledgerChannel.amount}`)
          console.log(`   Balance: ${ledgerChannel.balance}`)
          console.log(`   Settle Delay: ${ledgerChannel.settle_delay}`)
          console.log(`   Public Key: ${ledgerChannel.public_key}`)

          // Convert drops to XAH
          const amountXAH = parseFloat(ledgerChannel.amount) / 1000000
          const balanceXAH = parseFloat(ledgerChannel.balance) / 1000000
          const remainingXAH = amountXAH - balanceXAH

          console.log(`\n   💰 LEDGER BALANCES:`)
          console.log(`      Total Funded: ${amountXAH.toFixed(6)} XAH`)
          console.log(`      Claimed: ${balanceXAH.toFixed(6)} XAH`)
          console.log(`      Remaining: ${remainingXAH.toFixed(6)} XAH`)

          // Compare with database
          console.log(`\n   📊 DATABASE vs LEDGER:`)
          console.log(`      DB Status: ${dbChannel.status}`)
          console.log(`      Ledger Status: ACTIVE (channel exists)`)
          console.log(`      DB Balance: ${parseFloat(dbChannel.accumulated_balance).toFixed(6)} XAH`)
          console.log(`      Ledger Claimed: ${balanceXAH.toFixed(6)} XAH`)

          if (dbChannel.status === 'closed' || dbChannel.status === 'closing') {
            console.log(`\n   ⚠️  DISCREPANCY DETECTED!`)
            console.log(`      Database shows '${dbChannel.status}' but channel still exists on ledger`)
            console.log(`      Closure TX Hash: ${dbChannel.closure_tx_hash || 'NONE'}`)

            if (dbChannel.closure_tx_hash) {
              console.log(`\n   🔎 Verifying closure transaction...`)
              try {
                const txResponse = await client.request({
                  command: 'tx',
                  transaction: dbChannel.closure_tx_hash,
                  binary: false
                })

                console.log(`      TX Type: ${txResponse.result.TransactionType}`)
                console.log(`      TX Result: ${txResponse.result.meta.TransactionResult}`)
                console.log(`      Validated: ${txResponse.result.validated}`)

                if (txResponse.result.meta.TransactionResult !== 'tesSUCCESS') {
                  console.log(`      ❌ TRANSACTION FAILED: ${txResponse.result.meta.TransactionResult}`)
                }
              } catch (txError) {
                console.log(`      ❌ Could not fetch transaction: ${txError.message}`)
              }
            }
          }
        } else {
          console.log('❌ CHANNEL NOT FOUND ON LEDGER')
          console.log(`   Database Status: ${dbChannel.status}`)

          if (dbChannel.status === 'active') {
            console.log(`\n   ⚠️  DISCREPANCY DETECTED!`)
            console.log(`      Database shows 'active' but channel doesn't exist on ledger`)
          } else {
            console.log(`\n   ✅ CONSISTENT: Channel properly closed`)
            console.log(`      Closure TX: ${dbChannel.closure_tx_hash}`)
          }
        }

      } catch (error) {
        if (error.data?.error === 'actNotFound') {
          console.log('❌ ESCROW ACCOUNT NOT FOUND ON LEDGER')
          console.log(`   Account: ${dbChannel.escrow_wallet_address}`)
        } else {
          console.log(`❌ Error querying ledger: ${error.message}`)
        }
      }
    }

    console.log('\n\n=========================================')
    console.log('  VERIFICATION COMPLETE')
    console.log('=========================================\n')

  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED:', error.message)
    throw error
  } finally {
    await client.disconnect()
  }
}

// Main execution
async function main() {
  const workerWallet = process.argv[2]

  if (!workerWallet) {
    console.error('\n❌ Usage: node verify-channel-on-ledger.js <worker_wallet_address>\n')
    process.exit(1)
  }

  try {
    await verifyChannelsOnLedger(workerWallet)
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Script failed:', error.message)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main()
}

module.exports = { verifyChannelsOnLedger }
