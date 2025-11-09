# Cancel Payment Channel - Implementation Checklist

**Feature**: Cancel Payment Channel with Escrow Return
**Estimated Time**: 4-6 hours
**Status**: Not Started

---

## Phase 1: Analysis & Planning ✅

- [x] Review current system architecture
- [x] Identify dependencies and files to modify
- [x] Assess risks and mitigation strategies
- [x] Generate comprehensive workflow document

---

## Phase 2: Backend Implementation (Start Here)

### Step 1: Enhance Close Endpoint - Input Validation
- [ ] Open `backend/routes/paymentChannels.js`
- [ ] Add validation for `organizationWalletAddress` (required)
- [ ] Add validation for `channelId` parameter
- [ ] Add XRPL wallet address format validation
- [ ] Add channel ID format validation (64-char hex)
- [ ] Return 400 error for invalid inputs

### Step 2: Enhance Close Endpoint - Authorization
- [ ] Fetch channel from database with organization join
- [ ] Add authorization check: verify org owns channel
- [ ] Return 403 error if unauthorized
- [ ] Return 404 error if channel not found

### Step 3: Enhance Close Endpoint - State Validation
- [ ] Check if channel status is already 'closed'
- [ ] Return 400 error if already closed
- [ ] Log warning for double-cancellation attempts

### Step 4: Enhance Close Endpoint - Escrow Calculation
- [ ] Calculate `escrowReturn = escrowFunded - accumulatedBalance`
- [ ] Handle negative escrow (set to 0, log warning)
- [ ] Calculate worker payment amount
- [ ] Add validation: worker payment cannot exceed escrow funded

### Step 5: Enhance Close Endpoint - Response
- [ ] Return channel details (id, channelId, status, worker info)
- [ ] Return escrow calculation (funded, accumulated, return)
- [ ] Return XRPL transaction details structure
- [ ] Include `PaymentChannelClaim` transaction fields

### Step 6: Create Confirmation Endpoint
- [ ] Add new route: `POST /:channelId/close/confirm`
- [ ] Accept `txHash` and `organizationWalletAddress` in body
- [ ] Fetch channel and verify authorization again
- [ ] Update database: SET status='closed', closure_tx_hash, closed_at
- [ ] Return updated channel data

### Step 7: Backend Testing
- [ ] Create `backend/routes/paymentChannels.test.js`
- [ ] Test: Valid cancellation by owner succeeds
- [ ] Test: Reject unauthorized cancellation (403)
- [ ] Test: Reject already-closed channel (400)
- [ ] Test: Correct escrow return calculation
- [ ] Test: Handle negative escrow edge case
- [ ] Test: Confirmation endpoint stores tx hash
- [ ] Run: `cd backend && npm test`

**Files Modified**: `backend/routes/paymentChannels.js`

---

## Phase 3: XRPL Transaction Implementation

### Step 8: Create Payment Channel Utility File
- [ ] Create or open `frontend/src/utils/paymentChannels.ts`
- [ ] Add imports: `xrpl`, `WalletProvider`, `submitTransactionWithWallet`
- [ ] Define `CloseChannelParams` interface

### Step 9: Implement closePaymentChannel Function
- [ ] Create `closePaymentChannel()` async function
- [ ] Accept params: channelId, balance, escrowReturn, publicKey
- [ ] Build `PaymentChannelClaim` transaction object
- [ ] Set `TransactionType: 'PaymentChannelClaim'`
- [ ] Set `Channel` to channelId
- [ ] Set `Balance` to final worker payment (in drops)
- [ ] Set `Amount` to escrow return (in drops)
- [ ] Set `Flags: 0x00010000` (tfClose flag)
- [ ] Add `PublicKey` if provided

### Step 10: Integrate Multi-Wallet Signing
- [ ] Call `submitTransactionWithWallet()` with transaction
- [ ] Pass provider and network parameters
- [ ] Handle successful response (extract tx hash)
- [ ] Handle error response (extract error message)
- [ ] Add try-catch for unexpected errors

### Step 11: XRPL Testing (Testnet)
- [ ] Switch to testnet: `VITE_XRPL_NETWORK=testnet`
- [ ] Create test payment channel with testnet XAH
- [ ] Test `closePaymentChannel()` function manually
- [ ] Verify escrow returned to NGO on-chain
- [ ] Verify worker received accumulated balance
- [ ] Test with Xaman wallet
- [ ] Test with Crossmark wallet
- [ ] Test with GemWallet wallet
- [ ] Create unit tests: `frontend/src/utils/paymentChannels.test.ts`

**Files Modified**: `frontend/src/utils/paymentChannels.ts`

---

## Phase 4: Frontend API Integration

### Step 12: Add cancelPaymentChannel Function
- [ ] Open `frontend/src/services/api.ts`
- [ ] Create `cancelPaymentChannel()` async function
- [ ] Accept: channelId, organizationWalletAddress
- [ ] Build fetch request: `POST /api/payment-channels/:channelId/close`
- [ ] Send organizationWalletAddress in body
- [ ] Parse response JSON
- [ ] Throw ApiError on failure
- [ ] Return typed response

### Step 13: Add confirmChannelClosure Function
- [ ] Create `confirmChannelClosure()` async function
- [ ] Accept: channelId, txHash, organizationWalletAddress
- [ ] Build fetch request: `POST /api/payment-channels/:channelId/close/confirm`
- [ ] Send txHash and organizationWalletAddress in body
- [ ] Parse response JSON
- [ ] Throw ApiError on failure
- [ ] Return typed response

### Step 14: API Testing
- [ ] Test API functions with mock server
- [ ] Test error scenarios (404, 403, 500)
- [ ] Verify TypeScript types correct

**Files Modified**: `frontend/src/services/api.ts`

---

## Phase 5: Frontend UI Implementation

### Step 15: Import Dependencies in NgoDashboard
- [ ] Open `frontend/src/pages/NgoDashboard.tsx`
- [ ] Import `cancelPaymentChannel` from `services/api`
- [ ] Import `confirmChannelClosure` from `services/api`
- [ ] Import `closePaymentChannel` from `utils/paymentChannels`
- [ ] Import `useState` if not already imported

### Step 16: Add Component State
- [ ] Add state: `cancelingChannel` (string | null)
- [ ] Add state: `showCancelConfirm` (boolean)
- [ ] Add state: `selectedChannel` (any | null)

### Step 17: Create handleCancelClick Function
- [ ] Create `handleCancelClick(channel)` function
- [ ] Set `selectedChannel` to clicked channel
- [ ] Set `showCancelConfirm` to true

### Step 18: Create handleCancelConfirm Function (3-Step Flow)
- [ ] Create `handleCancelConfirm()` async function
- [ ] Add guard: return if no selectedChannel or walletAddress
- [ ] Set `cancelingChannel` to selectedChannel.channelId

### Step 19: Implement Step 1 - Get XRPL Details
- [ ] Add try-catch block
- [ ] Call `cancelPaymentChannel(channelId, walletAddress)`
- [ ] Check response.success and response.data exist
- [ ] Extract `channel` and `xrplTransaction` from response.data
- [ ] Log escrow return amount to console

### Step 20: Implement Step 2 - Execute XRPL Transaction
- [ ] Call `closePaymentChannel()` with params:
  - channelId: channel.channelId
  - balance: xrplTransaction.Balance
  - escrowReturn: xrplTransaction.Amount
  - publicKey: xrplTransaction.Public
- [ ] Pass provider and network from WalletContext
- [ ] Check txResult.success and txResult.hash exist
- [ ] Throw error if transaction failed

### Step 21: Implement Step 3 - Confirm in Database
- [ ] Call `confirmChannelClosure(channelId, txHash, walletAddress)`
- [ ] Wait for confirmation response

### Step 22: Add Success Handling
- [ ] Show alert: "Payment channel canceled successfully!"
- [ ] Include escrow return amount in message
- [ ] Call `refreshData()` to update channel list
- [ ] Consider: Replace alert with toast notification

### Step 23: Add Error Handling
- [ ] Add catch block for errors
- [ ] Log error to console
- [ ] Show alert with error message
- [ ] Consider: Show specific error messages (unauthorized, already closed, network)

### Step 24: Add Finally Block
- [ ] Set `cancelingChannel` to null
- [ ] Set `showCancelConfirm` to false
- [ ] Set `selectedChannel` to null

### Step 25: Add Cancel Button to Table
- [ ] Find payment channels table in JSX
- [ ] Add "Actions" column header if not exists
- [ ] In table row, add conditional button:
  - Show only if `channel.status === 'active'`
- [ ] Add button onClick: `() => handleCancelClick(channel)`
- [ ] Add disabled state: `cancelingChannel === channel.channelId`
- [ ] Button text: "Canceling..." if disabled, else "Cancel Channel"
- [ ] Add styling: red background, white text

### Step 26: Create Confirmation Modal JSX
- [ ] Add conditional render: `{showCancelConfirm && selectedChannel && (...)}`
- [ ] Create modal overlay (fixed inset-0, black bg-opacity-50)
- [ ] Create modal content box (white bg, rounded, padding)
- [ ] Add modal title: "Cancel Payment Channel"
- [ ] Add confirmation text with worker name (selectedChannel.workerName)
- [ ] Add warning box (yellow background):
  - "Escrow Return: Unused escrow will be returned to your wallet"
  - "Worker Payment: Any accumulated balance will be paid to the worker"

### Step 27: Add Modal Buttons
- [ ] Add "Keep Channel" button:
  - onClick: Close modal (reset state)
  - Styling: Gray background
- [ ] Add "Cancel Channel" button:
  - onClick: `handleCancelConfirm`
  - Styling: Red background (destructive)
  - Text: "Cancel Channel"

### Step 28: Add Loading States
- [ ] Disable "Cancel Channel" button during processing
- [ ] Show spinner or loading text during XRPL transaction
- [ ] Consider: Add loading overlay to modal

### Step 29: UI Testing
- [ ] Test: Click cancel button shows modal
- [ ] Test: "Keep Channel" button closes modal
- [ ] Test: "Cancel Channel" button triggers flow
- [ ] Test: Loading state displays during processing
- [ ] Test: Success message shows after completion
- [ ] Test: Error message shows on failure
- [ ] Test: Channel list refreshes after success

**Files Modified**: `frontend/src/pages/NgoDashboard.tsx`

---

## Phase 6: Database Schema Updates (Optional)

### Step 30: Add Closure Tracking Columns
- [ ] Open `backend/database/schema.sql` or create migration
- [ ] Add column: `closure_tx_hash VARCHAR(128)`
- [ ] Add column: `closed_at TIMESTAMP`
- [ ] Add column: `closure_reason VARCHAR(50)`
- [ ] Create index: `idx_payment_channels_closed_at`
- [ ] Run migration: `cd backend && npm run init-db`

**Files Modified**: `backend/database/schema.sql`

---

## Phase 7: Integration Testing

### Step 31: Testnet Environment Setup
- [ ] Set `frontend/.env`: `VITE_XRPL_NETWORK=testnet`
- [ ] Set `backend/.env`: `XRPL_NETWORK=testnet`
- [ ] Restart dev servers: `npm run dev`
- [ ] Verify dashboard shows "TESTNET XAHAU"

### Step 32: Create Test Data
- [ ] Add test worker to organization
- [ ] Create test payment channel with testnet XAH
- [ ] Verify channel appears in dashboard as "active"

### Step 33: Test Full Cancel Flow
- [ ] Click "Cancel Channel" button
- [ ] Verify modal appears with correct worker name
- [ ] Click "Cancel Channel" in modal
- [ ] Wait for wallet signature prompt (Xaman/Crossmark/GemWallet)
- [ ] Sign transaction in wallet
- [ ] Wait for completion (~5 seconds)
- [ ] Verify success message appears
- [ ] Verify escrow return amount shown

### Step 34: Verify On-Chain Results
- [ ] Check NGO wallet balance increased (escrow returned)
- [ ] Check worker wallet balance increased (accumulated payment)
- [ ] Verify channel closed on XRPL explorer (testnet)

### Step 35: Verify Database Results
- [ ] Check payment_channels table: status='closed'
- [ ] Check closure_tx_hash stored (if column added)
- [ ] Check closed_at timestamp set (if column added)
- [ ] Verify channel no longer appears in active list

### Step 36: Test Error Scenarios
- [ ] Test: Try to cancel same channel again (should fail)
- [ ] Test: Try to cancel with different wallet (should fail - 403)
- [ ] Test: Disconnect wallet mid-process (should fail gracefully)
- [ ] Test: Network timeout (should show error message)

### Step 37: Multi-Wallet Testing
- [ ] Test full flow with Xaman wallet
- [ ] Test full flow with Crossmark wallet
- [ ] Test full flow with GemWallet wallet
- [ ] Verify all wallets show correct transaction prompts

---

## Phase 8: Code Quality & Linting

### Step 38: Run Linting
- [ ] Run: `npm run lint` (from root)
- [ ] Fix any ESLint errors in backend
- [ ] Fix any ESLint errors in frontend

### Step 39: TypeScript Compilation
- [ ] Run: `cd frontend && npm run build`
- [ ] Fix any TypeScript compilation errors
- [ ] Verify build succeeds

### Step 40: Code Review Checklist
- [ ] Review authorization checks (no security gaps)
- [ ] Review error handling (all catch blocks implemented)
- [ ] Review input validation (all inputs sanitized)
- [ ] Review escrow calculation (no negative returns)
- [ ] Review transaction atomicity (DB update after XRPL)
- [ ] Add code comments for complex logic
- [ ] Add JSDoc comments for public functions

---

## Phase 9: Security Review

### Step 41: Authorization Security
- [ ] Verify: Close endpoint checks org owns channel
- [ ] Verify: Confirm endpoint checks org owns channel
- [ ] Verify: Channel ID from database, not client input
- [ ] Verify: No trust of client-provided wallet address (fetch from DB)
- [ ] Test attack: Modify channelId to cancel others' channels
- [ ] Test attack: Modify organizationWalletAddress in request body

### Step 42: Financial Security
- [ ] Verify: Escrow return cannot be negative
- [ ] Verify: Worker payment ≤ escrow funded amount
- [ ] Verify: Database update happens AFTER XRPL transaction succeeds
- [ ] Verify: No partial updates (all-or-nothing)
- [ ] Add retry logic for failed confirmations (if needed)

### Step 43: Input Validation Security
- [ ] Verify: Channel ID format validated (64-char hex)
- [ ] Verify: Wallet address format validated (XRPL r-address)
- [ ] Verify: All user inputs sanitized
- [ ] Verify: No SQL injection vulnerabilities (parameterized queries)

### Step 44: Get Second Code Review
- [ ] Request code review from another developer
- [ ] Address code review feedback
- [ ] Document security decisions

---

## Phase 10: Monitoring & Logging

### Step 45: Add Backend Logging
- [ ] Add log: "CHANNEL_CANCEL_INIT" with channelId, org, escrowReturn
- [ ] Add log: "CHANNEL_CANCEL_SUCCESS" with channelId, txHash
- [ ] Add error log: "CHANNEL_CANCEL_ERROR" with error details
- [ ] Test: Verify logs appear in console during cancel

### Step 46: Add Frontend Logging (Optional)
- [ ] Add console.log for cancel flow start
- [ ] Add console.log for XRPL transaction success
- [ ] Add console.error for failures
- [ ] Consider: Send errors to monitoring service (Sentry)

---

## Phase 11: Documentation

### Step 47: Update README.md
- [ ] Add "Canceling Payment Channels" section
- [ ] Document step-by-step user process:
  1. Go to NGO Dashboard
  2. Find active payment channel
  3. Click "Cancel Channel"
  4. Review confirmation modal
  5. Confirm cancellation
  6. Sign transaction with wallet
  7. Wait for confirmation
  8. Unused escrow returned
- [ ] Add important notes:
  - Only channel owner can cancel
  - Worker receives accumulated balance
  - Cannot undo cancellation
- [ ] Add security warnings if applicable

### Step 48: Update CLAUDE.md
- [ ] Add "Payment Channel Cancellation" section
- [ ] Document backend endpoints:
  - `POST /api/payment-channels/:channelId/close`
  - `POST /api/payment-channels/:channelId/close/confirm`
- [ ] Document 3-step flow:
  1. Get XRPL details from backend
  2. Execute PaymentChannelClaim transaction
  3. Confirm with tx hash
- [ ] Document security considerations
- [ ] List files modified

### Step 49: Add Code Comments
- [ ] Add JSDoc comment to `closePaymentChannel()` function
- [ ] Add JSDoc comment to `cancelPaymentChannel()` API function
- [ ] Add JSDoc comment to `confirmChannelClosure()` API function
- [ ] Add inline comments for escrow calculation logic
- [ ] Add inline comments for authorization checks

---

## Phase 12: Production Deployment

### Step 50: Pre-Deployment Checks
- [ ] All testnet tests passing ✅
- [ ] Security review complete ✅
- [ ] Code review approved ✅
- [ ] Documentation updated ✅
- [ ] Linting clean ✅
- [ ] TypeScript compilation clean ✅

### Step 51: Database Backup
- [ ] Backup production database before deployment
- [ ] Verify backup can be restored
- [ ] Document backup location

### Step 52: Switch to Mainnet
- [ ] Update `frontend/.env`: `VITE_XRPL_NETWORK=mainnet`
- [ ] Update `backend/.env`: `XRPL_NETWORK=mainnet`
- [ ] Verify WebSocket URLs point to mainnet
- [ ] Double-check no testnet references remain

### Step 53: Deploy Backend
- [ ] Build backend (if needed)
- [ ] Deploy backend to production server
- [ ] Test backend health check: `curl https://api.xahpayroll.io/health`
- [ ] Verify backend logs show "MAINNET"

### Step 54: Deploy Frontend
- [ ] Build frontend: `npm run build`
- [ ] Deploy frontend: `npm run deploy`
- [ ] Test frontend loads: Visit production URL
- [ ] Verify dashboard shows "MAINNET XAHAU"
- [ ] Test wallet connection works

### Step 55: Post-Deployment Validation
- [ ] Monitor backend logs for errors
- [ ] Monitor frontend console for errors
- [ ] Test cancel flow with small test channel (if possible)
- [ ] Verify first production cancellation succeeds
- [ ] Check escrow returned correctly on-chain
- [ ] Check database updated correctly
- [ ] Monitor for 24 hours

### Step 56: Rollback Plan (If Needed)
- [ ] Document rollback procedure in case of issues
- [ ] Disable cancel button via feature flag if critical issue
- [ ] Document manual recovery process
- [ ] Keep previous deployment artifacts for quick rollback

---

## Success Criteria Validation

### Functional Requirements
- [ ] NGO can cancel payment channel via UI ✅
- [ ] Escrow automatically returned to NGO wallet ✅
- [ ] Worker receives accumulated unpaid balance ✅
- [ ] Only channel owner can cancel ✅
- [ ] Cannot cancel already-closed channels ✅
- [ ] Works with Xaman wallet ✅
- [ ] Works with Crossmark wallet ✅
- [ ] Works with GemWallet wallet ✅

### Non-Functional Requirements
- [ ] Transaction completes in <10 seconds ✅
- [ ] Clear error messages for all failures ✅
- [ ] Loading states during processing ✅
- [ ] Database and blockchain synchronized ✅
- [ ] Test coverage ≥80% ✅
- [ ] No security vulnerabilities ✅

### User Experience
- [ ] One-click cancel with confirmation ✅
- [ ] Escrow return amount shown in modal ✅
- [ ] Visual feedback during processing ✅
- [ ] Success message with returned amount ✅
- [ ] Channel removed from active list ✅

---

## Progress Tracking

**Phase 1 (Planning)**: ✅ Complete (4/4 tasks)
**Phase 2 (Backend)**: ☐ Not Started (0/7 steps)
**Phase 3 (XRPL)**: ☐ Not Started (0/4 steps)
**Phase 4 (API)**: ☐ Not Started (0/3 steps)
**Phase 5 (UI)**: ☐ Not Started (0/15 steps)
**Phase 6 (Database)**: ☐ Optional (0/1 step)
**Phase 7 (Testing)**: ☐ Not Started (0/7 steps)
**Phase 8 (Quality)**: ☐ Not Started (0/3 steps)
**Phase 9 (Security)**: ☐ Not Started (0/4 steps)
**Phase 10 (Monitoring)**: ☐ Not Started (0/2 steps)
**Phase 11 (Docs)**: ☐ Not Started (0/3 steps)
**Phase 12 (Deploy)**: ☐ Not Started (0/7 steps)

**Total Steps**: 56 (+ 8 success criteria)
**Completed**: 4/56 (7%)
**Remaining**: 52 steps

---

## Quick Reference

### Development Commands
```bash
# Start dev servers
npm run dev

# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend

# Run linter
npm run lint

# Backend tests
cd backend && npm test

# Frontend build
cd frontend && npm run build

# Deploy to production
npm run deploy
```

### Key Files
```
backend/routes/paymentChannels.js       # Steps 1-7
frontend/src/utils/paymentChannels.ts   # Steps 8-11
frontend/src/services/api.ts            # Steps 12-14
frontend/src/pages/NgoDashboard.tsx     # Steps 15-29
```

---

## Notes & Issues

**Blockers**:
- [ ] None currently

**Questions**:
- [ ] Should we add toast notifications instead of alerts?
- [ ] Should we add analytics tracking for cancellations?
- [ ] Should we add admin override to cancel any channel?

**Known Issues**:
- [ ] None currently

**Next Session TODO**:
- [ ] Start with Step 1 (Backend input validation)

---

**Last Updated**: 2025-11-09
