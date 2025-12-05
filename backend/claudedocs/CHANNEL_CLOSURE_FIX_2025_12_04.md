# Payment Channel Closure Fix - December 4, 2025

## Critical Finding

**Problem**: Channel closure appears successful in UI but **channel remains open on XRPL ledger** with funds locked.

### Evidence

**Database State**:
```sql
channel_id: A798F6B1E5E47E99E1F340F5A4997919B4C26C5F6560BE85E119E9293143A29A
status: active
accumulated_balance: 0.29 XAH
closure_tx_hash: NULL
validation_attempts: 0
```

**XRPL Ledger State**:
```
Channel EXISTS on ledger
Amount (Escrow): 480 XAH
Balance (Claimed): 0 XAH  ← Worker NEVER received the 0.29 XAH
Expiration: NOT SET  ← No closure ever requested
```

**Conclusion**: Worker attempted closure but transaction was NEVER submitted to the ledger or FAILED silently.

## Root Cause Analysis

### XRPL Payment Channel Closure Rules

Per official XRPL documentation, there are **TWO** distinct closure mechanisms:

#### 1. Source (NGO) Closure - SCHEDULED
```javascript
// NGO requests closure
{
  TransactionType: 'PaymentChannelClaim',
  Account: ngoWalletAddress,  // NGO signs
  Channel: channelId,
  Flags: 0x00020000  // tfClose
}
```

**Behavior when balance > 0**:
- Sets `Expiration` field = current_time + `SettleDelay` (e.g., 24 hours)
- Channel does NOT close immediately
- Worker has `SettleDelay` period to claim accumulated balance
- After expiration, channel can be closed by ANY subsequent transaction
- **Critical**: If worker never claims, balance is LOST when channel finally closes

**Behavior when balance = 0**:
- Channel closes immediately (no settle delay needed)
- Escrow returns to NGO
- Channel removed from ledger

#### 2. Destination (Worker) Closure - IMMEDIATE
```javascript
// Worker closes channel
{
  TransactionType: 'PaymentChannelClaim',
  Account: workerWalletAddress,  // Worker signs
  Channel: channelId,
  Balance: "290000",  // Worker receives this amount (in drops)
  Flags: 0x00020000  // tfClose
}
```

**Behavior (ALWAYS)**:
- Worker receives `Balance` amount immediately (if > 0)
- Channel closes immediately (no settle delay)
- Remaining escrow returns to NGO
- Channel removed from ledger in ONE transaction

**Key Difference**: Destination can ALWAYS close immediately with tfClose, Source closure is delayed if balance > 0.

## Why Current Implementation Fails

### Issue #1: The UNCLAIMED_BALANCE Warning Blocks Closure

**Current Flow** (`backend/routes/paymentChannels.js:566-581`):
```javascript
if (unpaidBalance > 0 && !forceClose) {
  return res.status(400).json({
    success: false,
    error: {
      code: 'UNCLAIMED_BALANCE',
      message: warningMessage,
      unpaidBalance: unpaidBalance,
      requiresForceClose: true
    }
  })
}
```

**Problem**: This blocks the closure request from returning XRPL transaction details.

**Result**: Frontend NEVER receives the transaction to submit, so ledger is NEVER updated.

### Issue #2: Worker Receives Balance IN THE SAME TRANSACTION

The UNCLAIMED_BALANCE warning is **fundamentally wrong** for worker closures because:

1. Worker-initiated `PaymentChannelClaim` with `tfClose` + `Balance` field does BOTH:
   - Transfers `Balance` amount to worker
   - Closes channel immediately

2. There's NO SEPARATE "claim" step - the balance claim happens IN the closure transaction

3. Warning the worker about "unclaimed balance" when they're literally claiming it in the closure is nonsensical

### Issue #3: The Warning Happens BEFORE Transaction Submission

**Correct XRPL Flow**:
1. Worker submits `PaymentChannelClaim` with `Balance` + `tfClose`
2. XRPL validates and executes transaction
3. Worker receives balance
4. Channel closes
5. Escrow returns to NGO

**Current Broken Flow**:
1. Worker requests closure
2. Backend: "WAIT! You have unclaimed balance!" (400 error)
3. Frontend: Shows error alert
4. Transaction NEVER SUBMITTED to XRPL
5. Channel remains open with locked funds

## The Fix: Remove UNCLAIMED_BALANCE Check for Worker Closures

### Why It's Safe to Remove

**For Worker Closures**:
- The `Balance` field in the transaction ensures worker receives accumulated wages
- XRPL ledger enforces that Balance ≥ current channel balance
- If frontend tries to cheat (Balance < accumulated), XRPL rejects with `temBAD_AMOUNT`
- Worker cannot close without receiving owed balance (built into XRPL protocol)

**For NGO Closures**:
- Still need warning because Source closure with balance > 0 just sets Expiration
- Worker might not claim during settle delay → loses wages
- Warning protects worker from NGO accidentally/maliciously causing loss

### Implementation

**backend/routes/paymentChannels.js** - Modify UNCLAIMED_BALANCE check:

```javascript
// STEP 4.5: UNCLAIMED BALANCE WARNING (NGO ONLY)
// ============================================

const unpaidBalance = parseFloat(channel.accumulated_balance) || 0

// Only warn for NGO/Source closures
// Worker closures claim the balance IN THE SAME TRANSACTION
if (unpaidBalance > 0 && !forceClose && !isWorker) {
  const warningMessage = `WARNING: WORKER HAS ${unpaidBalance.toFixed(2)} XAH IN UNCLAIMED WAGES. ENSURE PAYMENT BEFORE CLOSING.`

  return res.status(400).json({
    success: false,
    error: {
      code: 'UNCLAIMED_BALANCE',
      message: warningMessage,
      unpaidBalance: unpaidBalance,
      requiresForceClose: true,
      callerType: 'ngo'
    }
  })
}

// For worker closures, proceed directly to transaction preparation
// The Balance field in PaymentChannelClaim ensures worker receives wages
```

**Key Change**: Add `&& !isWorker` condition to UNCLAIMED_BALANCE check

### Testing the Fix

**Test Case 1: Worker Closes Channel with Balance**

1. **Setup**:
   ```sql
   channel_id: A798...
   accumulated_balance: 0.29 XAH
   status: active
   ```

2. **Action**: Worker clicks "CLOSE CHANNEL"

3. **Expected Backend Response**:
   ```json
   {
     "success": true,
     "data": {
       "channel": {
         "channelId": "A798...",
         "accumulatedBalance": 0.29
       },
       "xrplTransaction": {
         "TransactionType": "PaymentChannelClaim",
         "Account": "rQHERc...",
         "Channel": "A798...",
         "Balance": "290000",
         "Flags": 131072
       }
     }
   }
   ```

4. **Frontend Submits Transaction**:
   - Worker signs with Xaman/Crossmark
   - Transaction hash received

5. **XRPL Ledger Result**:
   - Worker wallet receives 0.29 XAH
   - Channel removed from ledger
   - Remaining escrow (479.71 XAH) returns to NGO

6. **Database Confirmation**:
   ```sql
   UPDATE payment_channels
   SET status = 'closed',
       closure_tx_hash = '9C0CAAC...',
       closed_at = NOW()
   WHERE channel_id = 'A798...'
   ```

7. **Verification**:
   ```bash
   # Check ledger
   ledger_entry payment_channel: A798...
   # Expected: entryNotFound (channel closed)

   # Check worker wallet
   account_info: rQHERc...
   # Expected: Balance increased by 290000 drops

   # Check database
   SELECT status, closure_tx_hash FROM payment_channels WHERE channel_id = 'A798...'
   # Expected: status='closed', closure_tx_hash populated
   ```

**Test Case 2: NGO Closes Channel with Balance** (Warning Required)

1. **Setup**: Same channel, accumulated_balance = 0.29 XAH

2. **Action**: NGO clicks "CANCEL CHANNEL"

3. **Expected Backend Response** (400):
   ```json
   {
     "success": false,
     "error": {
       "code": "UNCLAIMED_BALANCE",
       "message": "WARNING: WORKER HAS 0.29 XAH IN UNCLAIMED WAGES...",
       "unpaidBalance": 0.29,
       "requiresForceClose": true,
       "callerType": "ngo"
     }
   }
   ```

4. **Frontend Shows**: UnclaimedBalanceWarningModal

5. **NGO Options**:
   - **GO BACK**: Cancel closure
   - **FORCE CLOSE**: Sets Expiration, worker has 24 hours to claim

## Alternative Solution: Automatic Balance Claim Before Closure

Instead of removing the warning, automatically claim balance first:

### Two-Transaction Flow

**Step 1: Claim Balance** (if balance > 0)
```javascript
{
  TransactionType: 'PaymentChannelClaim',
  Account: workerWalletAddress,
  Channel: channelId,
  Balance: "290000"
  // NO tfClose - channel stays open
}
```

**Step 2: Close Empty Channel**
```javascript
{
  TransactionType: 'PaymentChannelClaim',
  Account: workerWalletAddress,
  Channel: channelId,
  Flags: 0x00020000  // tfClose
  // NO Balance field - channel already at 0
}
```

**Pros**:
- Explicit two-step process
- Easier to debug if one step fails
- Can show progress ("Claiming balance... Closing channel...")

**Cons**:
- Requires TWO wallet signatures
- Twice the transaction fees
- More complex error handling
- Slower user experience

**Recommendation**: Use single-transaction approach (remove warning for workers) because:
- XRPL natively supports Balance + tfClose in one transaction
- Faster, cheaper, better UX
- XRPL protocol enforces balance transfer (can't bypass)
- Only one wallet signature needed

## Implementation Steps

1. **Modify Backend** (`backend/routes/paymentChannels.js:566-581`):
   ```javascript
   if (unpaidBalance > 0 && !forceClose && !isWorker) {
     // Only warn for NGO closures
   }
   ```

2. **Test on Testnet**:
   - Create channel with small escrow (10 XAH)
   - Log 0.01 hours (accumulate small balance)
   - Worker closes channel
   - Verify:
     - Worker receives accumulated balance
     - Channel removed from ledger
     - Escrow returns to NGO

3. **Frontend Logging** (optional enhancement):
   ```typescript
   console.log('[WORKER_CLOSE] Closing channel with balance claim', {
     channelId,
     balanceToClaim: channel.accumulatedBalance,
     totalEscrow: channel.escrowBalance,
     escrowReturn: escrowReturn
   })
   ```

4. **Update Documentation**:
   - PAYMENT_CHANNEL_TESTING.md: Add worker closure test case
   - CLAUDE.md: Update closure flow description

## Recovery Procedure for Stuck Channel

For the existing stuck channel `A798F6B1E5E47E99E1F340F5A4997919B4C26C5F6560BE85E119E9293143A29A`:

### Option 1: Worker Closes with Balance Claim

1. Apply backend fix (remove UNCLAIMED_BALANCE check for workers)
2. Worker clicks "CLOSE CHANNEL" in UI
3. Signs transaction:
   ```javascript
   {
     TransactionType: 'PaymentChannelClaim',
     Account: 'rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS',
     Channel: 'A798F6B1E5E47E99E1F340F5A4997919B4C26C5F6560BE85E119E9293143A29A',
     Balance: '290000',  // 0.29 XAH
     Flags: 131072  // tfClose
   }
   ```
4. Worker receives 0.29 XAH
5. NGO receives 479.71 XAH back
6. Channel closes properly

### Option 2: NGO Force Closes (Sets Expiration)

1. NGO clicks "CANCEL CHANNEL"
2. Sees UNCLAIMED_BALANCE warning
3. Clicks "FORCE CLOSE ANYWAY"
4. Transaction submitted:
   ```javascript
   {
     TransactionType: 'PaymentChannelClaim',
     Account: 'ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW',
     Channel: 'A798F6B1E5E47E99E1F340F5A4997919B4C26C5F6560BE85E119E9293143A29A',
     Flags: 131072  // tfClose
   }
   ```
5. Ledger sets Expiration = current + 86400 seconds
6. Worker has 24 hours to claim 0.29 XAH
7. After expiration, anyone can close channel

**Recommendation**: Use Option 1 (worker closes) - faster and guarantees worker receives wages.

## Long-Term Improvements

### 1. Automatic Balance Claims

**Feature**: Workers can set auto-claim threshold
- "Claim balance when > 1 XAH accumulated"
- Runs via scheduled job or frontend trigger
- Keeps channel open, just claims wages periodically

### 2. Closure Confirmation with Ledger Verification

**Current**: UI assumes closure succeeded if tx hash received

**Improved**:
```typescript
async function verifyChannelClosure(channelId: string): Promise<boolean> {
  const client = new Client(getNetworkUrl(network))
  await client.connect()

  try {
    await client.request({
      command: 'ledger_entry',
      payment_channel: channelId
    })
    // Channel still exists
    return false
  } catch (error) {
    if (error.data?.error === 'entryNotFound') {
      // Channel successfully closed
      return true
    }
    throw error
  } finally {
    await client.disconnect()
  }
}
```

Call this after receiving tx hash, only mark DB as closed if verification passes.

### 3. Stuck Channel Detection

**Scheduled Job** (runs daily):
```javascript
// Find channels with status='closing' for > 1 hour
SELECT * FROM payment_channels
WHERE status = 'closing'
AND last_validation_at < NOW() - INTERVAL '1 hour'

// For each stuck channel:
// 1. Query XRPL ledger
// 2. If channel not found: Mark closed
// 3. If channel still exists: Log warning, reset to 'active'
```

## Summary

**Root Cause**: UNCLAIMED_BALANCE warning blocks worker closures from submitting XRPL transactions

**Fix**: Remove warning for worker closures (add `&& !isWorker` condition)

**Justification**: Worker closures claim balance IN the closure transaction - warning is redundant and breaks the flow

**Impact**: Worker closures work correctly, NGO closures still protected by warning

**Testing**: Verify on testnet with small escrow amounts before production deployment
