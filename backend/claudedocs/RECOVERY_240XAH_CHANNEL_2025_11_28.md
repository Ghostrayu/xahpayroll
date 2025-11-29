# Recovery Guide: 240 XAH Stuck Channel - 2025-11-28

**Issue**: Payment channel not showing in dashboard, 240 XAH escrow not returned
**Channel ID**: `A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF`
**Root Cause**: Channel closure attempted with old code (before Balance field fix)
**Status**: ✅ Database reset complete, ready for retry with new code

---

## Problem Analysis

### What Happened

1. **15:38:49 (2025-11-28)**: User tried to close channel using **OLD CODE**
   - Old code always included `Balance: "0"` field
   - XRPL validation rejected transaction (temBAD_AMOUNT error)
   - Transaction got hash but **never made it into validated ledger**

2. **Frontend/Backend Behavior**:
   - Assumed transaction succeeded based on having a hash
   - Updated database: `status='closed'`, recorded transaction hash
   - But actual ledger still has active channel with 240 XAH

3. **User Experience**:
   - Dashboard queries database → sees "closed" → shows no channels
   - Ledger still has channel → funds locked, not returned
   - User confused: "No channels shown, money not back"

### Evidence

**Database State (Before Recovery)**:
```sql
status: closed
closure_tx_hash: 8838DEE22F6A8D64B9225F4DB52CC41F9A11BD88016E7EFED004E196DAB08B43
closed_at: 2025-11-28 15:38:49.810373
```

**Ledger State**:
```
✅ Channel EXISTS on ledger
Account (NGO): ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW
Destination (Worker): rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS
Amount (Escrow): 240 XAH
Balance (Owed to Worker): 0 XAH
```

**Failed Transaction**:
```json
{
  "TransactionType": "PaymentChannelClaim",
  "Balance": "0",          ← OLD CODE: Always included
  "Flags": 65536,          ← tfClose flag (correct)
  "validated": false       ← NEVER VALIDATED!
}
```

---

## Recovery Steps

### Step 1: Database Reset ✅ COMPLETE

```sql
UPDATE payment_channels
SET status='active', closure_tx_hash=NULL, closed_at=NULL
WHERE channel_id='A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF';
```

**Result**: Channel now shows as `active` in database

### Step 2: Rebuild Frontend (REQUIRED)

The fix is already in the codebase (`frontend/src/utils/paymentChannels.ts:384-386`), but you need to rebuild to get it into the running application.

```bash
cd frontend
npm run build
```

**Why Necessary**: The conditional Balance field logic must be in the running code

### Step 3: Refresh Dashboard

```bash
# Hard refresh (clear cache)
Ctrl + Shift + R  (Windows/Linux)
Cmd + Shift + R   (Mac)
```

**Expected**: Channel should now appear in NGO Dashboard with:
- Job Name: test channel
- Escrow: 240 XAH
- Balance: 0 XAH
- Status: ACTIVE

### Step 4: Retry Channel Closure

1. **Click "Cancel Channel"** button
2. **Sign transaction in Xaman app**
3. **Wait for completion** (up to 5 minutes with polling)

**What Happens (With New Code)**:
```typescript
// params.balance = "0" (no hours worked)

const transaction = {
  TransactionType: 'PaymentChannelClaim',
  Account: NGO_wallet,
  Channel: channel_id,
  Flags: 0x00010000 (tfClose)
  // Balance field OMITTED (our fix!)
}

// Console log:
// balance: "0"
// balanceFieldIncluded: false ← Confirms Balance omitted
```

**Expected Result**:
- ✅ Transaction succeeds (no temBAD_AMOUNT)
- ✅ 240 XAH returns to NGO wallet
- ✅ Channel removed from ledger
- ✅ Database updated: `status='closed'`, real transaction hash
- ✅ Channel disappears from dashboard (correctly this time)

---

## Verification Steps

### After Channel Closure

**1. Check NGO Wallet Balance**:
```
Before: X XAH
After: X + 240 XAH
```

**2. Verify Channel Removed from Ledger**:
```bash
node scripts/check-channel-status.js A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF
```

**Expected**: "Channel not found on ledger" or error

**3. Check Database**:
```sql
SELECT status, closure_tx_hash, closed_at
FROM payment_channels
WHERE channel_id='A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF';
```

**Expected**:
- status: `closed`
- closure_tx_hash: Real 64-char hex (different from `8838DEE...`)
- closed_at: Current timestamp

**4. Verify Transaction Validated**:
```bash
node -e "
const { Client } = require('xrpl');
(async () => {
  const client = new Client('wss://xahau-test.net');
  await client.connect();
  const tx = await client.request({
    command: 'tx',
    transaction: 'NEW_TX_HASH_HERE'
  });
  console.log('Validated:', tx.result.validated);
  console.log('Balance field:', tx.result.Balance || 'NOT INCLUDED ✅');
  await client.disconnect();
})();
"
```

**Expected**:
- validated: `true` ✅
- Balance field: `NOT INCLUDED ✅`

---

## Technical Details

### The Fix (Applied to Codebase)

**File**: `frontend/src/utils/paymentChannels.ts:384-386`

**Before (Broken)**:
```typescript
const transaction: PaymentChannelClaim = {
  TransactionType: 'PaymentChannelClaim',
  Account: params.account,
  Channel: params.channelId,
  Balance: params.balance, // ← Always included
  Flags: 0x00010000,
}
```

**After (Fixed)**:
```typescript
const transaction: PaymentChannelClaim = {
  TransactionType: 'PaymentChannelClaim',
  Account: params.account,
  Channel: params.channelId,
  Flags: 0x00010000,
}

// CONDITIONAL: Only include Balance if non-zero
if (params.balance !== '0') {
  transaction.Balance = params.balance
}
```

### Why This Works

**XRPL Specification**:
> "The Balance field must be provided **EXCEPT when closing the channel**"

**Constraint**:
- Balance must be **greater than** current channel balance
- When current balance is 0 and accumulated balance is 0:
  - Including `Balance: "0"` → 0 is NOT > 0 → **temBAD_AMOUNT**
  - Omitting `Balance` field → Allowed for tfClose → **Success**

---

## Prevention

### For Future Closures

**Always check browser console** when closing channels:
```
[CLOSE_CHANNEL] Submitting PaymentChannelClaim transaction {
  channelId: 'A3D68ED1...',
  balance: '0',
  balanceFieldIncluded: false, ← Should be false when balance="0"
  escrowReturn: 240,
  provider: 'xaman',
  network: 'testnet'
}
```

**If you see**:
- `balanceFieldIncluded: false` when `balance: '0'` → ✅ Correct (new code)
- `balanceFieldIncluded: true` when `balance: '0'` → ❌ Old code, rebuild frontend!

### Database-Ledger Consistency

**Rule**: Never trust database alone for payment channel state

**Best Practice**:
1. Check database for channel info
2. **Always verify ledger state** before assuming closure
3. If discrepancy → investigate transaction validation status

### Monitoring

**Watch for**:
- Channels marked "closed" in database but user reports funds not returned
- Transaction hashes in database with `validated: false` on ledger
- Channels disappearing from dashboard but escrow not returned

**Action**: Run `check-channel-status.js` script to verify ledger state

---

## Timeline

**2025-11-28**:
- **02:39:52** - Channel created (240 XAH escrow)
- **15:38:49** - Closure attempted with old code → Failed validation
- **Later** - Balance field fix implemented in codebase
- **23:56** - Issue reported: "No channels shown, reserve not returned"
- **23:58** - Database reset to active, recovery guide created
- **Next** - User rebuilds frontend and retries closure with new code

---

## Related Documentation

- **Fix Details**: `backend/claudedocs/TEMBAD_AMOUNT_FIX_2025_11_28.md`
- **CLAUDE.md**: Critical Fix #3 (lines 280-299)
- **Memory**: `session_2025-11-28_tembad_amount_zero_balance_fix`
- **Testing Guide**: `PAYMENT_CHANNEL_TESTING.md`

---

## Support

If channel closure fails again after following this guide:

1. **Check browser console** for error messages
2. **Verify** `balanceFieldIncluded: false` when `balance: "0"`
3. **Run** `check-channel-status.js` to verify ledger state
4. **Check** transaction validation status on ledger
5. **Report** with all console logs and transaction details

**Contact**: Provide channel ID and transaction hash for investigation

---

**STATUS**: ✅ Database reset complete, ready for retry with fixed code
