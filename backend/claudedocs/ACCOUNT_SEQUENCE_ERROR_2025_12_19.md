# Account Sequence Error Fix - December 19, 2025

## Problem Summary

Workers are experiencing "unable to set account sequence" error when trying to close payment channels via Xaman wallet. The transaction seems slow and eventually fails with this error.

## Error Context

**Error Message**: "unable to set account sequence"
**Wallet**: Xaman (XUMM)
**User Type**: Workers closing their own channels
**NGO Closure**: Works fine without errors

## Root Cause Investigation

### Transaction Flow Comparison

#### NGO Closure (Working) ✅

**Frontend** (NgoDashboard.tsx:203-213):
```javascript
const txResult = await closePaymentChannel(
  {
    channelId: channel.channelId,
    balance: xrplTransaction.Balance,
    escrowReturn: xrplTransaction.Amount,
    account: walletAddress,  // NGO wallet
    publicKey: xrplTransaction.Public
  },
  provider,
  network
)
```

#### Worker Closure (Failing) ❌

**Frontend** (WorkerDashboard.tsx:220-234):
```javascript
const txResult = await closePaymentChannel(
  {
    channelId: channel.channelId,
    balance: xrplTransaction.Balance,
    escrowReturn: xrplTransaction.Amount,
    account: walletAddress,  // Worker wallet
    publicKey: xrplTransaction.Public,
    // Extra parameters (IGNORED by function):
    isSourceClosure: false,
    sourceAddress: selectedChannel.ngoWalletAddress,
    destinationAddress: walletAddress
  },
  provider,
  network
)
```

**Key Observation**: Worker passes 3 extra parameters that are **NOT USED** by `closePaymentChannel()`.

### Backend Transaction Template

**Endpoint**: `POST /api/payment-channels/:channelId/close`
**Backend Response** (paymentChannels.js:972-980):
```javascript
xrplTransaction: {
  TransactionType: 'PaymentChannelClaim',
  Channel: channel.channel_id,
  Balance: balanceDrops,  // Worker payment in drops
  Flags: 0x00020000      // tfClose flag
}
```

**Missing Fields**:
- `Account` - Added by frontend from `params.account`
- `Public` - Backend doesn't return this field (xrplTransaction.Public is undefined)
- `Fee` - Auto-filled by wallet provider
- `Sequence` - Auto-filled by wallet provider (THIS IS WHERE THE ERROR OCCURS)

### Final Transaction Structure

**After Frontend Processing** (paymentChannels.ts:734-758):
```javascript
const transaction: PaymentChannelClaim = {
  TransactionType: 'PaymentChannelClaim',
  Account: params.account,     // ← Worker wallet address
  Channel: params.channelId,
  Flags: 0x00020000,           // tfClose
  Balance: params.balance      // ← Only if balance > 0
  // PublicKey: params.publicKey  ← NOT ADDED (xrplTransaction.Public is undefined)
}
```

## Probable Root Causes

### 1. Network Mismatch
**Symptom**: Xaman wallet is configured for mainnet, but backend is using testnet
**Result**: Xaman queries mainnet for worker account → account doesn't exist → sequence query fails
**Verification**: Check `VITE_XRPL_NETWORK` in frontend/.env and `XRPL_NETWORK` in backend/.env

### 2. Worker Account Not Activated
**Symptom**: Worker wallet exists in database but NOT on Xahau testnet ledger
**Result**: Xaman queries ledger for account sequence → account doesn't exist → error
**Verification**: Query ledger for worker wallet:
```bash
# Check if account exists on testnet
curl -X POST https://xahau-test.net \
  -H "Content-Type: application/json" \
  -d '{
    "method": "account_info",
    "params": [{
      "account": "<WORKER_WALLET_ADDRESS>",
      "ledger_index": "validated"
    }]
  }'
```

Expected responses:
- **Account Exists**: Returns account data with `Sequence` field
- **Account NOT Exists**: Returns `actNotFound` error → **THIS CAUSES "unable to set account sequence"**

### 3. Xaman Network Configuration
**Symptom**: Xaman app is pointing to wrong WebSocket URL
**Result**: Wallet can't connect to testnet → can't query sequence
**User Action**: Open Xaman → Settings → Advanced → Network → Verify "Xahau Testnet" is selected

### 4. PublicKey Field Missing
**Symptom**: Backend doesn't return `Public` field in xrplTransaction
**Current Impact**: PublicKey is optional for PaymentChannelClaim, so this is NOT the error cause
**Potential Issue**: Missing signature validation (future security concern)

## Fix Priority

### IMMEDIATE (Critical)
1. **Verify Network Configuration**: Frontend and backend MUST use same network
2. **Check Worker Account Activation**: Worker wallet MUST exist on ledger before channel creation
3. **Add Pre-flight Validation**: Before submitting transaction, check account exists

### SHORT-TERM (Important)
1. **Add PublicKey to Backend Response**: Return channel's public key for signature validation
2. **Better Error Messages**: Distinguish between "account not found" vs "network error" vs "sequence error"
3. **Xaman Payload Configuration**: Add better error handling in Xaman polling loop

### LONG-TERM (Enhancement)
1. **Remove Unused Parameters**: Clean up worker closure code (isSourceClosure, sourceAddress, destinationAddress)
2. **Pre-activation Check**: During channel creation, verify worker account is activated
3. **Network Mismatch Detection**: Alert users if frontend/backend network configs differ

## Testing Procedure

### Step 1: Verify Network Configuration
```bash
# Frontend
cat frontend/.env | grep VITE_XRPL_NETWORK
# Expected: VITE_XRPL_NETWORK=testnet

# Backend
cat backend/.env | grep XRPL_NETWORK
# Expected: XRPL_NETWORK=testnet
```

### Step 2: Check Worker Account on Ledger
```bash
# Replace with actual worker wallet address
WORKER_WALLET="rXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

curl -X POST https://xahau-test.net \
  -H "Content-Type: application/json" \
  -d "{
    \"method\": \"account_info\",
    \"params\": [{
      \"account\": \"$WORKER_WALLET\",
      \"ledger_index\": \"validated\"
    }]
  }"
```

**Expected Output**:
```json
{
  "result": {
    "account_data": {
      "Account": "rXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "Balance": "50000000",  // 50 XAH in drops
      "Sequence": 12345,       // ← THIS IS WHAT XAMAN NEEDS
      "OwnerCount": 0
    },
    "status": "success"
  }
}
```

**Error Output** (Account Not Activated):
```json
{
  "error": "actNotFound",  // ← THIS CAUSES "unable to set account sequence"
  "error_message": "Account not found."
}
```

### Step 3: Activate Worker Account (If Needed)
```bash
# Send activation transaction from another wallet
# Minimum: 10 XAH to activate account on testnet
# Use Xahau Testnet Faucet: https://xahau-test.net/faucet
```

### Step 4: Test Worker Closure
1. Worker clocks in and works for 30 minutes
2. Worker clocks out (accumulated_balance saved to database)
3. Worker clicks "Close Channel"
4. Xaman opens for signing
5. **Monitor Xaman behavior**:
   - If "unable to set account sequence" → Account not activated on ledger
   - If transaction succeeds → Worker receives accumulated balance ✅

## Comparison: NGO vs Worker Closure

| Aspect | NGO Closure | Worker Closure |
|--------|-------------|----------------|
| **Account Field** | NGO wallet (always activated) | Worker wallet (might NOT be activated) |
| **Extra Parameters** | None | isSourceClosure, sourceAddress, destinationAddress (unused) |
| **Error Rate** | 0% (NGOs always have activated accounts) | High (workers might not activate accounts) |
| **Network Sensitivity** | Low (NGOs usually on correct network) | High (workers might use different networks) |

## Recommended Code Changes

### 1. Add Pre-flight Account Check

**Location**: `frontend/src/utils/paymentChannels.ts` (before line 730)

```javascript
/**
 * Check if account exists on ledger
 * Returns true if account is activated, false otherwise
 */
async function checkAccountExists(
  accountAddress: string,
  network: string
): Promise<boolean> {
  try {
    const wsUrl = network === 'testnet'
      ? 'wss://xahau-test.net'
      : 'wss://xahau.network'

    const client = new Client(wsUrl)
    await client.connect()

    try {
      await client.request({
        command: 'account_info',
        account: accountAddress,
        ledger_index: 'validated'
      })

      await client.disconnect()
      return true  // Account exists
    } catch (error: any) {
      await client.disconnect()

      if (error.data?.error === 'actNotFound') {
        return false  // Account NOT activated
      }

      throw error  // Other error (network, etc.)
    }
  } catch (error: any) {
    console.error('[ACCOUNT_CHECK_ERROR]', error)
    throw new Error('Failed to verify account activation')
  }
}

export const closePaymentChannel = async (
  params: CloseChannelParams,
  provider: WalletProvider | null,
  network: string
): Promise<CloseChannelResult> => {
  if (!provider) {
    return { success: false, error: 'No wallet connected' }
  }

  // PRE-FLIGHT CHECK: Verify account exists on ledger
  try {
    const accountExists = await checkAccountExists(params.account, network)

    if (!accountExists) {
      return {
        success: false,
        error:
          'ACCOUNT NOT ACTIVATED ON XAHAU LEDGER.\n\n' +
          'YOUR WALLET NEEDS AT LEAST 10 XAH TO ACTIVATE.\n\n' +
          'PLEASE:\n' +
          '1. ADD FUNDS TO YOUR WALLET\n' +
          '2. OR USE TESTNET FAUCET: https://xahau-test.net/faucet\n' +
          '3. THEN TRY CLOSING THE CHANNEL AGAIN'
      }
    }
  } catch (error: any) {
    console.warn('[PREFLIGHT_CHECK_WARNING]', error.message)
    // Continue anyway - let Xaman handle the error
  }

  // ... rest of existing code ...
}
```

### 2. Remove Unused Parameters from Worker Closure

**Location**: `frontend/src/pages/WorkerDashboard.tsx` (lines 220-234)

```javascript
// BEFORE (with unused parameters):
const txResult = await closePaymentChannel(
  {
    channelId: channel.channelId,
    balance: xrplTransaction.Balance,
    escrowReturn: xrplTransaction.Amount,
    account: walletAddress,
    publicKey: xrplTransaction.Public,
    isSourceClosure: false,        // ← REMOVE (unused)
    sourceAddress: selectedChannel.ngoWalletAddress,  // ← REMOVE (unused)
    destinationAddress: walletAddress  // ← REMOVE (unused)
  },
  provider,
  network
)

// AFTER (clean parameters):
const txResult = await closePaymentChannel(
  {
    channelId: channel.channelId,
    balance: xrplTransaction.Balance,
    escrowReturn: xrplTransaction.Amount,
    account: walletAddress,
    publicKey: xrplTransaction.Public
  },
  provider,
  network
)
```

### 3. Improve Error Messages in Xaman Polling

**Location**: `frontend/src/utils/walletTransactions.ts` (lines 218-223)

```javascript
// Enhanced timeout message with troubleshooting
return {
  success: false,
  error:
    'TIMEOUT: XAMAN SIGNATURE NOT RECEIVED WITHIN 5 MINUTES.\n\n' +
    'POSSIBLE CAUSES:\n' +
    '• WALLET NOT ACTIVATED ON XAHAU (NEED 10+ XAH)\n' +
    '• NETWORK MISMATCH (CHECK XAMAN NETWORK SETTINGS)\n' +
    '• XAMAN APP CLOSED OR DISCONNECTED\n\n' +
    'TROUBLESHOOTING:\n' +
    '1. VERIFY YOUR WALLET HAS FUNDS ON XAHAU LEDGER\n' +
    '2. CHECK XAMAN SETTINGS → NETWORK → "XAHAU TESTNET"\n' +
    '3. REFRESH PAGE AND TRY AGAIN'
}
```

## Impact Analysis

### Before Fix
- Workers with unactivated wallets get "unable to set account sequence" error ❌
- Error message doesn't explain the problem ❌
- No pre-flight validation before transaction submission ❌
- Extra unused parameters cause code confusion ❌

### After Fix
- Pre-flight check prevents error before Xaman opens ✅
- Clear error message explains activation requirement ✅
- Workers know exactly what to do (add funds or use faucet) ✅
- Cleaner code without unused parameters ✅

## Deployment Checklist

- [ ] **Verify** network configuration matches (frontend + backend)
- [ ] **Test** worker account activation check
- [ ] **Deploy** pre-flight validation code
- [ ] **Remove** unused parameters from worker closure
- [ ] **Update** error messages with troubleshooting steps
- [ ] **Document** account activation requirement in user guide
- [ ] **Test** worker closure with:
  - [ ] Activated worker account (should succeed)
  - [ ] Unactivated worker account (should show clear error)
  - [ ] Network mismatch scenario (should fail gracefully)
