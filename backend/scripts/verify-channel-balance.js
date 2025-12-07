/**
 * Verify Channel 4 Balance on Xahau Ledger
 *
 * Checks if the 0.29 XAH accumulated balance for Channel 4 is stale database data
 * by querying the actual closure transaction on Xahau testnet.
 */

const { Client } = require('xrpl')

const XAHAU_TESTNET = 'wss://xahau-test.net'

async function verifyChannelBalance() {
  console.log('=== CHANNEL 4 BALANCE VERIFICATION ===\n')

  const channelId = 'A798F6B1E5E47E99E1F340F5A4997919B4C26C5F6560BE85E119E9293143A29A'
  const closureTxHash = 'ABA67907F4552832F75AFCA10ECD6B24620991BE0068AA190D7C0B1673199546'
  const organizationAddress = 'ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW' // From database query
  const workerAddress = 'rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS' // From user context

  const client = new Client(XAHAU_TESTNET)

  try {
    console.log('Connecting to Xahau testnet...')
    await client.connect()
    console.log('✅ Connected\n')

    // Step 1: Check if closure transaction exists and what it did
    console.log('Step 1: Querying closure transaction...')
    console.log(`Transaction Hash: ${closureTxHash}\n`)

    try {
      const txResponse = await client.request({
        command: 'tx',
        transaction: closureTxHash,
        binary: false
      })

      console.log('Transaction Details:')
      console.log(`  Type: ${txResponse.result.TransactionType}`)
      console.log(`  Status: ${txResponse.result.meta?.TransactionResult}`)
      console.log(`  Validated: ${txResponse.result.validated}`)

      if (txResponse.result.TransactionType === 'PaymentChannelClaim') {
        console.log(`  Channel: ${txResponse.result.Channel}`)
        console.log(`  Balance (drops): ${txResponse.result.Balance || 'NOT SPECIFIED'}`)

        if (txResponse.result.Balance) {
          const balanceXAH = parseInt(txResponse.result.Balance) / 1000000
          console.log(`  Balance (XAH): ${balanceXAH}`)
          console.log(`  Worker Received: ${balanceXAH} XAH ✅`)
        } else {
          console.log(`  Worker Received: 0 XAH (Balance field omitted)`)
        }

        console.log(`  tfClose Flag: ${(txResponse.result.Flags & 0x00020000) ? 'YES' : 'NO'}`)
      }

      console.log('\n')
    } catch (txError) {
      console.log(`⚠️ Transaction query failed: ${txError.message}`)
      console.log('This might mean the transaction is old or the command is not supported\n')
    }

    // Step 2: Check if channel still exists on ledger
    console.log('Step 2: Checking if channel still exists on ledger...')
    console.log(`Organization Address: ${organizationAddress}\n`)

    try {
      const channelsResponse = await client.request({
        command: 'account_channels',
        account: organizationAddress,
        ledger_index: 'validated'
      })

      console.log(`Total channels for organization: ${channelsResponse.result.channels?.length || 0}`)

      const targetChannel = channelsResponse.result.channels?.find(
        ch => ch.channel_id === channelId
      )

      if (targetChannel) {
        console.log(`\n❌ CHANNEL STILL EXISTS ON LEDGER!`)
        console.log('Channel Details:')
        console.log(`  Channel ID: ${targetChannel.channel_id}`)
        console.log(`  Destination: ${targetChannel.destination_account}`)
        console.log(`  Amount: ${targetChannel.amount}`)
        console.log(`  Balance: ${targetChannel.balance}`)
        console.log('\n⚠️ This suggests the channel was NOT fully closed!')
      } else {
        console.log(`\n✅ CHANNEL NOT FOUND ON LEDGER`)
        console.log('This confirms the channel was successfully closed and removed from the ledger.')
        console.log('\n💡 CONCLUSION:')
        console.log('The 0.29 XAH accumulated_balance in the database is STALE DATA.')
        console.log('The worker either:')
        console.log('  1. Received the balance as part of the closure transaction, OR')
        console.log('  2. Never accumulated that balance (database calculation error)')
        console.log('\n📝 RECOMMENDED ACTION:')
        console.log('Update database to set accumulated_balance = 0 for Channel 4')
        console.log('This will allow worker profile deletion to proceed.')
      }
    } catch (channelError) {
      if (channelError.data?.error === 'actNotFound') {
        console.log(`⚠️ Organization account not found on ledger: ${organizationAddress}`)
      } else {
        console.log(`⚠️ Channel query failed: ${channelError.message}`)
      }
    }

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await client.disconnect()
    console.log('\n✅ Disconnected from Xahau testnet')
  }
}

// Run verification
verifyChannelBalance().catch(console.error)
