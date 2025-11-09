# Implementation Workflow: Cancel Payment Channel with Escrow Return

**Feature**: Add cancel payment channel functionality with automatic escrow return
**Generated**: 2025-11-09
**Complexity**: Medium
**Estimated Time**: 4-6 hours
**Risk Level**: Medium-High (Financial transaction)

---

## Executive Summary

**Current State**:
- ✅ Backend endpoint exists: `POST /api/payment-channels/:channelId/close`
- ✅ Database update implemented: Sets status to 'closed'
- ❌ No XRPL transaction (on-chain channel close)
- ❌ No escrow return logic
- ❌ No frontend UI for cancel operation
- ❌ No validation for already-closed channels
- ❌ No authorization check (any org can close any channel)

**Target State**:
- Complete cancel flow with XRPL `PaymentChannelClaim` transaction
- Escrow balance returned to NGO wallet
- Frontend "Cancel Channel" button with confirmation modal
- Authorization: Only channel owner (NGO) can cancel
- Validation: Prevent canceling already-closed channels
- Error handling: Transaction failures, network errors
- User feedback: Loading states, success/error notifications

**Critical Business Rules**:
1. Only the NGO that created the channel can cancel it
2. Cannot cancel already-closed channels
3. Unused escrow must be returned to NGO wallet
4. Worker receives accumulated balance before closure
5. Database and blockchain state must stay synchronized

---

## Phase 1: Analysis & Planning ✅ (Complete)

### 1.1 Current System Analysis

**Backend Endpoint** (`backend/routes/paymentChannels.js:144-191`):
```javascript
POST /api/payment-channels/:channelId/close
- Input: { organizationWalletAddress }
- Action: UPDATE payment_channels SET status = 'closed'
- Missing: XRPL transaction, escrow return, authorization check
```

**Frontend State** (`frontend/src/pages/NgoDashboard.tsx`):
- No cancel button visible
- No cancel handler function
- No confirmation modal

**Database Schema** (`payment_channels` table):
```sql
Fields needed:
- channel_id (VARCHAR) - XRPL channel ID
- organization_id (INTEGER) - FK to organizations
- employee_id (INTEGER) - FK to employees
- escrow_funded_amount (DECIMAL) - Original funding
- accumulated_balance (DECIMAL) - Amount owed to worker
- hours_accumulated (DECIMAL) - Hours worked
- status (VARCHAR) - 'active' | 'closed'
```

**XRPL Integration**:
- Transaction type: `PaymentChannelClaim` (to close and settle)
- Signing: Via `walletTransactions.ts` multi-wallet abstraction
- Network: Auto-selected (testnet/mainnet) from environment

### 1.2 Dependencies Identified

**External Dependencies**:
- XRPL SDK v3.0.0 (already installed)
- Multi-wallet support (Xaman, Crossmark, GemWallet) (already implemented)
- PostgreSQL connection pool (already configured)

**Internal Dependencies**:
- WalletContext: `submitTransactionWithWallet()` function
- AuthContext: `walletAddress` for authorization
- DataContext: `refreshData()` to update channel list
- API client: `services/api.ts` needs new function

**Code Files to Modify**:
```
backend/routes/paymentChannels.js    # Enhance close endpoint
frontend/src/services/api.ts          # Add cancelPaymentChannel()
frontend/src/pages/NgoDashboard.tsx   # Add cancel button + handler
frontend/src/components/              # Create CancelChannelModal (optional)
frontend/src/utils/paymentChannels.ts # Add closePay mentChannel()
```

### 1.3 Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Transaction failure after DB update** | 🔴 HIGH | Implement 2-phase commit: DB update AFTER successful XRPL tx |
| **Escrow stuck on-chain** | 🔴 HIGH | Add retry logic, manual recovery endpoint |
| **Unauthorized cancellation** | 🟡 MEDIUM | Verify organizationWalletAddress matches channel owner |
| **Double-cancellation** | 🟡 MEDIUM | Check status before processing, add unique constraint |
| **Network errors** | 🟡 MEDIUM | Retry logic with exponential backoff |
| **User confusion** | 🟢 LOW | Clear confirmation modal with escrow return info |

---

## Phase 2: Backend Implementation

### 2.1 Enhance Close Endpoint

**File**: `backend/routes/paymentChannels.js`

**Changes**:
```javascript
// BEFORE: Simple database update
router.post('/:channelId/close', async (req, res) => {
  // UPDATE payment_channels SET status = 'closed'
})

// AFTER: Complete cancellation with validation
router.post('/:channelId/close', async (req, res) => {
  // 1. Validate authorization (org owns channel)
  // 2. Check channel not already closed
  // 3. Calculate escrow return amount
  // 4. Return channel + escrow details for XRPL tx
  // 5. Update DB only AFTER frontend confirms XRPL tx success
})
```

**Implementation Steps**:

#### Step 2.1.1: Add Input Validation
```javascript
const { channelId } = req.params
const { organizationWalletAddress } = req.body

if (!organizationWalletAddress) {
  return res.status(400).json({
    error: { message: 'Organization wallet address required' }
  })
}
```

#### Step 2.1.2: Fetch Channel with Authorization Check
```javascript
const channelResult = await query(`
  SELECT pc.*, o.escrow_wallet_address, e.employee_wallet_address, e.full_name
  FROM payment_channels pc
  JOIN organizations o ON pc.organization_id = o.id
  JOIN employees e ON pc.employee_id = e.id
  WHERE pc.channel_id = $1
`, [channelId])

if (channelResult.rows.length === 0) {
  return res.status(404).json({
    error: { message: 'Payment channel not found' }
  })
}

const channel = channelResult.rows[0]

// Authorization: Verify org owns this channel
if (channel.escrow_wallet_address !== organizationWalletAddress) {
  return res.status(403).json({
    error: { message: 'Unauthorized: You do not own this payment channel' }
  })
}
```

#### Step 2.1.3: Validate Channel State
```javascript
if (channel.status === 'closed') {
  return res.status(400).json({
    error: { message: 'Payment channel already closed' }
  })
}
```

#### Step 2.1.4: Calculate Escrow Return
```javascript
const escrowFunded = parseFloat(channel.escrow_funded_amount)
const accumulatedBalance = parseFloat(channel.accumulated_balance)
const escrowReturn = escrowFunded - accumulatedBalance

// Validate calculation
if (escrowReturn < 0) {
  console.warn('Escrow return negative - worker overpaid?', {
    channelId,
    escrowFunded,
    accumulatedBalance
  })
  // Proceed but return 0 (no refund)
  escrowReturn = 0
}
```

#### Step 2.1.5: Return XRPL Transaction Details
```javascript
// Return data needed for XRPL PaymentChannelClaim transaction
res.json({
  success: true,
  data: {
    channel: {
      id: channel.id,
      channelId: channel.channel_id,
      status: channel.status,
      workerAddress: channel.employee_wallet_address,
      workerName: channel.full_name,
      escrowFunded: escrowFunded,
      accumulatedBalance: accumulatedBalance,
      escrowReturn: escrowReturn,
      hoursAccumulated: parseFloat(channel.hours_accumulated)
    },
    // Frontend needs these for XRPL transaction
    xrplTransaction: {
      TransactionType: 'PaymentChannelClaim',
      Channel: channel.channel_id,
      Balance: (accumulatedBalance * 1000000).toString(), // Convert to drops
      Amount: (escrowReturn * 1000000).toString(), // Escrow return in drops
      Public: channel.public_key || '', // If stored
    }
  }
})
```

#### Step 2.1.6: Add Confirmation Endpoint
```javascript
// NEW ENDPOINT: Confirm closure after XRPL tx succeeds
router.post('/:channelId/close/confirm', async (req, res) => {
  const { channelId } = req.params
  const { txHash, organizationWalletAddress } = req.body

  // Verify authorization again
  const channelResult = await query(`
    SELECT pc.*, o.escrow_wallet_address
    FROM payment_channels pc
    JOIN organizations o ON pc.organization_id = o.id
    WHERE pc.channel_id = $1
  `, [channelId])

  if (channelResult.rows.length === 0) {
    return res.status(404).json({ error: { message: 'Channel not found' } })
  }

  const channel = channelResult.rows[0]

  if (channel.escrow_wallet_address !== organizationWalletAddress) {
    return res.status(403).json({ error: { message: 'Unauthorized' } })
  }

  // Update database with transaction hash
  const updateResult = await query(`
    UPDATE payment_channels
    SET status = 'closed',
        closure_tx_hash = $1,
        closed_at = NOW(),
        updated_at = NOW()
    WHERE channel_id = $2
    RETURNING *
  `, [txHash, channelId])

  res.json({
    success: true,
    data: { channel: updateResult.rows[0] }
  })
})
```

**Testing Requirements**:
- ✅ Valid cancellation by channel owner
- ✅ Reject cancellation by non-owner
- ✅ Reject already-closed channel
- ✅ Correct escrow return calculation
- ✅ Handle negative escrow (edge case)
- ✅ Verify transaction hash stored

---

## Phase 3: XRPL Transaction Implementation

### 3.1 Create Payment Channel Close Utility

**File**: `frontend/src/utils/paymentChannels.ts` (create or enhance)

**Implementation**:
```typescript
import { Client, Payment, PaymentChannelClaim } from 'xrpl'
import type { WalletProvider } from '../contexts/WalletContext'
import { submitTransactionWithWallet } from './walletTransactions'

interface CloseChannelParams {
  channelId: string
  balance: string // Amount owed to worker (in drops)
  escrowReturn: string // Amount to return to NGO (in drops)
  publicKey?: string
}

/**
 * Close payment channel on XRPL
 * This settles the channel and returns unused escrow to NGO
 */
export const closePaymentChannel = async (
  params: CloseChannelParams,
  provider: WalletProvider | null,
  network: string
): Promise<{ success: boolean; hash?: string; error?: string }> => {
  if (!provider) {
    return { success: false, error: 'No wallet connected' }
  }

  try {
    // Build PaymentChannelClaim transaction
    const transaction: PaymentChannelClaim = {
      TransactionType: 'PaymentChannelClaim',
      Channel: params.channelId,
      Balance: params.balance, // Final balance for worker
      Amount: params.escrowReturn, // Return to sender (NGO)
      Flags: 0x00010000, // tfClose flag (closes channel)
    }

    // Add public key if available
    if (params.publicKey) {
      transaction.PublicKey = params.publicKey
    }

    // Sign and submit via multi-wallet abstraction
    const result = await submitTransactionWithWallet(
      transaction,
      provider,
      network
    )

    if (result.success && result.hash) {
      return {
        success: true,
        hash: result.hash
      }
    }

    return {
      success: false,
      error: result.error || 'Transaction failed'
    }
  } catch (error: any) {
    console.error('Error closing payment channel:', error)
    return {
      success: false,
      error: error.message || 'Failed to close payment channel'
    }
  }
}
```

**Testing Requirements**:
- ✅ Successful channel close on testnet
- ✅ Verify escrow returned to NGO wallet
- ✅ Verify worker receives accumulated balance
- ✅ Handle insufficient balance errors
- ✅ Handle network timeouts
- ✅ Multi-wallet compatibility (Xaman, Crossmark, GemWallet)

---

## Phase 4: Frontend API Integration

### 4.1 Add API Client Function

**File**: `frontend/src/services/api.ts`

**Implementation**:
```typescript
/**
 * Initiate payment channel cancellation
 * Returns XRPL transaction details needed for closure
 */
export const cancelPaymentChannel = async (
  channelId: string,
  organizationWalletAddress: string
): Promise<ApiResponse<{
  channel: any
  xrplTransaction: any
}>> => {
  try {
    const response = await fetch(
      `${getBackendUrl()}/api/payment-channels/${channelId}/close`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationWalletAddress })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new ApiError(data.error?.message || 'Failed to cancel channel', response.status)
    }

    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('Network error', 500)
  }
}

/**
 * Confirm payment channel closure after XRPL transaction succeeds
 */
export const confirmChannelClosure = async (
  channelId: string,
  txHash: string,
  organizationWalletAddress: string
): Promise<ApiResponse<{ channel: any }>> => {
  try {
    const response = await fetch(
      `${getBackendUrl()}/api/payment-channels/${channelId}/close/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash, organizationWalletAddress })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new ApiError(data.error?.message || 'Failed to confirm closure', response.status)
    }

    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('Network error', 500)
  }
}
```

---

## Phase 5: Frontend UI Implementation

### 5.1 Add Cancel Button to NGO Dashboard

**File**: `frontend/src/pages/NgoDashboard.tsx`

**Changes**:
```tsx
import { cancelPaymentChannel, confirmChannelClosure } from '../services/api'
import { closePaymentChannel } from '../utils/paymentChannels'

const NgoDashboard: React.FC = () => {
  const { walletAddress } = useAuth()
  const { provider, network } = useWallet()
  const { paymentChannels, refreshData } = useData()

  const [cancelingChannel, setCancelingChannel] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<any>(null)

  const handleCancelClick = (channel: any) => {
    setSelectedChannel(channel)
    setShowCancelConfirm(true)
  }

  const handleCancelConfirm = async () => {
    if (!selectedChannel || !walletAddress) return

    setCancelingChannel(selectedChannel.channelId)

    try {
      // Step 1: Get XRPL transaction details from backend
      const response = await cancelPaymentChannel(
        selectedChannel.channelId,
        walletAddress
      )

      if (!response.success || !response.data) {
        throw new Error('Failed to prepare cancellation')
      }

      const { channel, xrplTransaction } = response.data

      // Show user escrow return amount
      console.log(`Canceling channel. Escrow return: ${channel.escrowReturn} XAH`)

      // Step 2: Execute XRPL transaction
      const txResult = await closePaymentChannel(
        {
          channelId: channel.channelId,
          balance: xrplTransaction.Balance,
          escrowReturn: xrplTransaction.Amount,
          publicKey: xrplTransaction.Public
        },
        provider,
        network
      )

      if (!txResult.success || !txResult.hash) {
        throw new Error(txResult.error || 'Transaction failed')
      }

      // Step 3: Confirm closure in database
      await confirmChannelClosure(
        selectedChannel.channelId,
        txResult.hash,
        walletAddress
      )

      // Success feedback
      alert(`Payment channel canceled successfully! Escrow returned: ${channel.escrowReturn} XAH`)

      // Refresh data
      await refreshData()

    } catch (error: any) {
      console.error('Error canceling channel:', error)
      alert(`Failed to cancel channel: ${error.message}`)
    } finally {
      setCancelingChannel(null)
      setShowCancelConfirm(false)
      setSelectedChannel(null)
    }
  }

  return (
    <div>
      {/* ... existing dashboard code ... */}

      {/* Payment Channels Table */}
      <div className="bg-white rounded-lg shadow">
        <table>
          <thead>
            <tr>
              <th>Worker</th>
              <th>Job</th>
              <th>Rate</th>
              <th>Escrow</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paymentChannels.map((channel) => (
              <tr key={channel.id}>
                <td>{channel.workerName}</td>
                <td>{channel.jobName}</td>
                <td>{channel.hourlyRate} XAH/hr</td>
                <td>{channel.escrowFundedAmount} XAH</td>
                <td>{channel.status}</td>
                <td>
                  {channel.status === 'active' && (
                    <button
                      onClick={() => handleCancelClick(channel)}
                      disabled={cancelingChannel === channel.channelId}
                      className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 disabled:opacity-50"
                    >
                      {cancelingChannel === channel.channelId ? 'Canceling...' : 'Cancel Channel'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && selectedChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md">
            <h3 className="text-xl font-bold mb-4">Cancel Payment Channel</h3>
            <p className="mb-4">
              Are you sure you want to cancel the payment channel for <strong>{selectedChannel.workerName}</strong>?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded mb-4">
              <p className="text-sm text-yellow-800">
                <strong>Escrow Return:</strong> Unused escrow will be returned to your wallet.
              </p>
              <p className="text-sm text-yellow-800 mt-2">
                <strong>Worker Payment:</strong> Any accumulated balance will be paid to the worker.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCancelConfirm(false)
                  setSelectedChannel(null)
                }}
                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
              >
                Keep Channel
              </button>
              <button
                onClick={handleCancelConfirm}
                className="flex-1 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Cancel Channel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

### 5.2 UI/UX Enhancements

**Loading States**:
- Disable "Cancel Channel" button while processing
- Show "Canceling..." text during transaction
- Loading spinner in modal during XRPL transaction

**Error Handling**:
- Show specific error messages (unauthorized, already closed, network error)
- Allow retry on network failures
- Clear error state on modal close

**Success Feedback**:
- Toast notification: "Payment channel canceled successfully"
- Show escrow return amount
- Auto-refresh payment channels list

---

## Phase 6: Database Schema Updates (Optional)

### 6.1 Add Closure Tracking Fields

**Migration** (optional but recommended):
```sql
ALTER TABLE payment_channels
ADD COLUMN closure_tx_hash VARCHAR(128),
ADD COLUMN closed_at TIMESTAMP,
ADD COLUMN closure_reason VARCHAR(50);

CREATE INDEX idx_payment_channels_closed_at ON payment_channels(closed_at);
```

**Purpose**:
- Track when and why channels were closed
- Store XRPL transaction hash for audit trail
- Enable closure analytics

---

## Phase 7: Testing & Validation

### 7.1 Unit Tests

**Backend Tests** (`backend/routes/paymentChannels.test.js`):
```javascript
describe('POST /api/payment-channels/:channelId/close', () => {
  it('should reject unauthorized cancellation', async () => {
    // Test with wrong wallet address
  })

  it('should reject already-closed channel', async () => {
    // Test double-cancellation
  })

  it('should calculate escrow return correctly', async () => {
    // Test escrow math
  })

  it('should return XRPL transaction details', async () => {
    // Verify response structure
  })
})

describe('POST /api/payment-channels/:channelId/close/confirm', () => {
  it('should update database after XRPL transaction', async () => {
    // Test confirmation endpoint
  })

  it('should store transaction hash', async () => {
    // Verify tx hash stored
  })
})
```

**Frontend Tests** (`frontend/src/utils/paymentChannels.test.ts`):
```typescript
describe('closePaymentChannel', () => {
  it('should build correct PaymentChannelClaim transaction', () => {
    // Test transaction structure
  })

  it('should handle transaction failure', async () => {
    // Test error handling
  })

  it('should work with all wallet providers', async () => {
    // Test Xaman, Crossmark, GemWallet
  })
})
```

### 7.2 Integration Tests

**Test Scenarios**:
1. ✅ **Happy Path**: NGO cancels active channel, escrow returned
2. ✅ **Authorization**: Non-owner cannot cancel channel
3. ✅ **State Validation**: Cannot cancel already-closed channel
4. ✅ **Network Errors**: Handle XRPL transaction timeout
5. ✅ **Database Sync**: Verify DB updated only after successful XRPL tx
6. ✅ **Multi-Wallet**: Test with Xaman, Crossmark, GemWallet

**Test on Testnet First**:
```bash
# Frontend .env
VITE_XRPL_NETWORK=testnet
VITE_BACKEND_URL=http://localhost:3001

# Backend .env
XRPL_NETWORK=testnet
```

### 7.3 Manual Testing Checklist

**Before Testnet**:
- [ ] Code review: Security, authorization, error handling
- [ ] Unit tests passing (80% coverage)
- [ ] Linting clean: `npm run lint`
- [ ] TypeScript compilation: `npm run build`

**Testnet Testing**:
- [ ] Create payment channel with testnet XAH
- [ ] Cancel channel via UI
- [ ] Verify escrow returned to NGO wallet
- [ ] Check worker received accumulated balance
- [ ] Verify database updated correctly
- [ ] Test error scenarios (wrong wallet, already closed)
- [ ] Test all 3 wallet providers (Xaman, Crossmark, GemWallet)

**Production Deployment**:
- [ ] Testnet tests passed
- [ ] Security audit complete
- [ ] Switch to mainnet in `.env` files
- [ ] Deploy backend first
- [ ] Deploy frontend
- [ ] Monitor first production cancellation

---

## Phase 8: Security Considerations

### 8.1 Authorization Security

**Critical Checks**:
```javascript
// MUST verify on EVERY request
if (channel.escrow_wallet_address !== organizationWalletAddress) {
  return res.status(403).json({ error: 'Unauthorized' })
}
```

**Attack Vectors**:
- ❌ User modifies channelId to cancel others' channels
- ❌ User modifies organizationWalletAddress in request body
- ✅ Mitigation: Always fetch from database, never trust client

### 8.2 Financial Security

**Escrow Return Validation**:
```javascript
// MUST prevent negative escrow return
const escrowReturn = Math.max(0, escrowFunded - accumulatedBalance)

// MUST prevent overpayment to worker
const workerPayment = Math.min(accumulatedBalance, escrowFunded)
```

**Transaction Atomicity**:
- Database update MUST happen AFTER XRPL transaction succeeds
- No partial updates (all or nothing)
- Retry logic for failed confirmations

### 8.3 Input Validation

**Required Validations**:
```javascript
// Channel ID format
const channelIdPattern = /^[0-9A-F]{64}$/i
if (!channelIdPattern.test(channelId)) {
  return res.status(400).json({ error: 'Invalid channel ID' })
}

// Wallet address format (XRPL)
const walletPattern = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/
if (!walletPattern.test(organizationWalletAddress)) {
  return res.status(400).json({ error: 'Invalid wallet address' })
}
```

---

## Phase 9: Monitoring & Observability

### 9.1 Logging

**Critical Events to Log**:
```javascript
// Backend logging
console.log('[CHANNEL_CANCEL_INIT]', {
  channelId,
  organizationWallet: organizationWalletAddress,
  escrowReturn,
  workerPayment,
  timestamp: new Date().toISOString()
})

console.log('[CHANNEL_CANCEL_SUCCESS]', {
  channelId,
  txHash,
  escrowReturned,
  timestamp: new Date().toISOString()
})

console.error('[CHANNEL_CANCEL_ERROR]', {
  channelId,
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString()
})
```

### 9.2 Metrics to Track

**Business Metrics**:
- Channels canceled per day
- Average escrow return amount
- Cancellation reasons (manual, timeout, error)
- Time from creation to cancellation

**Technical Metrics**:
- XRPL transaction success rate
- Average transaction time
- API response times
- Error rates by type

---

## Phase 10: Documentation

### 10.1 User Documentation

**Add to README.md**:
```markdown
### Canceling Payment Channels

NGOs can cancel active payment channels to stop payments and recover unused escrow:

1. Go to NGO Dashboard
2. Find the active payment channel
3. Click "Cancel Channel" button
4. Review escrow return amount in confirmation modal
5. Confirm cancellation
6. Sign transaction with your wallet (Xaman/Crossmark/GemWallet)
7. Wait for confirmation (~5 seconds)
8. Unused escrow automatically returned to your wallet

**Important Notes**:
- Only channel owner (NGO) can cancel
- Worker receives any accumulated unpaid balance
- Unused escrow returns to your wallet
- Cannot undo cancellation
```

### 10.2 Developer Documentation

**Add to CLAUDE.md**:
```markdown
## Payment Channel Cancellation

**Backend Endpoint**: `POST /api/payment-channels/:channelId/close`

**Flow**:
1. Frontend calls `/close` to get XRPL transaction details
2. Frontend executes `PaymentChannelClaim` on XRPL
3. Frontend calls `/close/confirm` with tx hash
4. Backend updates database

**Security**:
- Authorization: Verify `organizationWalletAddress` matches channel owner
- Validation: Check channel status is 'active'
- Atomicity: DB update only after XRPL tx succeeds

**Files Modified**:
- `backend/routes/paymentChannels.js` - Close endpoints
- `frontend/src/services/api.ts` - API client functions
- `frontend/src/utils/paymentChannels.ts` - XRPL transaction
- `frontend/src/pages/NgoDashboard.tsx` - UI + handlers
```

---

## Implementation Checklist

### Backend Tasks
- [ ] **2.1.1** Add input validation to close endpoint
- [ ] **2.1.2** Fetch channel with authorization check
- [ ] **2.1.3** Validate channel state (not already closed)
- [ ] **2.1.4** Calculate escrow return amount
- [ ] **2.1.5** Return XRPL transaction details
- [ ] **2.1.6** Create confirmation endpoint
- [ ] **7.1** Write backend unit tests
- [ ] **8** Security review and validation

### XRPL Integration Tasks
- [ ] **3.1** Create `closePaymentChannel()` utility function
- [ ] **3.1** Test PaymentChannelClaim transaction on testnet
- [ ] **3.1** Verify escrow return and worker payment
- [ ] **7.1** Write XRPL utility tests

### Frontend API Tasks
- [ ] **4.1** Add `cancelPaymentChannel()` to api.ts
- [ ] **4.1** Add `confirmChannelClosure()` to api.ts
- [ ] **7.1** Write API client tests

### Frontend UI Tasks
- [ ] **5.1** Add cancel button to payment channels table
- [ ] **5.1** Create cancel confirmation modal
- [ ] **5.1** Implement cancel handler with 3-step flow
- [ ] **5.2** Add loading states and error handling
- [ ] **5.2** Add success feedback (toast/alert)
- [ ] **5.2** Auto-refresh channels after cancellation

### Database Tasks (Optional)
- [ ] **6.1** Add `closure_tx_hash` column
- [ ] **6.1** Add `closed_at` timestamp column
- [ ] **6.1** Add `closure_reason` column
- [ ] **6.1** Create index on `closed_at`

### Testing Tasks
- [ ] **7.1** Backend unit tests (Jest)
- [ ] **7.1** Frontend unit tests (Vitest)
- [ ] **7.2** Integration tests on testnet
- [ ] **7.3** Manual testing checklist
- [ ] **7.3** Multi-wallet testing (Xaman, Crossmark, GemWallet)

### Security Tasks
- [ ] **8.1** Authorization security review
- [ ] **8.2** Financial security validation
- [ ] **8.3** Input validation implementation
- [ ] **8** Code review by second developer

### Documentation Tasks
- [ ] **10.1** Update README.md with user instructions
- [ ] **10.2** Update CLAUDE.md with developer notes
- [ ] **10.2** Document API endpoints
- [ ] **10.2** Add code comments

### Deployment Tasks
- [ ] **7.3** Complete testnet testing
- [ ] Switch environment to mainnet
- [ ] Deploy backend
- [ ] Deploy frontend
- [ ] Monitor first production cancellation

---

## Success Criteria

### Functional Requirements
✅ NGO can cancel payment channel via UI
✅ Escrow automatically returned to NGO wallet
✅ Worker receives accumulated unpaid balance
✅ Only channel owner can cancel
✅ Cannot cancel already-closed channels
✅ Works with all wallet providers (Xaman, Crossmark, GemWallet)

### Non-Functional Requirements
✅ Transaction completes in <10 seconds
✅ Clear error messages for all failure scenarios
✅ Loading states during transaction processing
✅ Database and blockchain stay synchronized
✅ 80%+ test coverage
✅ Security vulnerabilities addressed

### User Experience
✅ One-click cancel with clear confirmation
✅ Escrow return amount shown before confirmation
✅ Visual feedback during processing
✅ Success message with returned amount
✅ Channel removed from active list

---

## Rollback Plan

**If Production Issues Occur**:

1. **Disable Cancel Button** (Immediate):
```tsx
// frontend/src/pages/NgoDashboard.tsx
const CANCEL_ENABLED = false // Feature flag

{CANCEL_ENABLED && channel.status === 'active' && (
  <button onClick={() => handleCancelClick(channel)}>
    Cancel Channel
  </button>
)}
```

2. **Backend Endpoint Disable**:
```javascript
// backend/routes/paymentChannels.js
router.post('/:channelId/close', (req, res) => {
  return res.status(503).json({
    error: { message: 'Feature temporarily disabled for maintenance' }
  })
})
```

3. **Manual Recovery**:
- Contact affected NGOs
- Manually close channels via XRPL CLI if needed
- Refund escrow via separate transactions
- Update database manually

---

## Timeline Estimate

**Total: 4-6 hours** (single developer)

| Phase | Task | Time |
|-------|------|------|
| **Phase 2** | Backend implementation | 1.5 hours |
| **Phase 3** | XRPL integration | 1 hour |
| **Phase 4** | Frontend API | 0.5 hours |
| **Phase 5** | Frontend UI | 1.5 hours |
| **Phase 7** | Testing (unit + integration) | 1.5 hours |
| **Phase 8-10** | Security, docs, monitoring | 1 hour |

**Buffer**: +2 hours for unexpected issues

---

## Next Steps

**Recommended Execution Order**:

1. ✅ **Review Workflow** (You are here)
2. **Backend First**: Implement and test close endpoint
3. **XRPL Integration**: Test on testnet with real transactions
4. **Frontend UI**: Build cancel button and modal
5. **Integration Testing**: End-to-end on testnet
6. **Security Review**: Code review with focus on authorization
7. **Production Deploy**: Mainnet deployment with monitoring

**Ready to Start?**

Run this command to begin implementation:
```bash
/sc:implement "Cancel payment channel with escrow return" --validate --focus security
```

Or implement phase-by-phase:
```bash
# Phase 2: Backend
/sc:implement "Enhance payment channel close endpoint with authorization and escrow calculation"

# Phase 3: XRPL
/sc:implement "Create closePaymentChannel utility for XRPL PaymentChannelClaim transaction"

# Phase 5: Frontend
/sc:implement "Add cancel channel button and modal to NGO dashboard"
```

---

**End of Workflow Document**
