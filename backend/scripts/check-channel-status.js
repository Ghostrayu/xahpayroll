/**
 * Check Payment Channel Status on Xahau Ledger
 *
 * This script queries the actual ledger to see if a channel still exists
 * and what its current balance/status is
 *
 * Usage: node scripts/check-channel-status.js <channel_id>
 */

require('dotenv').config()
const { Client } = require('xrpl')

const NETWORK = process.env.XRPL_NETWORK || 'testnet'
const NETWORK_URL = NETWORK === 'mainnet'
  ? 'wss://xahau.network'
  : 'wss://xahau-test.net'

async function checkChannelStatus() {
  const channelId = process.argv[2]

  if (!channelId) {
    console.error('❌ Usage: node scripts/check-channel-status.js <channel_id>')
    process.exit(1)
  }

  console.log(`🔍 Checking channel status on Xahau ${NETWORK}...`)
  console.log(`Channel ID: ${channelId}\n`)

  const client = new Client(NETWORK_URL)

  try {
    await client.connect()
    console.log('✅ Connected to Xahau\n')

    // Query the ledger for channel details
    try {
      const response = await client.request({
        command: 'ledger_entry',
        payment_channel: channelId
      })

      console.log('✅ Channel EXISTS on ledger\n')
      console.log('Channel Details:')
      console.log('================')

      const channel = response.result.node
      console.log(`Account (NGO): ${channel.Account}`)
      console.log(`Destination (Worker): ${channel.Destination}`)
      console.log(`Amount (Escrow): ${parseInt(channel.Amount) / 1_000_000} XAH`)
      console.log(`Balance (Owed to Worker): ${parseInt(channel.Balance || 0) / 1_000_000} XAH`)
      console.log(`Settle Delay: ${channel.SettleDelay} seconds`)

      if (channel.Expiration) {
        const expiration = new Date((channel.Expiration + 946684800) * 1000)
        console.log(`Expiration: ${expiration.toISOString()}`)
      }

      if (channel.CancelAfter) {
        const cancelAfter = new Date((channel.CancelAfter + 946684800) * 1000)
        console.log(`Cancel After: ${cancelAfter.toISOString()}`)
      }

      console.log('\n💰 Financial Summary:')
      console.log(`Total Escrow: ${parseInt(channel.Amount) / 1_000_000} XAH`)
      console.log(`Worker Balance: ${parseInt(channel.Balance || 0) / 1_000_000} XAH`)
      console.log(`Available to Return: ${(parseInt(channel.Amount) - parseInt(channel.Balance || 0)) / 1_000_000} XAH`)

      console.log('\n⚠️ IMPORTANT: Channel still exists on ledger!')
      console.log('The database shows "closed" but the ledger channel is still active.')
      console.log('Funds are locked in the channel and need to be claimed properly.')

    } catch (channelError) {
      if (channelError.data?.error === 'entryNotFound') {
        console.log('✅ Channel DOES NOT EXIST on ledger')
        console.log('This means the channel was successfully closed and funds were distributed.')
        console.log('Check your wallet balance to confirm funds were received.')
      } else {
        console.error('❌ Error querying channel:', channelError.message)
        throw channelError
      }
    }

    await client.disconnect()

  } catch (error) {
    console.error('❌ Error:', error.message)
    await client.disconnect().catch(() => {})
    process.exit(1)
  }
}

checkChannelStatus()
  .then(() => {
    console.log('\n✅ Check completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Check failed:', error)
    process.exit(1)
  })
