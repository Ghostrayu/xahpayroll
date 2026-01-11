/**
 * Query Payment Channel Status from Xahau Ledger
 *
 * Checks the current ledger state of a payment channel
 */

const { Client } = require('xrpl')

const CHANNEL_ID = '871391761F1D26F503BEEFE8CDE884D5F296AA65840F254D71BD3C374F5E01AF'
const NGO_WALLET = 'ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW'
const NETWORK_URL = 'wss://xahau.network' // Mainnet

async function queryChannelStatus() {
  const client = new Client(NETWORK_URL)

  try {
    console.log('🔌 Connecting to Xahau mainnet...')
    await client.connect()
    console.log('✅ Connected to', NETWORK_URL)

    // Query payment channels for NGO wallet
    console.log('\n📋 Querying payment channels for:', NGO_WALLET)
    const channelsResponse = await client.request({
      command: 'account_channels',
      account: NGO_WALLET,
      ledger_index: 'validated'
    })

    console.log('\n📊 Account Channels Response:')
    console.log('Total channels:', channelsResponse.result.channels?.length || 0)

    // Find our specific channel
    const ourChannel = channelsResponse.result.channels?.find(
      ch => ch.channel_id === CHANNEL_ID
    )

    if (ourChannel) {
      console.log('\n✅ CHANNEL FOUND ON LEDGER:')
      console.log('   Channel ID:', ourChannel.channel_id)
      console.log('   Destination:', ourChannel.destination_account)
      console.log('   Amount (drops):', ourChannel.amount)
      console.log('   Amount (XAH):', parseInt(ourChannel.amount) / 1000000)
      console.log('   Balance (drops):', ourChannel.balance)
      console.log('   Balance (XAH):', parseInt(ourChannel.balance) / 1000000)
      console.log('   Settle Delay:', ourChannel.settle_delay, 'seconds')

      if (ourChannel.expiration) {
        const expirationDate = new Date((ourChannel.expiration + 946684800) * 1000)
        console.log('   Expiration:', expirationDate.toISOString())
        console.log('   Expired?:', expirationDate < new Date() ? 'YES' : 'NO')
      } else {
        console.log('   Expiration: None (no scheduled closure)')
      }
    } else {
      console.log('\n❌ CHANNEL NOT FOUND ON LEDGER')
      console.log('   This means the channel has been CLOSED and removed from ledger')
      console.log('   The escrow should have been returned to NGO wallet')
    }

    // Query the closure transaction
    console.log('\n🔍 Querying closure transaction...')
    const closureTxHash = 'B7E94D489E643C707BACA68670327F695D254F5462387DE75C58C4BC531B5BA4'

    try {
      const txResponse = await client.request({
        command: 'tx',
        transaction: closureTxHash,
        binary: false
      })

      console.log('\n📝 Closure Transaction Details:')
      console.log('   Transaction Type:', txResponse.result.TransactionType)
      console.log('   Account (Initiator):', txResponse.result.Account)
      console.log('   Channel:', txResponse.result.Channel)
      console.log('   Balance (drops):', txResponse.result.Balance)
      console.log('   Balance (XAH):', txResponse.result.Balance ? parseInt(txResponse.result.Balance) / 1000000 : 'N/A')
      console.log('   Flags:', txResponse.result.Flags)
      console.log('   Transaction Result:', txResponse.result.meta?.TransactionResult)
      console.log('   Validated:', txResponse.result.validated)

      // Check if this was a final close (tfClose flag)
      const tfClose = 0x00010000
      const isFinalClose = (txResponse.result.Flags & tfClose) === tfClose
      console.log('   Final Close (tfClose)?:', isFinalClose ? 'YES' : 'NO')

      // Analyze metadata for balance changes
      if (txResponse.result.meta?.AffectedNodes) {
        console.log('\n💰 Balance Changes from Transaction:')
        txResponse.result.meta.AffectedNodes.forEach((node, index) => {
          const nodeType = Object.keys(node)[0]
          const nodeData = node[nodeType]

          if (nodeData.LedgerEntryType === 'AccountRoot') {
            const account = nodeData.FinalFields?.Account || nodeData.NewFields?.Account
            const prevBalance = nodeData.PreviousFields?.Balance
            const finalBalance = nodeData.FinalFields?.Balance || nodeData.NewFields?.Balance

            if (prevBalance && finalBalance) {
              const change = parseInt(finalBalance) - parseInt(prevBalance)
              console.log(`   Account ${account}:`)
              console.log(`     Previous: ${parseInt(prevBalance) / 1000000} XAH`)
              console.log(`     Final: ${parseInt(finalBalance) / 1000000} XAH`)
              console.log(`     Change: ${change > 0 ? '+' : ''}${change / 1000000} XAH`)
            }
          }
        })
      }

    } catch (txError) {
      console.log('\n⚠️  Could not query transaction:', txError.message)
      console.log('   Transaction may not be available via tx command (Xahau limitation)')
    }

    // Query NGO account balance
    console.log('\n💼 NGO Account Info:')
    const accountInfo = await client.request({
      command: 'account_info',
      account: NGO_WALLET,
      ledger_index: 'validated'
    })

    console.log('   Current Balance:', parseInt(accountInfo.result.account_data.Balance) / 1000000, 'XAH')
    console.log('   Reserve:', parseInt(accountInfo.result.account_data.OwnerCount) * 2, 'XAH base reserve')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    throw error
  } finally {
    await client.disconnect()
    console.log('\n🔌 Disconnected from Xahau')
  }
}

// Run the query
queryChannelStatus()
  .then(() => {
    console.log('\n✅ Query complete')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Query failed:', error.message)
    process.exit(1)
  })
