# Stale Channel Balance Fix - 2025-12-06

## Problem Summary

Worker profile deletion was blocked by Channel 4 showing 0.29 XAH unpaid balance, despite the channel being closed on 2025-12-04. Investigation revealed this was **stale database data** - the worker had already been paid, but the database was never synced with the ledger after closure.

## Root Cause

### Missing Ledger Synchronization After Closure

**Issue**: When payment channels are closed, the `accumulated_balance` in the database is **NOT automatically cleared** to reflect that the worker received their payment as part of the closure transaction.

**Evidence**:
```sql
-- Channel 4 before fix
id: 4
status: closed
accumulated_balance: 0.29444444  ← STALE DATA
closure_tx_hash: ABA67907F4552832F75AFCA10ECD6B24620991BE0068AA190D7C0B1673199546
closed_at: 2025-12-04 18:00:05
last_ledger_sync: NULL  ← NEVER SYNCED AFTER CLOSURE!
```

## Investigation Process

### Step 1: Ledger Transaction Verification

Created script `backend/scripts/verify-channel-balance.js` to query Xahau testnet ledger.

**Transaction Query Results**:
```javascript
Transaction Hash: ABA67907F4552832F75AFCA10ECD6B24620991BE0068AA190D7C0B1673199546
Type: PaymentChannelClaim
Status: tesSUCCESS
Validated: true
Balance (drops): 294444
Balance (XAH): 0.294444
Worker Received: 0.294444 XAH ✅
tfClose Flag: NO
```

**Key Finding**: The closure transaction successfully sent **0.294444 XAH** to the worker on 2025-12-04.

### Step 2: Channel Existence Check

**Ledger Query Results**:
```javascript
Organization Address: ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW
Total channels for organization: 0
Channel A798F... NOT FOUND ON LEDGER ✅
```

**Conclusion**: Channel was successfully closed and removed from Xahau ledger. The worker already received their payment.

## Solution Implemented

### Database Update

Created SQL script `backend/scripts/clear-stale-channel-balances.sql`:

```sql
UPDATE payment_channels
SET
  accumulated_balance = 0,
  last_ledger_sync = NOW(),
  updated_at = NOW()
WHERE id = 4
  AND channel_id = 'A798F6B1E5E47E99E1F340F5A4997919B4C26C5F6560BE85E119E9293143A29A'
  AND status = 'closed'
  AND closure_tx_hash = 'ABA67907F4552832F75AFCA10ECD6B24620991BE0068AA190D7C0B1673199546';
```

### Results

**Before Fix**:
```
Channel 4:
- accumulated_balance: 0.29444444
- last_ledger_sync: NULL
- Deletion Status: BLOCKED ❌
```

**After Fix**:
```
Channel 4:
- accumulated_balance: 0.00000000 ✅
- last_ledger_sync: 2025-12-06 20:44:32 ✅
- Deletion Status: ALLOWED ✅
```

## Technical Details

### Why This Happened

**Payment Channel Closure Flow**:
1. User clicks "Cancel Channel" → Frontend calls `/api/payment-channels/:id/close`
2. Backend returns XRPL transaction details (PaymentChannelClaim)
3. User signs transaction with wallet → Transaction broadcast to Xahau
4. Frontend calls `/api/payment-channels/:id/close/confirm` with tx hash
5. Backend updates: `status='closed'`, `closure_tx_hash='...'`, `closed_at=NOW()`
6. **MISSING**: Backend does NOT clear `accumulated_balance` or update `last_ledger_sync`

**Result**: Database shows stale balance even though worker was paid via XRPL transaction.

### Impact on Deletion Eligibility

**Original Deletion Logic** (before 2025-12-06 fix):
```javascript
// BLOCKED if: active channel OR unpaid balance OR no closure tx
AND (
  pc.status = 'active'
  OR pc.accumulated_balance > 0  ← Triggered by stale 0.29 XAH
  OR pc.closure_tx_hash IS NULL
)
```

**Fixed Deletion Logic** (after 2025-12-06 fix):
```javascript
// BLOCKED only if: truly active channel OR unpaid balance
AND (
  pc.status IN ('active', 'timeout', 'closing')
  OR pc.accumulated_balance > 0  ← Still checks balance
)
```

Even with the fixed deletion logic, Channel 4's stale `accumulated_balance = 0.29` would still block deletion. The database balance needed to be manually cleared after ledger verification.

## Implemented Improvements

### 1. Auto-Clear Balance on Closure Confirmation ✅ IMPLEMENTED (2025-12-06)

**Backend Endpoint**: `POST /api/payment-channels/:channelId/close/confirm`

**Enhancement Applied**:
```javascript
// IMMEDIATE CLOSURE: Update to 'closed' state
// AUTO-CLEAR BALANCE: Worker received payment via XRPL transaction
// Clear accumulated_balance to prevent stale data (Fix 2025-12-06)
const updateResult = await query(
  `UPDATE payment_channels
   SET
     status = 'closed',
     closure_tx_hash = $1,
     closed_at = NOW(),
     accumulated_balance = 0,      ← AUTO-CLEAR ✅
     last_ledger_sync = NOW(),      ← RECORD SYNC ✅
     updated_at = NOW()
   WHERE channel_id = $2
   RETURNING *`,
  [txHash, channelId]
)
```

**Scheduled Closure Also Updated**:
```javascript
// SOURCE CLOSURE: Update to 'closing' state with expiration time
const updateResult = await query(
  `UPDATE payment_channels
   SET
     status = 'closing',
     closure_tx_hash = $1,
     expiration_time = to_timestamp($2),
     accumulated_balance = 0,       ← AUTO-CLEAR ✅
     last_ledger_sync = NOW(),       ← RECORD SYNC ✅
     last_validation_at = NOW(),
     updated_at = NOW()
   WHERE channel_id = $3
   RETURNING *`,
  [txHash, expirationTimestamp, channelId]
)
```

**Location**: `backend/routes/paymentChannels.js`
- Immediate closure: Lines 1120-1132
- Scheduled closure: Lines 1087-1100

**Rationale**: If the closure transaction succeeded on the ledger, the worker received their balance. Automatically clear it in the database to prevent future stale balance issues.

### 2. Ledger Sync Endpoint for Closed Channels

**New Endpoint**: `POST /api/payment-channels/:channelId/sync-closed`

**Purpose**: Allow manual synchronization of closed channels with ledger state.

**Logic**:
1. Query closure transaction hash on Xahau
2. Extract balance from PaymentChannelClaim
3. Verify channel no longer exists on ledger
4. Update database: `accumulated_balance = 0`, `last_ledger_sync = NOW()`

**Use Case**: Fix stale balances for channels closed before auto-clear was implemented.

### 3. Deletion Pre-Check with Ledger Verification

**Enhancement to**: `GET /api/workers/deletion-eligibility`

**Logic**:
```javascript
// For each closed channel with accumulated_balance > 0
if (channel.status === 'closed' && channel.accumulated_balance > 0) {
  // Verify with ledger
  const ledgerState = await verifyChannelOnLedger(channel.channel_id)

  if (!ledgerState.exists) {
    // Channel removed from ledger → Balance was paid
    // Auto-clear stale balance
    await clearStaleBalance(channel.id)
    channel.accumulated_balance = 0  // Update in-memory for eligibility check
  }
}
```

**Benefit**: Automatic stale balance detection and correction during deletion eligibility checks.

## Testing Checklist

### Verify Fix for Channel 4

- [x] Run `node backend/scripts/verify-channel-balance.js` → Confirms payment sent to worker
- [x] Run `backend/scripts/clear-stale-channel-balances.sql` → Clears stale balance
- [x] Query worker's channels → Both channels show `accumulated_balance = 0.00`
- [x] Test deletion eligibility → No longer blocked by Channel 4

### Test Future Channel Closures (AUTO-CLEAR IMPLEMENTED ✅)

**Expected Behavior After Fix**:
- [x] Auto-clear implementation added to both closure paths (2025-12-06)
- [ ] Create new payment channel with test worker
- [ ] Worker logs hours → Accumulate balance (e.g., 0.5 XAH)
- [ ] Close channel → Verify worker receives balance on ledger via transaction query
- [ ] **Check database → `accumulated_balance` should AUTO-CLEAR to 0.00** ✅
- [ ] **Verify `last_ledger_sync` is updated to closure timestamp** ✅
- [ ] Test worker deletion → Should NOT be blocked by closed channel (balance = 0.00)
- [ ] Verify no stale balance issues going forward

### Edge Cases

- [ ] Close channel with 0 accumulated balance → Should not cause errors
- [ ] Close channel without signing transaction → Balance should remain (tx failed)
- [ ] Close channel but transaction fails on ledger → Balance should remain for retry

## Files Modified

1. **backend/scripts/verify-channel-balance.js** (NEW)
   - Ledger verification script for Channel 4
   - Queries closure transaction and channel existence

2. **backend/scripts/clear-stale-channel-balances.sql** (NEW)
   - SQL script to fix Channel 4's stale balance
   - Template for fixing similar issues

3. **backend/routes/workers.js** (PREVIOUSLY FIXED)
   - Lines 232-245: Fixed deletion eligibility check
   - Lines 332-353: Fixed delete-profile endpoint eligibility
   - Changed from `OR pc.closure_tx_hash IS NULL` to `AND pc.status IN ('active', 'timeout', 'closing')`

## Related Issues

### Issue 1: Polling Removed from WorkerDashboard
- **Date**: 2025-12-06
- **Change**: Removed 30-second polling (240 API calls/hour reduction)
- **Impact**: Manual refresh required → May delay detection of stale balances
- **Mitigation**: "Sync All Channels" button triggers manual sync

### Issue 2: Auto-Close Channels Missing from Ledger
- **Date**: 2025-12-06
- **Change**: Channels not found on ledger auto-marked as `status='closed'`, `closure_reason='ledger_not_found'`
- **Impact**: Creates closed channels without closure_tx_hash
- **Behavior**: Deletion eligibility correctly allows these (fixed logic ignores closure_tx_hash check)

### Issue 3: Worker Deletion Blocked by Closed Channels
- **Date**: 2025-12-06 (before stale balance fix)
- **Cause**: Original deletion logic blocked on `OR pc.closure_tx_hash IS NULL`
- **Fix**: Changed to `AND pc.status IN ('active', 'timeout', 'closing')`
- **Remaining Issue**: Closed channels with stale `accumulated_balance > 0` still blocked deletion
- **Final Fix**: Manually clear stale balances via ledger verification

## Conclusion

**Root Cause**: Payment channel closure confirmation does NOT automatically clear `accumulated_balance` in database, even though worker receives payment via XRPL transaction.

**Immediate Fix**: Manually verified Channel 4 on Xahau ledger, confirmed payment was sent, cleared stale balance in database.

**Long-Term Solution**: Implement auto-clear of `accumulated_balance` in `/close/confirm` endpoint to prevent future stale balance issues.

**Worker Profile Deletion**: Now unblocked for wallet `rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS` - both channels have `status='closed'` and `accumulated_balance=0.00`.

## Verification Commands

```bash
# 1. Verify Channel 4 on ledger (already paid)
node backend/scripts/verify-channel-balance.js

# 2. Clear stale balance in database
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev \
  -f backend/scripts/clear-stale-channel-balances.sql

# 3. Check worker's channels no longer block deletion
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev -c "
SELECT
  pc.id,
  pc.status,
  pc.accumulated_balance,
  o.organization_name
FROM payment_channels pc
JOIN employees e ON pc.employee_id = e.id
JOIN organizations o ON pc.organization_id = o.id
WHERE e.employee_wallet_address = 'rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS'
ORDER BY pc.id;
"

# Expected output: Both channels show accumulated_balance = 0.00
```
