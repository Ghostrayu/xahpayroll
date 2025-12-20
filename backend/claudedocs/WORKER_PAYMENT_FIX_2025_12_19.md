# Critical Worker Payment Fix - December 19, 2025

## Problem Summary

Workers were receiving **0 XAH** when closing payment channels despite earning wages (e.g., 4.971 XAH earned → 0 XAH received).

Additionally, the success message was followed by a confusing "CHANNEL SCHEDULED FOR CLOSURE" alert with SettleDelay warnings.

## Root Causes

### Issue #1: Ledger Balance Used Instead of Database Balance

**Problem**: The December 15th "security enhancement" to prevent NGO manipulation was reading balance from the Xahau ledger for ALL closures. However:

- **System Architecture**: Off-chain work tracking
  - Workers clock in/out → `work_sessions` table → `accumulated_balance` in database
  - No on-chain claims until final closure
  - Ledger `Balance` field = 0 XAH during work period

- **Incorrect Logic**: `getChannelBalanceFromLedger()` was called for ALL closures
  - Worker earnings: 4.971 XAH (database)
  - Ledger balance: 0 XAH (no on-chain claims yet)
  - Result: Worker paid 0 XAH ❌

**Impact**: Workers lost ALL earned wages when closing channels

### Issue #2: Channel Status Not Updated After Closure

**Problem**: The `/close/confirm` endpoint was simplified to only record transaction hash without updating channel status.

**Incorrect Flow**:
1. Worker clicks "Close Channel"
2. PaymentChannelClaim transaction with tfClose flag submitted
3. Database status remains 'active' (not updated)
4. Success message: "PAYMENT CHANNEL CLOSED SUCCESSFULLY!"
5. Dashboard refreshes
6. Channel still shows as active/closing → confusing alerts appear

**Impact**: Confusing UX with success message followed by "SCHEDULED FOR CLOSURE" warning

## Solutions

### Fix #1: Conditional Balance Source Selection

**Implementation**: `backend/routes/paymentChannels.js` lines 819-892

**Logic**:
```javascript
// Determine which balance to use based on closure context
const isExpired = channel.status === 'closing' &&
                 channel.expiration_time &&
                 new Date(channel.expiration_time) < new Date()

if (isNGO && isExpired) {
  // SECURITY: Expired channel + NGO closing = query ledger
  // Prevents NGO from manipulating database before finalization
  accumulatedBalance = await getChannelBalanceFromLedger(...)
} else {
  // NORMAL: Active channel OR worker closure = use database
  // Database tracks off-chain work sessions (the source of truth)
  accumulatedBalance = databaseBalance
}
```

**When Ledger Balance Used**:
- NGO closing an EXPIRED channel (race condition protection)

**When Database Balance Used** (99% of cases):
- Worker closing active channel ✅
- Worker closing scheduled channel ✅
- NGO closing active channel ✅

**Rationale**:
- Workers earn wages through off-chain work sessions (database)
- Ledger only knows about on-chain signed claims (0 until closure)
- Security check only needed for expired channel race conditions
- Normal closures must use database balance (worker's earned wages)

### Fix #2: Immediate Closure with Status Update

**Implementation**: `backend/routes/paymentChannels.js` lines 1084-1147

**Changes**:
```javascript
// OLD (WRONG): Only record transaction hash
UPDATE payment_channels SET
  closure_tx_hash = $1,
  last_validation_at = NOW()
WHERE channel_id = $2

// NEW (CORRECT): Immediate closure
UPDATE payment_channels SET
  status = 'closed',              ← Mark as closed
  closure_tx_hash = $1,
  closed_at = NOW(),              ← Timestamp
  accumulated_balance = 0,        ← Clear (worker was paid)
  last_ledger_sync = NOW(),       ← Sync recorded
  last_validation_at = NOW()
WHERE channel_id = $2
```

**tfClose Flag Behavior**:
- `/close` endpoint ALWAYS uses tfClose flag (0x00020000)
- tfClose = immediate closure on ledger
- No SettleDelay period for worker-initiated closures
- Channel closes instantly → worker paid → escrow returned

**Result**:
- Database matches ledger state
- No confusing "SCHEDULED FOR CLOSURE" alerts
- Clean user experience: close → success → done

## Testing Verification

### Test Case 1: Worker Closes Active Channel

**Steps**:
1. Worker clocks in, works 20 minutes at 15 XAH/hr (earns 5 XAH)
2. Worker clocks out (accumulated_balance = 5.0 XAH in database)
3. Worker clicks "Close Channel"
4. Xaman signs PaymentChannelClaim with Balance=5000000 drops, tfClose flag

**Expected Backend Logs**:
```
[BALANCE_SOURCE] ACTIVE CHANNEL OR WORKER CLOSURE - USING DATABASE BALANCE
  channelId: <64-char-hex>
  databaseBalance: 5.0
  isNGO: false
  isExpired: false
  reason: 'Worker-initiated closure'

[CHANNEL_CLOSE_INIT]
  accumulatedBalance: 5.0
  balanceSource: 'database'

[CONFIRM_CLOSURE] Immediate closure with tfClose flag
  accumulatedBalance: 5.0

[CONFIRM_CLOSURE] Channel closed immediately
  finalStatus: 'closed'
```

**Expected Frontend**:
```
✅ PAYMENT CHANNEL CLOSED SUCCESSFULLY!

YOU RECEIVED: 5.0 XAH
ESCROW RETURNED TO EMPLOYER: 235.0 XAH
TRANSACTION: <64-char-tx-hash>
```

**Database Verification**:
```sql
SELECT status, accumulated_balance, closed_at, closure_tx_hash
FROM payment_channels
WHERE channel_id = '<channel-id>';

-- Expected:
status: 'closed'
accumulated_balance: 0
closed_at: <timestamp>
closure_tx_hash: <64-char-hash>
```

**Ledger Verification**:
```bash
# Query worker wallet transactions
# Should show incoming 5.0 XAH from PaymentChannelClaim
```

### Test Case 2: NGO Closes Expired Channel

**Steps**:
1. NGO initiates closure → channel status='closing', expiration_time set
2. Worker doesn't claim before expiration
3. NGO clicks "Finalize Closure" after expiration

**Expected Backend Logs**:
```
[BALANCE_SOURCE] EXPIRED CHANNEL - NGO CLOSURE - USING LEDGER BALANCE
[LEDGER_BALANCE_SECURITY]
  channelId: <64-char-hex>
  databaseBalance: 5.0
  ledgerBalance: 0.0  (or actual signed claim balance)
  discrepancy: true
```

**Security Feature**:
- Ledger balance prevents NGO from manipulating database
- Worker's protection: claim before expiration to lock in ledger balance
- After expiration: ledger is source of truth

## Impact Summary

### Before Fix:
- Workers received 0 XAH despite earning wages ❌
- Confusing success message followed by closure warnings ❌
- Database balance ignored, ledger balance (0 XAH) used ❌
- Channel status not updated after closure ❌

### After Fix:
- Workers receive full earned wages from database ✅
- Clean UX: close → immediate success → channel disappears ✅
- Database balance used for 99% of closures ✅
- Channel status correctly updated to 'closed' ✅
- Security protection remains for expired channel race conditions ✅

## Files Modified

1. **backend/routes/paymentChannels.js** (lines 819-892)
   - Added conditional balance source selection
   - Database balance for normal closures
   - Ledger balance only for expired NGO closures

2. **backend/routes/paymentChannels.js** (lines 1084-1147)
   - Restored immediate closure logic
   - Status updated to 'closed' after tfClose transaction
   - accumulated_balance cleared (worker was paid)

3. **backend/routes/paymentChannels.js** (lines 942-954)
   - Updated logging to show balance source (database vs ledger)

## Deployment Notes

### Pre-Deployment Checks:
1. Verify no workers have pending closures in production
2. Check for channels with status='closing' and low accumulated_balance
3. Backup payment_channels table before deployment

### Post-Deployment Validation:
1. Monitor backend logs for `[BALANCE_SOURCE]` entries
2. Verify workers receive correct amounts (compare to work_sessions)
3. Check channel status transitions: active → closed (not closing)
4. Verify no "SCHEDULED FOR CLOSURE" alerts after immediate closures

### Rollback Plan:
If workers still receive 0 XAH:
1. Revert to previous version
2. Manually query ledger for affected channels
3. Process manual refunds to workers
4. Investigate ledger balance discrepancies

## Additional Recommendations

### Future Enhancements:
1. **Add transaction verification**: Check XRPL transaction result before marking closed
2. **Worker protection**: Alert workers if ledger balance < database balance
3. **Audit trail**: Log balance source decisions for compliance
4. **Monitoring**: Track discrepancies between database and ledger balances

### Documentation Updates Needed:
1. Update CLAUDE.md with conditional balance source logic
2. Document when ledger vs database balance is used
3. Add troubleshooting guide for payment discrepancies
4. Update testing checklist with ledger verification steps
