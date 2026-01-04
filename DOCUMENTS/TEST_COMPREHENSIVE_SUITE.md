# XAH PAYROLL - COMPREHENSIVE TEST SUITE (1-2 HOURS)

**PURPOSE**: Thorough testing of all features, edge cases, and security validations.

**TARGET AUDIENCE**: Judges performing deep evaluation, QA testers, security auditors.

**TIME REQUIRED**: ~1-2 hours (depending on thoroughness)

**NETWORK**: Testnet (Xahau Testnet) - No real funds required

---

## 📋 PREREQUISITES

Complete **TEST_SETUP_GUIDE.md** first to ensure:
- ✅ Application running (backend + frontend)
- ✅ Three testnet wallets prepared (NGO, Worker1, Worker2)
- ✅ Each wallet funded with 50+ XAH testnet tokens
- ✅ Database accessible for verification queries

---

## 🗂️ TEST CATEGORIES

This comprehensive suite covers:

1. **User Authentication & Profiles** (15 min)
2. **Worker Management** (15 min)
3. **Payment Channel Lifecycle** (20 min)
4. **Work Session Tracking** (15 min)
5. **Multi-Worker Scenarios** (15 min)
6. **Security & Restrictions** (15 min)
7. **Error Handling & Edge Cases** (15 min)
8. **Data Management & Deletion** (10 min)

---

## CATEGORY 1: USER AUTHENTICATION & PROFILES (15 MIN)

### TEST 1.1: NGO Profile Creation
**Objective**: Verify NGO/employer can create profile with wallet-based authentication

**Steps**:
1. Navigate to http://localhost:3000
2. Click "REGISTER AS EMPLOYER"
3. Click "CONNECT WALLET"
4. Scan QR code with Xaman app (NGO wallet)
5. Approve sign-in in Xaman
6. Fill profile form:
   - Organization Name: "Test NGO Foundation"
   - Email: ngo@example.com
   - Account Type: "NGO/EMPLOYER"
7. Accept Terms of Service
8. Click "COMPLETE PROFILE"

**✅ EXPECTED RESULTS**:
- Success alert: "PROFILE CREATED SUCCESSFULLY"
- Redirected to NGO Dashboard
- Dashboard shows organization name and wallet address
- Navbar shows "Test NGO Foundation" (logged in)

**🔍 DATABASE VERIFICATION**:
```sql
SELECT id, wallet_address, user_type, profile_data
FROM users
WHERE wallet_address = 'rNGO...';

-- Should show: user_type = 'ngo' or 'employer'
```

---

### TEST 1.2: Worker Profile Creation
**Objective**: Verify worker can create employee profile

**Steps**:
1. Disconnect NGO wallet (click disconnect in navbar)
2. Navigate to http://localhost:3000
3. Click "GET STARTED AS WORKER"
4. Click "CONNECT WALLET"
5. Scan QR code with Xaman app (Worker1 wallet)
6. Approve sign-in in Xaman
7. Fill profile form:
   - Display Name: "Alice Worker"
   - Email: alice@example.com
   - Account Type: "EMPLOYEE"
8. Accept Terms of Service
9. Click "COMPLETE PROFILE"

**✅ EXPECTED RESULTS**:
- Success alert: "PROFILE CREATED SUCCESSFULLY"
- Redirected to Worker Dashboard
- Dashboard shows worker name and wallet address
- Navbar shows "Alice Worker" (logged in)

**🔍 DATABASE VERIFICATION**:
```sql
SELECT id, wallet_address, user_type, profile_data
FROM users
WHERE wallet_address = 'rWorker1...';

-- Should show: user_type = 'employee'
```

---

### TEST 1.3: Existing User Login
**Objective**: Verify returning users can log in without re-creating profile

**Steps**:
1. Disconnect current wallet
2. Click "CONNECT WALLET"
3. Scan QR code with NGO wallet (already has profile)
4. Approve sign-in in Xaman

**✅ EXPECTED RESULTS**:
- **NO profile setup page** (skipped because profile exists)
- Redirected directly to NGO Dashboard
- Dashboard shows existing organization "Test NGO Foundation"
- No duplicate user created in database

---

### TEST 1.4: Network Display Verification
**Objective**: Verify app correctly displays connected network

**Steps**:
1. Check environment variable in `backend/.env`:
   ```
   XRPL_NETWORK=testnet
   ```
2. Check navbar or dashboard for network indicator

**✅ EXPECTED RESULTS**:
- Network indicator shows "Testnet" or "Xahau Testnet"
- No production/mainnet warnings displayed
- All transactions go to testnet ledger (wss://xahau-test.net)

---

## CATEGORY 2: WORKER MANAGEMENT (15 MIN)

### TEST 2.1: Add Worker via Wallet Address
**Objective**: NGO can manually add worker by entering wallet address

**Steps**:
1. Log in as NGO (Test NGO Foundation)
2. Click "ADD WORKER" button
3. Fill worker form:
   - Full Name: "Alice Worker"
   - Wallet Address: rWorker1... (manually typed)
   - Hourly Rate: 0.20
4. Click "ADD WORKER"

**✅ EXPECTED RESULTS**:
- Success alert: "WORKER ADDED SUCCESSFULLY"
- Worker appears in workers list/table
- Worker shows: Name, Wallet, Rate (0.20 XAH/hr)

**🔍 DATABASE VERIFICATION**:
```sql
SELECT id, full_name, employee_wallet_address, hourly_rate
FROM employees
WHERE organization_id = (SELECT id FROM organizations WHERE organization_name = 'Test NGO Foundation');

-- Should show Alice Worker with rate 0.20
```

---

### TEST 2.2: Add Worker via Xaman QR Scan
**Objective**: NGO can scan worker's wallet QR code for easy address input

**Steps**:
1. Click "ADD WORKER" button
2. Click "SCAN WITH XAMAN" button
3. Scan Worker2's wallet QR code (or manually paste for testing)
4. Fill remaining fields:
   - Full Name: "Bob Worker"
   - Hourly Rate: 0.15
5. Click "ADD WORKER"

**✅ EXPECTED RESULTS**:
- Wallet address auto-filled after scan
- Worker "Bob Worker" added successfully
- Two workers now in list (Alice + Bob)

---

### TEST 2.3: Add Same Worker to Different Organization
**Objective**: Verify same worker wallet can work for multiple NGOs

**Setup**: Create second NGO profile with different wallet

**Steps**:
1. Create second NGO: "Second Foundation" (use different wallet)
2. Add "Alice Worker" to Second Foundation (same rWorker1... address)
3. Set different hourly rate: 0.25

**✅ EXPECTED RESULTS**:
- Worker added successfully to second organization
- Alice now has 2 employer relationships (different rates)
- No error about "worker already exists"

**🔍 DATABASE VERIFICATION**:
```sql
SELECT organization_id, full_name, employee_wallet_address, hourly_rate
FROM employees
WHERE employee_wallet_address = 'rWorker1...';

-- Should show 2 rows: same worker, different org_id, different rates
```

---

### TEST 2.4: Prevent Duplicate Worker in Same Organization
**Objective**: Verify can't add same worker twice to same NGO

**Steps**:
1. Log in as "Test NGO Foundation"
2. Try to add "Alice Worker" again (same wallet rWorker1...)
3. Click "ADD WORKER"

**✅ EXPECTED RESULTS**:
- ❌ Error alert: "WORKER ALREADY EXISTS IN THIS ORGANIZATION"
- Worker NOT added (no duplicate)
- Database constraint prevents duplicate (org_id, employee_wallet_address)

---

## CATEGORY 3: PAYMENT CHANNEL LIFECYCLE (20 MIN)

### TEST 3.1: Create Payment Channel
**Objective**: NGO creates payment channel with proper XRPL transaction

**Steps**:
1. Log in as NGO
2. Click "CREATE PAYMENT CHANNEL"
3. Fill form:
   - Worker: Select "Alice Worker (rWorker1...)"
   - Job Name: "Frontend Development"
   - Hourly Rate: 0.20 (auto-filled)
   - Duration: 5 hours
   - Escrow: 1.00 XAH (auto-calculated: 5 × 0.20)
4. Click "CREATE CHANNEL"
5. Sign transaction in Xaman app

**✅ EXPECTED RESULTS**:
- Success alert: "PAYMENT CHANNEL CREATED SUCCESSFULLY"
- Channel appears in "Active Payment Channels"
- Channel shows:
  - Job: "Frontend Development"
  - Worker: "Alice Worker"
  - Escrow: 1.00 XAH
  - Status: ● ACTIVE (green)
  - Accumulated Balance: 0.00 XAH

**🔍 XRPL VERIFICATION**:
1. Get transaction hash from success alert or database
2. Visit: https://explorer.xahau.network/tx/{tx_hash}
3. Verify:
   - Transaction Type: PaymentChannelCreate
   - Amount: 1.00 XAH (1000000 drops)
   - Destination: rWorker1...
   - Status: tesSUCCESS

**🔍 DATABASE VERIFICATION**:
```sql
SELECT channel_id, job_name, status, escrow_funded_amount, accumulated_balance
FROM payment_channels
WHERE job_name = 'Frontend Development';

-- Should show:
-- channel_id: 64-char hex (NOT 'TEMP-xxx')
-- status: 'active'
-- escrow_funded_amount: 1.00000000
-- accumulated_balance: 0.00000000
```

---

### TEST 3.2: Channel Appears in Worker Dashboard
**Objective**: Worker can see channel created by NGO

**Steps**:
1. Disconnect NGO wallet
2. Log in as Alice Worker (rWorker1...)
3. Navigate to Worker Dashboard
4. Check "Active Payment Channels" section

**✅ EXPECTED RESULTS**:
- "Frontend Development" channel visible
- Shows employer: "Test NGO Foundation"
- Shows rate: 0.20 XAH/hr
- Shows escrow: 1.00 XAH
- Shows status: ● ACTIVE

---

### TEST 3.3: Close Channel (NGO-Initiated)
**Objective**: NGO can close channel, worker receives balance, escrow returns

**Setup**: Ensure channel has some accumulated balance (log hours first)

**Steps**:
1. Log in as NGO
2. Find "Frontend Development" channel
3. Click "CANCEL CHANNEL"
4. Review confirmation modal (shows balance to be paid)
5. Click "CONFIRM CANCELLATION"
6. Sign PaymentChannelClaim transaction in Xaman

**✅ EXPECTED RESULTS**:
- Success alert: "CHANNEL CLOSED SUCCESSFULLY"
- Channel removed from "Active Payment Channels"
- Channel appears in "Closed Channels" (if implemented)
- Database shows status='closed', accumulated_balance=0.00
- Worker receives accumulated balance
- Unused escrow returns to NGO wallet

**🔍 XRPL VERIFICATION**:
```bash
# Query Xahau ledger to verify channel no longer exists
# Channel should be removed from ledger
```

**🔍 DATABASE VERIFICATION**:
```sql
SELECT channel_id, status, accumulated_balance, closure_tx_hash, closed_at
FROM payment_channels
WHERE job_name = 'Frontend Development';

-- Should show:
-- status: 'closed'
-- accumulated_balance: 0.00000000 (cleared!)
-- closure_tx_hash: (64-char hex)
-- closed_at: (recent timestamp)
```

---

### TEST 3.4: Close Channel (Worker-Initiated)
**Objective**: Worker can also close their own channels

**Setup**: Create new channel first

**Steps**:
1. NGO creates channel: "Backend Development", 0.30 XAH escrow
2. Worker logs 1 hour (accumulates 0.20 XAH balance)
3. Log in as Alice Worker
4. Click "CLOSE CHANNEL" button on "Backend Development" card
5. Confirm closure
6. Sign transaction in Xaman

**✅ EXPECTED RESULTS**:
- Success alert: "CHANNEL CLOSED SUCCESSFULLY"
- Channel removed from worker's dashboard
- Worker receives 0.20 XAH (accumulated balance)
- NGO receives 0.10 XAH back (0.30 - 0.20 = unused escrow)

---

## CATEGORY 4: WORK SESSION TRACKING (15 MIN)

### TEST 4.1: Clock In and Start Session
**Objective**: Worker can start work session, timer begins

**Steps**:
1. Log in as Alice Worker
2. Find active payment channel
3. Click "CLOCK IN" button
4. Confirm clock-in

**✅ EXPECTED RESULTS**:
- Success alert: "CLOCKED IN SUCCESSFULLY"
- Timer starts: 00:00:01, 00:00:02... (real-time counter)
- Button changes to "CLOCK OUT" (enabled)
- Session status: ● IN SESSION

**🔍 DATABASE VERIFICATION**:
```sql
SELECT id, employee_id, clock_in, clock_out, session_status
FROM work_sessions
WHERE session_status = 'active'
ORDER BY clock_in DESC
LIMIT 1;

-- Should show:
-- clock_in: (recent timestamp)
-- clock_out: NULL
-- session_status: 'active'
```

---

### TEST 4.2: Clock Out and Calculate Hours
**Objective**: Worker ends session, hours calculated, balance updated

**Steps**:
1. Wait 30+ seconds (or longer for more realistic hours)
2. Click "CLOCK OUT" button
3. Confirm clock-out

**✅ EXPECTED RESULTS**:
- Success alert: "CLOCKED OUT SUCCESSFULLY. HOURS LOGGED: 0.01" (or more)
- Timer stops
- Hours worked: 0.01 hours (30 seconds = 0.008 hours, rounds to 0.01)
- Accumulated balance updates: 0.00 XAH (0.01 hrs × 0.20 rate = 0.002 XAH, rounds)
- Button returns to "CLOCK IN" (enabled)

**🔍 DATABASE VERIFICATION**:
```sql
SELECT id, clock_in, clock_out, hours_worked, total_amount, session_status
FROM work_sessions
WHERE session_status = 'completed'
ORDER BY clock_out DESC
LIMIT 1;

-- Should show:
-- clock_out: (recent timestamp)
-- hours_worked: 0.01 (or actual hours)
-- total_amount: (hours × rate)
-- session_status: 'completed'
```

---

### TEST 4.3: Multiple Sessions Accumulate Balance
**Objective**: Multiple work sessions add up to total accumulated balance

**Steps**:
1. Worker clocks in → waits 1 minute → clocks out (Session 1)
2. Worker clocks in → waits 2 minutes → clocks out (Session 2)
3. Check accumulated balance on channel card

**✅ EXPECTED RESULTS**:
- Session 1: 0.02 hours logged
- Session 2: 0.03 hours logged
- Total hours: 0.05 hours (cumulative)
- Accumulated balance: 0.01 XAH (0.05 × 0.20 = 0.01)
- Channel card shows updated balance in real-time

**🔍 DATABASE VERIFICATION**:
```sql
SELECT SUM(hours_worked) AS total_hours, SUM(total_amount) AS total_balance
FROM work_sessions
WHERE employee_id = (SELECT id FROM employees WHERE employee_wallet_address = 'rWorker1...')
AND session_status = 'completed';

-- Should match displayed accumulated balance
```

---

### TEST 4.4: Cannot Clock In While Session Active
**Objective**: Prevent double clock-in

**Steps**:
1. Clock in (start session)
2. Try to clock in again (button should be disabled)

**✅ EXPECTED RESULTS**:
- "CLOCK IN" button disabled/hidden
- Only "CLOCK OUT" button visible
- Cannot start two sessions simultaneously

---

## CATEGORY 5: MULTI-WORKER SCENARIOS (15 MIN)

### TEST 5.1: Multiple Workers, Multiple Channels
**Objective**: NGO manages multiple workers with separate payment channels

**Setup**:
- NGO: "Test NGO Foundation"
- Workers: Alice (rWorker1...), Bob (rWorker2...)

**Steps**:
1. Add both workers to NGO (if not already added)
2. Create payment channel for Alice: "Frontend Work", 0.50 XAH escrow
3. Create payment channel for Bob: "Backend Work", 0.75 XAH escrow
4. Alice logs 1 hour of work
5. Bob logs 2 hours of work
6. Check NGO dashboard

**✅ EXPECTED RESULTS**:
- NGO dashboard shows 2 active channels
- Alice channel: 0.20 XAH balance (1 hour × 0.20)
- Bob channel: 0.30 XAH balance (2 hours × 0.15)
- Each channel tracks independently
- Total escrow: 1.25 XAH (0.50 + 0.75)

---

### TEST 5.2: Worker Works for Multiple NGOs
**Objective**: Same worker wallet can have channels with different NGOs

**Setup**:
- Alice Worker (rWorker1...)
- NGO 1: "Test NGO Foundation"
- NGO 2: "Second Foundation" (different wallet)

**Steps**:
1. NGO 1 creates channel for Alice: "Project A", 0.20/hr
2. NGO 2 creates channel for Alice: "Project B", 0.25/hr
3. Log in as Alice Worker
4. Check Worker Dashboard

**✅ EXPECTED RESULTS**:
- Alice sees 2 active payment channels
- Channel 1: Employer = "Test NGO Foundation", Rate = 0.20/hr
- Channel 2: Employer = "Second Foundation", Rate = 0.25/hr
- Alice can clock in/out for each channel independently
- Different rates apply to different employers

---

### TEST 5.3: Close One Channel, Others Remain Active
**Objective**: Closing one channel doesn't affect other active channels

**Steps**:
1. NGO closes Alice's "Frontend Work" channel
2. Check that Bob's "Backend Work" channel still active
3. Bob can still clock in/out normally

**✅ EXPECTED RESULTS**:
- Alice's channel closed successfully
- Bob's channel remains ● ACTIVE
- Bob can continue logging hours
- No interference between channels

---

## CATEGORY 6: SECURITY & RESTRICTIONS (15 MIN)

### TEST 6.1: Wallet Address Uniqueness (Employee XOR Employer)
**Objective**: Verify wallet can only be employee OR employer, not both

**Steps**:
1. Create NGO profile with wallet rNGO1... (type: employer)
2. Disconnect wallet
3. Try to create worker profile with SAME wallet rNGO1... (type: employee)
4. Fill profile form, click "COMPLETE PROFILE"

**✅ EXPECTED RESULTS**:
- ❌ Error alert: "WALLET ALREADY REGISTERED AS NGO/EMPLOYER"
- Profile creation blocked
- Cannot switch roles with same wallet
- Must use different wallet for employee role

**🔍 DATABASE VERIFICATION**:
```sql
SELECT wallet_address, user_type
FROM users
WHERE wallet_address = 'rNGO1...';

-- Should show only 1 row with user_type = 'employer' or 'ngo'
-- No duplicate with user_type = 'employee'
```

---

### TEST 6.2: Cannot Add NGO Wallet as Worker
**Objective**: Prevent NGO from adding their own wallet as worker

**Steps**:
1. Log in as NGO (rNGO1...)
2. Click "ADD WORKER"
3. Enter NGO's own wallet address (rNGO1...) as worker
4. Fill form, click "ADD WORKER"

**✅ EXPECTED RESULTS**:
- ❌ Error alert: "CANNOT ADD NGO/EMPLOYER WALLET AS WORKER"
- Worker not added
- Prevents self-payment exploit

---

### TEST 6.3: Worker Cannot Delete Profile with Active Channels
**Objective**: Protect against data loss while channels active

**Steps**:
1. Log in as Alice Worker (has active payment channel)
2. Navigate to profile settings (if implemented)
3. Try to delete profile

**✅ EXPECTED RESULTS**:
- ❌ Error alert: "CANNOT DELETE PROFILE WITH ACTIVE PAYMENT CHANNELS"
- Profile deletion blocked
- Must close all channels first before deletion

---

### TEST 6.4: Worker Cannot Delete Profile with Unpaid Balance
**Objective**: Prevent deleting profile before receiving payment

**Setup**: Close channel but worker hasn't received payment yet (if scenario exists)

**Steps**:
1. Worker has accumulated balance but channel closing in progress
2. Try to delete profile

**✅ EXPECTED RESULTS**:
- ❌ Error alert: "CANNOT DELETE PROFILE WITH UNPAID BALANCES"
- Profile deletion blocked
- Must receive all payments first

---

## CATEGORY 7: ERROR HANDLING & EDGE CASES (15 MIN)

### TEST 7.1: Worker Wallet Not Activated on Ledger
**Objective**: Handle worker wallet that doesn't exist on ledger yet

**Setup**: Use fresh worker wallet never funded with XAH

**Steps**:
1. NGO creates payment channel with unfunded worker wallet
2. Try to submit PaymentChannelCreate transaction

**✅ EXPECTED RESULTS**:
- ❌ Error alert: "WORKER WALLET NOT ACTIVATED ON LEDGER. SEND 10-20 XAH TO ACTIVATE."
- Transaction blocked before submission
- Clear instructions to activate worker wallet

**Fix**:
1. Send 20 XAH to worker wallet
2. Wait 5 seconds for ledger confirmation
3. Retry payment channel creation → Should succeed

---

### TEST 7.2: Insufficient Escrow Balance
**Objective**: Handle NGO wallet with insufficient XAH for escrow

**Steps**:
1. NGO wallet has only 5 XAH
2. Try to create channel with 10 XAH escrow
3. Sign transaction in Xaman

**✅ EXPECTED RESULTS**:
- ❌ Xaman app shows: "INSUFFICIENT BALANCE"
- Transaction rejected by ledger
- Error propagated to frontend
- User-friendly error message displayed

---

### TEST 7.3: Xaman Payload Timeout
**Objective**: Handle user not signing transaction within timeout

**Steps**:
1. Create payment channel
2. QR code displayed
3. **DO NOT sign in Xaman** (wait 5+ minutes)

**✅ EXPECTED RESULTS**:
- After ~5 minutes: Error alert "TIMEOUT: USER DID NOT SIGN TRANSACTION"
- Polling loop stops
- Transaction cancelled
- Channel not created (no partial state)

---

### TEST 7.4: Network Timeout During Transaction
**Objective**: Handle network failures gracefully

**Steps**:
1. Start creating payment channel
2. Disconnect internet briefly during transaction submission
3. Reconnect internet

**✅ EXPECTED RESULTS**:
- Error alert: "NETWORK ERROR" or "TRANSACTION FAILED"
- No partial channel creation
- Database remains consistent
- User can retry transaction

---

### TEST 7.5: Zero Balance Channel Closure
**Objective**: Close channel with no hours logged (zero accumulated balance)

**Steps**:
1. Create payment channel with 1.00 XAH escrow
2. Worker never logs any hours (balance = 0.00)
3. NGO closes channel immediately

**✅ EXPECTED RESULTS**:
- Channel closes successfully
- Worker receives 0.00 XAH (no balance)
- Full escrow returned to NGO: 1.00 XAH
- No errors about zero balance

---

## CATEGORY 8: DATA MANAGEMENT & DELETION (10 MIN)

### TEST 8.1: Worker Profile Deletion (No Active Channels)
**Objective**: Worker can delete profile after closing all channels

**Setup**: Worker has no active channels (all closed)

**Steps**:
1. Log in as worker
2. Navigate to profile settings / danger zone
3. Click "DELETE MY PROFILE"
4. Enter confirmation text: "DELETE MY ACCOUNT"
5. Provide deletion reason: "Testing deletion flow"
6. Click "CONFIRM DELETION"

**✅ EXPECTED RESULTS**:
- Success alert: "PROFILE DELETION SCHEDULED. DATA WILL BE REMOVED IN 48 HOURS."
- Worker profile soft-deleted (deleted_at timestamp set)
- 48-hour grace period before hard deletion
- Worker can cancel deletion within 48 hours

**🔍 DATABASE VERIFICATION**:
```sql
SELECT wallet_address, deleted_at, deletion_reason
FROM users
WHERE wallet_address = 'rWorker...';

-- Should show:
-- deleted_at: (recent timestamp)
-- deletion_reason: "Testing deletion flow"
```

---

### TEST 8.2: Cancel Profile Deletion
**Objective**: Worker can cancel scheduled deletion within grace period

**Steps**:
1. After scheduling deletion (Test 8.1)
2. Click "CANCEL DELETION" button
3. Confirm cancellation

**✅ EXPECTED RESULTS**:
- Success alert: "DELETION CANCELLED. YOUR ACCOUNT HAS BEEN RESTORED."
- deleted_at field cleared
- Profile fully restored
- Worker can continue using app normally

---

### TEST 8.3: Export Worker Data (GDPR Compliance)
**Objective**: Worker can export all personal data before deletion

**Steps**:
1. Log in as worker
2. Navigate to profile settings
3. Click "EXPORT MY DATA (PDF)"
4. Download PDF export

**✅ EXPECTED RESULTS**:
- PDF file downloads: worker_data_export_{wallet_address}.pdf
- PDF contains:
  - Personal info (name, wallet, email)
  - All work sessions (dates, hours, earnings)
  - All payment channels (employers, jobs, balances)
  - Payment history
- Data export timestamp included

---

## 🎉 COMPREHENSIVE TEST COMPLETE!

### ✅ VALIDATION SUMMARY

If all 30+ tests passed, you've thoroughly verified:

**Authentication & Profiles**:
- ✅ NGO and worker profile creation
- ✅ Wallet-based authentication (no passwords)
- ✅ Returning user login
- ✅ Network display

**Worker Management**:
- ✅ Add workers manually and via QR scan
- ✅ Multi-organization support for workers
- ✅ Duplicate prevention

**Payment Channels**:
- ✅ XRPL PaymentChannelCreate transactions
- ✅ Channel visibility in both dashboards
- ✅ NGO and worker-initiated closure
- ✅ Payment and escrow return

**Work Sessions**:
- ✅ Clock in/out functionality
- ✅ Hour calculation and balance accumulation
- ✅ Multiple session tracking
- ✅ Session state management

**Multi-User Scenarios**:
- ✅ Multiple workers per NGO
- ✅ Multiple channels per worker
- ✅ Independent channel tracking

**Security**:
- ✅ Wallet address restrictions (employee XOR employer)
- ✅ Self-payment prevention
- ✅ Active channel deletion protection
- ✅ Unpaid balance protection

**Error Handling**:
- ✅ Wallet activation checks
- ✅ Insufficient balance handling
- ✅ Timeout management
- ✅ Network failure recovery
- ✅ Edge case handling

**Data Management**:
- ✅ Profile deletion with grace period
- ✅ Deletion cancellation
- ✅ GDPR-compliant data export

---

## 📊 TEST COVERAGE MATRIX

| Category | Tests | Passed | Failed | Notes |
|----------|-------|--------|--------|-------|
| Authentication | 4 | ___ | ___ | |
| Worker Management | 4 | ___ | ___ | |
| Payment Channels | 4 | ___ | ___ | |
| Work Sessions | 4 | ___ | ___ | |
| Multi-Worker | 3 | ___ | ___ | |
| Security | 4 | ___ | ___ | |
| Error Handling | 5 | ___ | ___ | |
| Data Management | 3 | ___ | ___ | |
| **TOTAL** | **31** | ___ | ___ | |

---

## 🐛 ISSUE TRACKING TEMPLATE

If tests fail, document issues using this template:

```markdown
### Issue #1: [Brief Description]
**Test**: TEST X.Y - [Test Name]
**Severity**: Critical / High / Medium / Low
**Expected**: [What should happen]
**Actual**: [What actually happened]
**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3

**Error Message** (if any):
```
[Paste error message or screenshot]
```

**Database State**:
```sql
[Relevant SQL query results]
```

**XRPL Transaction**:
[Transaction hash or explorer link if applicable]

**Workaround**: [Temporary fix, if any]
**Root Cause**: [Analysis if known]
```

---

**LAST UPDATED**: 2026-01-02
**VERSION**: 1.0.0
**NETWORK**: Xahau Testnet
