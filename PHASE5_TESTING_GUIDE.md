# Phase 5 Testing Guide: Channel Closure Enhancements

**Feature**: Payment Channel Closure with Unclaimed Balance Warnings
**Version**: 1.0
**Date**: 2025-11-15
**Status**: Ready for Manual Testing

---

## Overview

Phase 5 adds comprehensive unclaimed balance protection when closing payment channels, with support for both NGO and Worker-initiated closures.

### Key Features
- ✅ **Dual Authorization**: NGO OR Worker can close channels
- ✅ **Unclaimed Balance Warnings**: Prevents accidental wage forfeiture
- ✅ **Force Close Option**: Allows override with explicit acknowledgment
- ✅ **Caller-Specific Messaging**: Different warnings for NGO vs Worker

---

## Pre-Testing Setup

### 1. Environment Preparation
```bash
# Ensure backend and frontend are running
npm run dev

# Verify database connection
cd backend && npm run test:db
```

### 2. Test Data Requirements
- **NGO Wallet**: Funded testnet wallet (minimum 100 XAH)
- **Worker Wallet**: Separate testnet wallet (minimum 10 XAH for fees)
- **Active Payment Channel**: With accumulated balance (e.g., 50 XAH)

### 3. Wallet Providers to Test
- [ ] Xaman (mobile + QR code)
- [ ] Crossmark (browser extension)
- [ ] GemWallet (browser extension)

### 4. Network Configuration
- [ ] **Testnet**: Primary testing environment (xahau-test.net)
- [ ] **Mainnet**: Only after testnet validation (use minimal amounts)

---

## Test Scenarios

## Scenario 1: NGO Closes Channel with Unclaimed Balance ⚠️

**Objective**: Verify NGO sees warning when worker has unclaimed wages

### Setup
1. Create payment channel with worker (funded with 100 XAH)
2. Worker accumulates balance (e.g., 50 XAH from hours worked)
3. **Do NOT** have worker claim balance yet

### Test Steps

#### Step 1.1: Initial Closure Attempt
```
1. Log in as NGO
2. Navigate to NGO Dashboard
3. Locate active payment channel with accumulated balance
4. Click "CANCEL CHANNEL" button
```

**Expected Result**:
- Confirmation modal appears
- Channel details displayed (Job, Escrow, Accumulated Balance, Hours)

#### Step 1.2: Confirm Cancellation (Triggers Warning)
```
1. In confirmation modal, click "CANCEL CHANNEL"
2. Backend checks for unclaimed balance
```

**Expected Result**:
- ⚠️ **UnclaimedBalanceWarningModal** appears
- Confirmation modal closes
- Warning shows:
  - "WORKER HAS X XAH IN UNCLAIMED WAGES"
  - Channel details (job name, worker name, hours, escrow)
  - Red warning box with important messages
  - "ENSURE PAYMENT BEFORE CLOSING" recommendation

**Validation Checks**:
- [ ] Warning modal displays correct balance amount
- [ ] Worker name and job details accurate
- [ ] Hours worked calculation correct
- [ ] Escrow remaining amount shown
- [ ] ALL CAPS text convention followed
- [ ] Two action buttons present: "GO BACK (RECOMMENDED)" and "FORCE CLOSE ANYWAY"

#### Step 1.3: Recommended Action (Go Back)
```
1. Click "GO BACK (RECOMMENDED)" button
```

**Expected Result**:
- Warning modal closes
- Returns to NGO Dashboard
- Channel remains active
- Worker balance unchanged

#### Step 1.4: Force Close Flow
```
1. Click "CANCEL CHANNEL" again
2. Click "CANCEL CHANNEL" in confirmation modal
3. Warning appears again
4. Click "⚠️ FORCE CLOSE ANYWAY" button
```

**Expected Result**:
- Loading state: "CLOSING CHANNEL..."
- **Step 1**: Backend returns XRPL transaction details
- **Step 2**: XRPL PaymentChannelClaim transaction submitted
  - Xaman: QR code or deep link appears
  - Crossmark: Extension popup appears
  - GemWallet: Extension popup appears
- **Step 3**: Database confirmation after XRPL success
- Success alert:
  ```
  ✅ PAYMENT CHANNEL CANCELED SUCCESSFULLY!

  ESCROW RETURNED: 50 XAH
  WORKER PAYMENT: 50 XAH
  TRANSACTION: [TX_HASH]
  ```
- Dashboard refreshes automatically
- Channel status: CLOSED

**Validation Checks**:
- [ ] XRPL transaction completed successfully
- [ ] Transaction hash displayed in success message
- [ ] Worker receives accumulated balance (50 XAH)
- [ ] NGO receives escrow return (50 XAH)
- [ ] Channel status updated to 'closed' in database
- [ ] `closure_tx_hash` stored in database
- [ ] `closed_at` timestamp recorded

---

## Scenario 2: Worker Closes Channel with Unclaimed Balance ⚠️

**Objective**: Verify worker sees forfeit warning when closing with unclaimed wages

### Setup
1. Use existing channel from Scenario 1 OR create new channel
2. Worker accumulates balance (e.g., 30 XAH)
3. **Do NOT** claim balance

### Test Steps

#### Step 2.1: Initial Closure Attempt
```
1. Log in as Worker
2. Navigate to Worker Dashboard
3. Locate "MY PAYMENT CHANNELS" section (if visible)
4. Click "CLOSE CHANNEL" button
```

**Expected Result**:
- Confirmation modal appears
- Shows job name, accumulated balance, hours worked

#### Step 2.2: Confirm Closure (Triggers Warning)
```
1. Click "CLOSE CHANNEL" in confirmation modal
```

**Expected Result**:
- ⚠️ **UnclaimedBalanceWarningModal** appears
- Warning shows:
  - "YOU HAVE X XAH IN UNCLAIMED WAGES"
  - "YOU WILL FORFEIT X XAH IN UNCLAIMED WAGES"
  - Red warning: "IF YOU CLOSE THIS CHANNEL, YOU WILL FORFEIT..."
  - "THIS AMOUNT REPRESENTS X.Xh OF YOUR WORK"
  - "CLAIM YOUR BALANCE FIRST TO RECEIVE YOUR EARNINGS"
  - Recommended action: "CLAIM YOUR BALANCE FIRST, THEN CLOSE THE CHANNEL SAFELY"

**Validation Checks**:
- [ ] Warning explicitly uses "YOU WILL FORFEIT" language
- [ ] Worker-specific messaging (not NGO messaging)
- [ ] Amount and hours calculation correct
- [ ] Strong visual warnings (red borders, warning icons)
- [ ] Two buttons: "← GO BACK (RECOMMENDED)" and "⚠️ FORFEIT WAGES & CLOSE"

#### Step 2.3: Recommended Action (Go Back)
```
1. Click "← GO BACK (RECOMMENDED)"
```

**Expected Result**:
- Modal closes
- Worker dashboard unchanged
- Balance still available to claim

#### Step 2.4: Force Close (Forfeit Wages)
```
1. Click "CLOSE CHANNEL" again
2. Confirm in modal
3. Warning appears
4. Click "⚠️ FORFEIT WAGES & CLOSE"
```

**Expected Result**:
- XRPL PaymentChannelClaim transaction submitted
- Worker signs transaction
- Success message:
  ```
  ✅ PAYMENT CHANNEL CLOSED SUCCESSFULLY!

  YOU RECEIVED: 0 XAH (forfeited)
  ESCROW RETURNED TO EMPLOYER: 100 XAH
  TRANSACTION: [TX_HASH]
  ```
- Channel closed
- Worker forfeited 30 XAH (returns to NGO escrow)

**Validation Checks**:
- [ ] Worker explicitly acknowledged forfeit
- [ ] Transaction completed successfully
- [ ] Worker receives 0 XAH (balance forfeited)
- [ ] NGO receives full escrow return (100 XAH)
- [ ] Channel status: 'closed'

---

## Scenario 3: NGO Closes Channel with Zero Balance ✅

**Objective**: Verify no warning when balance is zero

### Setup
1. Create payment channel (funded with 50 XAH)
2. Worker does NOT work (no hours logged)
3. Accumulated balance: 0 XAH

### Test Steps
```
1. NGO clicks "CANCEL CHANNEL"
2. Confirm cancellation
```

**Expected Result**:
- **NO unclaimed balance warning** modal
- Proceeds directly to XRPL transaction
- Success:
  ```
  ✅ PAYMENT CHANNEL CANCELED SUCCESSFULLY!

  ESCROW RETURNED: 50 XAH
  WORKER PAYMENT: 0 XAH
  TRANSACTION: [TX_HASH]
  ```

**Validation Checks**:
- [ ] No warning modal appeared
- [ ] Direct transition to XRPL transaction
- [ ] Full escrow returned to NGO (50 XAH)
- [ ] Worker receives 0 XAH (correct)

---

## Scenario 4: Worker Closes Channel with Zero Balance ✅

**Objective**: Worker can close channel without warning when balance is zero

### Setup
1. Worker has active channel
2. No hours worked (balance: 0 XAH)

### Test Steps
```
1. Worker clicks "CLOSE CHANNEL"
2. Confirm closure
```

**Expected Result**:
- No warning modal
- XRPL transaction proceeds
- Worker receives 0 XAH
- Escrow returns to NGO

**Validation Checks**:
- [ ] No warning displayed
- [ ] Clean closure flow
- [ ] Correct escrow distribution

---

## Scenario 5: Unauthorized Closure Attempt ❌

**Objective**: Verify authorization checks prevent unauthorized closures

### Setup
1. NGO creates channel with Worker A
2. Log in as different wallet (Worker B or unrelated user)

### Test Steps
```
1. Attempt to call API: POST /api/payment-channels/:channelId/close
   Body: { organizationWalletAddress: "WRONG_WALLET" }
```

**Expected Result**:
- **403 UNAUTHORIZED** error
- Message: "UNAUTHORIZED: YOU DO NOT HAVE PERMISSION TO CLOSE THIS PAYMENT CHANNEL"
- Channel remains active

**Validation Checks**:
- [ ] Authorization check blocks request
- [ ] Error message clear and accurate
- [ ] Channel state unchanged

---

## Scenario 6: Already-Closed Channel ❌

**Objective**: Cannot close already-closed channels

### Setup
1. Close a payment channel successfully
2. Attempt to close it again

### Test Steps
```
1. Call API: POST /api/payment-channels/:channelId/close
```

**Expected Result**:
- **400 BAD REQUEST** error
- Message: "PAYMENT CHANNEL IS ALREADY CLOSED"

**Validation Checks**:
- [ ] State validation prevents duplicate closure
- [ ] Error message informative
- [ ] No XRPL transaction attempted

---

## Scenario 7: Network Error Handling 🔧

**Objective**: Graceful handling of network/XRPL errors

### Test Cases

#### 7.1: XRPL Transaction Timeout
```
1. Start closure flow
2. Wallet signs transaction
3. XRPL network timeout (simulate by disconnecting internet)
```

**Expected Result**:
- Error message: "❌ FAILED TO CLOSE CHANNEL: XRPL TRANSACTION FAILED"
- Channel status unchanged
- User can retry

#### 7.2: User Rejects Transaction
```
1. Start closure flow
2. Wallet popup appears
3. User clicks "REJECT" or "CANCEL"
```

**Expected Result**:
- Error message: "❌ FAILED TO CLOSE CHANNEL: USER REJECTED TRANSACTION"
- Channel remains active
- No database changes

#### 7.3: Backend Error
```
1. Stop backend server
2. Attempt closure
```

**Expected Result**:
- Error message: "❌ FAILED TO CLOSE CHANNEL: BACKEND UNAVAILABLE"
- User-friendly error display

**Validation Checks**:
- [ ] All error cases handled gracefully
- [ ] No partial state changes
- [ ] User can retry after fixing issue

---

## Scenario 8: Multi-Wallet Provider Testing 🔄

**Objective**: Verify all wallet providers work correctly

### Test Matrix

| Wallet Provider | NGO Closure | Worker Closure | Force Close |
|-----------------|-------------|----------------|-------------|
| **Xaman**       | [ ]         | [ ]            | [ ]         |
| **Crossmark**   | [ ]         | [ ]            | [ ]         |
| **GemWallet**   | [ ]         | [ ]            | [ ]         |

### Test Steps (for each wallet)
```
1. Connect wallet
2. Create payment channel
3. Accumulate balance
4. Attempt closure
5. Verify warning appears
6. Complete force close
7. Verify transaction success
```

**Validation Checks**:
- [ ] All wallets show QR/popup correctly
- [ ] Transaction signing works
- [ ] Success confirmation received
- [ ] Blockchain transactions validated

---

## Edge Cases & Regression Tests

### Edge Case 1: Concurrent Closure Attempts
```
1. NGO starts closure (opens modal)
2. Worker starts closure simultaneously
3. Both attempt to close
```

**Expected Result**:
- First transaction succeeds
- Second transaction fails: "CHANNEL ALREADY CLOSED"

### Edge Case 2: Very Small Balances
```
1. Worker has 0.000001 XAH accumulated
2. Attempt closure
```

**Expected Result**:
- Warning still appears (any amount > 0 triggers warning)
- Amounts display correctly

### Edge Case 3: Very Large Balances
```
1. Worker has 10,000+ XAH accumulated
2. Attempt closure
```

**Expected Result**:
- Numbers formatted correctly (commas)
- Warning displays prominently
- Transaction handles large amounts

---

## Performance Testing

### Load Checks
- [ ] Modal renders in < 300ms
- [ ] Warning calculation in < 100ms
- [ ] XRPL transaction submission in < 5 seconds
- [ ] Database update in < 500ms

### UI Responsiveness
- [ ] No UI freezing during closure
- [ ] Loading states clear and immediate
- [ ] Smooth modal transitions
- [ ] Proper error recovery

---

## Security Validation Checklist

- [ ] **Authorization**: Only channel participants can close
- [ ] **Input Validation**: Wallet addresses validated (Xahau format)
- [ ] **Channel ID Validation**: 64-char hex string verified
- [ ] **Re-validation**: Backend re-checks authorization on confirm
- [ ] **State Checks**: Cannot close already-closed channels
- [ ] **Atomic Operations**: Database updates only after XRPL success
- [ ] **Escrow Safety**: No negative escrow returns
- [ ] **Amount Precision**: Drops to XAH conversion accurate
- [ ] **SQL Injection**: Parameterized queries used
- [ ] **XSS Prevention**: User inputs sanitized

---

## Accessibility Testing

- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Screen reader announces modal title and warnings
- [ ] Focus trapped within modal
- [ ] ESC key closes modals
- [ ] Color contrast meets WCAG AA standards (warning colors)
- [ ] Error messages read by screen readers
- [ ] Loading states announced

---

## Browser Compatibility

Test in the following browsers:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Final Checklist

### Functional Requirements ✅
- [ ] NGO can close channels with warning
- [ ] Worker can close channels with warning
- [ ] Force close works for both user types
- [ ] Zero balance closures skip warning
- [ ] Unauthorized attempts blocked
- [ ] Already-closed channels rejected

### User Experience ✅
- [ ] Warnings are clear and specific
- [ ] Recommended actions prominent
- [ ] ALL CAPS text convention followed
- [ ] Error messages user-friendly
- [ ] Loading states informative

### Technical Quality ✅
- [ ] 3-step closure flow completes successfully
- [ ] XRPL transactions validated on-chain
- [ ] Database state consistent
- [ ] Error handling comprehensive
- [ ] No console errors

### Documentation ✅
- [ ] CLAUDE.md updated with Phase 5 info
- [ ] WORKER_DELETION.md marked complete
- [ ] This testing guide available
- [ ] API endpoint documentation clear

---

## Reporting Issues

If you encounter any issues during testing, document:

1. **Issue Title**: Brief description
2. **Scenario**: Which test scenario
3. **Steps to Reproduce**: Exact steps taken
4. **Expected Result**: What should have happened
5. **Actual Result**: What actually happened
6. **Environment**: Wallet provider, network, browser
7. **Screenshots**: If applicable
8. **Console Logs**: Error messages or warnings

### Example Issue Report
```
Title: Warning modal doesn't appear for NGO closure

Scenario: Scenario 1, Step 1.2
Steps:
1. NGO logged in with Xaman wallet
2. Clicked "CANCEL CHANNEL" on active channel (50 XAH balance)
3. Confirmed cancellation

Expected: UnclaimedBalanceWarningModal appears
Actual: Proceeded directly to XRPL transaction

Environment:
- Wallet: Xaman v2.4.1
- Network: Testnet
- Browser: Chrome 119.0.6045.159
- OS: macOS 14.1

Console Logs:
[CANCEL_FLOW_ERROR] response.error.code: undefined
```

---

## Test Sign-Off

### Tester Information
- **Name**: _________________
- **Date**: _________________
- **Environment**: Testnet / Mainnet
- **Wallet Providers Tested**: _________________

### Test Results
- **Scenarios Passed**: _____ / 8
- **Edge Cases Passed**: _____ / 3
- **Critical Issues Found**: _____
- **Minor Issues Found**: _____

### Recommendation
- [ ] ✅ **APPROVED FOR PRODUCTION** - All critical tests passing
- [ ] ⚠️ **APPROVED WITH MINOR ISSUES** - Non-blocking issues documented
- [ ] ❌ **NOT APPROVED** - Critical issues must be resolved

### Notes
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

**End of Phase 5 Testing Guide**
