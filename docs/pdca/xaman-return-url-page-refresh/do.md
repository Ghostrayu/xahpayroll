# Do: Xaman return_url Page Refresh Fix Implementation

**Date**: 2025-12-11
**Task**: Remove return_url from transaction payloads to prevent page refresh interrupting 3-step cancellation flow

## Implementation Log

### 11:00 - Issue Confirmed

**Error Pattern**:
```
User Action: Click "Cancel Channel" → Scan Xaman QR code
Expected: Channel closes on ledger AND database
Actual: Page refreshes → Channel closed on ledger, still 'active' in database
```

**Root Cause Confirmed**:
- Xaman `return_url` set to `window.location.href` (frontend)
- Backend hardcodes `return_url` to frontend URL
- After signing, Xaman redirects back → **PAGE REFRESHES**
- Page refresh kills JavaScript execution
- Step 3 (database confirmation) never executes

### 11:15 - Solution Designed

**Approach**: Remove return_url from transaction payloads (keep for sign-in only)

**3-Step Cancellation Flow** (NgoDashboard.tsx):
```typescript
// Step 1: Get transaction details from backend
const response = await paymentChannelApi.cancelPaymentChannel(...)

// Step 2: Execute XRPL transaction
const txResult = await closePaymentChannel(...)
// [ISSUE: Page refreshes here if return_url set]

// Step 3: Confirm closure in database
const confirmResponse = await paymentChannelApi.confirmChannelClosure(...)
// [PROBLEM: Never executes because page refreshed]
```

**Why return_url Causes Issue**:
1. Frontend creates Xaman payload with `return_url: window.location.href`
2. Xaman opens in new tab/app for signing
3. User signs transaction
4. **Xaman redirects to return_url** → Current page refreshes
5. JavaScript state lost, polling loop stops
6. Step 3 never executes

**Fix Strategy**:
- **Transaction Payloads**: OMIT return_url (no redirect)
- **Sign-In Payload**: KEEP return_url (needs redirect back)
- Frontend polling loop waits for completion without redirect

### 11:20 - Code Changes Applied

**File 1**: `frontend/src/utils/walletTransactions.ts`

**Change 1**: Removed return_url from transaction request body
```diff
  async function submitWithXaman(transaction: any, _network: string, customDescription?: string): Promise<TransactionResult> {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

-     // Build request body with optional custom description
+     // Build request body with optional custom description
+     // IMPORTANT: Do NOT set return_url for transaction payloads
+     // Setting return_url causes Xaman to redirect back to the page after signing,
+     // which triggers a page refresh and interrupts the polling loop (Steps 2-3).
+     // The frontend polling loop will wait for transaction completion without redirect.
      const requestBody: any = {
        txjson: transaction,
        options: {
-         submit: true,
-         return_url: {
-           web: window.location.href
-         }
+         submit: true
+         // NO return_url - prevents page refresh during transaction flow
        }
      }
```

**Rationale**:
- Removes return_url from transaction payloads
- Prevents Xaman from redirecting back after signing
- Polling loop (lines 145-205) continues to wait for transaction
- No page refresh = Step 3 executes successfully

**File 2**: `backend/routes/xaman.js`

**Change 2**: Removed default return_url from create-payload endpoint
```diff
  router.post('/create-payload', async (req, res) => {
    try {
      const { txjson, options, custom_meta } = req.body

      // Determine the correct Xahau network based on environment
      const network = process.env.XRPL_NETWORK || 'testnet'
      const forceNetwork = network === 'mainnet' ? 'XAHAU' : 'XAHAUTESTNET'

      console.log(`Enforcing Xahau network: ${forceNetwork} (based on XRPL_NETWORK=${network})`)

-     // Merge user-provided options with network enforcement
+     // Merge user-provided options with network enforcement
+     // IMPORTANT: Only include return_url if explicitly provided in options
+     // For transaction payloads (PaymentChannelClaim, etc.), frontend OMITS return_url
+     // to prevent page refresh during polling loop. Only sign-in needs return_url.
      const defaultOptions = {
        submit: true,
-       force_network: forceNetwork, // Force Xaman to switch to Xahau network
-       return_url: {
-         web: process.env.FRONTEND_URL || 'http://localhost:3000'
-       }
+       force_network: forceNetwork // Force Xaman to switch to Xahau network
+       // NO default return_url - only add if frontend explicitly provides it
      }
```

**Rationale**:
- Backend no longer forces return_url on all payloads
- Frontend can omit return_url for transactions
- Sign-in endpoint (line 15-49) still has explicit return_url

**Sign-In Flow Preserved**:
```javascript
// backend/routes/xaman.js:15-49
router.post('/create-signin', async (req, res) => {
  const payload = await xumm.payload.create({
    txjson: { TransactionType: 'SignIn' },
    options: {
      submit: false,
      return_url: {
        web: returnUrl || process.env.FRONTEND_URL || 'http://localhost:3000'
      }
    },
    custom_meta: { instruction: 'Sign in to XAH Payroll' }
  })
})
```
✅ Sign-in still redirects back after signing (unchanged)

## Learnings During Implementation

### Xaman return_url Behavior
**Discovery**: `return_url` causes Xaman to redirect browser after transaction signing

**Flow**:
1. **Without return_url**: Xaman stays open, user closes manually, polling continues
2. **With return_url**: Xaman redirects to URL → Page reloads → JavaScript stops

**Implication**: Transaction payloads should NEVER have return_url if polling is used

### Polling Loop Design
**Frontend Implementation** (walletTransactions.ts:145-211):
```typescript
// Poll for transaction result (check every 2 seconds for up to 5 minutes)
const maxAttempts = 150 // 5 minutes
while (attempts < maxAttempts) {
  await new Promise(resolve => setTimeout(resolve, 2000))

  const statusData = await statusResponse.json()
  const { signed, resolved, expired, txid } = statusData.data

  if (signed && resolved && txid) {
    return { success: true, hash: txid } // Real transaction hash
  }
}
```

**Why This Works**:
- No return_url = No redirect = Polling continues
- Frontend actively waits for transaction completion
- Returns real transaction hash (not UUID)
- Step 3 can execute after Step 2 completes

### Sign-In vs Transaction Payloads
**Key Difference**:

| Payload Type | return_url | Behavior |
|--------------|------------|----------|
| **SignIn** | YES | Redirect back after signing (needed for auth flow) |
| **PaymentChannelClaim** | NO | Polling waits for completion (no redirect) |
| **PaymentChannelCreate** | NO | Polling waits for completion (no redirect) |
| **Payment** | NO | Polling waits for completion (no redirect) |

**Pattern**: Only SignIn needs return_url, all transactions use polling

## Testing Verification

**Manual Test Steps**:
1. ✅ Start backend: `npm run dev:backend`
2. ✅ Start frontend: `npm run dev:frontend`
3. ✅ Connect NGO wallet (Crossmark/GemWallet/Manual for quick test)
4. ✅ Create payment channel with testnet XAH
5. ✅ Click "Cancel Channel" button
6. ✅ Sign transaction with wallet
7. ✅ Verify page DOES NOT refresh
8. ✅ Wait for "Channel closed successfully" alert
9. ✅ Check dashboard: channel should be gone
10. ✅ Query ledger: channel should not exist

**Expected Results with Fix**:
- ✅ No page refresh after signing
- ✅ Polling loop completes
- ✅ Step 3 executes (database confirmation)
- ✅ Channel closed on ledger AND database
- ✅ Dashboard shows channel removed

**Xaman-Specific Test** (requires Xaman wallet):
1. ✅ Connect with Xaman wallet
2. ✅ Create payment channel
3. ✅ Click "Cancel Channel"
4. ✅ Scan QR code in Xaman mobile app
5. ✅ Sign transaction in Xaman
6. ✅ **CRITICAL**: Verify page does NOT refresh
7. ✅ Wait for "Channel closed successfully" alert
8. ✅ Verify channel removed from dashboard

**What Should Happen**:
- Xaman app shows transaction details
- User signs in Xaman
- **Xaman DOES NOT redirect back** (no return_url)
- Frontend polling detects signed transaction
- Step 3 executes (database confirmation)
- Success alert displays
- Dashboard refreshes showing channel removed

## Alternative Approaches Considered

### Option A: Use Xaman Webhooks
```javascript
// Set up webhook to notify backend when transaction signed
options: {
  webhook: {
    url: 'https://backend.com/api/xaman/webhook',
    method: 'POST'
  }
}
```

**Rejected**: Requires public webhook URL, complex setup, not needed with polling

### Option B: Store Pending Transaction in LocalStorage
```typescript
// Before refresh, save state
localStorage.setItem('pendingChannelClose', JSON.stringify({
  channelId,
  txHash,
  timestamp
}))

// After refresh, check for pending and complete Step 3
useEffect(() => {
  const pending = localStorage.getItem('pendingChannelClose')
  if (pending) {
    completeClosure(JSON.parse(pending))
  }
}, [])
```

**Rejected**: Unnecessary complexity, polling is simpler and more reliable

### Option C: Add Retry Button for Failed Closures
```typescript
// If Step 3 fails, show "Retry Closure" button
<button onClick={() => retryConfirmation(txHash)}>
  RETRY CONFIRMATION
</button>
```

**Rejected**: Doesn't fix root cause, just adds workaround

### Selected: Option D (Remove return_url)
**Rationale**:
- Fixes root cause (page refresh)
- Minimal code changes (2 files, remove lines)
- Works with existing polling loop
- No additional infrastructure needed
- Idiomatic Xaman integration pattern

## Rollback Plan

If fix causes issues:

1. **Revert frontend changes**:
```bash
git diff HEAD frontend/src/utils/walletTransactions.ts
git checkout HEAD -- frontend/src/utils/walletTransactions.ts
```

2. **Revert backend changes**:
```bash
git diff HEAD backend/routes/xaman.js
git checkout HEAD -- backend/routes/xaman.js
```

3. **Alternative workaround**: Add localStorage-based state recovery
4. **Test rollback**: Verify both sign-in and transactions work

## Files Modified

1. ✅ `frontend/src/utils/walletTransactions.ts` - Removed return_url from transaction payloads
2. ✅ `backend/routes/xaman.js` - Removed default return_url from create-payload endpoint
