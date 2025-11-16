# Worker Deletion Feature - Deployment & Monitoring Guide

**Version**: 1.0
**Date**: 2025-11-15
**Feature**: Worker Profile Deletion System
**Status**: Ready for Production Deployment

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Database Migration](#database-migration)
3. [Backend Deployment](#backend-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Scheduled Jobs Configuration](#scheduled-jobs-configuration)
6. [Monitoring Setup](#monitoring-setup)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Rollback Procedures](#rollback-procedures)
9. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Environment Preparation

**Staging Environment**:
- [ ] Staging database accessible and backed up
- [ ] Backend staging server running
- [ ] Frontend staging build deployed
- [ ] All environment variables configured
- [ ] Test data created for smoke testing

**Production Environment**:
- [ ] Production database backed up (full backup + transaction logs)
- [ ] Backup verified and restoration tested
- [ ] Maintenance window scheduled (recommended: 2-4 hours)
- [ ] Rollback plan reviewed and approved
- [ ] Team availability confirmed (backend, frontend, DevOps)
- [ ] Communication plan ready (user notifications, status page)

### Code Review & Testing

- [ ] All unit tests passing (`npm test` in backend)
- [ ] Integration tests passing
- [ ] Manual testing checklist completed (see WORKER_DELETION_TESTING_CHECKLIST.md)
- [ ] Security audit completed
- [ ] Performance testing completed
- [ ] Code review approved by at least 2 developers
- [ ] Documentation updated and reviewed

### Dependencies Verification

**Backend** (`backend/package.json`):
```json
{
  "pdfkit": "^0.17.2",
  "node-cron": "^3.0.3",
  "joi": "^17.11.0"
}
```

**DevDependencies**:
```json
{
  "jest": "^29.7.0",
  "supertest": "^7.0.0"
}
```

- [ ] All dependencies installed: `npm install` in backend
- [ ] No critical vulnerabilities: `npm audit`
- [ ] Dependency versions locked in `package-lock.json`

---

## Database Migration

### Migration File
**Location**: `backend/database/migrations/003_worker_deletion.sql`

### Pre-Migration Steps

1. **Create Database Backup**:
```bash
# PostgreSQL backup (production)
pg_dump -U xahpayroll_user -h <PROD_DB_HOST> -d xahpayroll > backup_pre_worker_deletion_$(date +%Y%m%d_%H%M%S).sql

# Verify backup size
ls -lh backup_pre_worker_deletion_*.sql
```

2. **Test Migration on Staging**:
```bash
# Connect to staging database
psql -U xahpayroll_user -h <STAGING_DB_HOST> -d xahpayroll_staging

# Run migration
\i backend/database/migrations/003_worker_deletion.sql

# Verify tables created
\d deletion_logs
\d ngo_notifications
\d users  -- Should have new columns: deleted_at, deletion_reason, last_login_at
```

3. **Verify Migration Success (Staging)**:
```sql
-- Check new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('deleted_at', 'deletion_reason', 'last_login_at');

-- Check new tables
SELECT tablename FROM pg_tables WHERE tablename IN ('deletion_logs', 'ngo_notifications');

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename IN ('users', 'deletion_logs', 'ngo_notifications');
```

### Production Migration

**Execution Window**: During scheduled maintenance (recommended: low-traffic period)

```bash
# 1. Enable maintenance mode (optional)
echo "MAINTENANCE_MODE=true" >> /path/to/backend/.env

# 2. Connect to production database
psql -U xahpayroll_user -h <PROD_DB_HOST> -d xahpayroll

# 3. Begin transaction (safety measure)
BEGIN;

# 4. Run migration
\i backend/database/migrations/003_worker_deletion.sql

# 5. Verify migration
\d deletion_logs
\d ngo_notifications
\d users

# 6. If all looks good, commit
COMMIT;

# 7. If issues detected, rollback
-- ROLLBACK;
```

### Post-Migration Verification

```sql
-- Verify indexes created
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE tablename IN ('users', 'deletion_logs', 'ngo_notifications')
ORDER BY tablename, indexname;

-- Expected indexes:
-- users: idx_users_deleted_at, idx_users_last_login
-- deletion_logs: idx_deletion_logs_wallet, idx_deletion_logs_created_at
-- ngo_notifications: idx_ngo_notifications_org, idx_ngo_notifications_created_at

-- Verify foreign keys
SELECT conname, conrelid::regclass AS table_name, confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE contype = 'f'
AND conrelid::regclass::text = 'ngo_notifications';

-- Expected: ngo_notifications_organization_id_fkey → organizations(id)
```

### Migration Rollback (If Needed)

```sql
-- Rollback script (use with caution)
BEGIN;

-- Drop new tables
DROP TABLE IF EXISTS ngo_notifications;
DROP TABLE IF EXISTS deletion_logs;

-- Drop new columns from users
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE users DROP COLUMN IF EXISTS deletion_reason;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;

-- Verify rollback
\d users
\dt deletion_logs  -- Should not exist
\dt ngo_notifications  -- Should not exist

COMMIT;
```

---

## Backend Deployment

### Pre-Deployment Steps

1. **Build and Test**:
```bash
cd backend

# Run tests
npm test

# Verify no errors
echo $?  # Should be 0
```

2. **Environment Variables**:
```bash
# Production .env (backend/.env)
NODE_ENV=production
XRPL_NETWORK=mainnet  # or testnet
DATABASE_URL=postgresql://xahpayroll_user:<PASSWORD>@<PROD_DB_HOST>:5432/xahpayroll
XAMAN_API_KEY=<PRODUCTION_XAMAN_KEY>
XAMAN_API_SECRET=<PRODUCTION_XAMAN_SECRET>
JWT_SECRET=<STRONG_RANDOM_SECRET>
PORT=3001

# Verify environment variables loaded
node -e "require('dotenv').config(); console.log(process.env.NODE_ENV)"
```

### Deployment Steps

**Option A: PM2 Deployment** (Recommended for Production)

```bash
# 1. Stop existing backend server
pm2 stop xahpayroll-backend

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
cd backend
npm install --production

# 4. Restart backend with PM2
pm2 restart xahpayroll-backend

# 5. Verify server started
pm2 logs xahpayroll-backend --lines 50

# 6. Health check
curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"..."}
```

**Option B: Docker Deployment**

```bash
# 1. Build Docker image
docker build -t xahpayroll-backend:worker-deletion .

# 2. Stop existing container
docker stop xahpayroll-backend

# 3. Start new container
docker run -d \
  --name xahpayroll-backend \
  --env-file .env \
  -p 3001:3001 \
  --restart unless-stopped \
  xahpayroll-backend:worker-deletion

# 4. Verify container running
docker ps | grep xahpayroll-backend

# 5. Check logs
docker logs xahpayroll-backend --tail 100
```

### Backend Smoke Tests

```bash
# 1. Health check
curl http://localhost:3001/health

# 2. Test deletion eligibility endpoint
curl "http://localhost:3001/api/workers/deletion-eligibility?walletAddress=rABC123TEST456"

# 3. Test NGO notifications endpoint (requires JWT)
curl -H "Authorization: Bearer <JWT_TOKEN>" \
  http://localhost:3001/api/organizations/1/notifications

# 4. Verify scheduled jobs loaded
pm2 logs xahpayroll-backend | grep -i "scheduled job"
# Expected: "Hard delete job scheduled" and "Inactivity deletion job scheduled"
```

---

## Frontend Deployment

### Pre-Deployment Steps

1. **Build Frontend**:
```bash
cd frontend

# Install dependencies
npm install

# Build production bundle
npm run build

# Verify build
ls -lh dist/
```

2. **Environment Variables**:
```bash
# Production .env (frontend/.env)
VITE_XRPL_NETWORK=mainnet  # or testnet
VITE_BACKEND_URL=https://api.xahpayroll.com  # Production backend URL
```

### Deployment Steps

**Option A: Netlify Deployment** (Current Setup)

```bash
# 1. Deploy to Netlify
npm run deploy

# 2. Verify deployment
# Check Netlify dashboard: https://app.netlify.com

# 3. Smoke test
# Open: https://xahpayroll.netlify.app
# Navigate to Employee Settings (requires login)
# Verify "DELETE MY PROFILE" button visible
```

**Option B: Manual Static Hosting**

```bash
# 1. Build frontend
npm run build

# 2. Copy build files to web server
scp -r dist/* user@webserver:/var/www/xahpayroll/

# 3. Restart web server (Nginx example)
sudo systemctl restart nginx

# 4. Verify deployment
curl https://xahpayroll.com
```

### Frontend Smoke Tests

**Manual Browser Tests**:
1. [ ] Open production URL
2. [ ] Log in as worker (employee)
3. [ ] Navigate to Employee Settings page
4. [ ] Verify "DANGER ZONE" section visible
5. [ ] Verify "DELETE MY PROFILE" button present
6. [ ] Log in as NGO/employer
7. [ ] Navigate to NGO Dashboard
8. [ ] Verify "NOTIFICATIONS" tab visible
9. [ ] Test wallet connections (Xaman, Crossmark, GemWallet)

---

## Scheduled Jobs Configuration

### Hard Delete Job

**File**: `backend/jobs/hardDelete.js`
**Schedule**: Every 1 hour
**Purpose**: Permanently delete soft-deleted accounts after 48-hour grace period

**Configuration**:
```javascript
// In backend/server.js
const hardDeleteJob = require('./jobs/hardDelete');

// Run hourly
setInterval(() => {
  hardDeleteJob.processHardDeletes()
    .catch(error => console.error('[HARD_DELETE_JOB_ERROR]', error));
}, 60 * 60 * 1000); // 1 hour
```

**Monitoring**:
```bash
# Check logs for hard delete execution
pm2 logs xahpayroll-backend | grep "HARD_DELETE"

# Expected output (hourly):
# [HARD_DELETE] Starting hard delete job...
# [HARD_DELETE] Found 0 users eligible for hard delete
# [HARD_DELETE] Hard delete job completed
```

### Inactivity Deletion Job

**File**: `backend/jobs/inactivityDeletion.js`
**Schedule**: Daily at 2:00 AM
**Purpose**: Auto-delete workers after 14 days of inactivity

**Configuration**:
```javascript
// In backend/server.js
const cron = require('node-cron');
const inactivityDeletionJob = require('./jobs/inactivityDeletion');

// Run daily at 2 AM
cron.schedule('0 2 * * *', () => {
  inactivityDeletionJob.processInactiveWorkers()
    .catch(error => console.error('[INACTIVITY_JOB_ERROR]', error));
});
```

**Monitoring**:
```bash
# Check logs for inactivity job execution (daily)
pm2 logs xahpayroll-backend | grep "AUTO_DELETE"

# Expected output (daily at 2 AM):
# [AUTO_DELETE] Starting inactivity deletion job...
# [AUTO_DELETE] Found 3 inactive workers
# [AUTO_DELETE] Successfully deleted inactive worker: rABC123...
```

### Manual Job Execution (Testing)

```bash
# Hard delete job (manual run)
node backend/jobs/hardDelete.js

# Inactivity deletion job (manual run)
node backend/jobs/inactivityDeletion.js
```

---

## Monitoring Setup

### Application Metrics

**Key Metrics to Track**:

1. **Deletion Metrics**:
   - Deletion requests per day
   - Successful deletions vs blocked deletions
   - Deletion cancellations (within 48 hours)
   - Hard deletes executed (hourly)
   - Auto-deletes (inactivity-based)

2. **Notification Metrics**:
   - NGO notifications sent
   - Notification read rate
   - Notification types distribution

3. **Performance Metrics**:
   - PDF generation time (average, p95, p99)
   - Hard delete job execution time
   - Inactivity job execution time
   - API response times

### Database Monitoring Queries

```sql
-- Deletion statistics (daily)
SELECT
  DATE(deleted_at) AS deletion_date,
  COUNT(*) AS soft_deletes,
  COUNT(CASE WHEN deletion_reason LIKE '%inactivity%' THEN 1 END) AS auto_deletes,
  COUNT(CASE WHEN deletion_reason NOT LIKE '%inactivity%' THEN 1 END) AS manual_deletes
FROM deletion_logs
WHERE deleted_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(deleted_at)
ORDER BY deletion_date DESC;

-- Hard delete statistics (daily)
SELECT
  DATE(hard_deleted_at) AS hard_delete_date,
  COUNT(*) AS hard_deletes
FROM deletion_logs
WHERE hard_deleted_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(hard_deleted_at)
ORDER BY hard_delete_date DESC;

-- Notification statistics (daily)
SELECT
  notification_type,
  COUNT(*) AS total,
  COUNT(CASE WHEN is_read THEN 1 END) AS read,
  COUNT(CASE WHEN NOT is_read THEN 1 END) AS unread
FROM ngo_notifications
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY notification_type;

-- Current soft-deleted users (pending hard delete)
SELECT
  wallet_address,
  deleted_at,
  deletion_reason,
  EXTRACT(EPOCH FROM (NOW() - deleted_at)) / 3600 AS hours_since_deletion
FROM users
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;
```

### Error Monitoring

**LogRocket / Sentry Configuration** (Optional):

```javascript
// In backend/server.js
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app })
  ]
});

// Error tracking for deletion operations
app.use((err, req, res, next) => {
  if (req.path.includes('/delete-profile')) {
    Sentry.captureException(err);
  }
  next(err);
});
```

### Alerting Rules

**Recommended Alerts**:

1. **Critical**:
   - Hard delete job failed for 2+ consecutive runs
   - Database connection errors during deletion operations
   - Scheduled jobs not executing (missed 2+ runs)

2. **Warning**:
   - PDF generation taking > 10 seconds
   - Deletion blocked rate > 50% (may indicate UX issues)
   - Notification delivery failures

3. **Info**:
   - Deletion cancellation rate > 20% (may indicate unclear UX)
   - Hard delete job processing > 100 users/run (unusual volume)

---

## Post-Deployment Verification

### Immediate Verification (Within 1 Hour)

**Backend**:
- [ ] Server healthy: `curl http://localhost:3001/health`
- [ ] Deletion eligibility endpoint working
- [ ] NGO notifications endpoint working
- [ ] PDF export endpoint working
- [ ] No errors in logs: `pm2 logs xahpayroll-backend --err`

**Frontend**:
- [ ] Production site accessible
- [ ] Worker Settings page loads
- [ ] "DELETE MY PROFILE" button visible
- [ ] NGO Dashboard "NOTIFICATIONS" tab visible
- [ ] No JavaScript errors in browser console

**Database**:
- [ ] Migration applied successfully
- [ ] All indexes created
- [ ] Foreign keys working
- [ ] No permission errors

### Extended Verification (Within 24 Hours)

- [ ] Scheduled jobs executed at least once (check logs)
- [ ] No database deadlocks or transaction conflicts
- [ ] Performance metrics within acceptable ranges
- [ ] User feedback collected (if any early users)

### Scheduled Jobs Verification (Within 48 Hours)

**Hard Delete Job**:
- [ ] Executed at least 48 times (hourly)
- [ ] Processed at least 1 soft-deleted user (if any)
- [ ] No errors in execution logs
- [ ] Deletion logs updated correctly

**Inactivity Job**:
- [ ] Executed at least 2 times (daily at 2 AM)
- [ ] Processed inactive users (if any exist)
- [ ] NGO notifications sent correctly
- [ ] No errors in execution logs

---

## Rollback Procedures

### When to Rollback

**Critical Issues**:
- Data integrity compromised (incorrect deletions)
- Database corruption or deadlocks
- Scheduled jobs causing performance degradation
- Security vulnerabilities discovered

**Non-Critical Issues** (Fix Forward Instead):
- Minor UI bugs
- Non-critical error messages
- Performance optimization opportunities

### Database Rollback

**Step 1: Stop Application**
```bash
pm2 stop xahpayroll-backend
```

**Step 2: Restore Database from Backup**
```bash
# Drop existing database (CAUTION!)
psql -U postgres -c "DROP DATABASE xahpayroll;"

# Create fresh database
psql -U postgres -c "CREATE DATABASE xahpayroll OWNER xahpayroll_user;"

# Restore from backup
psql -U xahpayroll_user -d xahpayroll < backup_pre_worker_deletion_<TIMESTAMP>.sql

# Verify restoration
psql -U xahpayroll_user -d xahpayroll -c "\dt"
```

**Step 3: Verify Data Integrity**
```sql
-- Check critical tables
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM organizations;
SELECT COUNT(*) FROM employees;
SELECT COUNT(*) FROM payment_channels;

-- Verify no new tables exist
SELECT tablename FROM pg_tables WHERE tablename IN ('deletion_logs', 'ngo_notifications');
-- Should return 0 rows after rollback
```

### Backend Rollback

```bash
# 1. Checkout previous stable commit
git checkout <PREVIOUS_STABLE_COMMIT>

# 2. Reinstall dependencies
cd backend
npm install

# 3. Restart server
pm2 restart xahpayroll-backend

# 4. Verify server healthy
curl http://localhost:3001/health
```

### Frontend Rollback

**Netlify**:
```bash
# 1. Go to Netlify dashboard
# 2. Deployments tab
# 3. Find previous stable deployment
# 4. Click "Publish deploy"
```

**Manual Hosting**:
```bash
# 1. Checkout previous stable commit
git checkout <PREVIOUS_STABLE_COMMIT>

# 2. Rebuild frontend
cd frontend
npm run build

# 3. Deploy to web server
scp -r dist/* user@webserver:/var/www/xahpayroll/
```

---

## Troubleshooting

### Common Issues

**Issue 1: Migration Fails with Permission Error**

**Error**: `ERROR: permission denied for table users`

**Solution**:
```bash
# Grant necessary permissions
psql -U postgres -d xahpayroll

GRANT ALL PRIVILEGES ON TABLE users TO xahpayroll_user;
GRANT ALL PRIVILEGES ON TABLE deletion_logs TO xahpayroll_user;
GRANT ALL PRIVILEGES ON TABLE ngo_notifications TO xahpayroll_user;
```

**Issue 2: Scheduled Jobs Not Running**

**Symptoms**: No logs from hard delete or inactivity jobs

**Diagnosis**:
```bash
# Check server logs
pm2 logs xahpayroll-backend | grep -i "scheduled job"

# Verify server.js loaded jobs
ps aux | grep node
```

**Solution**:
```bash
# Restart backend server
pm2 restart xahpayroll-backend

# Manually trigger job to test
node backend/jobs/hardDelete.js
```

**Issue 3: PDF Export Fails (500 Error)**

**Error**: `PDF_GENERATION_FAILED`

**Diagnosis**:
```bash
# Check backend logs
pm2 logs xahpayroll-backend | grep "PDF"

# Test PDF generation manually
curl "http://localhost:3001/api/workers/export-data?walletAddress=rABC123..." -o test.pdf
```

**Common Causes**:
- Missing pdfkit dependency: `npm install pdfkit`
- Database query failure: Check query logs
- Memory issues: Increase Node.js heap size

**Solution**:
```bash
# Install pdfkit if missing
cd backend
npm install pdfkit

# Increase Node heap size
pm2 delete xahpayroll-backend
pm2 start server.js --name xahpayroll-backend --node-args="--max-old-space-size=2048"
```

**Issue 4: Hard Delete Job Deleting Wrong Users**

**Symptoms**: Users deleted before 48-hour grace period

**Immediate Action**:
```bash
# Stop scheduled job
pm2 stop xahpayroll-backend

# Review deletion_logs
psql -U xahpayroll_user -d xahpayroll -c "SELECT * FROM deletion_logs WHERE hard_deleted_at IS NOT NULL ORDER BY hard_deleted_at DESC LIMIT 10;"
```

**Prevention**:
- Review hard delete query logic in `backend/jobs/hardDelete.js`
- Add additional safeguards (minimum 48-hour check)
- Test on staging before re-deploying

**Issue 5: NGO Notifications Not Appearing**

**Symptoms**: Notifications created in database but not visible in UI

**Diagnosis**:
```sql
-- Check notifications exist
SELECT * FROM ngo_notifications
WHERE organization_id = 1
ORDER BY created_at DESC
LIMIT 10;
```

**Common Causes**:
- API endpoint not returning notifications
- Frontend not fetching notifications
- Authorization mismatch

**Solution**:
```bash
# Test API endpoint
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:3001/api/organizations/1/notifications

# Check frontend network tab (browser DevTools)
# Verify JWT includes correct organization_id
```

---

## Deployment Checklist Summary

### Pre-Deployment
- [ ] All tests passing
- [ ] Code review approved
- [ ] Documentation updated
- [ ] Database backup created and verified
- [ ] Rollback plan reviewed

### Deployment
- [ ] Database migration applied successfully
- [ ] Backend deployed and health check passed
- [ ] Frontend deployed and smoke tested
- [ ] Scheduled jobs configured and verified
- [ ] Monitoring setup completed

### Post-Deployment
- [ ] Immediate verification passed (< 1 hour)
- [ ] Extended verification passed (< 24 hours)
- [ ] Scheduled jobs executed successfully (< 48 hours)
- [ ] Performance metrics within acceptable ranges
- [ ] No critical errors reported

### Sign-Off
- **Deployed By**: _______________________ Date: _______
- **Verified By**: _______________________ Date: _______
- **Approved By**: _______________________ Date: _______

---

**END OF DEPLOYMENT GUIDE**
