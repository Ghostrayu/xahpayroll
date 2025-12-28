/**
 * Verify Channel Closure Transaction
 *
 * Queries Xahau ledger to verify if a transaction hash is valid
 * and check the transaction result code.
 */

const { Client } = require('xrpl')

const TX_HASH = '0B2AE278D7D4592FDE723916750F962CE0A26856F487C2703CB4F8709A09256F'
const CHANNEL_ID = 'BB0127B9AFD3B8697C5B968ABE160DA3E25803E1FBBB0778E8768CDFF43E81C0'
const NETWORK = 'wss://xahau-test.net' // Xahau testnet

async function verifyTransaction() {
  const client = new Client(NETWORK)

  try {
    console.log('🔌 Connecting to Xahau testnet...')
    await client.connect()
    console.log('✅ Connected\n')

    // Query transaction details
    console.log(`🔍 Querying transaction: ${TX_HASH}\n`)
    const txResponse = await client.request({
      command: 'tx',
      transaction: TX_HASH,
      binary: false
    })

    const tx = txResponse.result
    const meta = tx.meta

    console.log('📋 TRANSACTION DETAILS:')
    console.log('========================')
    console.log(`Transaction Type: ${tx.TransactionType}`)
    console.log(`Account (Signer): ${tx.Account}`)
    console.log(`Channel ID: ${tx.Channel}`)
    console.log(`Balance Field: ${tx.Balance || 'NOT_INCLUDED'}`)
    console.log(`PublicKey Field: ${tx.PublicKey || 'NOT_INCLUDED'}`)
    console.log(`Flags: ${tx.Flags} (${tx.Flags === 0x00020000 ? 'tfClose ✅' : 'OTHER'})`)
    console.log(`Validated: ${tx.validated}`)
    console.log(`Ledger Index: ${tx.ledger_index}`)
    console.log(`Date: ${new Date((tx.date + 946684800) * 1000).toISOString()}`)
    console.log(`\nTransaction Result: ${meta.TransactionResult}`)

    if (meta.TransactionResult === 'tesSUCCESS') {
      console.log('✅ TRANSACTION SUCCESSFUL!\n')
    } else {
      console.log(`❌ TRANSACTION FAILED: ${meta.TransactionResult}\n`)
    }

    // Check if channel still exists
    console.log('🔍 Checking channel state on ledger...\n')
    try {
      const channelResponse = await client.request({
        command: 'ledger_entry',
        payment_channel: CHANNEL_ID
      })

      const channel = channelResponse.result.node
      console.log('📋 CHANNEL STATE:')
      console.log('================')
      console.log(`Amount (Escrow): ${parseInt(channel.Amount) / 1000000} XAH`)
      console.log(`Balance (Claimed): ${parseInt(channel.Balance) / 1000000} XAH`)
      console.log(`Public Key: ${channel.PublicKey}`)
      console.log(`Expiration: ${channel.Expiration ? new Date((channel.Expiration + 946684800) * 1000).toISOString() : 'NONE'}`)
      console.log(`Cancel After: ${channel.CancelAfter ? new Date((channel.CancelAfter + 946684800) * 1000).toISOString() : 'NONE'}`)
      console.log(`Settle Delay: ${channel.SettleDelay} seconds`)
      console.log(`Destination: ${channel.Destination}`)
      console.log(`Account (Source): ${channel.Account}`)

      if (channel.Expiration) {
        const expirationDate = new Date((channel.Expiration + 946684800) * 1000)
        const now = new Date()
        const timeRemaining = Math.max(0, (expirationDate - now) / 1000)
        console.log(`\n⏱️  Channel in CLOSING state (SettleDelay)`)
        console.log(`Time remaining: ${Math.floor(timeRemaining / 60)} minutes ${Math.floor(timeRemaining % 60)} seconds`)
      }

    } catch (channelError) {
      if (channelError.data?.error === 'entryNotFound') {
        console.log('✅ CHANNEL NOT FOUND ON LEDGER (Fully closed)')
      } else {
        console.error('❌ Error querying channel:', channelError.message)
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.data) {
      console.error('Error details:', JSON.stringify(error.data, null, 2))
    }
  } finally {
    await client.disconnect()
    console.log('\n🔌 Disconnected')
  }
}

verifyTransaction()
