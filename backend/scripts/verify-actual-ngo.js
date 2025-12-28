#!/usr/bin/env node

/**
 * Verify Actual NGO Account for Channel BB0127B9...
 *
 * This script verifies the correct NGO account and checks for PublicKey
 */

const { Client } = require('xrpl');

const CHANNEL_ID = 'BB0127B9AFD3B8697C5B968ABE160DA3E25803E1FBBB0778E8768CDFF43E81C0';
const ACTUAL_NGO = 'ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW'; // From database
const WORKER = 'rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS';
const NETWORK = process.env.XRPL_NETWORK || 'testnet';
const WSS_URL = NETWORK === 'mainnet' ? 'wss://xahau.network' : 'wss://xahau-test.net';

async function verifyActualNGO() {
  console.log('='.repeat(70));
  console.log('VERIFY ACTUAL NGO ACCOUNT');
  console.log('='.repeat(70));
  console.log(`Channel ID: ${CHANNEL_ID}`);
  console.log(`Database NGO: ${ACTUAL_NGO}`);
  console.log(`Worker: ${WORKER}`);
  console.log('='.repeat(70));
  console.log();

  const client = new Client(WSS_URL);

  try {
    await client.connect();
    console.log('✅ Connected to Xahau\n');

    // Step 1: Query channel on ledger to verify creator
    console.log('[STEP 1] Querying Channel on Ledger');
    console.log('-'.repeat(70));

    const channelResponse = await client.request({
      command: 'ledger_entry',
      payment_channel: CHANNEL_ID,
      ledger_index: 'validated'
    });

    if (channelResponse?.result?.node) {
      const channel = channelResponse.result.node;
      console.log('Channel Details from Ledger:');
      console.log(`  Account (Creator/NGO): ${channel.Account}`);
      console.log(`  Destination (Worker): ${channel.Destination}`);
      console.log(`  Amount (Escrow): ${parseInt(channel.Amount) / 1000000} XAH`);
      console.log(`  Balance (On-Chain): ${parseInt(channel.Balance || 0) / 1000000} XAH`);
      console.log(`  PublicKey: ${channel.PublicKey || 'NOT SET'}`);
      console.log();

      // Verify NGO address matches
      if (channel.Account === ACTUAL_NGO) {
        console.log(`✅ DATABASE NGO MATCHES LEDGER: ${ACTUAL_NGO}`);
      } else {
        console.log(`❌ MISMATCH!`);
        console.log(`   Database says: ${ACTUAL_NGO}`);
        console.log(`   Ledger says: ${channel.Account}`);
        process.exit(1);
      }

      // Verify worker address matches
      if (channel.Destination === WORKER) {
        console.log(`✅ WORKER MATCHES: ${WORKER}`);
      } else {
        console.log(`❌ WORKER MISMATCH!`);
        console.log(`   Expected: ${WORKER}`);
        console.log(`   Ledger: ${channel.Destination}`);
      }
      console.log();
    } else {
      console.log('❌ Channel not found on ledger');
      process.exit(1);
    }

    // Step 2: Query NGO account for PublicKey
    console.log('[STEP 2] Querying NGO Account for PublicKey');
    console.log('-'.repeat(70));

    const accountInfo = await client.request({
      command: 'account_info',
      account: ACTUAL_NGO,
      ledger_index: 'validated'
    });

    if (accountInfo?.result?.account_data) {
      const account = accountInfo.result.account_data;
      console.log('NGO Account Details:');
      console.log(`  Account: ${account.Account}`);
      console.log(`  Balance: ${parseInt(account.Balance) / 1000000} XAH`);
      console.log(`  Sequence: ${account.Sequence}`);
      console.log(`  OwnerCount: ${account.OwnerCount}`);
      console.log();

      if (account.PublicKey) {
        console.log(`✅ PUBLIC KEY FOUND: ${account.PublicKey}`);
        console.log(`✅ Full PublicKey: ${account.PublicKey}`);
        console.log();
        console.log('🎉 NGO ACCOUNT IS ACTIVATED!');
        console.log('✅ Worker closures will work correctly with this PublicKey');
      } else {
        console.log(`❌ PUBLIC KEY NOT FOUND`);
        console.log();
        console.log('⚠️  NGO ACCOUNT NOT ACTIVATED');
        console.log('NGO must send at least one transaction to establish PublicKey');
        console.log();
        console.log('Recommended: Self-payment transaction');
        console.log(`  From: ${ACTUAL_NGO}`);
        console.log(`  To: ${ACTUAL_NGO} (self)`);
        console.log(`  Amount: 0.000001 XAH (minimal)`);
      }
    }

    // Step 3: Get recent transactions to understand account activity
    console.log();
    console.log('[STEP 3] Recent Account Activity');
    console.log('-'.repeat(70));

    try {
      const transactions = await client.request({
        command: 'account_tx',
        account: ACTUAL_NGO,
        ledger_index_min: -1,
        ledger_index_max: -1,
        limit: 5
      });

      if (transactions.result.transactions && transactions.result.transactions.length > 0) {
        console.log(`Found ${transactions.result.transactions.length} recent transactions:`);
        transactions.result.transactions.forEach((tx, i) => {
          console.log(`  ${i + 1}. ${tx.tx.TransactionType} - Hash: ${tx.tx.hash.substring(0, 20)}...`);
          console.log(`     From: ${tx.tx.Account}`);
          if (tx.tx.SigningPubKey) {
            console.log(`     SigningPubKey: ${tx.tx.SigningPubKey.substring(0, 40)}...`);
          }
        });
      } else {
        console.log('No transactions found');
      }
    } catch (error) {
      console.log('Could not fetch transactions:', error.message);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  } finally {
    if (client.isConnected()) {
      await client.disconnect();
      console.log('\n[CLEANUP] Disconnected from Xahau');
    }
  }
}

verifyActualNGO().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
