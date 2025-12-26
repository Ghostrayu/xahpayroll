# Payment Channel Patterns Reference
**Quick lookup for payment channel implementation patterns**

## State Verification Pattern
**When**: After submitting critical transactions to XRPL
**Why**: Prevent database-ledger mismatches from transaction failures

```javascript
// Pattern: Transaction → Intermediate State → Ledger Verification → Final State
async function verifyAndUpdateState(channelId, transactionHash) {
  // 1. Submit transaction (already done)
  // 2. Set intermediate state
  await db.update({ status: 'closing' }, { id: channelId });

  // 3. Verify state changed on source of truth (ledger)
  const channelExists = await checkChannelExistsOnLedger(channelId);

  // 4. Only finalize state if verified
  if (!channelExists) {
    await db.update({ status: 'closed' }, { id: channelId });
  } else {
    // State is intermediate, waiting for ledger update
    return { status: 'closing' };
  }
}
```

## Immediate Closure Pattern
**When**: Need to close channel without SettleDelay period
**How**: Omit CancelAfter field during channel creation

```javascript
// Channel created WITHOUT CancelAfter → tfClose closes immediately
const createChannel = async (address, workerAddress, amount) => {
  return {
    TransactionType: 'PaymentChannelCreate',
    // ❌ NO CancelAfter field
    Account: address,
    Destination: workerAddress,
    Amount: amount,
    SettlementDelay: 3600  // Optional: time worker has to claim
  };
};

// Later: tfClose flag causes immediate closure (no SettleDelay)
const closeChannel = async (channelId, address) => {
  return {
    TransactionType: 'PaymentChannelClaim',
    Channel: channelId,
    Account: address,
    Flags: 0x00000001  // tfClose flag
    // Channel closed immediately, removed from ledger
  };
};
```

## Scheduled Closure Pattern
**When**: Need to give worker time to claim (protection period)
**How**: Include CancelAfter field during channel creation

```javascript
// Channel created WITH CancelAfter → tfClose triggers SettleDelay
const createChannelWithSettleDelay = async (address, workerAddress, amount) => {
  return {
    TransactionType: 'PaymentChannelCreate',
    Account: address,
    Destination: workerAddress,
    Amount: amount,
    CancelAfter: Math.floor(Date.now() / 1000) + 2592000  // 30 days
    // tfClose on this channel enters SettleDelay period
  };
};
```

## Ledger Verification Pattern
**When**: Need to confirm XRPL state matches expectations
**How**: Query ledger_entry directly against validated ledger

```javascript
const checkChannelExistsOnLedger = async (channelId, xrplNetwork = 'testnet') => {
  const wsUrl = xrplNetwork === 'mainnet'
    ? 'https://xahau.network'
    : 'https://xahau-test.net';

  try {
    const response = await fetch(wsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'ledger_entry',
        params: {
          index: channelId,
          ledger_index: 'validated'
        }
      })
    });

    const data = await response.json();

    // Key: entryNotFound error means channel removed from ledger
    if (data.error && data.error.error === 'entryNotFound') {
      return false;  // Channel closed/removed
    }

    if (data.result && data.result.node) {
      return true;   // Channel still exists
    }

    // Unknown response
    return true;  // Default to true (safer assumption)
  } catch (error) {
    console.error('Ledger verification error:', error);
    return true;  // Default to true on network error (safer)
  }
};
```

## Database State Update Pattern
**When**: Confirmed closure, update database to match ledger state
**How**: Clear balance, set state, record sync timestamp

```javascript
const markChannelClosed = async (channelId, transactionHash) => {
  return db.query(
    `UPDATE payment_channels
     SET
       status = 'closed',
       closure_tx_hash = $1,
       closed_at = NOW(),
       accumulated_balance = 0,      -- Auto-clear balance
       last_ledger_sync = NOW(),     -- Record verification timestamp
       updated_at = NOW()
     WHERE channel_id = $2`,
    [transactionHash, channelId]
  );
};
```

## Rate Limiting Pattern
**When**: Protecting API from abuse without blocking legitimate operations
**How**: Higher limits for wallet/auth, normal for others

```javascript
// Wallet operations need higher limits (multiple rapid requests)
app.use('/api/xaman/', limiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,                   // Increased for wallet signing
  message: 'TOO MANY REQUESTS, TRY AGAIN LATER'
}));

// Standard endpoints
app.use('/api/', limiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'TOO MANY REQUESTS, TRY AGAIN LATER'
}));
```

## Transaction Result Verification Pattern
**When**: Need to confirm XRPL transaction succeeded
**How**: Check both validation status and result code

```javascript
const verifyTransactionSuccess = async (txHash, xrplNetwork = 'testnet') => {
  const wsUrl = xrplNetwork === 'mainnet'
    ? 'https://xahau.network'
    : 'https://xahau-test.net';

  try {
    const response = await fetch(wsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'tx',
        params: { transaction: txHash }
      })
    });

    const data = await response.json();

    // Success requires BOTH validation AND success result
    return data.result &&
           data.result.validated === true &&
           data.result.meta.TransactionResult === 'tesSUCCESS';
  } catch (error) {
    console.error('Transaction verification error:', error);
    return false;
  }
};
```

## Quick Reference: XRPL State Machine

```
Payment Channel Lifecycle:

CREATE (no CancelAfter)
    ↓
ACTIVE (funded, operational)
    ↓
CLOSE (tfClose flag)
    ↓
CLOSED (removed from ledger immediately)

---

CREATE (with CancelAfter)
    ↓
ACTIVE (funded, operational)
    ↓
CLOSE (tfClose flag)
    ↓
CLOSING (SettleDelay period active)
    ↓
[After expiration]
    ↓
CLOSED (removed from ledger)
```

## Testing Queries

**Check if channel exists**:
```bash
curl -X POST https://xahau-test.net \
  -H "Content-Type: application/json" \
  -d '{
    "method": "ledger_entry",
    "params": {"index": "[CHANNEL_ID]", "ledger_index": "validated"}
  }'
```

**Check all channels for account**:
```bash
curl -X POST https://xahau-test.net \
  -H "Content-Type: application/json" \
  -d '{
    "method": "account_channels",
    "params": {"account": "[ADDRESS]", "ledger_index": "validated"}
  }'
```

**Verify transaction success**:
```bash
curl -X POST https://xahau-test.net \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tx",
    "params": {"transaction": "[HASH]"}
  }'
```

## Key Implementation Files

| File | Purpose | Key Function |
|------|---------|--------------|
| `backend/routes/paymentChannels.js` | Channel lifecycle endpoints | `checkChannelExistsOnLedger()` |
| `frontend/src/components/CreatePaymentChannelModal.tsx` | Channel creation UI | Removed CancelAfter field |
| `frontend/src/utils/paymentChannels.ts` | Channel utilities | `closePaymentChannel()` |
| `backend/server.js` | API server config | Rate limiting rules |

## Common Pitfalls to Avoid

1. ❌ Assume transaction hash = successful closure
   - ✅ Always verify transaction with `tx` command
   - ✅ Check both `validated: true` AND `result: tesSUCCESS`

2. ❌ Trust database state without ledger verification
   - ✅ Query ledger after critical transactions
   - ✅ Verify channel entry exists/removed as expected

3. ❌ Create channels with CancelAfter for immediate closure
   - ✅ Omit CancelAfter field for immediate closure
   - ✅ Include CancelAfter only for protection periods

4. ❌ Use low rate limits for wallet endpoints
   - ✅ Increase limits for `/api/xaman/*` endpoints
   - ✅ Wallet operations require multiple rapid requests

5. ❌ Clear accumulated_balance before verifying closure
   - ✅ Only clear AFTER confirming channel removed from ledger
   - ✅ Prevents loss tracking if closure fails

## Decision Tree: Channel Closure Strategy

```
Need immediate closure?
├─ YES → Omit CancelAfter → tfClose closes immediately ✓
└─ NO → Include CancelAfter → tfClose enters SettleDelay

Channel closed on ledger?
├─ Verify with ledger_entry query
├─ entryNotFound error? → YES = closed, NO = still exists
└─ Update database only after verification

Database-ledger mismatch detected?
├─ Query ledger for current state
├─ Update database to match ledger (ledger is source of truth)
└─ Never trust database alone for critical state
```

## Performance Considerations

- **Ledger queries**: ~200-500ms, add 2-5 second polling for settlement
- **Rate limiting**: 500 req/15min for wallet ops = ~33 req/min per IP
- **Balance updates**: Immediate in database, verified async with ledger
- **Channel cleanup**: Can run as background job for historical verification

---
**Last Updated**: 2025-12-25
**Applicable To**: Payment Channel implementation v2+ with immediate closure
**Status**: Production Reference
