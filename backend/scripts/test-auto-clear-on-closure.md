# Test Auto-Clear Balance Enhancement

## Purpose

Verify that the auto-clear enhancement (Fix #5, 2025-12-06) correctly clears `accumulated_balance` when payment channels are closed.

## Expected Behavior

When a payment channel is closed:
1. Worker receives accumulated balance via XRPL PaymentChannelClaim transaction
2. Channel is removed from Xahau ledger
3. Database updates: `status='closed'`, `accumulated_balance=0`, `last_ledger_sync=NOW()`

## Test Scenario

### Setup (Prerequisite)

1. **Create Test Channel**:
   - NGO: Create payment channel with test worker
   - Worker: Log some hours to accumulate balance (e.g., 2 hours × 0.15 XAH/hr = 0.30 XAH)
   - Verify: Channel shows `accumulated_balance = 0.30` in database

2. **Pre-Closure Verification**:
   ```sql
   SELECT
     id,
     channel_id,
     status,
     accumulated_balance,
     last_ledger_sync,
     closure_tx_hash
   FROM payment_channels
   WHERE id = <channel_id>;

   Expected:
   - status: active
   - accumulated_balance: 0.30000000 (or whatever was accumulated)
   - last_ledger_sync: NULL (or some past timestamp)
   - closure_tx_hash: NULL
   ```

### Test Steps

1. **Initiate Channel Closure**:
   - Click "Cancel Channel" button in NGO Dashboard
   - Review confirmation modal showing escrow return amount
   - Click "Confirm Cancellation"

2. **Sign Transaction**:
   - Xaman/Crossmark/GemWallet prompts for signature
   - Sign the PaymentChannelClaim transaction
   - Wait for transaction confirmation

3. **Verify XRPL Transaction** (via Xahau Explorer or script):
   ```bash
   # Using verification script
   node backend/scripts/verify-channel-balance.js

   Expected output:
   - Transaction Type: PaymentChannelClaim
   - Status: tesSUCCESS
   - Validated: true
   - Balance (XAH): 0.30000000 (worker received payment)
   - Channel NOT FOUND on ledger (removed)
   ```

4. **Verify Database Auto-Clear** ✅ **THIS IS THE KEY TEST**:
   ```sql
   SELECT
     id,
     channel_id,
     status,
     accumulated_balance,  -- Should be 0.00000000
     last_ledger_sync,     -- Should be recent timestamp
     closure_tx_hash,
     closed_at
   FROM payment_channels
   WHERE id = <channel_id>;

   Expected (AUTO-CLEAR WORKING):
   - status: closed
   - accumulated_balance: 0.00000000 ✅ (CLEARED!)
   - last_ledger_sync: 2025-12-06 20:XX:XX ✅ (UPDATED!)
   - closure_tx_hash: <64-char hex hash>
   - closed_at: 2025-12-06 20:XX:XX
   ```

5. **Verify Worker Profile Deletion** (Secondary Test):
   ```bash
   # Attempt to delete worker profile
   curl -X POST http://localhost:3001/api/workers/delete-profile \
     -H "Content-Type: application/json" \
     -d '{
       "walletAddress": "<worker_wallet>",
       "confirmationText": "DELETE MY ACCOUNT",
       "reason": "testing"
     }'

   Expected:
   - Success response (no longer blocked by stale balance)
   - Worker profile deleted or scheduled for deletion
   ```

## What to Look For

### ✅ SUCCESS INDICATORS

1. **Database State**:
   - `accumulated_balance = 0.00000000` (not the old 0.30)
   - `last_ledger_sync` has recent timestamp (not NULL)
   - `status = 'closed'`
   - `closure_tx_hash` populated with real transaction hash

2. **Worker Received Payment**:
   - Xahau explorer shows PaymentChannelClaim with Balance field
   - Worker's wallet balance increased by accumulated amount

3. **No Stale Balance Issues**:
   - Worker can delete profile without "unpaid balance" error
   - No need to manually clear balances with SQL scripts

### ❌ FAILURE INDICATORS (Bug Not Fixed)

1. **Stale Balance Remains**:
   - `accumulated_balance` still shows old value (e.g., 0.30000000)
   - Worker profile deletion blocked with "UNPAID BALANCE" error

2. **No Sync Timestamp**:
   - `last_ledger_sync` remains NULL after closure

3. **Database-Ledger Mismatch**:
   - Database shows `accumulated_balance > 0`
   - But ledger shows channel removed (no longer exists)

## Regression Testing

### Test Both Closure Paths

**Path 1: Worker-Initiated Closure** (Immediate):
- Worker clicks "Close Channel" from WorkerDashboard
- Tests immediate closure code path (lines 1120-1132)
- Verify auto-clear works

**Path 2: NGO-Initiated Closure** (Can be Scheduled or Immediate):
- NGO clicks "Cancel Channel" from NgoDashboard
- Tests scheduled closure code path (lines 1087-1100) if source-initiated
- Tests immediate closure code path (lines 1120-1132) if destination-signs-immediately
- Verify auto-clear works for both

### Edge Cases

**Zero Balance Closure**:
```sql
-- Create channel, don't log hours (balance = 0)
-- Close channel
-- Verify: accumulated_balance stays 0.00 (no errors)
```

**Multiple Closures**:
```sql
-- Close channel 1 → Verify auto-clear
-- Close channel 2 → Verify auto-clear
-- Both should work independently
```

## Rollback Scenario (Validation Fails)

If channel closure validation FAILS (transaction failed on ledger):
1. Channel status should rollback to `active`
2. `accumulated_balance` should NOT be cleared (worker wasn't paid)
3. `last_ledger_sync` should be updated to NOW()
4. Worker can retry closure

**Test Validation Failure**:
```bash
# Force a failure by using invalid transaction hash
# Database should NOT clear balance if validation fails
```

## Comparison: Before vs After Fix

### BEFORE FIX (Old Behavior)

```sql
-- After channel closure
status: closed
accumulated_balance: 0.30000000  ❌ STALE!
last_ledger_sync: NULL           ❌ NEVER SYNCED!
closure_tx_hash: ABA67907...

-- Worker deletion attempt
ERROR: CANNOT DELETE PROFILE WITH UNPAID BALANCES ❌

-- Manual fix required
UPDATE payment_channels SET accumulated_balance = 0, last_ledger_sync = NOW()...
```

### AFTER FIX (New Behavior)

```sql
-- After channel closure
status: closed
accumulated_balance: 0.00000000  ✅ AUTO-CLEARED!
last_ledger_sync: 2025-12-06...  ✅ SYNCED!
closure_tx_hash: ABA67907...

-- Worker deletion attempt
SUCCESS: Profile deletion scheduled ✅

-- No manual fix needed!
```

## Automated Test (Future Enhancement)

```javascript
// backend/tests/paymentChannels.autoclear.test.js
describe('Payment Channel Auto-Clear on Closure', () => {
  it('should clear accumulated_balance when channel closes', async () => {
    // 1. Create channel with balance
    const channel = await createTestChannel({ balance: 0.30 })
    expect(channel.accumulated_balance).toBe(0.30)

    // 2. Close channel (simulate XRPL transaction)
    const txHash = await closeChannel(channel.id)

    // 3. Confirm closure (calls /close/confirm)
    await confirmClosure(channel.id, txHash)

    // 4. Verify auto-clear
    const updated = await getChannel(channel.id)
    expect(updated.status).toBe('closed')
    expect(updated.accumulated_balance).toBe(0.00)  // ✅ AUTO-CLEARED
    expect(updated.last_ledger_sync).not.toBeNull() // ✅ SYNCED
  })
})
```

## Success Criteria

✅ **Fix is working correctly if**:
1. Closed channels have `accumulated_balance = 0.00` in database
2. `last_ledger_sync` is updated to closure timestamp
3. Worker profile deletion no longer blocked by closed channels
4. No manual SQL scripts needed to clear stale balances
5. Works for both immediate and scheduled closure paths

## Next Steps After Testing

1. ✅ Verify fix works in development
2. ⬜ Deploy to staging environment
3. ⬜ Run full regression tests
4. ⬜ Monitor production closures for stale balance issues
5. ⬜ Consider automated test suite for payment channel lifecycle
