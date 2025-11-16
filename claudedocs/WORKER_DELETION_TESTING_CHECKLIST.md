# Worker Deletion Feature - Manual Testing Checklist

**Version**: 1.0
**Date**: 2025-11-15
**Tester**: _______________________
**Environment**: □ Testnet □ Mainnet

---

## Pre-Testing Setup

### Database Preparation
- [ ] Test database accessible and clean
- [ ] Migration `003_worker_deletion.sql` applied successfully
- [ ] All tables verified: `users`, `deletion_logs`, `ngo_notifications`
- [ ] Test data created: at least 2 workers, 2 organizations
- [ ] Backup created before testing begins

### Backend Verification
- [ ] Backend server running on port 3001
- [ ] `/health` endpoint returns 200 OK
- [ ] Scheduled jobs configured (hard delete, inactivity)
- [ ] JWT authentication working
- [ ] Environment variables set correctly (XRPL_NETWORK, DATABASE_URL)

### Frontend Verification
- [ ] Frontend running on port 3000
- [ ] Can log in as worker (employee)
- [ ] Can log in as NGO/employer
- [ ] Wallet connections working (Xaman/Crossmark/GemWallet)

---

## Test Scenario 1: Worker Eligibility Check

### Setup
- Worker: Test Worker A
- Organizations: None assigned
- Payment Channels: None active
- Unpaid Balance: $0.00

### Steps
1. [ ] Log in as Test Worker A
2. [ ] Navigate to Employee Settings page
3. [ ] Click "DELETE MY PROFILE" button in Danger Zone
4. [ ] Modal opens with eligibility check loading spinner

### Expected Results
- [ ] Modal displays "✅ ELIGIBLE FOR DELETION"
- [ ] Shows list of affected organizations (if any)
- [ ] Shows 48-hour deletion timeline
- [ ] "EXPORT MY DATA (PDF)" button visible
- [ ] "CONTINUE" button enabled

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 2: Deletion Blocked - Active Channel

### Setup
- Worker: Test Worker B
- Organizations: Red Cross NGO (active channel)
- Payment Channels: 1 active with $50.25 unpaid balance
- Unpaid Balance: $50.25

### Steps
1. [ ] Log in as Test Worker B
2. [ ] Navigate to Employee Settings
3. [ ] Click "DELETE MY PROFILE"
4. [ ] Eligibility check runs

### Expected Results
- [ ] Modal displays "❌ CANNOT DELETE PROFILE"
- [ ] Shows blocking reasons section
- [ ] Lists RED CROSS NGO with channel details
- [ ] Shows "Status: ACTIVE"
- [ ] Shows "Unpaid Balance: $50.25"
- [ ] Shows statistics (total organizations, active channels, unpaid balance)
- [ ] "VIEW CHANNEL" and "CLOSE CHANNEL" buttons visible (optional)
- [ ] Cannot proceed to deletion

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 3: Deletion Blocked - Unpaid Balance

### Setup
- Worker: Test Worker C
- Organizations: UNICEF (closed channel with unpaid balance)
- Payment Channels: 1 closed but $25.50 unpaid
- Unpaid Balance: $25.50

### Steps
1. [ ] Log in as Test Worker C
2. [ ] Attempt deletion via Employee Settings
3. [ ] Check eligibility

### Expected Results
- [ ] Deletion blocked
- [ ] Shows unpaid balance blocking reason
- [ ] Message: "YOU HAVE UNPAID BALANCES THAT MUST BE CLAIMED"
- [ ] Total unpaid balance displayed: $25.50

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 4: Successful Deletion - Single Organization

### Setup
- Worker: Test Worker D
- Organizations: Doctors Without Borders
- Payment Channels: All closed, no unpaid balance
- Unpaid Balance: $0.00

### Steps
1. [ ] Log in as Test Worker D
2. [ ] Navigate to Employee Settings
3. [ ] Click "DELETE MY PROFILE"
4. [ ] Verify eligibility (should be eligible)
5. [ ] Click "CONTINUE"
6. [ ] Type "DELETE MY ACCOUNT" in confirmation field
7. [ ] Enter deletion reason: "NO LONGER WORKING WITH ORGANIZATIONS"
8. [ ] Click "DELETE MY PROFILE" button

### Expected Results
- [ ] Success modal displays
- [ ] Message: "PROFILE DELETION SCHEDULED"
- [ ] Shows scheduled timestamp
- [ ] Shows hard delete timestamp (48 hours later)
- [ ] Shows "1 organizations notified"
- [ ] "DOWNLOAD MY DATA (PDF)" button available
- [ ] 10-second countdown to auto-logout displayed
- [ ] Worker automatically logged out after countdown

### Database Verification
- [ ] `users.deleted_at` is NOT NULL
- [ ] `users.deletion_reason` = "NO LONGER WORKING WITH ORGANIZATIONS"
- [ ] `deletion_logs` entry created
- [ ] `ngo_notifications` entry created for Doctors Without Borders

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 5: Successful Deletion - Multi-Organization

### Setup
- Worker: Test Worker E
- Organizations: Red Cross NGO, UNICEF, Doctors Without Borders (3 total)
- Payment Channels: All closed, no unpaid balance
- Unpaid Balance: $0.00

### Steps
1. [ ] Log in as Test Worker E
2. [ ] Complete deletion flow (same as Scenario 4)
3. [ ] Enter reason: "MULTI-ORG TEST"

### Expected Results
- [ ] All 3 organizations listed in confirmation modal
- [ ] Success message shows "3 organizations notified"
- [ ] Auto-logout after 10 seconds

### Database Verification
- [ ] 3 entries in `ngo_notifications` table
- [ ] All 3 organizations have `notification_type = 'worker_deleted'`
- [ ] All notifications show `is_read = false`
- [ ] Each notification has correct `worker_wallet_address`

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 6: PDF Export

### Setup
- Worker: Test Worker F
- Data: 45 work sessions, 3 organizations, $1,250.50 historical earnings

### Steps
1. [ ] Log in as Test Worker F
2. [ ] Navigate to Employee Settings
3. [ ] Click "DELETE MY PROFILE" → "ELIGIBLE"
4. [ ] Click "EXPORT MY DATA (PDF)"

### Expected Results
- [ ] PDF file downloads automatically
- [ ] Filename format: `worker_<WALLET>_<TIMESTAMP>.pdf`
- [ ] File size: Reasonable (< 500KB for test data)
- [ ] PDF opens successfully in viewer

### PDF Content Verification
- [ ] Header: "XAH PAYROLL - WORKER DATA EXPORT"
- [ ] Section: PROFILE INFORMATION (wallet, name, email, phone)
- [ ] Section: ORGANIZATION ASSOCIATIONS (3 organizations listed)
- [ ] Section: PAYMENT CHANNELS (active/closed counts)
- [ ] Section: WORK SESSIONS (last 50 sessions)
- [ ] Section: PAYMENT HISTORY (last 50 payments)
- [ ] Section: STATISTICS SUMMARY (totals, aggregates)
- [ ] ALL CAPS formatting applied throughout
- [ ] Footer: Company logo (if configured)

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 7: Deletion Cancellation

### Setup
- Worker: Test Worker G (already soft-deleted)
- Time Since Deletion: 24 hours (within 48-hour window)

### Steps
1. [ ] Verify worker is soft-deleted in database
2. [ ] Make API call to `/api/workers/cancel-deletion`
3. [ ] Body: `{ "walletAddress": "rGHI..." }`

### Expected Results (API)
- [ ] Status code: 200 OK
- [ ] Response: `{ "success": true, "message": "DELETION CANCELLED..." }`
- [ ] `restoredAt` timestamp present

### Database Verification
- [ ] `users.deleted_at` = NULL
- [ ] `users.deletion_reason` = NULL (or unchanged)
- [ ] Worker can log in again

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 8: NGO Notifications - View

### Setup
- NGO: Red Cross NGO
- Worker: Test Worker H (just deleted profile)
- Expected Notifications: 1 worker_deleted notification

### Steps
1. [ ] Log in as Red Cross NGO admin
2. [ ] Navigate to NGO Dashboard
3. [ ] Click "NOTIFICATIONS" tab

### Expected Results
- [ ] Tab shows unread count badge (red with count)
- [ ] Notifications list displays
- [ ] Latest notification visible at top
- [ ] Notification card shows:
  - [ ] Icon: 🗑️
  - [ ] Title: "WORKER DELETED"
  - [ ] Badge: "Unread" (red dot)
  - [ ] Worker name: TEST WORKER H
  - [ ] Wallet address: rABC... (truncated)
  - [ ] Deletion date: Nov 15, 2025 2:35 PM
  - [ ] Reason: Visible if provided
  - [ ] Timestamp: Relative (e.g., "5 minutes ago")

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 9: NGO Notifications - Mark as Read

### Setup
- NGO: UNICEF
- Unread Notifications: 2 worker_deleted notifications

### Steps
1. [ ] Log in as UNICEF admin
2. [ ] Navigate to Notifications tab
3. [ ] Click on first unread notification card

### Expected Results
- [ ] Notification card expands (optional) or shows details
- [ ] Notification marked as read automatically
- [ ] "Unread" badge disappears
- [ ] Unread count badge decrements by 1
- [ ] Notification card styling changes (lighter background)

### Database Verification
- [ ] `ngo_notifications.is_read` = true for clicked notification

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 10: NGO Notifications - Mark All as Read

### Setup
- NGO: Doctors Without Borders
- Unread Notifications: 5 various notifications

### Steps
1. [ ] Log in as Doctors Without Borders admin
2. [ ] Navigate to Notifications tab
3. [ ] Click "MARK ALL AS READ" button

### Expected Results
- [ ] All notification cards update to "Read" state
- [ ] Unread count badge disappears (shows 0 or hidden)
- [ ] Success message: "ALL NOTIFICATIONS MARKED AS READ" (optional)

### Database Verification
- [ ] All notifications for organization have `is_read = true`

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 11: NGO Notifications - Deletion Error

### Setup
- Worker: Test Worker I (attempts deletion with active channel)
- NGO: Red Cross NGO (has active channel with worker)

### Steps
1. [ ] Worker I attempts deletion
2. [ ] Deletion blocked due to active channel
3. [ ] Log in as Red Cross NGO admin
4. [ ] Check notifications

### Expected Results
- [ ] Notification type: "deletion_error" OR no notification (system doesn't notify on failed attempts)
- [ ] If notification exists:
  - [ ] Icon: ❌
  - [ ] Message: "DELETION FAILED: ACTIVE CHANNEL DETECTED"
  - [ ] Metadata includes error details

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 12: Channel Closure - Worker-Initiated

### Setup
- Worker: Test Worker J
- NGO: UNICEF
- Payment Channel: Active with $0.00 unpaid balance

### Steps
1. [ ] Log in as Test Worker J
2. [ ] Navigate to Worker Dashboard
3. [ ] Find "MY PAYMENT CHANNELS" section
4. [ ] Click "CLOSE CHANNEL" button on UNICEF channel
5. [ ] Confirm closure

### Expected Results
- [ ] Channel closure transaction submitted to XRPL
- [ ] Worker's connected wallet (Xaman/Crossmark/GemWallet) prompts for signature
- [ ] After signature, channel marked as 'closed' in database
- [ ] Escrow returned to NGO
- [ ] Worker receives accumulated balance (if any)

### Database Verification
- [ ] `payment_channels.status` = 'closed'
- [ ] `payment_channels.closure_tx_hash` = XRPL transaction hash
- [ ] `payment_channels.closed_at` timestamp set

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 13: Channel Closure - Unclaimed Balance Warning (Worker)

### Setup
- Worker: Test Worker K
- NGO: Red Cross NGO
- Payment Channel: Active with $100.50 unpaid balance

### Steps
1. [ ] Log in as Test Worker K
2. [ ] Navigate to Payment Channels
3. [ ] Click "CLOSE CHANNEL"

### Expected Results
- [ ] Warning modal displays:
  - [ ] Title: "⚠️ UNCLAIMED BALANCE WARNING"
  - [ ] Message: "YOU HAVE $100.50 IN UNCLAIMED WAGES. YOU WILL FORFEIT THIS AMOUNT IF YOU CLOSE THE CHANNEL."
  - [ ] Recommended action: "GO BACK (RECOMMENDED)"
  - [ ] Force close option: "FORCE CLOSE ANYWAY" (red button)
- [ ] If "GO BACK" clicked: Modal closes, no action taken
- [ ] If "FORCE CLOSE ANYWAY" clicked: Channel closes, worker forfeits balance

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 14: Channel Closure - Unclaimed Balance Warning (NGO)

### Setup
- NGO: UNICEF
- Worker: Test Worker L
- Payment Channel: Active with $75.25 unpaid balance

### Steps
1. [ ] Log in as UNICEF admin
2. [ ] Navigate to NGO Dashboard → Active Channels
3. [ ] Click "CANCEL CHANNEL" on worker L's channel

### Expected Results
- [ ] Warning modal displays:
  - [ ] Title: "⚠️ UNCLAIMED BALANCE WARNING"
  - [ ] Message: "WORKER HAS $75.25 IN UNCLAIMED WAGES. ENSURE PAYMENT BEFORE CLOSING."
  - [ ] Recommended action: "GO BACK (RECOMMENDED)"
  - [ ] Force close option: "FORCE CLOSE ANYWAY" (red button)
- [ ] If "FORCE CLOSE ANYWAY" clicked: Channel closes, worker receives accumulated balance

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 15: Orphaned Records Re-Association

### Setup
- Worker: Previously deleted (Test Worker M)
- Orphaned Records: 45 work sessions, 3 organizations, $1,250.50 earnings
- Same Wallet: rABC123... (previously used)

### Steps
1. [ ] Navigate to signup page
2. [ ] Sign up with same wallet address as Test Worker M
3. [ ] Complete signup flow

### Expected Results
- [ ] Orphaned Records Modal displays:
  - [ ] Title: "🔍 RECORDS FOUND"
  - [ ] Shows statistics:
    - [ ] 45 work sessions
    - [ ] 3 previous organizations
    - [ ] $1,250.50 in historical earnings
    - [ ] Last activity date
  - [ ] Message: "Would you like to re-associate these records with your new account?"
  - [ ] Buttons: "Skip" and "Re-Associate Records"
- [ ] If "Re-Associate Records" clicked:
  - [ ] Records linked to new user account
  - [ ] Success message displayed
  - [ ] Dashboard shows complete work history

### Database Verification
- [ ] `employees.user_id` updated to new user ID for all orphaned records
- [ ] Work history accessible in worker dashboard

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 16: Automatic Inactivity Deletion

### Setup
- Worker: Test Worker N
- Last Login: 15 days ago
- Payment Channels: None active
- Unpaid Balance: $0.00

### Steps
1. [ ] Set worker's `last_login_at` to 15 days ago in database
2. [ ] Run inactivity deletion job manually: `node jobs/inactivityDeletion.js` OR wait for scheduled run
3. [ ] Check database after job execution

### Expected Results
- [ ] Worker soft-deleted (deleted_at timestamp set)
- [ ] Deletion reason: "Automatic deletion due to 2 weeks of inactivity"
- [ ] Deletion log entry created with `deleted_by = 'system'`
- [ ] All associated organizations notified
- [ ] Notification type: "worker_deleted"
- [ ] Notification metadata includes inactivity details

### Database Verification
- [ ] `users.deleted_at` IS NOT NULL
- [ ] `deletion_logs.deleted_by` = 'system'
- [ ] `ngo_notifications` entries created for all organizations

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 17: Hard Delete Job - 48-Hour Grace Period

### Setup
- Worker: Test Worker O (soft-deleted 50 hours ago)
- Deletion: Soft delete timestamp: 50 hours in the past

### Steps
1. [ ] Set worker's `deleted_at` to 50 hours ago in database
2. [ ] Run hard delete job manually: `node jobs/hardDelete.js` OR wait for hourly run
3. [ ] Check database after job execution

### Expected Results
- [ ] Worker permanently deleted from `users` table
- [ ] Employee records deleted from `employees` table (CASCADE)
- [ ] Work sessions deleted (CASCADE through employees)
- [ ] Payments deleted (CASCADE through employees)
- [ ] Deletion log updated: `hard_deleted_at` timestamp set
- [ ] Wallet address now available for reuse

### Database Verification
- [ ] `SELECT * FROM users WHERE wallet_address = 'rABC...'` returns 0 rows
- [ ] `SELECT * FROM employees WHERE employee_wallet_address = 'rABC...'` returns 0 rows
- [ ] `deletion_logs.hard_deleted_at` IS NOT NULL

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 18: Hard Delete Job - Instant Deletion (No Active Channels)

### Setup
- Worker: Test Worker P (soft-deleted 1 hour ago)
- Deletion: Soft delete timestamp: 1 hour in the past
- Payment Channels: None active
- Unpaid Balance: $0.00

### Steps
1. [ ] Set worker's `deleted_at` to 1 hour ago in database
2. [ ] Ensure NO active channels or unpaid balances
3. [ ] Run hard delete job manually
4. [ ] Check database after job execution

### Expected Results
- [ ] Worker permanently deleted (instant deletion path)
- [ ] Hard delete executed within 1 hour of soft delete
- [ ] Deletion log shows `hard_deleted_at` timestamp

### Database Verification
- [ ] User deleted from database
- [ ] Deletion occurred before 48-hour grace period

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 19: Security - Unauthorized Deletion Attempt

### Setup
- Worker A: rABC123...
- Worker B: rXYZ789... (different wallet)

### Steps
1. [ ] Log in as Worker A
2. [ ] Intercept API request to `/api/workers/delete-profile`
3. [ ] Modify `walletAddress` in request body to Worker B's wallet
4. [ ] Submit request

### Expected Results
- [ ] Status code: 403 FORBIDDEN
- [ ] Error message: "UNAUTHORIZED"
- [ ] Worker B's account NOT deleted

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Test Scenario 20: Security - NGO Notification Access Control

### Setup
- NGO A: Organization ID 1
- NGO B: Organization ID 2

### Steps
1. [ ] Log in as NGO A admin
2. [ ] Attempt to access NGO B's notifications: `GET /api/organizations/2/notifications`

### Expected Results
- [ ] Status code: 403 FORBIDDEN
- [ ] Error message: "UNAUTHORIZED"
- [ ] No notifications returned

### Test Results
- **Status**: □ PASS □ FAIL
- **Notes**: _______________________________________

---

## Edge Cases & Error Scenarios

### Edge Case 1: Delete with 0 Balance, Active Channel (Status Issue)
- [ ] Worker has active channel with 0 accumulated balance
- [ ] Deletion should still be blocked (active status)
- **Result**: □ PASS □ FAIL

### Edge Case 2: Invalid Confirmation Text Variations
- [ ] Test: "delete my account" (lowercase)
- [ ] Test: "DELETE MY ACCONT" (typo)
- [ ] Test: "DELETE MY ACCOUNT " (trailing space)
- [ ] All should be rejected with INVALID_CONFIRMATION error
- **Result**: □ PASS □ FAIL

### Edge Case 3: Concurrent Deletion Requests
- [ ] Submit two deletion requests simultaneously
- [ ] Only one should succeed
- [ ] Second should fail gracefully
- **Result**: □ PASS □ FAIL

### Edge Case 4: Deletion During Active Work Session
- [ ] Worker clocked in (active work session)
- [ ] Attempt deletion
- [ ] Should be blocked or require session end
- **Result**: □ PASS □ FAIL

### Edge Case 5: PDF Export for Worker with No Data
- [ ] New worker with no work sessions, payments, or channels
- [ ] PDF should generate successfully with empty sections
- **Result**: □ PASS □ FAIL

---

## Performance Testing

### Performance Test 1: Large PDF Export
- [ ] Worker with 500+ work sessions, 100+ payments
- [ ] PDF generation time: _________ seconds
- [ ] PDF file size: _________ KB/MB
- [ ] Acceptable: < 10 seconds, < 5MB
- **Result**: □ PASS □ FAIL

### Performance Test 2: Hard Delete Job with 100 Users
- [ ] Create 100 soft-deleted users (>48 hours old)
- [ ] Run hard delete job
- [ ] Execution time: _________ seconds
- [ ] Acceptable: < 60 seconds
- **Result**: □ PASS □ FAIL

### Performance Test 3: Notification Fetch for NGO with 1000+ Notifications
- [ ] Create 1000+ notifications for an organization
- [ ] Fetch notifications with pagination (limit=20)
- [ ] Response time: _________ ms
- [ ] Acceptable: < 500ms
- **Result**: □ PASS □ FAIL

---

## Cross-Browser Testing

### Browser: Chrome
- [ ] All UI tests pass
- [ ] PDF download works
- [ ] Wallet connections work (Xaman, Crossmark, GemWallet)

### Browser: Firefox
- [ ] All UI tests pass
- [ ] PDF download works
- [ ] Wallet connections work

### Browser: Safari
- [ ] All UI tests pass
- [ ] PDF download works
- [ ] Wallet connections work

### Browser: Edge
- [ ] All UI tests pass
- [ ] PDF download works
- [ ] Wallet connections work

---

## Wallet Provider Testing

### Xaman Wallet
- [ ] Worker deletion flow completes
- [ ] Channel closure works
- [ ] Transaction signing successful

### Crossmark Wallet
- [ ] Worker deletion flow completes
- [ ] Channel closure works
- [ ] Transaction signing successful

### GemWallet
- [ ] Worker deletion flow completes
- [ ] Channel closure works
- [ ] Transaction signing successful

---

## Final Checklist

### Documentation
- [ ] All API endpoints documented
- [ ] User guides updated
- [ ] Admin guides updated
- [ ] Troubleshooting guide created

### Deployment Readiness
- [ ] Database migration tested on staging
- [ ] Scheduled jobs configured on production
- [ ] Environment variables set
- [ ] Backup strategy in place
- [ ] Rollback plan documented

### Monitoring
- [ ] Deletion logs accessible
- [ ] Error tracking configured
- [ ] Scheduled job monitoring active
- [ ] Performance metrics tracked

---

## Testing Summary

**Total Scenarios**: 20 + Edge Cases + Performance Tests
**Scenarios Passed**: _______
**Scenarios Failed**: _______
**Pass Rate**: _______ %

**Critical Issues Found**: _______
**Blockers**: _______
**Recommendations**: _______

**Sign-off**: _______________________ (Tester) Date: _______
**Approval**: _______________________ (Project Lead) Date: _______

---

**END OF TESTING CHECKLIST**
