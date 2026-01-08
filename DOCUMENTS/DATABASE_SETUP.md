# XAH PAYROLL DATABASE SETUP GUIDE

Complete step-by-step guide to set up the PostgreSQL database for XAH Payroll system.

**Current Database**: `xahpayroll_dev` (development environment)
**PostgreSQL Version**: 14+ (15 recommended)

---

## QUICK START

```bash
# 1. Install PostgreSQL 15
brew install postgresql@15  # macOS
# OR
sudo apt install postgresql postgresql-contrib  # Ubuntu/Debian

# 2. Start PostgreSQL
brew services start postgresql@15  # macOS
# OR
sudo systemctl start postgresql  # Linux

# 3. Create database and user
psql postgres
# Then run the SQL commands in Step 3 below

# 4. Configure environment
cd backend
cp .env.example .env
# Edit .env with your database credentials

# 5. Initialize schema
npm run dev  # Auto-creates tables on first run
```

---

## TABLE OF CONTENTS

1. [Prerequisites](#prerequisites)
2. [PostgreSQL Installation](#step-1-install-postgresql)
3. [Access PostgreSQL](#step-2-access-postgresql)
4. [Create Database and User](#step-3-create-database-and-user)
5. [Current Database Schema](#current-database-schema)
6. [Environment Configuration](#environment-configuration)
7. [Schema Initialization](#schema-initialization)
8. [Verification](#verification)
9. [Useful Commands](#useful-postgresql-commands)
10. [Backup and Restore](#backup-and-restore)
11. [Troubleshooting](#troubleshooting)
12. [Production Considerations](#production-considerations)

---

## PREREQUISITES

- [x] PostgreSQL 14+ installed (15 recommended)
- [x] Command line access (Terminal/PowerShell)
- [x] Admin/superuser access to PostgreSQL
- [x] Node.js 18+ for backend application

---

## STEP 1: INSTALL POSTGRESQL

### macOS (Homebrew)

```bash
# Install PostgreSQL 15
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15

# Verify installation
psql --version
# Expected: psql (PostgreSQL) 15.x
```

### Ubuntu/Debian

```bash
# Update package index
sudo apt update

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
psql --version
```

### Windows

1. Download PostgreSQL installer from https://www.postgresql.org/download/windows/
2. Run the installer and follow the setup wizard
3. Remember the password you set for the `postgres` user
4. Add PostgreSQL `bin` directory to PATH

---

## STEP 2: ACCESS POSTGRESQL

Connect to PostgreSQL as superuser:

```bash
# macOS/Linux
psql postgres

# Or with sudo (Linux)
sudo -u postgres psql

# Windows (PowerShell)
psql -U postgres
```

You should see the PostgreSQL prompt:
```
postgres=#
```

---

## STEP 3: CREATE DATABASE AND USER

Run these SQL commands in the PostgreSQL prompt:

```sql
-- Create the database
CREATE DATABASE xahpayroll_dev;

-- Create a dedicated user with secure password
-- ⚠️ IMPORTANT: Replace 'xahpayroll_secure_2024' with your own secure password!
CREATE USER xahpayroll_user WITH ENCRYPTED PASSWORD 'xahpayroll_secure_2024';

-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON DATABASE xahpayroll_dev TO xahpayroll_user;

-- Connect to the new database
\c xahpayroll_dev

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO xahpayroll_user;

-- Grant future table privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO xahpayroll_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO xahpayroll_user;

-- Exit PostgreSQL
\q
```

**Test Connection**:
```bash
psql -U xahpayroll_user -d xahpayroll_dev -h localhost
# Enter password when prompted
# You should see: xahpayroll_dev=>
```

**Generate Secure Password**:
```bash
openssl rand -base64 32
```

---

## CURRENT DATABASE SCHEMA

**Canonical Source**: `backend/database/schema.sql` (production-ready schema used by `npm run init-db`)

The XAH Payroll database consists of **13 tables** with the following structure:

### Core Tables

#### 1. **users** - User accounts
- Stores wallet addresses and user types (employee, ngo, employer)
- Primary authentication table
- Links to organizations, employees, and sessions

#### 2. **organizations** - NGO/Employer entities
- Organization details and escrow wallet addresses
- Linked to users table via `user_id`
- Tracks total workers and escrow balance

#### 3. **employees** - Workers employed by organizations
- Links workers to organizations
- Supports multi-organization workers (same wallet, multiple employers)
- Stores hourly rates and employment status

#### 4. **payment_channels** - XRPL payment channels ⭐ **PRIMARY FEATURE**
- Tracks XRP/XAH payment channels between NGOs and workers
- **New fields (Path D - Two-Field Balance System)**:
  - `off_chain_accumulated_balance` - Worker earnings (source of truth for payments)
  - `on_chain_balance` - XRPL ledger Balance field (read-only sync data)
  - `legacy_accumulated_balance` - Original field (backup for rollback)
- **Channel lifecycle**: active → closing → closed
- **CancelAfter support**: Automatic channel closure after specified time
- **SettleDelay**: Worker protection period during channel closure

### Work & Payment Tables

#### 5. **work_sessions** - Clock in/out tracking
- Tracks individual work shifts
- Links to payment channels for per-channel work tracking
- Calculates hours worked and earnings

#### 6. **payments** - Payment transaction records
- Audit trail of all payments from escrow to workers
- Stores transaction hashes and payment status
- Links to work sessions and payment channels

#### 7. **escrow_transactions** - Escrow account movements
- Tracks deposits, withdrawals, payments, refunds
- Maintains balance history for organizations

### Configuration Tables

#### 8. **payment_configurations** - Payment rules per organization
- Timeout thresholds and payment frequency
- Auto-payment settings and approval requirements

#### 9. **sessions** - Authentication sessions
- User session tokens and expiration
- Session management for authenticated users

### Notification & Logging Tables

#### 10. **notifications** - User notifications
- General notifications for important events
- Read/unread status tracking

#### 11. **ngo_notifications** - NGO-specific notifications
- Notifications for NGO/employer users
- Worker-related events and alerts

#### 12. **activity_logs** - Audit trail
- Tracks all user actions in the system
- IP addresses, user agents, and metadata

#### 13. **deletion_logs** - User deletion tracking
- Records of deleted user profiles
- GDPR compliance and data retention

---

## KEY SCHEMA FEATURES

### Path D: Two-Field Balance System (Implemented 2025-12-23)

**Problem Solved**: Ledger sync was overwriting worker earnings with on-chain Balance (always 0 for off-chain work).

**Solution**: Separate balance fields in `payment_channels` table:

```sql
-- Worker earnings (source of truth for payment calculations)
off_chain_accumulated_balance DECIMAL(20,8) NOT NULL DEFAULT 0

-- XRPL ledger Balance field (read-only sync data)
on_chain_balance DECIMAL(20,8) NOT NULL DEFAULT 0

-- Original field (backup for rollback)
legacy_accumulated_balance DECIMAL(20,8) DEFAULT 0
```

**Flow**:
1. **Clock-out**: Updates `off_chain_accumulated_balance` (+hours * rate)
2. **Ledger sync**: Updates `on_chain_balance` ONLY (never touches off-chain balance)
3. **Channel closure**: Reads `off_chain_accumulated_balance` for final payment
4. **Closure confirmation**: Clears `off_chain_accumulated_balance = 0`

### Payment Channel Lifecycle

```
1. ACTIVE
   ├── NGO creates channel with escrow funding
   ├── Worker clocks in/out → off_chain_accumulated_balance increases
   └── Periodic ledger sync → on_chain_balance updated (monitoring only)

2. CLOSING (SettleDelay period - 24+ hours)
   ├── NGO or Worker initiates closure (PaymentChannelClaim)
   ├── Worker has SettleDelay to claim accumulated balance
   └── Channel status = 'closing', expiration_time set

3. EXPIRED (After SettleDelay)
   ├── Channel ready for finalization
   ├── Either party can finalize with final PaymentChannelClaim
   └── Worker should finalize to protect their balance

4. CLOSED
   ├── Final payment sent to worker (off_chain_accumulated_balance)
   ├── Unused escrow returned to NGO (automatic)
   ├── Database: off_chain_accumulated_balance = 0, status = 'closed'
   └── Transaction hash stored in closure_tx_hash
```

### CancelAfter Feature (Implemented 2025-12-28)

**Purpose**: Automatic channel expiration after specified time (e.g., 24 hours).

**Implementation**:
- `cancel_after` field stores ledger time for automatic expiration
- When CancelAfter expires, channel can be force-closed by anyone
- Protects NGOs from worker abandonment (channel funds locked indefinitely)

**Default**: 24 hours from channel creation (86400 seconds)

---

## ENVIRONMENT CONFIGURATION

### 1. Copy Environment Template

```bash
cd backend
cp .env.example .env
```

### 2. Edit .env File

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=xahpayroll_dev
DB_USER=xahpayroll_user
DB_PASSWORD=xahpayroll_secure_2024  # ⚠️ Change this!

# Database URL (alternative format)
DATABASE_URL=postgresql://xahpayroll_user:xahpayroll_secure_2024@localhost:5432/xahpayroll_dev

# Connection Pool Settings
DB_POOL_MIN=2
DB_POOL_MAX=10

# XRPL Network Configuration
XRPL_NETWORK=testnet  # or mainnet
XAHAU_WSS_URL=wss://xahau-test.net  # Auto-selected based on network

# Server Configuration
PORT=3001
NODE_ENV=development
```

**Security Note**: Never commit `.env` files to version control! The `.gitignore` file already excludes them.

---

## SCHEMA INITIALIZATION

The database schema is automatically created when you start the backend server for the first time.

### Auto-Initialization Process

```bash
cd backend
npm run dev
```

The server will:
1. Check if the `users` table exists
2. If not found, execute all migration scripts in order:
   - `001_create_payment_channels.sql`
   - `002_add_worker_deletion_support.sql`
   - `003_add_ledger_sync_tracking.sql`
   - `004_add_settle_delay.sql`
   - `005_add_cancel_after.sql`
   - `006_two_field_balance_system.sql`
3. Create indexes and triggers
4. Grant necessary permissions

**Expected Output**:
```
🔄 Initializing database...
📋 Running migration: 001_create_payment_channels.sql
📋 Running migration: 002_add_worker_deletion_support.sql
📋 Running migration: 003_add_ledger_sync_tracking.sql
📋 Running migration: 004_add_settle_delay.sql
📋 Running migration: 005_add_cancel_after.sql
📋 Running migration: 006_two_field_balance_system.sql
✅ All migrations completed successfully
✅ Connected to PostgreSQL database
🚀 XAH Payroll Backend running on port 3001
💾 Database: xahpayroll_dev on localhost
```

### Manual Schema Creation (Optional)

If you need to manually create the schema:

```bash
cd backend
psql -U xahpayroll_user -d xahpayroll_dev -h localhost < database/migrations/001_create_payment_channels.sql
psql -U xahpayroll_user -d xahpayroll_dev -h localhost < database/migrations/002_add_worker_deletion_support.sql
# ... run all migrations in order
```

---

## VERIFICATION

### Check Tables Exist

```bash
psql -U xahpayroll_user -d xahpayroll_dev -h localhost
```

```sql
-- List all tables
\dt

-- Expected output: 13 tables
-- users, organizations, employees, work_sessions, payments,
-- escrow_transactions, payment_configurations, activity_logs,
-- notifications, payment_channels, deletion_logs, ngo_notifications
```

### Verify Table Structure

```sql
-- Describe payment_channels table (key table with Path D fields)
\d payment_channels

-- Check for Path D balance fields
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'payment_channels'
  AND column_name IN ('off_chain_accumulated_balance', 'on_chain_balance', 'legacy_accumulated_balance');

-- Expected: 3 rows with DECIMAL(20,8) type
```

### Test Connection from Node.js

Create `test-db.js`:

```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ DATABASE CONNECTED SUCCESSFULLY!');

    const result = await client.query('SELECT NOW()');
    console.log('Current time from DB:', result.rows[0].now);

    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('\n📋 TABLES IN DATABASE (' + tables.rows.length + ' tables):');
    tables.rows.forEach(row => console.log('  ✓', row.table_name));

    // Test Path D fields
    const pathD = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payment_channels'
        AND column_name LIKE '%balance%'
      ORDER BY column_name
    `);
    console.log('\n💰 PAYMENT CHANNEL BALANCE FIELDS:');
    pathD.rows.forEach(row => console.log('  ✓', row.column_name));

    client.release();
    await pool.end();
  } catch (err) {
    console.error('❌ DATABASE CONNECTION ERROR:', err.message);
  }
}

testConnection();
```

Run it:
```bash
npm install pg dotenv
node test-db.js
```

---

## USEFUL POSTGRESQL COMMANDS

### Connection & Navigation

```sql
-- Connect to database
\c xahpayroll_dev

-- List all databases
\l

-- List all tables
\dt

-- Describe table structure
\d payment_channels
\d users

-- List all indexes
\di

-- Quit PostgreSQL
\q
```

### Data Queries

```sql
-- Count records in each table
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL SELECT 'payment_channels', COUNT(*) FROM payment_channels
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'work_sessions', COUNT(*) FROM work_sessions;

-- View payment channels with Path D balances
SELECT
  id,
  channel_id,
  status,
  off_chain_accumulated_balance,
  on_chain_balance,
  legacy_accumulated_balance,
  created_at
FROM payment_channels
ORDER BY created_at DESC
LIMIT 10;

-- Count users by type
SELECT user_type, COUNT(*)
FROM users
GROUP BY user_type;

-- View active payment channels
SELECT
  pc.id,
  o.organization_name,
  e.full_name as worker_name,
  pc.hourly_rate,
  pc.off_chain_accumulated_balance,
  pc.status
FROM payment_channels pc
JOIN organizations o ON pc.organization_id = o.id
JOIN employees e ON pc.employee_id = e.id
WHERE pc.status = 'active';
```

### Maintenance Queries

```sql
-- View table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check for duplicate channel IDs (should be 0)
SELECT channel_id, COUNT(*)
FROM payment_channels
GROUP BY channel_id
HAVING COUNT(*) > 1;

-- View recent activity logs
SELECT
  al.action_type,
  u.wallet_address,
  al.description,
  al.created_at
FROM activity_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.created_at DESC
LIMIT 20;
```

---

## BACKUP AND RESTORE

### Create Backup

```bash
# Full database backup (custom format - recommended)
pg_dump -U xahpayroll_user -d xahpayroll_dev -h localhost -F c -b -v -f xahpayroll_backup_$(date +%Y%m%d_%H%M%S).dump

# SQL format backup (human-readable)
pg_dump -U xahpayroll_user -d xahpayroll_dev -h localhost > xahpayroll_backup_$(date +%Y%m%d_%H%M%S).sql

# Backup single table
pg_dump -U xahpayroll_user -d xahpayroll_dev -h localhost -t payment_channels > payment_channels_backup.sql
```

### Restore from Backup

```bash
# Restore from custom format dump
pg_restore -U xahpayroll_user -d xahpayroll_dev -h localhost -v xahpayroll_backup.dump

# Restore from SQL file
psql -U xahpayroll_user -d xahpayroll_dev -h localhost < xahpayroll_backup.sql

# Restore single table
psql -U xahpayroll_user -d xahpayroll_dev -h localhost < payment_channels_backup.sql
```

### Automated Backup Script

Create `backup-db.sh`:

```bash
#!/bin/bash
BACKUP_DIR="$HOME/backups/xahpayroll"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U xahpayroll_user -d xahpayroll_dev -h localhost -F c -b -v \
  -f "$BACKUP_DIR/xahpayroll_$TIMESTAMP.dump"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "xahpayroll_*.dump" -mtime +7 -delete

echo "✅ Backup created: xahpayroll_$TIMESTAMP.dump"
```

Make executable and add to cron:
```bash
chmod +x backup-db.sh
crontab -e
# Add: 0 2 * * * /path/to/backup-db.sh  # Daily at 2 AM
```

---

## TROUBLESHOOTING

### Connection Refused

**Symptoms**: `psql: error: connection to server on socket failed`

**Solutions**:
```bash
# Check if PostgreSQL is running
# macOS
brew services list | grep postgresql

# Linux
sudo systemctl status postgresql

# Start if not running
brew services start postgresql@15  # macOS
sudo systemctl start postgresql    # Linux

# Check port 5432 is open
lsof -i :5432
```

### Password Authentication Failed

**Symptoms**: `psql: error: FATAL: password authentication failed for user "xahpayroll_user"`

**Solutions**:
```bash
# 1. Verify password in .env matches PostgreSQL
cat backend/.env | grep DB_PASSWORD

# 2. Reset password
psql postgres
ALTER USER xahpayroll_user WITH PASSWORD 'new_secure_password';
\q

# 3. Update .env with new password

# 4. Check pg_hba.conf authentication method
# macOS: /usr/local/var/postgresql@15/pg_hba.conf
# Linux: /etc/postgresql/15/main/pg_hba.conf
# Ensure line: host all all 127.0.0.1/32 md5
```

### Permission Denied

**Symptoms**: `ERROR: permission denied for schema public`

**Solutions**:
```sql
-- Connect as superuser
psql postgres

-- Grant all privileges
\c xahpayroll_dev
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO xahpayroll_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO xahpayroll_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO xahpayroll_user;

-- For future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO xahpayroll_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO xahpayroll_user;
```

### Database "xahpayroll_dev" does not exist

**Symptoms**: `FATAL: database "xahpayroll_dev" does not exist`

**Solutions**:
```sql
-- Connect to PostgreSQL
psql postgres

-- Create database
CREATE DATABASE xahpayroll_dev;
GRANT ALL PRIVILEGES ON DATABASE xahpayroll_dev TO xahpayroll_user;

-- Verify
\l xahpayroll_dev
```

### Migration Failed

**Symptoms**: Errors during automatic migration on server start

**Solutions**:
```bash
# 1. Check migration status
psql -U xahpayroll_user -d xahpayroll_dev -h localhost
\dt
# If tables exist but migrations failed, may need manual intervention

# 2. View migration error logs
tail -f backend/logs/error.log

# 3. Manually run failed migration
psql -U xahpayroll_user -d xahpayroll_dev -h localhost < backend/database/migrations/006_two_field_balance_system.sql

# 4. Drop and recreate database (⚠️ CAUTION: Data loss!)
psql postgres
DROP DATABASE xahpayroll_dev;
CREATE DATABASE xahpayroll_dev;
GRANT ALL PRIVILEGES ON DATABASE xahpayroll_dev TO xahpayroll_user;
\c xahpayroll_dev
GRANT ALL ON SCHEMA public TO xahpayroll_user;
\q

# Restart server to trigger auto-migration
npm run dev
```

---

## PRODUCTION CONSIDERATIONS

### Security Best Practices

#### 1. **Strong Passwords**
```bash
# Generate secure password
openssl rand -base64 32

# Update PostgreSQL user
psql postgres
ALTER USER xahpayroll_user WITH PASSWORD 'generated_secure_password';
```

#### 2. **SSL/TLS Connections**
```env
# In production .env
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

#### 3. **Firewall Rules**
```bash
# Linux UFW
sudo ufw allow from YOUR_APP_SERVER_IP to any port 5432

# AWS Security Group
# Inbound: PostgreSQL (5432) from application security group only
```

#### 4. **Regular Security Updates**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade postgresql

# macOS
brew upgrade postgresql@15
```

### Performance Optimization

#### 1. **Connection Pooling**
Already configured in `backend/database/db.js`:
```javascript
const pool = new Pool({
  max: 20,        // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

#### 2. **Index Optimization**
```sql
-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM payment_channels WHERE status = 'active';

-- View index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Find unused indexes
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexname NOT LIKE '%_pkey';
```

#### 3. **Query Optimization**
```sql
-- Enable slow query logging
ALTER DATABASE xahpayroll_dev SET log_min_duration_statement = 1000;  -- Log queries > 1s

-- View slow queries
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

#### 4. **Regular Maintenance**
```sql
-- Analyze tables (updates statistics)
ANALYZE payment_channels;
ANALYZE users;
ANALYZE employees;

-- Vacuum tables (reclaim storage)
VACUUM ANALYZE payment_channels;

-- Full vacuum (locks table - run during maintenance window)
VACUUM FULL payment_channels;
```

### Monitoring & Alerting

#### Key Metrics to Track

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size('xahpayroll_dev'));

-- Active connections
SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'xahpayroll_dev';

-- Long-running queries
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 minutes';

-- Deadlocks
SELECT * FROM pg_stat_database WHERE datname = 'xahpayroll_dev';

-- Cache hit ratio (should be > 95%)
SELECT
  sum(heap_blks_read) as heap_read,
  sum(heap_blks_hit)  as heap_hit,
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;
```

### Scaling Strategies

#### 1. **Read Replicas**
For high-traffic production:
- Primary database for writes
- Read replicas for query load distribution
- Connection routing in application code

#### 2. **Connection Pooling (PgBouncer)**
```bash
# Install PgBouncer
sudo apt install pgbouncer

# Configure in /etc/pgbouncer/pgbouncer.ini
[databases]
xahpayroll_dev = host=localhost port=5432 dbname=xahpayroll_dev

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
```

#### 3. **Table Partitioning**
For large tables like `activity_logs`:
```sql
-- Partition by date (example for activity_logs)
CREATE TABLE activity_logs_2025_01 PARTITION OF activity_logs
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE activity_logs_2025_02 PARTITION OF activity_logs
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
```

### Managed Database Services

For production deployment, consider:

| Provider | Service | Features |
|----------|---------|----------|
| **AWS** | RDS for PostgreSQL | Automated backups, read replicas, Multi-AZ |
| **Google Cloud** | Cloud SQL | High availability, automatic failover |
| **Azure** | Database for PostgreSQL | Intelligent performance, automated tuning |
| **DigitalOcean** | Managed Databases | Simple pricing, automatic backups |
| **Heroku** | Heroku Postgres | Easy integration, dev-friendly |

**Benefits**:
- ✅ Automated backups with point-in-time recovery
- ✅ High availability with automatic failover
- ✅ Monitoring and alerting dashboards
- ✅ Easy scaling (vertical and horizontal)
- ✅ SSL/TLS encryption by default
- ✅ Patch management and updates

**Migration to Managed Service**:
1. Create managed PostgreSQL instance
2. Note connection credentials
3. Update `.env` with new DATABASE_URL
4. Migrate data: `pg_dump` → `pg_restore`
5. Test thoroughly before switching production traffic

---

## MIGRATION HISTORY

The database schema evolves through migration scripts:

1. **001_create_payment_channels.sql** - Initial payment channel schema
2. **002_add_worker_deletion_support.sql** - Worker profile deletion feature
3. **003_add_ledger_sync_tracking.sql** - Ledger synchronization tracking
4. **004_add_settle_delay.sql** - SettleDelay for worker protection
5. **005_add_cancel_after.sql** - CancelAfter for automatic channel expiration
6. **006_two_field_balance_system.sql** - Path D two-field balance system

**Latest Migration**: 006 (Path D) - 2025-12-23
**Status**: All migrations applied to `xahpayroll_dev`

---

## ADDITIONAL RESOURCES

- **PostgreSQL Documentation**: https://www.postgresql.org/docs/
- **Node.js pg Library**: https://node-postgres.com/
- **XRPL Payment Channels**: https://xrpl.org/payment-channels.html
- **Database Normalization**: https://en.wikipedia.org/wiki/Database_normalization

---

## SUPPORT

For issues specific to XAH Payroll database setup:
- Check `DOCUMENTS/QUICK_REFERENCE.md` for diagnostic commands
- Review troubleshooting section above
- Check server logs: `backend/logs/error.log`
- Open issue on GitHub: https://github.com/YOUR_REPO/issues

---

**Database Ready!** ✅ You can now start the backend server and begin development. 🚀
