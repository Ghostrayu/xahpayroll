# Path D Implementation Checklist: Two-Field Balance System

**Project**: XAH Payroll - Ledger Sync Bug Fix
**Solution**: Separate off-chain and on-chain balance tracking
**Status**: Not Started
**Start Date**: _____
**Completion Date**: _____

---

## 📋 Overview

**Problem**: Ledger sync overwrites database `accumulated_balance` with on-chain Balance (always 0 for off-chain work tracking) → worker wages lost

**Solution**: Two-field system
- `off_chain_accumulated_balance` - Worker earnings from clock in/out (never synced from ledger)
- `on_chain_balance` - Current XRPL ledger Balance field (read-only from ledger)

**Expected Outcome**: Ledger sync cannot erase worker earnings, workers receive correct payment on channel closure

---

## 📊 Progress Summary

- **Phase 1 - Planning**: 0/4 ⬜⬜⬜⬜
- **Phase 2 - Database**: 0/7 ⬜⬜⬜⬜⬜⬜⬜
- **Phase 3 - Backend**: 0/17 ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜
- **Phase 4 - Frontend**: 0/7 ⬜⬜⬜⬜⬜⬜⬜
- **Phase 5 - Testing**: 0/9 ⬜⬜⬜⬜⬜⬜⬜⬜⬜
- **Phase 6 - Deployment**: 0/9 ⬜⬜⬜⬜⬜⬜⬜⬜⬜
- **Phase 7 - Monitoring**: 0/7 ⬜⬜⬜⬜⬜⬜⬜
- **Phase 8 - Rollback Plan**: 0/4 ⬜⬜⬜⬜
- **Phase 9 - Documentation**: 0/3 ⬜⬜⬜

**Overall Progress**: 0/67 tasks completed (0%)

---

## 📋 Phase 1: Planning & Preparation

### 1.1 Pre-Implementation Assessment

- [ ] **Backup Production Database**
  - [x] Export full database dump with timestamp
  - [x] Verify backup integrity (test restore on dev environment)
  - [x] Store backup in secure location with version tag
  - **File**: `backups/xahpayroll_pre_pathd_YYYY-MM-DD.sql`
  - **Acceptance**: Backup file exists and can be restored successfully
  - **Completed**: _____ | **By**: _____

- [ ] **Identify All Code Locations Using `accumulated_balance`**
  - [ ] Search backend for `accumulated_balance` references
  - [ ] Search frontend for `accumulated_balance` or `accumulatedBalance` references
  - [ ] Document each usage (read vs write operations)
  - **Command**: `grep -rn "accumulated_balance\|accumulatedBalance" backend/ frontend/src/`
  - **File**: `claudedocs/ACCUMULATED_BALANCE_USAGE.md`
  - **Acceptance**: Complete list of files requiring updates
  - **Completed**: _____ | **By**: _____

- [ ] **Set Up Test Environment**
  - [ ] Clone production database to test environment
  - [ ] Configure test XRPL connection (testnet)
  - [ ] Set up test NGO and worker accounts
  - **Acceptance**: Test environment mirrors production structure
  - **Completed**: _____ | **By**: _____

---

## 🗄️ Phase 2: Database Schema Migration

### 2.1 Create Migration Script

- [ ] **Write Migration SQL File**
  - **File**: `backend/database/migrations/006_two_field_balance_system.sql`
  - **Contents**:
    - [ ] Add `off_chain_accumulated_balance` column
    - [ ] Add `on_chain_balance` column
    - [ ] Migrate data from `accumulated_balance` to `off_chain_accumulated_balance`
    - [ ] Set `on_chain_balance` to 0 for all channels
    - [ ] Rename `accumulated_balance` to `legacy_accumulated_balance`
    - [ ] Add indexes for performance
    - [ ] Include rollback script in comments
  - **Acceptance**: Migration script passes SQL linting, includes rollback section
  - **Completed**: _____ | **By**: _____

- [ ] **Include Safety Mechanisms**
  - [ ] Add `BEGIN; ... COMMIT;` transaction wrapper
  - [ ] Include pre-migration validation queries
  - [ ] Add post-migration verification queries
  - [ ] Include explicit rollback script in comments
  - **Acceptance**: Script is idempotent and safe to re-run
  - **Completed**: _____ | **By**: _____

### 2.2 Test Migration on Dev

- [ ] **Execute Migration on Development Database**
  - [ ] Run migration script: `psql -U xahpayroll_user -d xahpayroll_dev -f backend/database/migrations/006_two_field_balance_system.sql`
  - [ ] Capture execution time and output logs
  - [ ] Verify all channels migrated correctly
  - **Acceptance**: `SELECT COUNT(*) FROM payment_channels WHERE off_chain_accumulated_balance IS NULL` returns 0
  - **Completed**: _____ | **By**: _____

- [ ] **Validate Migration Results**
  - **Query**:
    ```sql
    SELECT
      COUNT(*) as total_channels,
      SUM(CASE WHEN off_chain_accumulated_balance = legacy_accumulated_balance THEN 1 ELSE 0 END) as correctly_migrated,
      SUM(CASE WHEN on_chain_balance = 0 THEN 1 ELSE 0 END) as zero_on_chain
    FROM payment_channels;
    ```
  - **Acceptance**: `correctly_migrated` = `total_channels`, `zero_on_chain` = `total_channels`
  - **Completed**: _____ | **By**: _____

- [ ] **Performance Testing**
  - [ ] Run typical queries (dashboard, worker list, channel closure)
  - [ ] Measure query execution time (should be < 100ms)
  - [ ] Verify indexes are being used: `EXPLAIN ANALYZE SELECT ...`
  - **Acceptance**: No performance degradation vs baseline
  - **Completed**: _____ | **By**: _____

### 2.3 Execute Migration on Test Database

- [ ] **Run Migration on Test Database**
  - [ ] Backup test database first
  - [ ] Execute migration script
  - [ ] Run all validation queries from 2.2
  - **Acceptance**: Test database migration successful, data integrity verified
  - **Completed**: _____ | **By**: _____

---

## 💻 Phase 3: Backend Code Updates

### 3.1 Clock-Out Logic

- [ ] **Update `backend/routes/workSessions.js`**
  - **Location**: Lines 248-256 (UPDATE payment_channels query)
  - **Changes**:
    - [ ] Change `accumulated_balance = accumulated_balance + $1` to `off_chain_accumulated_balance = off_chain_accumulated_balance + $1`
    - [ ] Keep `hours_accumulated = hours_accumulated + $2` unchanged
    - [ ] Add logging: `console.log('[CLOCK_OUT_BALANCE_UPDATE]', { channelId, addedAmount, newOffChainBalance })`
  - **Acceptance**: Clock-out updates `off_chain_accumulated_balance`, not `accumulated_balance`
  - **Completed**: _____ | **By**: _____

- [ ] **Test Clock-Out Flow on Dev**
  - [ ] Create test work session
  - [ ] Clock in, wait 10 seconds, clock out
  - [ ] Query: `SELECT off_chain_accumulated_balance, on_chain_balance FROM payment_channels WHERE id = X`
  - [ ] Verify `off_chain_accumulated_balance` incremented correctly
  - [ ] Verify `on_chain_balance` unchanged (still 0)
  - **Acceptance**: Database shows correct balance in off_chain field
  - **Completed**: _____ | **By**: _____

### 3.2 Channel Closure Logic

- [ ] **Update `backend/routes/paymentChannels.js` - Balance Source**
  - **Location**: Line 834 (`const databaseBalance = parseFloat(channel.accumulated_balance) || 0`)
  - **Change**:
    ```javascript
    const databaseBalance = parseFloat(channel.off_chain_accumulated_balance) || 0
    ```
  - [ ] Add comment: `// Use off_chain_accumulated_balance (worker's earned wages from clock in/out)`
  - **Acceptance**: Closure endpoint reads from `off_chain_accumulated_balance`
  - **Completed**: _____ | **By**: _____

- [ ] **Update `backend/routes/paymentChannels.js` - Balance Calculation**
  - **Location**: Line 939 (`const balanceDrops = Math.floor(accumulatedBalance * 1000000).toString()`)
  - [ ] Verify `accumulatedBalance` variable comes from `databaseBalance` (now using `off_chain_accumulated_balance`)
  - [ ] Add logging:
    ```javascript
    console.log('[CLOSURE_BALANCE_CALCULATION]', {
      channelId,
      offChainBalance: databaseBalance,
      balanceDrops,
      source: 'off_chain_accumulated_balance'
    })
    ```
  - **Acceptance**: Balance field calculation uses `off_chain_accumulated_balance`
  - **Completed**: _____ | **By**: _____

- [ ] **Update Closure Confirmation Logic**
  - **Location**: Lines 1120-1132 (immediate closure UPDATE query)
  - **Changes**:
    ```sql
    UPDATE payment_channels
    SET
      status = 'closed',
      closure_tx_hash = $1,
      closed_at = NOW(),
      off_chain_accumulated_balance = 0,  -- Clear off-chain balance
      -- Do NOT touch on_chain_balance (will sync from ledger separately)
      last_ledger_sync = NOW(),
      updated_at = NOW()
    WHERE channel_id = $2
    ```
  - [ ] Apply same change to scheduled closure path (lines 1087-1100)
  - **Acceptance**: Confirmed closures clear off_chain balance, preserve on_chain balance
  - **Completed**: _____ | **By**: _____

### 3.3 Ledger Sync Logic

- [ ] **Locate Ledger Sync Function**
  - [ ] Search for: `grep -rn "getChannelBalanceFromLedger\|account_channels" backend/`
  - [ ] Identify where ledger Balance is queried and written to database
  - **File**: _______________
  - **Function**: _______________
  - **Acceptance**: Sync function identified and documented
  - **Completed**: _____ | **By**: _____

- [ ] **Update Sync to Use `on_chain_balance` Only**
  - **Before**:
    ```javascript
    UPDATE payment_channels
    SET accumulated_balance = $1,
        last_ledger_sync = NOW()
    WHERE channel_id = $2
    ```
  - **After**:
    ```javascript
    UPDATE payment_channels
    SET on_chain_balance = $1,  -- Ledger Balance field (read-only from XRPL)
        last_ledger_sync = NOW()
    WHERE channel_id = $2
    -- CRITICAL: Never touch off_chain_accumulated_balance (worker earnings)
    ```
  - [ ] Add comment explaining why `off_chain_accumulated_balance` is never modified
  - **Acceptance**: Sync updates `on_chain_balance`, never touches `off_chain_accumulated_balance`
  - **Completed**: _____ | **By**: _____

- [ ] **Add Discrepancy Logging**
  - [ ] Log when `on_chain_balance` ≠ `off_chain_accumulated_balance`
  - [ ] Include channel ID, both balances, timestamp, discrepancy amount
  - **Code**:
    ```javascript
    if (Math.abs(onChainBalance - offChainBalance) > 0.01) {
      console.warn('[BALANCE_DISCREPANCY]', {
        channelId,
        offChainBalance,
        onChainBalance,
        discrepancy: (onChainBalance - offChainBalance).toFixed(6),
        reason: 'Off-chain work tracking (expected for active channels)'
      })
    }
    ```
  - **Acceptance**: Discrepancies logged with actionable details
  - **Completed**: _____ | **By**: _____

### 3.4 Dashboard Queries

- [ ] **Update NGO Dashboard Balance Queries**
  - **File**: `backend/routes/paymentChannels.js` or `backend/routes/organizations.js`
  - [ ] Find query that returns payment channels for NGO dashboard
  - [ ] Change `accumulated_balance` to `off_chain_accumulated_balance AS accumulated_balance` (backward compatible)
  - [ ] Optionally add `on_chain_balance` to SELECT for transparency
  - **Acceptance**: Dashboard query returns `off_chain_accumulated_balance`
  - **Completed**: _____ | **By**: _____

- [ ] **Update Worker Dashboard Balance Queries**
  - **File**: `backend/routes/workers.js` (GET /:walletAddress/payment-channels)
  - [ ] Change `accumulated_balance` to `off_chain_accumulated_balance AS accumulated_balance`
  - [ ] Optionally add `on_chain_balance` to SELECT
  - **Acceptance**: Worker dashboard query returns `off_chain_accumulated_balance`
  - **Completed**: _____ | **By**: _____

### 3.5 API Response Updates

- [ ] **Update Payment Channel API Responses**
  - [ ] Review all API endpoints returning `accumulated_balance`
  - [ ] Map `off_chain_accumulated_balance` to `accumulatedBalance` in responses (backward compatibility)
  - [ ] Optionally add `onChainBalance` and `offChainAccumulatedBalance` for transparency
  - **Acceptance**: API returns both balance fields, frontend receives correct data
  - **Completed**: _____ | **By**: _____

- [ ] **Update TypeScript Types**
  - **File**: `frontend/src/types/api.ts`
  - [ ] Add optional fields to `PaymentChannel` interface:
    ```typescript
    offChainAccumulatedBalance?: number
    onChainBalance?: number
    ```
  - [ ] Keep `accumulatedBalance` as primary field (maps to `offChainAccumulatedBalance`)
  - **Acceptance**: TypeScript compilation succeeds, no type errors
  - **Completed**: _____ | **By**: _____

### 3.6 Code Cleanup

- [ ] **Search for Remaining `accumulated_balance` References**
  - [ ] Run: `grep -rn "accumulated_balance" backend/routes/ | grep -v "off_chain"`
  - [ ] Review each occurrence, update if needed
  - [ ] Document any intentional uses of `legacy_accumulated_balance`
  - **Acceptance**: All references updated or documented as intentional
  - **Completed**: _____ | **By**: _____

- [ ] **Add Database Field Comments**
  - [ ] Update database schema documentation
  - [ ] Add COMMENT ON COLUMN for new fields:
    ```sql
    COMMENT ON COLUMN payment_channels.off_chain_accumulated_balance IS
      'Worker earnings from completed work sessions (clock in/out). Source of truth for final payment. Never synced from ledger.';

    COMMENT ON COLUMN payment_channels.on_chain_balance IS
      'Current Balance field from XRPL ledger. Read-only, updated by ledger sync. For audit/monitoring only.';
    ```
  - **Acceptance**: Field purposes documented in database
  - **Completed**: _____ | **By**: _____

---

## 🎨 Phase 4: Frontend Code Updates

### 4.1 Type Definitions

- [ ] **Update `frontend/src/types/api.ts`**
  - [ ] Add new fields to `PaymentChannel` interface:
    ```typescript
    export interface PaymentChannel {
      // ... existing fields
      offChainAccumulatedBalance?: number
      onChainBalance?: number
      accumulatedBalance: number // Primary field (maps to offChainAccumulatedBalance)
    }
    ```
  - [ ] Run TypeScript compilation: `npm run build`
  - **Acceptance**: TypeScript compilation succeeds, no type errors
  - **Completed**: _____ | **By**: _____

### 4.2 Dashboard Components

- [ ] **Review `NgoDashboard.tsx`**
  - [ ] Check if `accumulatedBalance` is used in channel display
  - [ ] If backend maps `off_chain_accumulated_balance → accumulatedBalance`, no frontend changes needed
  - [ ] Optionally display both balances with tooltips for transparency
  - **Acceptance**: Dashboard shows correct balances from new fields
  - **Completed**: _____ | **By**: _____

- [ ] **Review `WorkerDashboard.tsx`**
  - [ ] Check if `accumulatedBalance` is used in payment channels section
  - [ ] Verify "COMPLETED SESSIONS" calculation uses `accumulatedBalance`
  - [ ] If backend maps correctly, no changes needed
  - **Acceptance**: Worker sees accurate earnings from off_chain tracking
  - **Completed**: _____ | **By**: _____

### 4.3 Channel Closure Flow

- [ ] **Verify `closePaymentChannel()` Receives Correct Balance**
  - **File**: `frontend/src/utils/paymentChannels.ts`
  - [ ] Check that Balance parameter comes from backend API response
  - [ ] Backend should calculate Balance from `off_chain_accumulated_balance`
  - [ ] Frontend passes this value unchanged to XRPL transaction
  - **Acceptance**: Channel closure includes worker's off_chain earnings in Balance field
  - **Completed**: _____ | **By**: _____

### 4.4 Frontend Code Cleanup

- [ ] **Search for `accumulatedBalance` References**
  - [ ] Run: `grep -rn "accumulatedBalance" frontend/src/`
  - [ ] Review each usage, verify it works with new backend mapping
  - [ ] No changes should be needed if backend maintains backward compatibility
  - **Acceptance**: All references reviewed and confirmed compatible
  - **Completed**: _____ | **By**: _____

### 4.5 Optional UI Enhancements

- [ ] **Add Balance Transparency (Optional)**
  - [ ] Display both `offChainAccumulatedBalance` and `onChainBalance` in admin view
  - [ ] Add tooltip: "Off-Chain = Worker earnings from time tracking | On-Chain = Ledger balance (0 until closure)"
  - [ ] Only for NGO dashboard, not needed for workers
  - **Acceptance**: Admins can see both balance fields for audit purposes
  - **Completed**: _____ | **By**: _____

---

## 🧪 Phase 5: Testing & Validation

### 5.1 Unit Tests

- [ ] **Test Clock-Out Balance Update**
  - **File**: `backend/tests/workSessions.test.js` (create if doesn't exist)
  - [ ] Test: Clock-out increments `off_chain_accumulated_balance`
  - [ ] Test: Clock-out does NOT modify `on_chain_balance`
  - [ ] Test: Concurrent clock-outs handle race conditions correctly
  - **Acceptance**: All tests pass
  - **Completed**: _____ | **By**: _____

- [ ] **Test Ledger Sync Isolation**
  - **File**: `backend/tests/ledgerSync.test.js`
  - [ ] Test: Sync updates `on_chain_balance` only
  - [ ] Test: Sync preserves `off_chain_accumulated_balance`
  - [ ] Test: Discrepancy logging works correctly
  - **Acceptance**: Sync cannot erase off_chain balance
  - **Completed**: _____ | **By**: _____

- [ ] **Test Channel Closure with Off-Chain Balance**
  - **File**: `backend/tests/paymentChannels.test.js`
  - [ ] Test: Closure uses `off_chain_accumulated_balance` for Balance field
  - [ ] Test: Closure clears `off_chain_accumulated_balance` on confirmation
  - [ ] Test: Closure preserves `on_chain_balance`
  - **Acceptance**: Closure uses correct balance, worker receives payment
  - **Completed**: _____ | **By**: _____

### 5.2 Integration Tests

- [ ] **End-to-End Worker Payment Flow**
  1. [ ] Create payment channel (240 XAH escrow)
  2. [ ] Worker clocks in
  3. [ ] Simulate 1 hour of work
  4. [ ] Worker clocks out
  5. [ ] Verify `off_chain_accumulated_balance` = 15 XAH (hourly rate)
  6. [ ] NGO closes channel
  7. [ ] Verify XRPL transaction includes Balance = 15 XAH
  8. [ ] Query worker wallet on testnet, verify received 15 XAH
  9. [ ] Query NGO wallet, verify received 225 XAH escrow return
  - **Acceptance**: Full flow completes successfully, balances correct
  - **Completed**: _____ | **By**: _____

- [ ] **Ledger Sync Does Not Erase Earnings**
  1. [ ] Worker clocks in/out (off_chain_accumulated_balance = 15 XAH)
  2. [ ] Run ledger sync (on_chain_balance = 0 from ledger)
  3. [ ] Query: `SELECT off_chain_accumulated_balance, on_chain_balance FROM payment_channels WHERE id = X`
  4. [ ] Verify `off_chain_accumulated_balance` still = 15 XAH
  5. [ ] Verify `on_chain_balance` = 0
  6. [ ] Close channel
  7. [ ] Verify worker receives 15 XAH payment on testnet
  - **Acceptance**: Sync preserves off_chain balance, worker paid correctly
  - **Completed**: _____ | **By**: _____

### 5.3 Edge Case Testing

- [ ] **Test Channel with Zero Off-Chain Balance**
  - [ ] Create channel, do NOT clock in/out
  - [ ] Close channel immediately
  - [ ] Verify Balance field omitted (no temBAD_AMOUNT error)
  - [ ] Verify only escrow returned to NGO
  - **Acceptance**: Zero-balance channels close successfully
  - **Completed**: _____ | **By**: _____

- [ ] **Test Channel with Large Balance**
  - [ ] Worker accumulates 100+ XAH in earnings (multiple sessions)
  - [ ] Close channel
  - [ ] Verify full balance transferred on-chain
  - [ ] Verify no overflow or precision errors
  - **Acceptance**: Large balances handled correctly
  - **Completed**: _____ | **By**: _____

- [ ] **Test Concurrent Clock-Outs**
  - [ ] Create 10 test workers on same channel
  - [ ] All clock out simultaneously (or within 1 second)
  - [ ] Verify all `off_chain_accumulated_balance` updates succeed
  - [ ] Verify no race conditions, no lost updates
  - [ ] Query: `SELECT SUM(total_amount) FROM work_sessions` vs `SELECT off_chain_accumulated_balance FROM payment_channels`
  - **Acceptance**: Concurrent updates work correctly, no data loss
  - **Completed**: _____ | **By**: _____

---

## 🚀 Phase 6: Deployment

### 6.1 Pre-Deployment Checklist

- [ ] **Code Review**
  - [ ] All changes peer-reviewed by at least 2 developers
  - [ ] Security implications assessed (no new vulnerabilities)
  - [ ] Performance impact evaluated (no regressions)
  - **Reviewer 1**: _____ | **Date**: _____
  - **Reviewer 2**: _____ | **Date**: _____
  - **Acceptance**: Code review approved
  - **Completed**: _____ | **By**: _____

- [ ] **Documentation Updates**
  - [ ] Update `CLAUDE.md` with two-field system architecture
  - [ ] Update `PAYMENT_CHANNEL_IMPLEMENTATION.md` with new fields
  - [ ] Update API documentation with new balance fields
  - [ ] Create `PATH_D_MIGRATION_SUMMARY.md` for future reference
  - **Acceptance**: Documentation reflects new architecture
  - **Completed**: _____ | **By**: _____

- [ ] **Staging Deployment**
  - [ ] Deploy to staging environment
  - [ ] Run full test suite on staging
  - [ ] Perform manual QA testing (NGO + Worker flows)
  - [ ] Verify ledger sync behavior on staging
  - **Acceptance**: All tests pass on staging, no critical issues
  - **Completed**: _____ | **By**: _____

### 6.2 Production Deployment

- [ ] **Schedule Maintenance Window**
  - [ ] Notify users of planned downtime (if required)
  - [ ] Choose low-traffic time (e.g., Sunday 2 AM)
  - [ ] Estimate downtime: ~30 minutes for DB migration + deployment
  - **Scheduled Time**: _____
  - **Users Notified**: [ ] Yes [ ] No
  - **Acceptance**: Maintenance window scheduled and communicated
  - **Completed**: _____ | **By**: _____

- [ ] **Execute Deployment Steps**
  1. [ ] **Backup Production Database** (final backup before migration)
     - Command: `pg_dump -U xahpayroll_user -d xahpayroll -F c -f backups/pre_pathd_prod_$(date +%Y%m%d_%H%M%S).dump`
  2. [ ] **Run Database Migration Script**
     - Command: `psql -U xahpayroll_user -d xahpayroll -f backend/database/migrations/006_two_field_balance_system.sql`
  3. [ ] **Verify Migration Success**
     - Query: `SELECT COUNT(*) FROM payment_channels WHERE off_chain_accumulated_balance IS NULL;`
     - Expected: 0
  4. [ ] **Deploy Backend Code Updates**
     - Pull latest code: `git pull origin main`
     - Install dependencies: `npm install`
     - Restart backend: `pm2 restart backend` (or equivalent)
  5. [ ] **Deploy Frontend Code Updates**
     - Build: `npm run build`
     - Deploy to CDN/hosting (e.g., Netlify)
  6. [ ] **Clear Caches**
     - Clear frontend cache / CDN cache
     - Clear backend API response cache (if any)
  - **Acceptance**: All deployment steps completed without errors
  - **Completed**: _____ | **By**: _____

- [ ] **Smoke Testing**
  - [ ] NGO dashboard loads correctly
  - [ ] Worker dashboard loads correctly
  - [ ] Create test work session (clock in/out) on production
  - [ ] Verify balance updates in production database
  - [ ] Test channel closure flow on testnet channel
  - **Acceptance**: All critical flows work in production
  - **Completed**: _____ | **By**: _____

---

## 📊 Phase 7: Post-Deployment Monitoring

### 7.1 Immediate Monitoring (First 24 Hours)

- [ ] **Monitor Database Queries**
  - [ ] Check PostgreSQL slow query logs
  - [ ] Verify new indexes are being used: `EXPLAIN ANALYZE SELECT ...`
  - [ ] Monitor query performance metrics
  - **Acceptance**: No slow queries related to new fields (< 100ms)
  - **Completed**: _____ | **By**: _____

- [ ] **Monitor Application Logs**
  - [ ] Watch backend logs for errors related to balance field access
  - [ ] Check for null pointer exceptions or type errors
  - [ ] Monitor `[BALANCE_DISCREPANCY]` warnings (expected for active channels)
  - **Acceptance**: No errors related to new balance fields
  - **Completed**: _____ | **By**: _____

- [ ] **Monitor User Activity**
  - [ ] Track clock-in/out success rate (should be ≥ 99%)
  - [ ] Track channel closure success rate (should be ≥ 99%)
  - [ ] Monitor for user-reported issues (support tickets, emails)
  - **Acceptance**: Success rates maintained, no critical user complaints
  - **Completed**: _____ | **By**: _____

### 7.2 Data Integrity Validation

- [ ] **Run Validation Queries Daily (First Week)**
  - **Query**:
    ```sql
    -- Verify off_chain balance matches work sessions
    SELECT
      pc.channel_id,
      pc.off_chain_accumulated_balance as db_balance,
      COALESCE(SUM(ws.total_amount), 0) as calculated_balance,
      (pc.off_chain_accumulated_balance - COALESCE(SUM(ws.total_amount), 0)) as discrepancy
    FROM payment_channels pc
    LEFT JOIN work_sessions ws ON ws.payment_channel_id = pc.id
    WHERE pc.status = 'active'
    GROUP BY pc.channel_id, pc.off_chain_accumulated_balance
    HAVING ABS(pc.off_chain_accumulated_balance - COALESCE(SUM(ws.total_amount), 0)) > 0.01;
    ```
  - **Acceptance**: Zero discrepancies > 0.01 XAH
  - **Day 1**: _____ | **Day 2**: _____ | **Day 3**: _____ | **Day 7**: _____
  - **Completed**: _____ | **By**: _____

- [ ] **Verify Ledger Sync Behavior**
  - [ ] Run ledger sync manually (or wait for scheduled sync)
  - [ ] Verify `on_chain_balance` updates correctly
  - [ ] Verify `off_chain_accumulated_balance` untouched
  - [ ] Check for `[BALANCE_DISCREPANCY]` warnings in logs
  - **Acceptance**: Sync isolated to `on_chain_balance` field
  - **Completed**: _____ | **By**: _____

### 7.3 User Feedback Collection

- [ ] **Monitor Support Tickets**
  - [ ] Check for user confusion about balance display
  - [ ] Address any UX issues promptly
  - [ ] Document recurring questions for FAQ update
  - **Acceptance**: No critical user complaints, issues resolved within 24h
  - **Completed**: _____ | **By**: _____

- [ ] **Validate with Test Users**
  - [ ] Have NGO test account perform full workflow
  - [ ] Have worker test account perform clock in/out and view earnings
  - [ ] Collect feedback on any UI confusion
  - **Acceptance**: Test users confirm system works as expected
  - **Completed**: _____ | **By**: _____

---

## 🔄 Phase 8: Rollback Plan (If Needed)

### 8.1 Rollback Triggers

- [ ] **Define Rollback Criteria**
  - [ ] Critical data loss (worker earnings erased) - **IMMEDIATE ROLLBACK**
  - [ ] System-wide failures (> 10% error rate) - **IMMEDIATE ROLLBACK**
  - [ ] Performance degradation (> 2x slower queries) - **EVALUATE & DECIDE**
  - [ ] User confusion (> 20 support tickets in 24h) - **EVALUATE & DECIDE**
  - **Acceptance**: Clear criteria documented, team aligned
  - **Completed**: _____ | **By**: _____

### 8.2 Rollback Procedure

- [ ] **Prepare Rollback Database Script**
  - **File**: `backend/database/migrations/006_two_field_balance_system_ROLLBACK.sql`
  - **Contents**:
    ```sql
    BEGIN;

    -- Restore accumulated_balance from off_chain field
    UPDATE payment_channels
    SET accumulated_balance = off_chain_accumulated_balance
    WHERE off_chain_accumulated_balance IS NOT NULL;

    -- Drop new fields
    ALTER TABLE payment_channels
    DROP COLUMN off_chain_accumulated_balance,
    DROP COLUMN on_chain_balance;

    -- Rename legacy field back
    ALTER TABLE payment_channels
    RENAME COLUMN legacy_accumulated_balance TO accumulated_balance_backup;

    COMMIT;
    ```
  - [ ] Test rollback script on staging database
  - **Acceptance**: Rollback script tested on staging, ready to execute
  - **Completed**: _____ | **By**: _____

- [ ] **Prepare Code Rollback**
  - [ ] Identify previous Git commit hash before Path D changes
  - [ ] Test rollback deployment on staging
  - **Git Commit to Rollback To**: _____
  - **Acceptance**: Code rollback tested and ready
  - **Completed**: _____ | **By**: _____

### 8.3 Execute Rollback (Only If Needed)

- [ ] **Execute Rollback Steps**
  1. [ ] Stop backend services
  2. [ ] Run database rollback script
  3. [ ] Verify data integrity post-rollback
  4. [ ] Revert code to previous commit: `git checkout <commit-hash>`
  5. [ ] Restart backend services
  6. [ ] Smoke test: NGO dashboard, worker dashboard, clock in/out
  - **Acceptance**: System returns to pre-migration state
  - **Executed**: _____ | **By**: _____

---

## 📝 Phase 9: Final Documentation

### 9.1 Architecture Documentation

- [ ] **Create Architecture Diagram**
  - **File**: `claudedocs/TWO_FIELD_BALANCE_ARCHITECTURE.md`
  - [ ] Diagram showing data flow: work_sessions → off_chain_accumulated_balance → closure
  - [ ] Diagram showing ledger sync: XRPL Balance → on_chain_balance (read-only)
  - [ ] Include explanation of field purposes
  - **Acceptance**: Diagram reflects new architecture accurately
  - **Completed**: _____ | **By**: _____

- [ ] **Document Field Purposes**
  - **File**: `claudedocs/BALANCE_FIELD_REFERENCE.md`
  - **Contents**:
    ```markdown
    ## Balance Fields in payment_channels Table

    ### off_chain_accumulated_balance
    - **Purpose**: Tracks worker earnings from completed work sessions (clock in/out)
    - **Updated By**: Clock-out endpoint (/api/work-sessions/clock-out)
    - **Used By**: Channel closure endpoint (calculates Balance field for PaymentChannelClaim)
    - **Never Synced From Ledger**: This field is the source of truth for off-chain earnings

    ### on_chain_balance
    - **Purpose**: Reflects the current Balance field on the XRPL ledger for this channel
    - **Updated By**: Ledger sync process (queries XRPL, writes to DB)
    - **Used By**: Audit/monitoring, discrepancy detection
    - **Read-Only from Ledger**: This field never influences payment calculations

    ### legacy_accumulated_balance (deprecated)
    - **Purpose**: Original accumulated_balance field, renamed for safety
    - **Do Not Use**: Kept for rollback purposes only
    ```
  - **Acceptance**: Field purposes clearly documented for future developers
  - **Completed**: _____ | **By**: _____

### 9.2 Operational Runbook

- [ ] **Create Troubleshooting Guide**
  - **File**: `claudedocs/PATH_D_TROUBLESHOOTING.md`
  - [ ] How to detect balance discrepancies
  - [ ] How to manually reconcile if needed
  - [ ] How to verify ledger sync is working
  - [ ] Common error scenarios and solutions
  - **Acceptance**: Runbook includes step-by-step procedures
  - **Completed**: _____ | **By**: _____

---

## ✅ Completion Criteria

**Path D implementation is complete when:**

- [ ] All 67 checklist items marked complete
- [ ] Zero critical bugs in production (first 7 days)
- [ ] Zero worker wage loss incidents (verified via validation queries)
- [ ] Ledger sync cannot erase off_chain earnings (tested and verified)
- [ ] 100% of test cases passing (unit + integration)
- [ ] User satisfaction maintained (< 5 support tickets related to balances in first week)
- [ ] Documentation complete and reviewed
- [ ] Team trained on new architecture (knowledge transfer session held)

---

## 📅 Timeline Tracking

| Phase | Estimated Duration | Start Date | End Date | Status |
|-------|-------------------|------------|----------|--------|
| Phase 1: Planning | 1 day | _____ | _____ | ⬜ Not Started |
| Phase 2: DB Migration | 1 day | _____ | _____ | ⬜ Not Started |
| Phase 3: Backend Updates | 2 days | _____ | _____ | ⬜ Not Started |
| Phase 4: Frontend Updates | 1 day | _____ | _____ | ⬜ Not Started |
| Phase 5: Testing | 2 days | _____ | _____ | ⬜ Not Started |
| Phase 6: Deployment | 1 day | _____ | _____ | ⬜ Not Started |
| Phase 7: Monitoring | 7 days | _____ | _____ | ⬜ Not Started |
| Phase 8: Documentation | 1 day | _____ | _____ | ⬜ Not Started |

**Total Duration**: ~10 business days (2 weeks)

---

## 📊 Risk Register

| Risk | Likelihood | Impact | Mitigation | Status |
|------|-----------|--------|------------|--------|
| Database migration fails | Low | High | Tested on dev/staging, transaction-safe script, backup ready | ⬜ |
| Performance degradation | Low | Medium | Indexes added, performance tested, rollback ready | ⬜ |
| Worker wage loss (critical) | Very Low | Critical | Comprehensive testing, validation queries, ledger sync isolated | ⬜ |
| User confusion about balances | Medium | Low | Backward compatible API, optional transparency UI | ⬜ |
| Code bugs in updated logic | Low | Medium | Unit tests, integration tests, code review, staging validation | ⬜ |

---

## 👥 Team Assignments

| Phase | Responsible Person | Backup |
|-------|-------------------|--------|
| Phase 1: Planning | _____ | _____ |
| Phase 2: DB Migration | _____ | _____ |
| Phase 3: Backend Updates | _____ | _____ |
| Phase 4: Frontend Updates | _____ | _____ |
| Phase 5: Testing | _____ | _____ |
| Phase 6: Deployment | _____ | _____ |
| Phase 7: Monitoring | _____ | _____ |
| Phase 8: Documentation | _____ | _____ |

---

## 📞 Contact Information

**Project Lead**: _____
**Technical Lead**: _____
**Database Admin**: _____
**DevOps Lead**: _____

**Emergency Rollback Contact**: _____
**Emergency Rollback Phone**: _____

---

**Document Version**: 1.0
**Last Updated**: 2025-12-22
**Next Review Date**: After Phase 7 completion
