# MANUAL DATABASE CLEANUP PROCEDURES

**FOR DATABASE ADMINISTRATORS ONLY**

This document provides manual procedures for database cleanup operations. Automated scheduled jobs have been disabled - all data deletion must be performed manually by authorized database administrators.

## Table of Contents

1. [Hard Delete Worker Profiles](#1-hard-delete-worker-profiles)
2. [Check Deletion Status](#2-check-deletion-status)
3. [Clean Up Deletion Logs](#3-clean-up-deletion-logs)
4. [Clean Up Old Work Sessions](#4-clean-up-old-work-sessions)
5. [Restore Accidentally Deleted Workers](#5-restore-accidentally-deleted-workers)
6. [Safety Procedures](#6-safety-procedures)

---

## 1. HARD DELETE WORKER PROFILES

### 1.1 Manual Hard Delete Script

**Purpose**: Permanently remove worker profiles that have been soft-deleted for 48+ hours.

**Run from backend directory**:
```bash
cd /path/to/backend

# Set environment variables and run script
DB_USER=xahpayroll_user \
DB_PASSWORD=xahpayroll_secure_2024 \
DB_NAME=xahpayroll_dev \
DB_HOST=localhost \
DB_PORT=5432 \
node jobs/hardDelete.js
```

**What the script does**:
1. Finds users with `deleted_at` older than 48 hours
2. OR finds users with `deleted_at` set but no active payment channels (instant deletion)
3. Deletes employee records (cascades to work_sessions, payments)
4. Deletes user records
5. Updates deletion_logs with `hard_deleted_at` timestamp

**Expected output**:
```
[HARD_DELETE] Starting hard delete job at 2025-12-25T22:00:02.606Z
[HARD_DELETE] Cutoff time: 2025-12-23T22:00:02.606Z
[HARD_DELETE] Found 1 accounts to delete
[HARD_DELETE] Processing: rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS
[HARD_DELETE] Deletion type: GRACE PERIOD EXPIRED
[HARD_DELETE] ✅ Successfully deleted user: rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS
[HARD_DELETE] Job completed in 85ms
[HARD_DELETE] Summary: 1 successful, 0 failed
```

### 1.2 Manual SQL Hard Delete

**⚠️ WARNING**: This bypasses safety checks. Use only when script fails.

```sql
-- 1. START TRANSACTION
BEGIN;

-- 2. VERIFY DELETION CANDIDATE
SELECT
  wallet_address,
  display_name,
  user_type,
  deleted_at,
  NOW() - deleted_at as time_since_deletion
FROM users
WHERE wallet_address = 'rXXXXXXXXXXXXXXX';

-- 3. CHECK FOR ACTIVE CHANNELS (must be 0)
SELECT COUNT(*) as active_channels
FROM payment_channels pc
JOIN employees e ON pc.employee_id = e.id
WHERE e.employee_wallet_address = 'rXXXXXXXXXXXXXXX'
  AND (
    pc.status = 'active'
    OR pc.off_chain_accumulated_balance > 0
    OR pc.closure_tx_hash IS NULL
  );

-- 4. DELETE EMPLOYEE RECORDS (cascades to work_sessions, payments)
DELETE FROM employees
WHERE employee_wallet_address = 'rXXXXXXXXXXXXXXX';

-- 5. DELETE USER RECORD
DELETE FROM users
WHERE wallet_address = 'rXXXXXXXXXXXXXXX';

-- 6. UPDATE DELETION LOG
UPDATE deletion_logs
SET hard_deleted_at = CURRENT_TIMESTAMP
WHERE wallet_address = 'rXXXXXXXXXXXXXXX'
  AND hard_deleted_at IS NULL;

-- 7. COMMIT TRANSACTION
COMMIT;

-- If anything goes wrong: ROLLBACK;
```

---

## 2. CHECK DELETION STATUS

### 2.1 View Pending Deletions

```sql
-- SOFT-DELETED WORKERS AWAITING HARD DELETE
SELECT
  wallet_address,
  display_name,
  user_type,
  deleted_at,
  deletion_reason,
  NOW() - deleted_at as time_since_deletion,
  CASE
    WHEN NOW() - deleted_at > INTERVAL '48 hours' THEN '✅ READY FOR HARD DELETE'
    ELSE '⏳ GRACE PERIOD - CAN RESTORE'
  END as status
FROM users
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;
```

### 2.2 View Deletion History (Audit Trail)

```sql
-- PERMANENT DELETION HISTORY
SELECT
  wallet_address,
  user_type,
  deleted_by,
  deletion_reason,
  created_at as soft_deleted_at,
  hard_deleted_at,
  hard_deleted_at - created_at as retention_period
FROM deletion_logs
WHERE hard_deleted_at IS NOT NULL
ORDER BY hard_deleted_at DESC
LIMIT 50;
```

### 2.3 Check Deletion Eligibility

```sql
-- WORKERS ELIGIBLE FOR IMMEDIATE DELETION (no active channels)
SELECT
  u.wallet_address,
  u.display_name,
  u.deleted_at,
  COUNT(pc.id) FILTER (WHERE pc.status = 'active') as active_channels,
  SUM(pc.off_chain_accumulated_balance) FILTER (WHERE pc.status = 'active') as unpaid_balance
FROM users u
LEFT JOIN employees e ON e.employee_wallet_address = u.wallet_address
LEFT JOIN payment_channels pc ON pc.employee_id = e.id
WHERE u.deleted_at IS NOT NULL
GROUP BY u.wallet_address, u.display_name, u.deleted_at
HAVING
  COUNT(pc.id) FILTER (WHERE pc.status = 'active') = 0
  AND COALESCE(SUM(pc.off_chain_accumulated_balance) FILTER (WHERE pc.status = 'active'), 0) = 0;
```

---

## 3. CLEAN UP DELETION LOGS

### 3.1 View Deletion Log Statistics

```sql
-- DELETION LOG SIZE AND AGE
SELECT
  COUNT(*) as total_logs,
  COUNT(*) FILTER (WHERE hard_deleted_at IS NULL) as pending_hard_delete,
  COUNT(*) FILTER (WHERE hard_deleted_at IS NOT NULL) as completed_deletions,
  MIN(created_at) as oldest_log,
  MAX(created_at) as newest_log,
  pg_size_pretty(pg_total_relation_size('deletion_logs')) as table_size
FROM deletion_logs;
```

### 3.2 Archive Old Deletion Logs

```sql
-- ARCHIVE LOGS OLDER THAN 1 YEAR (export first!)
\copy (SELECT * FROM deletion_logs WHERE created_at < NOW() - INTERVAL '1 year') TO '/tmp/deletion_logs_archive.csv' CSV HEADER;

-- AFTER VERIFYING ARCHIVE, DELETE OLD LOGS
DELETE FROM deletion_logs
WHERE created_at < NOW() - INTERVAL '1 year'
  AND hard_deleted_at IS NOT NULL;
```

### 3.3 Clean Up Orphaned Logs

```sql
-- FIND LOGS FOR USERS THAT WERE RESTORED (soft delete cancelled)
SELECT dl.wallet_address, dl.created_at, u.deleted_at
FROM deletion_logs dl
LEFT JOIN users u ON dl.wallet_address = u.wallet_address
WHERE dl.hard_deleted_at IS NULL
  AND (u.deleted_at IS NULL OR u.wallet_address IS NULL);

-- CLEAN UP ORPHANED LOGS (user was restored or never existed)
DELETE FROM deletion_logs
WHERE id IN (
  SELECT dl.id
  FROM deletion_logs dl
  LEFT JOIN users u ON dl.wallet_address = u.wallet_address
  WHERE dl.hard_deleted_at IS NULL
    AND (u.deleted_at IS NULL OR u.wallet_address IS NULL)
    AND dl.created_at < NOW() - INTERVAL '7 days'
);
```

---

## 4. CLEAN UP OLD WORK SESSIONS

### 4.1 View Old Work Sessions

```sql
-- WORK SESSIONS OLDER THAN 6 MONTHS
SELECT
  COUNT(*) as old_sessions,
  pg_size_pretty(pg_total_relation_size('work_sessions')) as current_table_size,
  MIN(clock_in) as oldest_session,
  MAX(clock_out) as newest_completed_session
FROM work_sessions
WHERE clock_out IS NOT NULL
  AND clock_out < NOW() - INTERVAL '6 months';
```

### 4.2 Archive and Delete Old Sessions

```sql
-- 1. EXPORT OLD WORK SESSIONS
\copy (SELECT * FROM work_sessions WHERE clock_out IS NOT NULL AND clock_out < NOW() - INTERVAL '1 year') TO '/tmp/work_sessions_archive.csv' CSV HEADER;

-- 2. VERIFY EXPORT
\! wc -l /tmp/work_sessions_archive.csv

-- 3. DELETE OLD SESSIONS (TRANSACTION PROTECTED)
BEGIN;

DELETE FROM work_sessions
WHERE clock_out IS NOT NULL
  AND clock_out < NOW() - INTERVAL '1 year';

-- Check how many rows deleted
-- If correct: COMMIT;
-- If wrong: ROLLBACK;

COMMIT;

-- 4. VACUUM TABLE TO RECLAIM SPACE
VACUUM FULL work_sessions;
```

---

## 5. RESTORE ACCIDENTALLY DELETED WORKERS

### 5.1 Check If Worker Can Be Restored

```sql
-- VERIFY WORKER IS SOFT-DELETED (NOT HARD-DELETED)
SELECT
  wallet_address,
  display_name,
  user_type,
  deleted_at,
  deletion_reason,
  NOW() - deleted_at as time_since_deletion,
  CASE
    WHEN deleted_at IS NULL THEN '❌ NOT DELETED'
    WHEN NOW() - deleted_at > INTERVAL '48 hours' THEN '⚠️ MAY BE HARD-DELETED ALREADY'
    ELSE '✅ CAN RESTORE'
  END as restore_status
FROM users
WHERE wallet_address = 'rXXXXXXXXXXXXXXX';
```

### 5.2 Restore Worker Profile

```sql
-- RESTORE SOFT-DELETED WORKER (within 48-hour grace period)
UPDATE users
SET
  deleted_at = NULL,
  deletion_reason = NULL
WHERE wallet_address = 'rXXXXXXXXXXXXXXX'
  AND deleted_at IS NOT NULL;

-- VERIFY RESTORATION
SELECT wallet_address, display_name, deleted_at, deletion_reason
FROM users
WHERE wallet_address = 'rXXXXXXXXXXXXXXX';
```

### 5.3 Using API Endpoint (Alternative)

```bash
curl -X POST http://localhost:3001/api/workers/cancel-deletion \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "rXXXXXXXXXXXXXXX"}'
```

---

## 6. SAFETY PROCEDURES

### 6.1 Pre-Deletion Checklist

**BEFORE RUNNING ANY DELETION OPERATION:**

- [ ] Verify database backup exists and is recent
- [ ] Run in transaction (`BEGIN` ... `COMMIT`/`ROLLBACK`)
- [ ] Check worker has no active payment channels
- [ ] Check worker has no unpaid balances (`off_chain_accumulated_balance = 0`)
- [ ] Verify 48-hour grace period has expired
- [ ] Review deletion logs for audit trail
- [ ] Export data if needed (GDPR compliance)

### 6.2 Database Backup Before Deletion

```bash
# CREATE FULL DATABASE BACKUP
pg_dump -U xahpayroll_user \
  -h localhost \
  -p 5432 \
  -d xahpayroll_dev \
  -F c \
  -f /backup/xahpayroll_pre_deletion_$(date +%Y%m%d_%H%M%S).dump

# VERIFY BACKUP
ls -lh /backup/xahpayroll_pre_deletion_*.dump
```

### 6.3 Transaction Safety Pattern

```sql
-- ALWAYS USE TRANSACTIONS FOR MANUAL DELETIONS
BEGIN;

-- Perform deletion operations here
-- ...

-- BEFORE COMMITTING:
-- 1. Review affected rows
SELECT * FROM users WHERE wallet_address = 'rXXXXXXXXXXXXXXX';

-- 2. Check deletion logs updated
SELECT * FROM deletion_logs WHERE wallet_address = 'rXXXXXXXXXXXXXXX';

-- 3. Verify no unintended side effects
SELECT COUNT(*) FROM employees WHERE employee_wallet_address = 'rXXXXXXXXXXXXXXX';

-- If everything looks good:
COMMIT;

-- If something is wrong:
ROLLBACK;
```

### 6.4 Emergency Recovery

**If deletion was committed by mistake:**

```sql
-- 1. RESTORE FROM BACKUP (last resort)
pg_restore -U xahpayroll_user \
  -h localhost \
  -p 5432 \
  -d xahpayroll_dev \
  -c \
  /backup/xahpayroll_pre_deletion_YYYYMMDD_HHMMSS.dump

-- 2. VERIFY RESTORATION
SELECT wallet_address, deleted_at
FROM users
WHERE wallet_address = 'rXXXXXXXXXXXXXXX';
```

---

## SCHEDULED MAINTENANCE RECOMMENDATIONS

### Monthly Tasks (Database Administrator)

1. **Review Pending Deletions** (10 min)
   ```bash
   # Run section 2.1 query to see pending deletions
   ```

2. **Run Hard Delete Job** (5 min)
   ```bash
   DB_USER=xahpayroll_user \
   DB_PASSWORD=xahpayroll_secure_2024 \
   DB_NAME=xahpayroll_dev \
   node jobs/hardDelete.js
   ```

3. **Review Deletion Logs** (5 min)
   ```bash
   # Run section 2.2 query to audit recent deletions
   ```

### Quarterly Tasks

1. **Clean Up Deletion Logs** (15 min)
   - Archive logs older than 90 days
   - Delete archived logs older than 1 year

2. **Clean Up Work Sessions** (20 min)
   - Archive sessions older than 6 months
   - Delete archived sessions older than 1 year

### Annual Tasks

1. **Database Vacuum and Analyze** (30 min)
   ```sql
   VACUUM FULL;
   ANALYZE;
   ```

2. **Review Retention Policies** (30 min)
   - Assess if 48-hour grace period is appropriate
   - Review work session retention (currently 1 year)
   - Update deletion log archival policy

---

## TROUBLESHOOTING

### Issue: Hard Delete Script Fails with "role postgres does not exist"

**Solution**: Run with explicit environment variables:
```bash
DB_USER=xahpayroll_user \
DB_PASSWORD=xahpayroll_secure_2024 \
DB_NAME=xahpayroll_dev \
DB_HOST=localhost \
DB_PORT=5432 \
node jobs/hardDelete.js
```

### Issue: Worker Cannot Be Deleted (Active Channels)

**Check active channels**:
```sql
SELECT
  pc.channel_id,
  pc.status,
  pc.off_chain_accumulated_balance,
  pc.closure_tx_hash
FROM payment_channels pc
JOIN employees e ON pc.employee_id = e.id
WHERE e.employee_wallet_address = 'rXXXXXXXXXXXXXXX'
  AND (
    pc.status = 'active'
    OR pc.off_chain_accumulated_balance > 0
    OR pc.closure_tx_hash IS NULL
  );
```

**Solution**: Close all payment channels first, then retry deletion.

### Issue: Deletion Log Not Updated

**Manual update**:
```sql
UPDATE deletion_logs
SET hard_deleted_at = CURRENT_TIMESTAMP
WHERE wallet_address = 'rXXXXXXXXXXXXXXX'
  AND hard_deleted_at IS NULL;
```

---

## CONTACTS

- **Database Administrator**: [Your Contact]
- **System Administrator**: [Your Contact]
- **Emergency Contact**: [Your Contact]

---

**DOCUMENT VERSION**: 1.0
**LAST UPDATED**: 2025-12-25
**AUTHOR**: Database Administration Team
