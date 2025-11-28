/**
 * Recover Stuck Payment Channel
 *
 * This script helps recover a payment channel that was incorrectly marked as "closed"
 * in the database but still exists on the ledger with funds locked.
 *
 * Usage: node scripts/recover-stuck-channel.js <channel_id>
 */

require('dotenv').config()
const { Client } = require('xrpl')
const { query } = require('../database/db')

const NETWORK = process.env.XRPL_NETWORK || 'testnet'
const NETWORK_URL = NETWORK === 'mainnet'
  ? 'wss://xahau.network'
  : 'wss://xahau-test.net'

async function recoverChannel() {
  const channelId = process.argv[2]

  if (!channelId) {
    console.error('❌ Usage: node scripts/recover-stuck-channel.js <channel_id>')
    process.exit(1)
  }

  console.log('🔧 Payment Channel Recovery Script')
  console.log('==================================\n')
  console.log(`Channel ID: ${channelId}`)
  console.log(`Network: ${NETWORK}\n`)

  // Step 1: Check database status
  console.log('Step 1: Checking database status...')
  const dbResult = await query(
    `SELECT
      pc.id,
      pc.channel_id,
      pc.status,
      pc.escrow_funded_amount,
      pc.accumulated_balance,
      pc.closure_tx_hash,
      o.escrow_wallet_address as ngo_wallet,
      e.employee_wallet_address as worker_wallet
    FROM payment_channels pc
    JOIN organizations o ON pc.organization_id = o.id
    JOIN employees e ON pc.employee_id = e.id
    WHERE pc.channel_id = $1`,
    [channelId]
  )

  if (dbResult.rows.length === 0) {
    console.error('❌ Channel not found in database')
    process.exit(1)
  }

  const dbChannel = dbResult.rows[0]
  console.log('✅ Found in database:')
  console.log(`  Status: ${dbChannel.status}`)
  console.log(`  Escrow Funded: ${dbChannel.escrow_funded_amount} XAH`)
  console.log(`  Accumulated Balance: ${dbChannel.accumulated_balance} XAH`)
  console.log(`  NGO Wallet: ${dbChannel.ngo_wallet}`)
  console.log(`  Worker Wallet: ${dbChannel.worker_wallet}`)
  console.log(`  Closure TX Hash: ${dbChannel.closure_tx_hash || 'NULL'}\n`)

  // Step 2: Check ledger status
  console.log('Step 2: Checking ledger status...')
  const client = new Client(NETWORK_URL)

  try {
    await client.connect()

    const channelResponse = await client.request({
      command: 'ledger_entry',
      payment_channel: channelId
    })

    const ledgerChannel = channelResponse.result.node
    const escrowAmount = parseInt(ledgerChannel.Amount) / 1_000_000
    const balanceOwed = parseInt(ledgerChannel.Balance || 0) / 1_000_000
    const escrowReturn = escrowAmount - balanceOwed

    console.log('✅ Found on ledger:')
    console.log(`  Account (NGO): ${ledgerChannel.Account}`)
    console.log(`  Destination (Worker): ${ledgerChannel.Destination}`)
    console.log(`  Escrow Amount: ${escrowAmount} XAH`)
    console.log(`  Balance Owed to Worker: ${balanceOwed} XAH`)
    console.log(`  Available to Return: ${escrowReturn} XAH\n`)

    // Step 3: Provide recovery instructions
    console.log('Step 3: Recovery Instructions')
    console.log('=============================\n')

    console.log('⚠️ DIAGNOSIS:')
    console.log('The channel is marked "closed" in the database but still exists on the ledger.')
    console.log('This means the XRPL transaction failed but the database was incorrectly updated.\n')

    console.log('💡 RECOVERY OPTIONS:\n')

    console.log('OPTION 1: Reset Database Status (Recommended)')
    console.log('---------------------------------------------')
    console.log('Reset the channel status to "active" so the NGO can try canceling again:')
    console.log('')
    console.log('  UPDATE payment_channels')
    console.log('  SET status = \'active\',')
    console.log('      closure_tx_hash = NULL,')
    console.log('      closed_at = NULL')
    console.log(`  WHERE channel_id = '${channelId}';`)
    console.log('')
    console.log('After running this SQL:')
    console.log('1. Refresh the NGO dashboard')
    console.log('2. The channel will appear as active again')
    console.log('3. Click "Cancel Channel" button')
    console.log('4. The system will now use the CORRECT transaction structure:\n')
    console.log('   PaymentChannelClaim {')
    console.log(`     Channel: "${channelId}",`)
    console.log(`     Balance: "${Math.floor(balanceOwed * 1_000_000)}", // ${balanceOwed} XAH to worker`)
    console.log('     Flags: 0x00010000  // tfClose flag')
    console.log('     // NO Amount field - escrow returns automatically!')
    console.log('   }\n')

    console.log('OPTION 2: Manual XRPL Transaction (Advanced)')
    console.log('--------------------------------------------')
    console.log('Manually close the channel using XRPL CLI or library:')
    console.log('')
    console.log('  const tx = {')
    console.log('    TransactionType: "PaymentChannelClaim",')
    console.log(`    Account: "${ledgerChannel.Account}",`)
    console.log(`    Channel: "${channelId}",`)
    console.log(`    Balance: "${Math.floor(balanceOwed * 1_000_000)}",`)
    console.log('    Flags: 0x00010000')
    console.log('  }')
    console.log('')
    console.log('After successful transaction:')
    console.log('1. Get the transaction hash')
    console.log('2. Update database with:')
    console.log(`   UPDATE payment_channels SET closure_tx_hash = '<real_tx_hash>' WHERE channel_id = '${channelId}';`)
    console.log('')

    console.log('📋 TECHNICAL EXPLANATION:')
    console.log('-------------------------')
    console.log('The original error occurred because the system incorrectly used the "Amount" field')
    console.log('to try to return escrow. In XRPL PaymentChannelClaim:')
    console.log('')
    console.log('  ❌ WRONG: Amount field = escrow return (this is NOT how XRPL works)')
    console.log('  ✅ CORRECT: When channel closes, escrow automatically returns to Account')
    console.log('')
    console.log('The "Amount" field is for sending ADDITIONAL XAH from the Account\'s regular')
    console.log('balance, not for returning escrow. Escrow return is automatic on channel close.')
    console.log('')
    console.log('The system has now been fixed to NOT include the Amount field when closing')
    console.log('channels with zero worker balance.')

    await client.disconnect()

  } catch (error) {
    if (error.data?.error === 'entryNotFound') {
      console.log('✅ Channel does not exist on ledger')
      console.log('\n📋 RECOVERY:')
      console.log('The channel was successfully closed on the ledger.')
      console.log('The database just needs cleanup:')
      console.log('')
      console.log('  -- Nothing to do! Funds were already returned.')
      console.log('  -- The database status is actually correct.')
      console.log('')
    } else {
      console.error('❌ Error querying ledger:', error.message)
      throw error
    }
    await client.disconnect()
  }

  console.log('\n✅ Recovery analysis complete')
}

recoverChannel()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Recovery script failed:', error)
    process.exit(1)
  })
