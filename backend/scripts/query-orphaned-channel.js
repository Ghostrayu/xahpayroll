/**
 * Query Xahau Ledger for Orphaned Payment Channel
 *
 * This script queries the Xahau mainnet ledger to find the real channel ID
 * for the orphaned payment channel that failed to sync to the database.
 *
 * Orphaned Channel Details:
 * - Organization: ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW
 * - Worker: rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS
 * - Funding: 240.00 XAH (240,000,000 drops)
 * - Created: 2026-01-11T00:56:44.755Z
 */

const { Client } = require('xrpl')

async function findOrphanedChannel() {
  const client = new Client('wss://xahau.network') // Xahau Mainnet

  try {
    console.log('🔌 Connecting to Xahau Mainnet...')
    await client.connect()
    console.log('✅ Connected to Xahau ledger')

    const organizationWallet = 'ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW'
    const workerWallet = 'rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS'
    const expectedAmount = '240000000' // 240 XAH in drops

    console.log('\n📋 Search Criteria:')
    console.log(`   Organization: ${organizationWallet}`)
    console.log(`   Worker: ${workerWallet}`)
    console.log(`   Expected Funding: ${expectedAmount} drops (240 XAH)`)
    console.log(`   Created: ~2026-01-11T00:56:44Z`)

    // Query payment channels for the organization wallet
    console.log('\n🔍 Querying account_channels...')
    const response = await client.request({
      command: 'account_channels',
      account: organizationWallet,
      ledger_index: 'validated'
    })

    console.log(`\n📊 Found ${response.result.channels?.length || 0} total channels`)

    if (!response.result.channels || response.result.channels.length === 0) {
      console.log('❌ No payment channels found for this organization')
      return null
    }

    // Filter channels matching our criteria
    const matchingChannels = response.result.channels.filter(channel => {
      return channel.destination_account === workerWallet &&
             channel.amount === expectedAmount
    })

    if (matchingChannels.length === 0) {
      console.log('\n❌ No channels found matching worker and amount criteria')
      console.log('\n📋 All channels for this organization:')
      response.result.channels.forEach((channel, index) => {
        console.log(`\n   Channel ${index + 1}:`)
        console.log(`   - Channel ID: ${channel.channel_id}`)
        console.log(`   - Destination: ${channel.destination_account}`)
        console.log(`   - Amount: ${channel.amount} drops (${parseFloat(channel.amount) / 1000000} XAH)`)
        console.log(`   - Balance: ${channel.balance} drops`)
        console.log(`   - Settle Delay: ${channel.settle_delay} seconds`)
      })
      return null
    }

    console.log(`\n✅ Found ${matchingChannels.length} matching channel(s)`)

    matchingChannels.forEach((channel, index) => {
      console.log(`\n🎯 Match ${index + 1}:`)
      console.log(`   Channel ID: ${channel.channel_id}`)
      console.log(`   Destination: ${channel.destination_account}`)
      console.log(`   Amount: ${channel.amount} drops (${parseFloat(channel.amount) / 1000000} XAH)`)
      console.log(`   Balance: ${channel.balance} drops (${parseFloat(channel.balance) / 1000000} XAH)`)
      console.log(`   Settle Delay: ${channel.settle_delay} seconds`)
      console.log(`   Public Key: ${channel.public_key}`)
      if (channel.expiration) {
        const expDate = new Date((channel.expiration + 946684800) * 1000)
        console.log(`   Expiration: ${channel.expiration} (${expDate.toISOString()})`)
      }
      if (channel.cancel_after) {
        const cancelDate = new Date((channel.cancel_after + 946684800) * 1000)
        console.log(`   Cancel After: ${channel.cancel_after} (${cancelDate.toISOString()})`)
      }
    })

    const realChannelId = matchingChannels[0].channel_id
    console.log(`\n✨ REAL CHANNEL ID: ${realChannelId}`)
    console.log(`   Length: ${realChannelId.length} characters`)

    return {
      channelId: realChannelId,
      destination: matchingChannels[0].destination_account,
      amount: matchingChannels[0].amount,
      balance: matchingChannels[0].balance,
      settleDelay: matchingChannels[0].settle_delay,
      publicKey: matchingChannels[0].public_key,
      expiration: matchingChannels[0].expiration,
      cancelAfter: matchingChannels[0].cancel_after
    }

  } catch (error) {
    console.error('❌ Error querying ledger:', error)
    throw error
  } finally {
    await client.disconnect()
    console.log('\n🔌 Disconnected from Xahau ledger')
  }
}

// Run the script
findOrphanedChannel()
  .then(result => {
    if (result) {
      console.log('\n✅ SUCCESS - Channel found on ledger')
      console.log('\n📝 Next Step: Insert this channel into production database')
      console.log(`   Channel ID: ${result.channelId}`)
      process.exit(0)
    } else {
      console.log('\n❌ FAILED - Channel not found on ledger')
      console.log('\n💡 Possible reasons:')
      console.log('   1. Channel was closed/cancelled')
      console.log('   2. Different network (mainnet vs testnet)')
      console.log('   3. Incorrect wallet addresses')
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error.message)
    process.exit(1)
  })
