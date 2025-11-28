# Xaman Transaction Fix - UUID vs Real Transaction Hash

## Problem Summary

**User-Reported Issue**: "frontend not showing any payment channels but escrow is not returned"

**Root Cause**: Xaman wallet integration returns payload UUID instead of waiting for actual transaction hash, causing database to record failed transactions as successful.

## Technical Analysis

### Current Broken Flow

1. User clicks "Cancel Channel" in NgoDashboard
2. Frontend calls `closePaymentChannel()` → `submitTransactionWithWallet('xaman')`
3. `submitWithXaman()` creates Xaman payload (UUID: `7e0d0e48-4dad-450d-98cf-f687d7b58004`)
4. **BROKEN**: Returns `{ success: true, hash: data.uuid }` immediately (line 148)
5. Frontend calls `confirmChannelClosure()` with UUID
6. Database updated: `status='closed'`, `closure_tx_hash='UUID'`
7. **ACTUAL XRPL TRANSACTION FAILS** with `temBAD_AMOUNT` error
8. Channel still exists on ledger with 240 XAH locked
9. Frontend shows no channels (database says closed)
10. User's funds stuck in channel

### Evidence

**Database State**:
```sql
SELECT channel_id, status, closure_tx_hash, closed_at
FROM payment_channels
WHERE channel_id = 'A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF';

-- Result:
-- channel_id: A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF
-- status: closed
-- closure_tx_hash: 7e0d0e48-4dad-450d-98cf-f687d7b58004 (UUID, NOT transaction hash!)
-- closed_at: 2025-11-28 03:21:21.956145
```

**Ledger State**:
```bash
node scripts/check-channel-status.js A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF

# Result:
# ✅ Channel EXISTS on ledger
# Account (NGO): rDdXRK8xTkNiUTtMHqpnaJ3ofYb8W1N2WW
# Destination (Worker): rJZ3EE8ULrr1LoXLjx3h3Zy29FWDPdvFhH
# Amount (Escrow): 240 XAH
# Balance (Owed to Worker): 0 XAH
# Available to Return: 240 XAH
```

**Problematic Code** (`frontend/src/utils/walletTransactions.ts:102-153`):
```typescript
async function submitWithXaman(transaction: any, _network: string, customDescription?: string): Promise<TransactionResult> {
  try {
    // ... create payload logic ...

    const response = await fetch(`${backendUrl}/api/xaman/create-payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    const data = await response.json()

    if (data.refs?.qr_png) {
      window.open(data.next.always, '_blank')
    }

    // ❌ BROKEN: Returns payload UUID as "hash", not actual transaction hash
    // Poll for transaction result
    // In production, you'd use websockets or webhooks
    return {
      success: true,
      hash: data.uuid // Xaman payload UUID ⚠️ THIS IS THE PROBLEM!
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Xaman transaction failed' }
  }
}
```

## The Fix

### Updated `submitWithXaman` Function

**File**: `frontend/src/utils/walletTransactions.ts`

**Strategy**: Poll the `/api/xaman/payload/:uuid` endpoint until transaction is signed and submitted, then return the actual transaction hash.

```typescript
/**
 * Submit transaction using Xaman (formerly Xumm)
 * FIXED: Now waits for actual transaction hash instead of returning payload UUID
 */
async function submitWithXaman(
  transaction: any,
  _network: string,
  customDescription?: string
): Promise<TransactionResult> {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

    // Build request body with optional custom description
    const requestBody: any = {
      txjson: transaction,
      options: {
        submit: true,
        return_url: {
          web: window.location.href
        }
      }
    }

    if (customDescription) {
      requestBody.custom_meta = {
        instruction: customDescription
      }
    }

    // Step 1: Create Xaman payload
    const response = await fetch(`${backendUrl}/api/xaman/create-payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      return { success: false, error: 'FAILED TO CREATE XAMAN PAYLOAD' }
    }

    const data = await response.json()
    const payloadUuid = data.uuid

    console.log('[XAMAN] Created payload:', payloadUuid)

    // Step 2: Open Xaman app/website for signing
    if (data.refs?.qr_png || data.next?.always) {
      window.open(data.next.always, '_blank')
    }

    // Step 3: Poll for transaction result (check every 2 seconds for up to 5 minutes)
    console.log('[XAMAN] Waiting for user to sign transaction...')
    const maxAttempts = 150 // 5 minutes (150 * 2 seconds)
    let attempts = 0

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
      attempts++

      try {
        // Query payload status
        const statusResponse = await fetch(
          `${backendUrl}/api/xaman/payload/${payloadUuid}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        )

        if (!statusResponse.ok) {
          console.warn('[XAMAN] Failed to fetch payload status, retrying...')
          continue
        }

        const statusData = await statusResponse.json()
        const { signed, resolved, expired, txid } = statusData.data

        console.log('[XAMAN] Payload status:', { signed, resolved, expired, txid, attempt: attempts })

        // Check if payload expired
        if (expired) {
          return {
            success: false,
            error: 'XAMAN PAYLOAD EXPIRED. PLEASE TRY AGAIN.'
          }
        }

        // Check if user rejected
        if (resolved && !signed) {
          return {
            success: false,
            error: 'TRANSACTION REJECTED BY USER'
          }
        }

        // Check if transaction was signed and submitted successfully
        if (signed && resolved && txid) {
          console.log('[XAMAN] ✅ Transaction signed successfully. TX Hash:', txid)

          // ✅ FIXED: Return actual transaction hash, not UUID
          return {
            success: true,
            hash: txid // Real XRPL transaction hash
          }
        }

        // Not resolved yet, continue polling
        console.log(`[XAMAN] Waiting... (${attempts}/${maxAttempts})`)

      } catch (pollError: any) {
        console.error('[XAMAN] Error polling payload status:', pollError)
        // Continue polling on error
      }
    }

    // Timeout after 5 minutes
    return {
      success: false,
      error: 'TIMEOUT: USER DID NOT SIGN TRANSACTION WITHIN 5 MINUTES'
    }

  } catch (error: any) {
    console.error('[XAMAN] Transaction submission error:', error)
    return {
      success: false,
      error: error.message || 'XAMAN TRANSACTION FAILED'
    }
  }
}
```

### Key Changes

1. **Polling Loop**: Checks payload status every 2 seconds for up to 5 minutes
2. **Status Validation**: Checks `signed`, `resolved`, `expired` flags
3. **Real Transaction Hash**: Returns `txid` from payload response, NOT UUID
4. **User Feedback**: Console logs show progress ("Waiting...", "Transaction signed")
5. **Error Handling**: Handles expired payloads, user rejection, timeout
6. **Timeout Protection**: 5-minute maximum wait time (150 attempts × 2 seconds)

## Recovery Steps for Current Stuck Channel

### Step 1: Reset Database Status
```sql
UPDATE payment_channels
SET
  status = 'active',
  closure_tx_hash = NULL,
  closed_at = NULL
WHERE channel_id = 'A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF';
```

### Step 2: Apply Code Fix
Replace `submitWithXaman` function in `frontend/src/utils/walletTransactions.ts` with the fixed version above.

### Step 3: Rebuild Frontend
```bash
cd frontend
npm run build
```

### Step 4: Test Channel Closure
1. Refresh NgoDashboard - channel should appear again
2. Click "Cancel Channel"
3. Sign transaction in Xaman app
4. Wait for polling to complete (console will show progress)
5. Verify success message
6. Check wallet balance - 240 XAH should be returned
7. Verify channel no longer exists on ledger

### Step 5: Verify Database
```sql
SELECT channel_id, status, closure_tx_hash, closed_at
FROM payment_channels
WHERE channel_id = 'A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF';

-- closure_tx_hash should now be a real 64-character hex transaction hash
-- Example: 7E5F9F8A... (NOT a UUID like 7e0d0e48-4dad-450d-98cf-f687d7b58004)
```

### Step 6: Verify Ledger
```bash
node scripts/check-channel-status.js A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF

# Should return:
# ✅ Channel DOES NOT EXIST on ledger
# This means the channel was successfully closed and funds were distributed.
```

## Testing Checklist

### Pre-Deployment Tests
- [ ] Create test payment channel with 10 XAH
- [ ] Attempt cancellation with Xaman wallet
- [ ] Verify polling logs appear in console
- [ ] Sign transaction in Xaman app
- [ ] Confirm success message appears after signing
- [ ] Verify real transaction hash (64-char hex) stored in database
- [ ] Confirm 10 XAH returned to NGO wallet
- [ ] Verify channel removed from ledger

### Edge Case Tests
- [ ] Test user rejection (reject in Xaman app)
- [ ] Test payload expiration (wait >10 minutes without signing)
- [ ] Test network timeout (disconnect during polling)
- [ ] Test with 0 worker balance (escrow return only)
- [ ] Test with worker balance > 0 (both worker payment + escrow return)

### Cross-Wallet Validation
- [ ] Test channel closure with GemWallet (should still work)
- [ ] Test channel closure with Crossmark (should still work)
- [ ] Test channel closure with Manual wallet (should still work)

## Impact Analysis

### Files Modified
- `frontend/src/utils/walletTransactions.ts` - `submitWithXaman` function (lines 102-153)

### API Endpoints Used
- `POST /api/xaman/create-payload` - Create Xaman payload (existing)
- `GET /api/xaman/payload/:uuid` - Poll payload status (existing)

### User Experience Changes
- **Before**: Instant "success" but transaction actually failed silently
- **After**: Visible waiting period (2-300 seconds) while transaction processes
- **UX Enhancement**: Add loading spinner with message "WAITING FOR XAMAN SIGNATURE..."

### Database Schema
No changes required - `closure_tx_hash` will now contain real transaction hashes instead of UUIDs

## Monitoring & Alerts

### Success Metrics
- `closure_tx_hash` format: Must be 64-character hexadecimal string
- Channel exists on ledger: `false` after successful closure
- Escrow returned: NGO wallet balance increases by expected amount

### Failure Indicators
- `closure_tx_hash` is UUID format: Transaction failed but database updated
- Channel exists on ledger after "closed": Database-ledger mismatch
- Console errors: "Xaman transaction failed", "Timeout", "Rejected"

### Recommended Logging
```typescript
// Add to submitWithXaman
console.log('[XAMAN_METRICS]', {
  payloadUuid,
  waitTime: attempts * 2, // seconds
  signed,
  resolved,
  txid,
  timestamp: new Date().toISOString()
})
```

## Related Issues

### Issue 1: temBAD_AMOUNT Error
**Status**: ✅ FIXED (removed `Amount` field from PaymentChannelClaim)
**Files**:
- `backend/routes/paymentChannels.js:368-377`
- `frontend/src/utils/paymentChannels.ts:368-388`

### Issue 2: TEMP Channel IDs
**Status**: ✅ FIXED (3-tier fallback strategy)
**Files**:
- `frontend/src/utils/paymentChannels.ts:85-210`
- `backend/scripts/fix-temp-channel-ids.js`

### Issue 3: Xaman UUID as Transaction Hash
**Status**: 🔧 IN PROGRESS (this fix)
**Files**:
- `frontend/src/utils/walletTransactions.ts:102-153`

## Documentation Updates Required

### CLAUDE.md
Add section under "Payment Channel Implementation":

```markdown
### Xaman Transaction Polling (Fixed 2025-11-28)
- **Problem**: Xaman integration returned payload UUID instead of waiting for transaction hash
- **Impact**: Failed transactions incorrectly marked as successful in database
- **Fix**: Implemented polling loop that waits for actual transaction hash
- **Polling Strategy**: Check status every 2 seconds for up to 5 minutes
- **Status Checks**: `signed`, `resolved`, `expired` flags via `/api/xaman/payload/:uuid`
- **User Experience**: Transaction shows "waiting" state until Xaman signature confirmed
- **Timeout**: 5-minute maximum wait, then returns timeout error
- **Real Hash**: Returns `txid` from payload response, not UUID
```

### PAYMENT_CHANNEL_TESTING.md
Add test case:

```markdown
## Xaman Wallet Channel Closure Test

### Setup
1. Create payment channel with 10 XAH escrow
2. Connect with Xaman wallet
3. Open browser console for monitoring

### Test Procedure
1. Click "Cancel Channel" button
2. Xaman app/tab opens automatically
3. **IMPORTANT**: Keep original tab open, do not close
4. In Xaman app, review transaction details
5. Sign transaction
6. Return to original tab
7. Observe polling logs in console: "XAMAN Waiting... (1/150)"
8. Success message appears after ~5-10 seconds
9. Channel disappears from dashboard
10. Check NGO wallet balance (should increase by 10 XAH)

### Expected Console Output
```
[XAMAN] Created payload: 7e0d0e48-4dad-450d-98cf-f687d7b58004
[XAMAN] Waiting for user to sign transaction...
[XAMAN] Payload status: { signed: false, resolved: false, expired: false, txid: null, attempt: 1 }
[XAMAN] Waiting... (1/150)
...
[XAMAN] Payload status: { signed: true, resolved: true, expired: false, txid: '7A8F9B...' }
[XAMAN] ✅ Transaction signed successfully. TX Hash: 7A8F9B...
[CLOSE_CHANNEL_SUCCESS] { hash: '7A8F9B...', channelId: 'A3D68ED...' }
```

### Failure Cases
- **User rejects**: "TRANSACTION REJECTED BY USER"
- **Timeout (5 min)**: "TIMEOUT: USER DID NOT SIGN TRANSACTION WITHIN 5 MINUTES"
- **Expired payload**: "XAMAN PAYLOAD EXPIRED. PLEASE TRY AGAIN."
```

## Implementation Priority

**CRITICAL** - This fix should be deployed immediately because:
1. User funds are currently locked (240 XAH stuck in channel)
2. Database shows incorrect state (closed but channel still active)
3. Silent failures prevent users from knowing transactions failed
4. Affects all Xaman wallet users (likely majority of user base)

## Deployment Steps

1. **Code Review**: Review `submitWithXaman` changes
2. **Local Testing**: Test channel closure with Xaman on testnet
3. **Database Backup**: Backup payment_channels table before deployment
4. **Deploy Frontend**: Build and deploy updated walletTransactions.ts
5. **User Communication**: Notify affected users of stuck channels
6. **Recovery Assistance**: Help users recover locked funds via reset + retry
7. **Monitoring**: Watch for UUID format in closure_tx_hash (indicates failure)

## Success Criteria

✅ All new channel closures store 64-character hex transaction hashes
✅ No new UUIDs appear in `closure_tx_hash` column
✅ Channel closure with Xaman wallet waits for user signature
✅ Failed transactions properly return error, not success
✅ Database state matches ledger state after closure
✅ User's 240 XAH successfully recovered from stuck channel
