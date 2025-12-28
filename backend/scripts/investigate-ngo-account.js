#!/usr/bin/env node

/**
 * Investigate NGO Account - Debug PublicKey Issue
 *
 * This script investigates why the NGO account may not have a PublicKey field
 */

const { Client } = require('xrpl');

const NGO_ADDRESS = 'rw2ciyaNshpHe7bCHo4bRWq6pqqynnWKQg';
const NETWORK = process.env.XRPL_NETWORK || 'testnet';
const WSS_URL = NETWORK === 'mainnet' ? 'wss://xahau.network' : 'wss://xahau-test.net';

async function investigateNGOAccount() {
  console.log('Investigating NGO Account:', NGO_ADDRESS);
  console.log('Network:', NETWORK);
  console.log('WebSocket:', WSS_URL);
  console.log();

  const client = new Client(WSS_URL);

  try {
    await client.connect();
    console.log('Connected to Xahau\n');

    // Get full account info
    console.log('[1] Full Account Info:');
    console.log('-'.repeat(70));
    const accountInfo = await client.request({
      command: 'account_info',
      account: NGO_ADDRESS,
      ledger_index: 'validated'
    });

    console.log(JSON.stringify(accountInfo.result, null, 2));
    console.log();

    // Check if account exists and has made transactions
    if (accountInfo.result.account_data) {
      const account = accountInfo.result.account_data;
      console.log('[2] Account Analysis:');
      console.log('-'.repeat(70));
      console.log('Account:', account.Account);
      console.log('Balance:', parseInt(account.Balance) / 1000000, 'XAH');
      console.log('Sequence:', account.Sequence);
      console.log('PublicKey:', account.PublicKey || 'NOT FOUND ❌');
      console.log('OwnerCount:', account.OwnerCount);
      console.log();

      if (!account.PublicKey) {
        console.log('⚠️  PUBLIC KEY MISSING');
        console.log('Possible reasons:');
        console.log('1. Account has never sent a transaction (only received)');
        console.log('2. Account created via payment but never signed anything');
        console.log('3. Sequence is 1 (no transactions sent from this account)');
        console.log();
        console.log('Solution: NGO must send at least one transaction to set PublicKey');
        console.log('Example: Send a minimal XAH payment to self to establish PublicKey');
      }
    }

    // Get recent transactions to understand account activity
    console.log('[3] Recent Transactions:');
    console.log('-'.repeat(70));
    try {
      const transactions = await client.request({
        command: 'account_tx',
        account: NGO_ADDRESS,
        ledger_index_min: -1,
        ledger_index_max: -1,
        limit: 10
      });

      if (transactions.result.transactions && transactions.result.transactions.length > 0) {
        console.log(`Found ${transactions.result.transactions.length} transactions:`);
        transactions.result.transactions.forEach((tx, i) => {
          console.log(`  ${i + 1}. Type: ${tx.tx.TransactionType}, Hash: ${tx.tx.hash}`);
          console.log(`     Account: ${tx.tx.Account}`);
          if (tx.tx.SigningPubKey) {
            console.log(`     SigningPubKey: ${tx.tx.SigningPubKey}`);
          }
        });
      } else {
        console.log('No transactions found for this account');
      }
    } catch (error) {
      console.log('Could not fetch transactions:', error.message);
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    if (client.isConnected()) {
      await client.disconnect();
      console.log('\nDisconnected from Xahau');
    }
  }
}

investigateNGOAccount().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
