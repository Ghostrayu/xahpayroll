# XAH PAYROLL - QUICK VALIDATION TEST (15 MINUTES)

**PURPOSE**: Rapid smoke test covering the core payment channel workflow end-to-end.

**TARGET AUDIENCE**: Judges, evaluators, or users who want to quickly verify the app works correctly.

**TIME REQUIRED**: ~15 minutes

**NETWORK**: Testnet (Xahau Testnet) - No real funds required

---

## ✅ PREREQUISITES

Before starting, ensure you have:

- [ ] **Xaman Wallet App** installed on mobile device (iOS/Android) or desktop
  - Download: https://xaman.app
  - Create wallet or import existing testnet wallet

- [ ] **Testnet XAH Tokens** (at least 50 XAH for NGO, 20 XAH for Worker)
  - Get free testnet XAH from faucet: https://xahau-test.net (if available)
  - Or use existing testnet wallet addresses

- [ ] **Application Running**
  - Backend on http://localhost:3001
  - Frontend on http://localhost:3000
  - Both servers started via `npm run dev` from root

- [ ] **Two Separate Wallet Addresses**
  - **NGO Wallet**: For employer/organization role (rNGO...)
  - **Worker Wallet**: For employee role (rWorker...)
  - ⚠️ CRITICAL: These MUST be different addresses (wallet restriction enforced)

---

## 🎯 TEST SCENARIO

You are an NGO hiring a worker for a 2-hour job at 0.15 XAH/hour (total: 0.30 XAH). The worker will log 2 hours, and you'll close the payment channel to release payment.

---

## 📋 TEST STEPS

### PART 1: NGO SETUP (5 MINUTES)

#### Step 1.1: Connect NGO Wallet
1. Navigate to http://localhost:3000
2. Click **"REGISTER AS EMPLOYER"** button (right card on homepage)
3. Click **"CONNECT WALLET"** button
4. Scan QR code with Xaman app using NGO wallet
5. Approve sign-in request in Xaman app

**✅ EXPECTED RESULT:**
- Redirected to profile setup page
- Xaman app shows "Signed successfully" message

#### Step 1.2: Complete NGO Profile
1. Fill in profile form:
   - **Organization Name**: "Test NGO Foundation"
   - **Email**: your-email@example.com (optional)
   - **Account Type**: Select **"NGO/EMPLOYER"**
2. Check **"I ACCEPT THE TERMS OF SERVICE"**
3. Click **"COMPLETE PROFILE"**

**✅ EXPECTED RESULT:**
- Success alert: "PROFILE CREATED SUCCESSFULLY"
- Redirected to NGO Dashboard
- Dashboard shows organization name "Test NGO Foundation"
- Dashboard shows wallet address (rNGO...)

#### Step 1.3: Add Worker
1. Click **"ADD WORKER"** button (top right of dashboard)
2. Fill in worker details:
   - **Full Name**: "John Doe"
   - **Wallet Address**: [Your Worker Wallet Address - rWorker...]
     - You can click "SCAN WITH XAMAN" to scan worker's wallet QR code
   - **Hourly Rate**: 0.15
3. Click **"ADD WORKER"**

**✅ EXPECTED RESULT:**
- Success alert: "WORKER ADDED SUCCESSFULLY"
- Worker "John Doe" appears in workers list
- Worker shows wallet address (rWorker...)

#### Step 1.4: Create Payment Channel
1. Click **"CREATE PAYMENT CHANNEL"** button
2. Fill in channel details:
   - **Select Worker**: Choose "John Doe (rWorker...)" from dropdown
   - **Job Name**: "Test Development Work"
   - **Hourly Rate**: 0.15 XAH (auto-filled from worker profile)
   - **Estimated Duration**: 2 hours
   - **Escrow Amount**: 0.30 XAH (auto-calculated: 2 hours × 0.15)
3. Click **"CREATE CHANNEL"**
4. **Sign transaction in Xaman app** (scan QR code or approve via deep link)

**✅ EXPECTED RESULT:**
- Success alert: "PAYMENT CHANNEL CREATED SUCCESSFULLY"
- New channel appears in "Active Payment Channels" table
- Channel shows:
  - Job: "Test Development Work"
  - Worker: "John Doe (rWorker...)"
  - Escrow: 0.30 XAH
  - Status: **● ACTIVE** (green indicator)
  - Accumulated Balance: 0.00 XAH (no hours logged yet)
- Transaction confirmed on Xahau testnet ledger

**🔍 VERIFICATION (Optional):**
```sql
-- Connect to database
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev -h localhost -p 5432

-- Query payment channels
SELECT channel_id, job_name, status, escrow_funded_amount, accumulated_balance
FROM payment_channels
WHERE job_name = 'Test Development Work';

-- Should show: status = 'active', escrow_funded_amount = 0.30000000
```

---

### PART 2: WORKER WORKFLOW (3 MINUTES)

#### Step 2.1: Connect Worker Wallet
1. **Disconnect NGO wallet** (click disconnect in navbar)
2. Click **"GET STARTED AS WORKER"** button (left card on homepage)
3. Click **"CONNECT WALLET"** button
4. Scan QR code with Xaman app using **WORKER wallet** (different from NGO!)
5. Approve sign-in request in Xaman app

**✅ EXPECTED RESULT:**
- Redirected to worker profile setup

#### Step 2.2: Complete Worker Profile
1. Fill in profile form:
   - **Display Name**: "John Doe"
   - **Email**: worker@example.com (optional)
   - **Account Type**: Select **"EMPLOYEE"**
2. Check **"I ACCEPT THE TERMS OF SERVICE"**
3. Click **"COMPLETE PROFILE"**

**✅ EXPECTED RESULT:**
- Success alert: "PROFILE CREATED SUCCESSFULLY"
- Redirected to Worker Dashboard
- Dashboard shows "John Doe" profile
- Dashboard shows wallet address (rWorker...)

#### Step 2.3: Verify Payment Channel
1. Check **"Active Payment Channels"** section on Worker Dashboard

**✅ EXPECTED RESULT:**
- Payment channel appears:
  - Employer: "Test NGO Foundation"
  - Job: "Test Development Work"
  - Rate: 0.15 XAH/hour
  - Escrow: 0.30 XAH
  - Status: **● ACTIVE**
  - Hours: 0.00 / Balance: 0.00 XAH

#### Step 2.4: Clock In (Start Work Session)
1. Expand the payment channel card (click to view details)
2. Click **"CLOCK IN"** button
3. Confirm clock-in

**✅ EXPECTED RESULT:**
- Success alert: "CLOCKED IN SUCCESSFULLY"
- Timer starts counting (00:00:01, 00:00:02...)
- Button changes to **"CLOCK OUT"** (enabled)
- Session status shows **"● IN SESSION"**

**⏳ WAIT 5-10 SECONDS** (simulate work time - optional: wait longer for more realistic balance)

#### Step 2.5: Clock Out (End Work Session)
1. Click **"CLOCK OUT"** button
2. Confirm clock-out

**✅ EXPECTED RESULT:**
- Success alert: "CLOCKED OUT SUCCESSFULLY. HOURS LOGGED: 0.00"
- Timer stops
- **Accumulated Balance** updates (e.g., 0.00 XAH for 10 seconds)
- Hours worked shows: 0.00 hours (rounds down for short sessions)

**💡 NOTE**: For testing purposes, the session is very short. In production, workers would log hours over longer periods (e.g., actual work shifts).

---

### PART 3: CHANNEL CLOSURE & PAYMENT (7 MINUTES)

#### Step 3.1: Switch Back to NGO Wallet
1. **Disconnect worker wallet** (click disconnect in navbar)
2. Navigate to http://localhost:3000
3. Click **"REGISTER AS EMPLOYER"**
4. Click **"CONNECT WALLET"**
5. Scan QR code with Xaman app using **NGO wallet**
6. Sign in (should recognize existing profile)

**✅ EXPECTED RESULT:**
- Redirected directly to NGO Dashboard (profile already exists)
- Dashboard shows "Test NGO Foundation"

#### Step 3.2: Close Payment Channel
1. Find "Test Development Work" channel in **"Active Payment Channels"** table
2. Click **"CANCEL CHANNEL"** button (far right of channel row)
3. Review confirmation modal:
   - Shows accumulated balance (0.00 XAH in this test)
   - Shows escrow return amount (0.30 XAH - since no hours logged)
4. Click **"CONFIRM CANCELLATION"**
5. **Sign transaction in Xaman app** (PaymentChannelClaim transaction)

**✅ EXPECTED RESULT:**
- Success alert: "CHANNEL CLOSED SUCCESSFULLY"
- Channel removed from "Active Payment Channels" table
- Channel appears in **"Closed Channels"** section (if implemented)
- Unused escrow (0.30 XAH) returned to NGO wallet automatically
- Worker receives accumulated balance (0.00 XAH in this test)

**🔍 VERIFICATION (Database):**
```sql
-- Query closed channel
SELECT channel_id, job_name, status, accumulated_balance, closure_tx_hash, closed_at
FROM payment_channels
WHERE job_name = 'Test Development Work';

-- Should show:
-- status = 'closed'
-- accumulated_balance = 0.00000000 (cleared after closure)
-- closure_tx_hash = (64-char hex hash)
-- closed_at = (recent timestamp)
```

**🔍 VERIFICATION (Xahau Explorer):**
1. Copy `closure_tx_hash` from database or success alert
2. Visit: https://explorer.xahau.network/tx/{closure_tx_hash}
3. Verify:
   - Transaction Type: PaymentChannelClaim
   - Status: tesSUCCESS (validated)
   - Balance field shows accumulated amount (if any)
   - Channel no longer exists on ledger

---

## 🎉 TEST COMPLETE!

### ✅ WHAT YOU VALIDATED

If all steps completed successfully, you've verified:

1. ✅ **Wallet Integration**: Xaman QR code + deep linking works
2. ✅ **Profile Management**: NGO and Worker profiles created with wallet-based auth
3. ✅ **Wallet Restrictions**: Different wallets required for NGO vs Worker roles
4. ✅ **Worker Management**: NGO can add workers to organization
5. ✅ **Payment Channel Creation**: XRPL PaymentChannelCreate transaction works
6. ✅ **Work Session Tracking**: Workers can clock in/out to log hours
7. ✅ **Balance Accumulation**: Hours worked convert to XAH balance
8. ✅ **Channel Closure**: XRPL PaymentChannelClaim releases payment + returns escrow
9. ✅ **Database Integrity**: All state changes persisted correctly
10. ✅ **Ledger Sync**: XRPL ledger and database remain consistent

---

## 🐛 TROUBLESHOOTING

### Issue: "WALLET ALREADY REGISTERED AS [TYPE]"
**Cause**: Trying to use same wallet for both NGO and Worker roles

**Fix**: Use two separate Xaman wallet addresses (one for NGO, one for Worker)

---

### Issue: "WORKER WALLET NOT ACTIVATED ON LEDGER"
**Cause**: Worker wallet doesn't exist on Xahau testnet yet

**Fix**:
1. Send 10-20 XAH to worker wallet to activate it
2. Wait 3-5 seconds for ledger confirmation
3. Retry payment channel creation

---

### Issue: "PAGE REFRESHES AFTER SIGNING IN XAMAN"
**Cause**: Old behavior (should be fixed as of 2025-12-11)

**Fix**: Ensure you're running latest code with `return_url` removed from transaction payloads

---

### Issue: Channel shows "ACTIVE" but already closed on ledger
**Cause**: Database not synced with ledger state

**Fix**: Click "Sync All Channels" button (if implemented) or restart backend

---

## 📊 EXPECTED TIMING

| Step | Description | Time |
|------|-------------|------|
| 1.1-1.2 | NGO wallet connection + profile | 2 min |
| 1.3-1.4 | Add worker + create channel | 3 min |
| 2.1-2.5 | Worker wallet + clock in/out | 3 min |
| 3.1-3.2 | Return to NGO + close channel | 5 min |
| Verification | Optional database/ledger checks | 2 min |
| **TOTAL** | | **~15 min** |

---

## 🎯 NEXT STEPS

**For Quick Validation**: ✅ You're done! Core functionality verified.

**For Comprehensive Testing**: See `TEST_COMPREHENSIVE_SUITE.md` for:
- Profile deletion and data export
- Multiple workers and channels
- Network switching (testnet ↔ mainnet)
- Edge cases and error handling
- Security validation

**For Setup Help**: See `TEST_SETUP_GUIDE.md` for:
- Testnet wallet creation
- Getting testnet XAH tokens
- Environment configuration
- Database troubleshooting

---

**LAST UPDATED**: 2026-01-02
**VERSION**: 1.0.0
**NETWORK**: Xahau Testnet
