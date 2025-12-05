# Payment Channel Balance Claim Flow

## Problem Statement

**Original Issue**: Worker channel closure had redundant warnings:
1. Notification: "RECEIVE YOUR ACCUMULATED BALANCE OF [0.29 XAH]"
2. After approval: UnclaimedBalanceWarningModal with same information
3. User requested: ONE warning, not two

**Root Cause**: The system only supported one operation:
- `PaymentChannelClaim` with `tfClose` flag → Claims balance AND closes channel

Workers couldn't claim wages without closing the channel, forcing them through closure flow even when they just wanted payment.

## Solution: Separate Claim from Close

### XRPL PaymentChannelClaim Capabilities

Per official XRPL documentation, `PaymentChannelClaim` supports two distinct operations:

#### 1. Claim Balance (NO tfClose flag)
```typescript
{
  TransactionType: 'PaymentChannelClaim',
  Account: workerWalletAddress,
  Channel: channelId,
  Balance: "290000" // Amount in drops (0.29 XAH)
  // NO tfClose flag - channel remains open
}
```
- **Effect**: Worker receives accumulated wages
- **Channel State**: Remains ACTIVE
- **Use Case**: Regular wage payment

#### 2. Close Channel (WITH tfClose flag)
```typescript
{
  TransactionType: 'PaymentChannelClaim',
  Account: workerWalletAddress,
  Channel: channelId,
  Balance: "0", // Optional: final claim amount
  Flags: 0x00020000 // tfClose (131072)
}
```
- **Effect**: Channel closes, escrow returns to NGO
- **Channel State**: REMOVED from ledger
- **Use Case**: End employment relationship

## Implementation

### Backend API Endpoints

#### New: POST /api/payment-channels/:channelId/claim
**Purpose**: Claim balance WITHOUT closing channel

**Request**:
```json
{
  "workerWalletAddress": "rXXXX..."
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "channel": {
      "channelId": "A798...",
      "accumulatedBalance": 0.29,
      "jobName": "General Work",
      "employer": "XAH Payroll"
    },
    "xrplTransaction": {
      "TransactionType": "PaymentChannelClaim",
      "Account": "rXXXX...",
      "Channel": "A798...",
      "Balance": "290000"
      // NO tfClose flag
    }
  }
}
```

**Authorization**: Only worker can claim
**Validation**: Channel must be active, balance > 0

#### Existing: POST /api/payment-channels/:channelId/close
**Purpose**: Close channel (optionally with final claim)

**Modified Behavior**:
- **If balance > 0 AND !forceClose**: Return UNCLAIMED_BALANCE warning (status 400)
- **If balance = 0**: Proceed with closure (no warnings)
- **If forceClose = true**: Skip warning, close with final claim

### Frontend Utilities

#### New: claimChannelBalance()
**Location**: `frontend/src/utils/paymentChannels.ts`

```typescript
export const claimChannelBalance = async (
  params: {
    channelId: string
    balance: string // In drops
    account: string // Worker wallet
    publicKey?: string
  },
  provider: WalletProvider | null,
  network: string
): Promise<CloseChannelResult>
```

**XRPL Transaction**:
- Builds `PaymentChannelClaim` WITHOUT `tfClose` flag
- Worker signs with their wallet (Xaman/Crossmark/GemWallet)
- Channel remains active after transaction

#### Existing: closePaymentChannel()
**No changes required** - already handles closure with `tfClose` flag

## User Flows

### Flow 1: Worker Claims Wages (Channel Stays Open)

1. **Worker Dashboard**: Shows "CLAIM BALANCE" button (green)
2. **Worker clicks**: "CLAIM BALANCE"
3. **Confirmation Modal**:
   - "YOU WILL RECEIVE [0.29 XAH] FROM YOUR ACCUMULATED WAGES"
   - "CHANNEL WILL REMAIN OPEN FOR CONTINUED WORK"
   - Buttons: [CANCEL] [CLAIM WAGES]
4. **Worker confirms**: Signs transaction with wallet
5. **Result**:
   - Worker receives 0.29 XAH
   - Channel balance resets to 0
   - Channel status: ACTIVE (can continue working)
6. **Dashboard Update**:
   - Balance shows 0 XAH
   - "CLAIM BALANCE" button disabled (no balance to claim)
   - Can continue logging hours

### Flow 2: Worker Closes Channel (Balance = 0)

1. **Worker Dashboard**: Shows "CLOSE CHANNEL" button (red, only if balance = 0)
2. **Worker clicks**: "CLOSE CHANNEL"
3. **Confirmation Modal**:
   - "CLOSING THIS CHANNEL WILL END YOUR EMPLOYMENT"
   - "ESCROW WILL RETURN TO EMPLOYER"
   - Buttons: [CANCEL] [CLOSE CHANNEL]
4. **Worker confirms**: Signs transaction with wallet
5. **Result**:
   - Channel removed from ledger
   - Escrow returns to NGO
   - Channel status: CLOSED
6. **Dashboard Update**: Channel no longer appears

### Flow 3: NGO Requests Closure (Worker Has Balance)

1. **NGO Dashboard**: Clicks "CANCEL CHANNEL"
2. **Backend Check**: balance = 0.29 XAH → Returns UNCLAIMED_BALANCE warning
3. **UnclaimedBalanceWarningModal**:
   - "WORKER HAS 0.29 XAH IN UNCLAIMED WAGES"
   - "ENSURE PAYMENT BEFORE CLOSING"
   - Buttons: [GO BACK (RECOMMENDED)] [FORCE CLOSE ANYWAY]
4. **NGO Options**:
   - **GO BACK**: Cancel closure, contact worker to claim first
   - **FORCE CLOSE**: Worker receives final 0.29 XAH, channel closes

**This is the ONLY remaining warning** - shown to NGO when forcing closure with unclaimed balance.

### Flow 4: Worker Receives Closure Request Notification

**OLD FLOW** (Redundant Warnings):
1. Notification: "RECEIVE YOUR ACCUMULATED BALANCE OF [0.29 XAH]"
2. Worker clicks "APPROVE & CLOSE"
3. **Redundant Warning**: UnclaimedBalanceWarningModal appears AGAIN
4. Worker clicks "PROCEED WITH CLOSURE"
5. Channel closes

**NEW FLOW** (Clean, One Action):
1. Notification: "EMPLOYER REQUESTS CLOSURE. YOU HAVE [0.29 XAH] TO CLAIM."
2. Worker has TWO options:
   - **CLAIM BALANCE FIRST**: Click "CLAIM BALANCE" button → Receive wages → Channel stays open
   - **APPROVE CLOSURE**: Click "APPROVE & CLOSE" → Receive final 0.29 XAH → Channel closes
3. **No redundant warnings** - notification already informed worker about balance

## Benefits

### 1. Eliminates Redundant Warnings
- **Before**: Two warnings for same information
- **After**: One notification with clear action options

### 2. Worker Flexibility
- **Before**: Must close channel to receive payment
- **After**: Can claim wages anytime, keep working

### 3. Cleaner UX
- Separate buttons for separate actions
- "CLAIM BALANCE" (green) vs "CLOSE CHANNEL" (red)
- Disabled states prevent invalid operations

### 4. Better Cash Flow
- Workers can withdraw weekly/monthly without ending employment
- NGO doesn't need to create new channel for each pay period
- Reduces on-chain transaction fees

### 5. XRPL Spec Compliance
- Uses PaymentChannelClaim correctly for both use cases
- Proper flag usage (tfClose only when closing)
- Follows official XRPL documentation patterns

## Database Impact

**No schema changes required** - existing `payment_channels` table supports both flows:
- `accumulated_balance` updates after claim (resets to 0)
- `status` remains 'active' after claim
- `status` changes to 'closed' only on channel closure

## Testing Scenarios

### Test 1: Claim Balance with Active Channel
1. Worker logs 3 hours (accumulated_balance = 0.29 XAH)
2. Worker clicks "CLAIM BALANCE"
3. Signs transaction with Xaman
4. **Verify**:
   - Worker wallet receives 0.29 XAH
   - Channel still active
   - accumulated_balance = 0
   - Can log more hours

### Test 2: Close Channel with Zero Balance
1. Worker has accumulated_balance = 0
2. Worker clicks "CLOSE CHANNEL"
3. Signs transaction
4. **Verify**:
   - Channel removed from ledger
   - No payment to worker (balance was 0)
   - Escrow returns to NGO
   - Channel disappears from dashboard

### Test 3: NGO Force Close with Balance
1. Worker has accumulated_balance = 0.29 XAH
2. NGO clicks "CANCEL CHANNEL"
3. **Warning shown**: "WORKER HAS 0.29 XAH UNCLAIMED"
4. NGO clicks "FORCE CLOSE ANYWAY"
5. **Verify**:
   - Worker receives final 0.29 XAH
   - Channel closes
   - Escrow (minus 0.29) returns to NGO

### Test 4: Notification Approval Flow
1. NGO requests closure (worker has 0.29 XAH)
2. Worker sees notification
3. Worker clicks "CLAIM BALANCE FIRST"
4. **Verify**:
   - Worker receives 0.29 XAH
   - Channel stays open
   - Notification still shows (NGO's request pending)
5. Worker later clicks "APPROVE & CLOSE" (now balance = 0)
6. **Verify**:
   - Channel closes with no warnings
   - Clean closure flow

## Migration Notes

### Existing Channels
- No migration needed
- All existing channels work with new flow
- Workers can immediately use "CLAIM BALANCE" feature

### Backward Compatibility
- Existing closure flow unchanged
- NGO closure warnings still work
- Database queries unchanged

## API Client Updates

Add to `frontend/src/services/api.ts`:

```typescript
async claimChannelBalance(
  channelId: string,
  workerWalletAddress: string
): Promise<ApiResponse<{
  channel: any
  xrplTransaction: any
}>> {
  return apiFetch(
    `/api/payment-channels/${channelId}/claim`,
    {
      method: 'POST',
      body: JSON.stringify({ workerWalletAddress }),
    }
  )
}
```

## Security Considerations

### Authorization
- **Claim endpoint**: Only worker can claim (validated via wallet address)
- **Close endpoint**: Both NGO and worker authorized (different flows)

### Balance Validation
- Cannot claim if balance = 0 (returns NO_BALANCE error)
- Cannot close with balance unless forceClose = true
- Worker always receives accumulated balance on closure

### Transaction Safety
- Worker signs all transactions (Xaman/Crossmark/GemWallet)
- No backend holds private keys
- XRPL ledger validates all operations

## Performance Impact

### Positive
- Reduces channel create/close cycles
- One channel per job instead of per pay period
- Lower on-chain transaction fees

### Neutral
- Claim transactions cheaper than close+create
- Same database load (balance updates already tracked)
- No new indexes required

## Future Enhancements

### Potential Features
1. **Auto-Claim Schedule**: Worker sets auto-claim every Friday
2. **Partial Claims**: Claim 50% of balance, leave rest
3. **Multi-Channel Claim**: Claim from all channels at once
4. **Claim History**: Track all balance claims for tax reporting

### Analytics
- Average claim frequency per worker
- Channel lifetime before closure
- Balance accumulation patterns
- Claim vs close ratio

## Documentation Updates Required

1. **CLAUDE.md**: Update payment channel flow description
2. **PAYMENT_CHANNEL_TESTING.md**: Add claim balance test scenarios
3. **README.md**: Update features list with balance claiming
4. **Worker Dashboard**: Update UI screenshots with new buttons

## Deployment Checklist

- [x] Backend API endpoint created
- [x] Frontend utility function created
- [ ] API client method added
- [ ] WorkerDashboard UI updated (two buttons)
- [ ] Notification handling modified
- [ ] Test on testnet (all 4 flows)
- [ ] Update documentation
- [ ] Deploy to production
