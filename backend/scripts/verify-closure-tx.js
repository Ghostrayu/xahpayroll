const { Client } = require('xrpl');

async function verifyTransaction() {
  const client = new Client('wss://xahau.network');

  try {
    await client.connect();
    console.log('🔗 CONNECTED TO XAH MAINNET\n');

    const txHash = '46B26D4A9B407E2FFFF00256E645D172B6B8AA445CD5CD25711DC1BAC251E2A8';

    const txResponse = await client.request({
      command: 'tx',
      transaction: txHash
    });

    console.log('📋 TRANSACTION DETAILS\n');
    console.log('Type:', txResponse.result.TransactionType);
    console.log('Account:', txResponse.result.Account);
    console.log('Channel:', txResponse.result.Channel);
    console.log('Validated:', txResponse.result.validated);
    console.log('Result:', txResponse.result.meta?.TransactionResult);

    if (txResponse.result.Balance) {
      console.log('Balance (drops):', txResponse.result.Balance);
      console.log('Balance (XAH):', parseInt(txResponse.result.Balance) / 1000000);
    }

    if (txResponse.result.Flags) {
      const tfClose = 0x00020000;
      const hasCloseFlag = (txResponse.result.Flags & tfClose) !== 0;
      console.log('Close Flag:', hasCloseFlag ? 'YES (tfClose)' : 'NO');
    }

    console.log('\n📊 FULL TRANSACTION:\n');
    console.log(JSON.stringify(txResponse.result, null, 2));

    await client.disconnect();
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    await client.disconnect().catch(() => {});
  }
}

verifyTransaction();
