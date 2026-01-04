# Cron Job Setup Guide

Production-ready scheduled job configuration for XAH Payroll system.

## Overview

XAH Payroll uses **system cron jobs** (not Node.js setInterval) to ensure scheduled tasks run reliably, independent of backend server uptime.

### Scheduled Jobs

| Job | Script | Schedule | Purpose |
|-----|--------|----------|---------|
| **Hard Delete** | `runHardDelete.js` | Every hour (`:00`) | Permanently delete soft-deleted workers after 48-hour grace period |
| **Inactivity Deletion** | `runInactivityDeletion.js` | Daily at 2:00 AM | Soft-delete workers inactive for 14+ days |

---

## Why Cron vs Server-Based?

### ❌ Server-Based (Old Approach)
```javascript
// Inside server.js - REMOVED
setInterval(() => processHardDeletes(), 60 * 60 * 1000);
```

**Problems**:
- Jobs ONLY run when server is active
- Server restart = missed execution
- Development mode restarts reset timers
- Crashes stop job execution

### ✅ Cron-Based (Current Approach)
```bash
# System cron - PRODUCTION READY
0 * * * * cd /backend && node jobs/runHardDelete.js >> logs/hard-delete.log 2>&1
```

**Advantages**:
- Independent of server uptime
- Guaranteed execution at scheduled time
- Separate process (doesn't affect server)
- Standard production practice
- Automatic retries on next schedule

---

## Installation

### Step 1: Create Log Directory

```bash
cd /path/to/backend
mkdir -p logs
chmod 755 logs
```

### Step 2: Make Scripts Executable (Optional)

```bash
chmod +x jobs/runHardDelete.js
chmod +x jobs/runInactivityDeletion.js
```

### Step 3: Configure Crontab

**Option A: Edit crontab directly**
```bash
crontab -e
```

**Option B: Use crontab file**
```bash
# Create crontab file
cat > crontab.txt << 'EOF'
# XAH Payroll Scheduled Jobs
# Edit paths to match your installation

# Hard Delete Job (runs every hour at minute 0)
0 * * * * cd /path/to/backend && /usr/bin/node jobs/runHardDelete.js >> logs/hard-delete.log 2>&1

# Inactivity Deletion Job (runs daily at 2:00 AM)
0 2 * * * cd /path/to/backend && /usr/bin/node jobs/runInactivityDeletion.js >> logs/inactivity-deletion.log 2>&1
EOF

# Install crontab
crontab crontab.txt
```

### Step 4: Verify Installation

```bash
# List current cron jobs
crontab -l

# Expected output:
# 0 * * * * cd /path/to/backend && /usr/bin/node jobs/runHardDelete.js >> logs/hard-delete.log 2>&1
# 0 2 * * * cd /path/to/backend && /usr/bin/node jobs/runInactivityDeletion.js >> logs/inactivity-deletion.log 2>&1
```

---

## Configuration Details

### Crontab Entry Format

```bash
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday=0)
│ │ │ │ │
│ │ │ │ │
* * * * * command to execute
```

### Hard Delete Job
```bash
0 * * * * cd /path/to/backend && /usr/bin/node jobs/runHardDelete.js >> logs/hard-delete.log 2>&1
```

**Breakdown**:
- `0 * * * *` - Every hour at minute 0 (1:00, 2:00, 3:00, etc.)
- `cd /path/to/backend` - Change to backend directory (for .env loading)
- `/usr/bin/node` - Full path to Node.js binary (recommended for cron)
- `jobs/runHardDelete.js` - Relative path to script
- `>> logs/hard-delete.log` - Append stdout to log file
- `2>&1` - Redirect stderr to stdout (capture errors)

### Inactivity Deletion Job
```bash
0 2 * * * cd /path/to/backend && /usr/bin/node jobs/runInactivityDeletion.js >> logs/inactivity-deletion.log 2>&1
```

**Breakdown**:
- `0 2 * * *` - Daily at 2:00 AM
- Rest same as hard delete job

---

## Path Configuration

### Find Your Paths

**Node.js binary**:
```bash
which node
# Example output: /usr/bin/node or /usr/local/bin/node
```

**Backend directory**:
```bash
pwd
# Example: /home/deploy/xahpayroll/backend
```

**Update crontab with absolute paths**:
```bash
# Replace /usr/bin/node with your Node.js path
# Replace /path/to/backend with your backend directory
```

---

## Testing

### Manual Execution

Test scripts before adding to cron:

```bash
cd /path/to/backend

# Test hard delete job
node jobs/runHardDelete.js

# Expected output:
# ========================================
# [CRON] Hard Delete Job Started
# [CRON] Timestamp: 2025-12-07T...
# [CRON] Environment: development
# ========================================
# [CRON] Testing database connection...
# [CRON] ✅ Database connection successful
# [CRON] Starting hard delete process...
# [HARD_DELETE] Starting hard delete job at 2025-12-07T...
# [HARD_DELETE] Found 0 accounts to delete
# ...
# [CRON] ✅ Job completed successfully

# Test inactivity deletion job
node jobs/runInactivityDeletion.js
```

### Test Cron Execution

**Option 1: Temporary test schedule**
```bash
# Add test entry (runs every minute)
* * * * * cd /path/to/backend && /usr/bin/node jobs/runHardDelete.js >> logs/hard-delete-test.log 2>&1

# Wait 2 minutes, then check log
tail -f logs/hard-delete-test.log

# Remove test entry after verification
crontab -e  # Delete the test line
```

**Option 2: Force immediate run**
```bash
# Run the cron job command directly
cd /path/to/backend && /usr/bin/node jobs/runHardDelete.js >> logs/hard-delete-test.log 2>&1

# Check log
cat logs/hard-delete-test.log
```

---

## Monitoring

### Check Logs

```bash
# Real-time monitoring
tail -f logs/hard-delete.log
tail -f logs/inactivity-deletion.log

# View recent runs
tail -n 100 logs/hard-delete.log

# Search for errors
grep -i error logs/hard-delete.log
grep "\[CRON\] ❌" logs/*.log

# Check successful runs
grep "\[CRON\] ✅ Job completed successfully" logs/hard-delete.log | tail -n 10
```

### Log Rotation

Prevent log files from growing indefinitely:

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/xahpayroll

# Add configuration:
/path/to/backend/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 deploy deploy
}
```

### Cron Execution Logs

```bash
# Linux: Check system cron logs
grep CRON /var/log/syslog | tail -n 20

# macOS: Check system logs
log show --predicate 'process == "cron"' --last 1h
```

---

## Troubleshooting

### Jobs Not Running

**Check crontab is installed**:
```bash
crontab -l
# Should show your jobs
```

**Check cron service is running**:
```bash
# Linux
sudo systemctl status cron
# or
sudo service cron status

# macOS
sudo launchctl list | grep cron
```

**Check script permissions**:
```bash
ls -la jobs/runHardDelete.js
# Should be readable (at minimum: -rw-r--r--)
```

**Check Node.js path in crontab**:
```bash
which node
# Update crontab with correct path
```

### Environment Variables Not Loading

**Issue**: `.env` file not found

**Solution**: Use absolute path in script
```javascript
// jobs/runHardDelete.js
require('dotenv').config({ path: '/absolute/path/to/backend/.env' });
```

**Or**: Set environment variables in crontab
```bash
# Add to top of crontab
PGPASSWORD=your_password
DB_HOST=localhost
DB_NAME=xahpayroll_dev

0 * * * * cd /path/to/backend && /usr/bin/node jobs/runHardDelete.js >> logs/hard-delete.log 2>&1
```

### Database Connection Errors

**Check database is accessible**:
```bash
# Test connection manually
psql -U xahpayroll_user -d xahpayroll_dev -c "SELECT NOW();"
```

**Check .env configuration**:
```bash
cat .env | grep DB_
# Verify DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
```

### Exit Code 1 (Errors During Execution)

**Check logs for details**:
```bash
grep "FATAL ERROR" logs/hard-delete.log
grep "❌" logs/hard-delete.log
```

**Common causes**:
- Database connection failure
- Permission issues
- Missing dependencies

---

## Production Deployment Checklist

- [ ] Backend directory exists and accessible
- [ ] Node.js installed (`node --version`)
- [ ] Database accessible from cron user
- [ ] `.env` file configured with correct credentials
- [ ] Log directory created (`mkdir -p logs`)
- [ ] Scripts tested manually (exit code 0)
- [ ] Crontab installed (`crontab -l`)
- [ ] Paths in crontab are absolute
- [ ] Log rotation configured
- [ ] Monitoring alerts configured (optional)
- [ ] Test cron execution (wait for next scheduled time)
- [ ] Verify logs after 24 hours

---

## Example Production Setup

```bash
# 1. SSH into production server
ssh deploy@production-server

# 2. Navigate to backend directory
cd /home/deploy/xahpayroll/backend

# 3. Create logs directory
mkdir -p logs

# 4. Test scripts manually
node jobs/runHardDelete.js
node jobs/runInactivityDeletion.js

# 5. Find Node.js path
which node
# Output: /usr/bin/node

# 6. Configure crontab
crontab -e

# 7. Add entries (replace paths with actual values)
0 * * * * cd /home/deploy/xahpayroll/backend && /usr/bin/node jobs/runHardDelete.js >> logs/hard-delete.log 2>&1
0 2 * * * cd /home/deploy/xahpayroll/backend && /usr/bin/node jobs/runInactivityDeletion.js >> logs/inactivity-deletion.log 2>&1

# 8. Save and exit (:wq in vim)

# 9. Verify crontab
crontab -l

# 10. Monitor logs
tail -f logs/hard-delete.log
```

---

## Migration from setInterval

### What Changed

**Before** (server.js):
```javascript
const { startHardDeleteJob } = require('./jobs/hardDelete')
const hardDeleteJobId = startHardDeleteJob()
```

**After** (server.js):
```javascript
// NOTE: Scheduled jobs now run via system cron
// See: backend/jobs/runHardDelete.js and DOCUMENTS/backend/CRON_SETUP.md
```

### Benefits

- ✅ Jobs run even if server crashes
- ✅ Independent scaling (server can restart without affecting jobs)
- ✅ Standard production practice
- ✅ Better monitoring and logging
- ✅ Guaranteed execution timing

### Rollback (If Needed)

If you need to rollback to server-based jobs:

1. Uncomment imports in `server.js`:
```javascript
const { startHardDeleteJob } = require('./jobs/hardDelete')
const { startInactivityDeletionJob } = require('./jobs/inactivityDeletion')
```

2. Uncomment job initialization:
```javascript
const hardDeleteJobId = startHardDeleteJob()
const inactivityDeleteJobId = startInactivityDeletionJob()
```

3. Remove cron jobs:
```bash
crontab -e  # Delete job entries
```

---

## Additional Resources

- [Crontab Guru](https://crontab.guru/) - Cron schedule expression editor
- [Cron Best Practices](https://blog.sanctum.geek.nz/cron-best-practices/)
- Worker Deletion System Docs: `backend/claudedocs/WORKER_DELETION_DEPLOYMENT_GUIDE.md`

---

## Support

For issues or questions:
1. Check logs first: `tail -f logs/*.log`
2. Verify cron is running: `crontab -l`
3. Test manually: `node jobs/runHardDelete.js`
4. Review troubleshooting section above
