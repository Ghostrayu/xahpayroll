/**
 * Check Transaction Status on Xahau Ledger
 *
 * Usage: node scripts/check-transaction.js [txHash]
 */

const { Client } = require('xrpl')

const XAHAU_TESTNET = 'wss://xahau-test.net'
const TX_HASH = process.argv[2] || '23AE9E09DDB93BA309FC3409FE1045BF5D1C10D35E51E87EDF6ED277C6F2BE97'

async function checkTransaction() {
  const client = new Client(XAHAU_TESTNET)

  try {
    console.log('🔗 Connecting to Xahau Testnet...')
    await client.connect()
    console.log('✅ Connected\n')

    console.log('🔍 Querying transaction:', TX_HASH)
    console.log('─'.repeat(80))

    try {
      const txResponse = await client.request({
        command: 'tx',
        transaction: TX_HASH
      })

      const tx = txResponse.result

      console.log('\n📋 TRANSACTION DETAILS:')
      console.log('─'.repeat(80))
      console.log('Transaction Type:', tx.TransactionType)
      console.log('Account:', tx.Account)
      console.log('Validated:', tx.validated)
      console.log('Ledger Index:', tx.ledger_index)
      console.log('Transaction Result:', tx.meta?.TransactionResult || 'UNKNOWN')
      console.log('Fee (drops):', tx.Fee)
      console.log('Sequence:', tx.Sequence)

      if (tx.TransactionType === 'PaymentChannelClaim') {
        console.log('\n💰 PAYMENT CHANNEL CLAIM DETAILS:')
        console.log('─'.repeat(80))
        console.log('Channel ID:', tx.Channel)
        console.log('Balance:', tx.Balance ? `${parseInt(tx.Balance) / 1000000} XAH` : 'Not specified')
        console.log('Flags:', tx.Flags)
        console.log('tfClose flag:', (tx.Flags & 0x00010000) !== 0 ? 'YES ✅' : 'NO ❌')
      }

      console.log('\n🔍 METADATA ANALYSIS:')
      console.log('─'.repeat(80))
      console.log('Validated:', tx.validated ? '✅ TRUE' : '❌ FALSE')
      console.log('Transaction Result:', tx.meta?.TransactionResult || 'UNKNOWN')

      if (tx.meta?.TransactionResult === 'tesSUCCESS') {
        console.log('Result Status: ✅ SUCCESS')
      } else {
        console.log('Result Status: ❌ FAILED')
        console.log('Error Code:', tx.meta?.TransactionResult)
      }

      console.log('\n📊 FULL RESPONSE:')
      console.log('─'.repeat(80))
      console.log(JSON.stringify(tx, null, 2))

    } catch (txError) {
      console.error('\n❌ TRANSACTION QUERY FAILED:')
      console.error('─'.repeat(80))
      console.error('Error:', txError.message)
      console.error('Data:', txError.data)

      if (txError.data?.error === 'txnNotFound') {
        console.log('\n⚠️  TRANSACTION NOT FOUND ON LEDGER')
        console.log('Possible reasons:')
        console.log('  1. Transaction never submitted to network')
        console.log('  2. Transaction hash is incorrect')
        console.log('  3. Network/consensus issue prevented inclusion')
        console.log('  4. Transaction too old (pruned from ledger history)')
      }
    }

  } catch (error) {
    console.error('❌ Fatal error:', error)
  } finally {
    await client.disconnect()
    console.log('\n🔌 Disconnected from Xahau')
  }
}

checkTransaction()
