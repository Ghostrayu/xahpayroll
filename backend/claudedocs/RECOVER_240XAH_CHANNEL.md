# Recovery Guide: 240 XAH Stuck Channel

## Your Current Situation

**Channel ID**: `A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF`

**Problem**:
- ✅ Database shows channel as "closed" (status='closed')
- ❌ Channel still exists on Xahau ledger with 240 XAH locked
- ❌ Database has UUID `7e0d0e48-4dad-450d-98cf-f687d7b58004` instead of real transaction hash
- ❌ Frontend shows no payment channels (thinks it's closed)
- ❌ 240 XAH escrow NOT returned to your wallet

**Root Cause**: Xaman wallet integration bug - returned payload UUID instead of waiting for actual transaction hash. The XRPL transaction failed with `temBAD_AMOUNT` error, but database was incorrectly updated as if it succeeded.

## ✅ Fix Applied

The code has been fixed to prevent this from happening again:
1. ✅ Removed `Amount` field from PaymentChannelClaim transaction (temBAD_AMOUNT fix)
2. ✅ Fixed Xaman integration to poll for real transaction hash instead of returning UUID

## Recovery Steps

### Step 1: Reset Database Status

Open PostgreSQL and run this SQL command:

```sql
UPDATE payment_channels
SET
  status = 'active',
  closure_tx_hash = NULL,
  closed_at = NULL
WHERE channel_id = 'A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF';
```

**Verify reset worked**:
```sql
SELECT channel_id, status, closure_tx_hash, closed_at
FROM payment_channels
WHERE channel_id = 'A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF';

-- Expected result:
-- channel_id: A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF
-- status: active
-- closure_tx_hash: NULL
-- closed_at: NULL
```

### Step 2: Rebuild Frontend (Code Fix Applied)

The Xaman polling fix has been applied. Rebuild the frontend:

```bash
cd frontend
npm run build
```

If running development server, restart it:
```bash
# From project root
npm run dev
```

### Step 3: Refresh NGO Dashboard

1. Open your browser and go to NGO Dashboard
2. **Hard refresh**: Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
3. The payment channel should now appear again in the active channels list

**Expected**:
- Channel shows as "Active"
- Job name, worker address, escrow balance (240 XAH) displayed
- "Cancel Channel" button available

### Step 4: Close Channel (This Time It Will Work)

1. Click **"Cancel Channel"** button on the payment channel
2. Review confirmation modal:
   - Channel ID: `A3D68ED1D0...`
   - Escrow funded: 240 XAH
   - Worker balance: 0 XAH
   - Escrow return: 240 XAH
3. Click **"Confirm"**
4. Xaman app will open in new tab

**IMPORTANT**: Do NOT close the original tab! The system is now polling for transaction completion.

5. In Xaman app:
   - Review transaction details
   - Verify it's a PaymentChannelClaim with:
     - Channel: `A3D68ED1D0...`
     - Balance: 0 (no worker payment)
     - Flags: tfClose (closes channel)
   - **Sign** the transaction

6. **Wait for polling to complete** (console will show progress):
   ```
   [XAMAN] Created payload: <uuid>
   [XAMAN] Waiting for user to sign transaction...
   [XAMAN] Payload status: { signed: false, resolved: false, ... }
   [XAMAN] Waiting... (1/150)
   [XAMAN] Waiting... (2/150)
   ...
   [XAMAN] Payload status: { signed: true, resolved: true, txid: '7A8F9B...' }
   [XAMAN] ✅ Transaction signed successfully. TX Hash: 7A8F9B...
   [CLOSE_CHANNEL_SUCCESS] { hash: '7A8F9B...', channelId: 'A3D68ED...' }
   ```

7. Success message appears in dashboard:
   - "PAYMENT CHANNEL CLOSED SUCCESSFULLY"
   - Channel disappears from active channels list

### Step 5: Verify Escrow Returned

**Check your NGO wallet balance**:
- Open Xaman app
- Check wallet balance
- Should have increased by **240 XAH**

**Verify database updated correctly**:
```sql
SELECT channel_id, status, closure_tx_hash, closed_at
FROM payment_channels
WHERE channel_id = 'A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF';

-- Expected result:
-- channel_id: A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF
-- status: closed
-- closure_tx_hash: 7A8F9B... (64-character HEX, NOT UUID!)
-- closed_at: 2025-11-28 XX:XX:XX
```

**Verify channel removed from ledger**:
```bash
cd backend
node scripts/check-channel-status.js A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF

# Expected output:
# ✅ Channel DOES NOT EXIST on ledger
# This means the channel was successfully closed and funds were distributed.
```

## Troubleshooting

### Problem: Channel Still Not Showing After Step 3

**Possible causes**:
- Frontend not rebuilt
- Browser cache not cleared
- Database reset didn't work

**Solutions**:
1. Verify database reset:
   ```sql
   SELECT status FROM payment_channels WHERE channel_id = 'A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF';
   -- Should return: active
   ```

2. Clear browser cache completely:
   - Open DevTools (F12)
   - Right-click refresh button
   - Select "Empty Cache and Hard Reload"

3. Try different browser or incognito mode

### Problem: Polling Times Out (5 minutes)

**Error**: "TIMEOUT: USER DID NOT SIGN TRANSACTION WITHIN 5 MINUTES"

**Solutions**:
1. Try again - the channel is still active
2. Make sure to sign transaction in Xaman app within 5 minutes
3. Keep original browser tab open during signing

### Problem: Transaction Rejected

**Error**: "TRANSACTION REJECTED BY USER"

**Solution**: This just means you clicked "Reject" in Xaman app. Try again and click "Sign" this time.

### Problem: Payload Expired

**Error**: "XAMAN PAYLOAD EXPIRED. PLEASE TRY AGAIN."

**Solution**: Xaman payloads expire after ~10 minutes. Just try the channel closure again - it will create a fresh payload.

### Problem: Still Getting temBAD_AMOUNT Error

**This should not happen** with the fix applied. If it does:

1. Verify you rebuilt the frontend:
   ```bash
   cd frontend
   npm run build
   ```

2. Check console logs for [CLOSE_CHANNEL] messages

3. Verify backend code has the fix:
   ```bash
   cd backend
   grep -A 5 "xrplTransaction:" routes/paymentChannels.js
   ```
   Should NOT have `Amount` field, only:
   - TransactionType
   - Channel
   - Balance
   - Flags

## What Was Fixed

### Fix #1: temBAD_AMOUNT Error
- **Before**: Code tried to use `Amount` field to return escrow (incorrect)
- **After**: Removed `Amount` field - escrow returns automatically when channel closes
- **File**: `backend/routes/paymentChannels.js:368-377`

### Fix #2: Xaman UUID Instead of Transaction Hash
- **Before**: Returned payload UUID immediately, never waited for transaction
- **After**: Polls for transaction status, waits for real transaction hash
- **File**: `frontend/src/utils/walletTransactions.ts:103-220`

## Prevention

These issues will not happen again because:

1. ✅ XRPL transactions are properly structured (no Amount field)
2. ✅ Xaman integration waits for real transaction hash (polling implemented)
3. ✅ Failed transactions will properly return errors, not fake success
4. ✅ Database only updated after XRPL transaction confirmed successful

## Support

If you encounter any issues during recovery:

1. **Check console logs**: Open browser DevTools (F12) → Console tab
2. **Database verification**: Run SQL queries to check current state
3. **Ledger verification**: Run `check-channel-status.js` script
4. **Recovery script**: Run `recover-stuck-channel.js` for detailed diagnosis

## Timeline

**Total recovery time**: ~5-10 minutes
- Step 1 (Database reset): 30 seconds
- Step 2 (Rebuild frontend): 1-2 minutes
- Step 3 (Refresh dashboard): 10 seconds
- Step 4 (Close channel + polling): 2-5 minutes
- Step 5 (Verify): 1 minute

## Success Criteria

✅ Channel closed in database with real transaction hash (64-char hex)
✅ Channel does not exist on Xahau ledger
✅ NGO wallet balance increased by 240 XAH
✅ Frontend shows no active channels
✅ No errors in console logs

---

**Last Updated**: 2025-11-28
**Channel ID**: A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF
**Locked Amount**: 240 XAH
**Status**: Code fix applied, ready for recovery
