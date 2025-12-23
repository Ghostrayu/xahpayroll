# Database Backup Procedure

**Project**: XAH Payroll - Path D Implementation
**Purpose**: Safe database backup and verification before migration
**Last Updated**: 2025-12-22

---

## 📋 Overview

This document provides step-by-step instructions for backing up the XAH Payroll database before executing the Path D (Two-Field Balance System) migration.

**Why Backup?**
- **Safety**: Rollback capability if migration fails
- **Compliance**: Audit trail for database changes
- **Verification**: Baseline for post-migration validation

---

## 🚀 Quick Start

```bash
# 1. Make scripts executable
chmod +x scripts/backup-database.sh
chmod +x scripts/verify-backup.sh

# 2. Run backup (development environment)
./scripts/backup-database.sh dev

# 3. Verify backup integrity
./scripts/verify-backup.sh backups/xahpayroll_pre_pathd_dev_YYYYMMDD_HHMMSS.sql sql

# 4. Review backup manifest
cat backups/BACKUP_MANIFEST_dev_YYYYMMDD_HHMMSS.md
```

---

## 📂 Backup Script Features

### `backup-database.sh`

**Purpose**: Create comprehensive database backup with verification

**Features**:
- ✅ Timestamped backups (prevents overwrites)
- ✅ Two formats: SQL (human-readable) + Custom (compressed)
- ✅ Database statistics baseline
- ✅ Automatic manifest generation
- ✅ Connection validation before backup
- ✅ Detailed logging

**Usage**:
```bash
./scripts/backup-database.sh [dev|test|prod]
```

**Output Files**:
```
backups/
├── xahpayroll_pre_pathd_dev_20251222_143022.sql      # Plain SQL dump
├── xahpayroll_pre_pathd_dev_20251222_143022.dump     # Compressed custom dump
├── database_stats_dev_20251222_143022.txt            # Statistics baseline
├── BACKUP_MANIFEST_dev_20251222_143022.md            # Backup summary
└── backup_dev_20251222_143022.log                    # Execution log
```

---

## ✅ Verification Script Features

### `verify-backup.sh`

**Purpose**: Verify backup integrity by test restore

**Features**:
- ✅ Creates temporary test database
- ✅ Restores backup to test environment
- ✅ Validates table structure and data
- ✅ Compares row counts and statistics
- ✅ Auto-cleanup after verification

**Usage**:
```bash
# Verify SQL dump
./scripts/verify-backup.sh backups/xahpayroll_pre_pathd_dev_YYYYMMDD_HHMMSS.sql sql

# Verify custom dump
./scripts/verify-backup.sh backups/xahpayroll_pre_pathd_dev_YYYYMMDD_HHMMSS.dump custom
```

**What It Checks**:
- All required tables exist (users, organizations, payment_channels, etc.)
- Data is accessible (sample queries work)
- Row counts match expectations
- No restore errors or corruption

---

## 🔧 Step-by-Step Backup Procedure

### Phase 1: Preparation

1. **Set Environment Variables** (if not using defaults):
   ```bash
   export DB_USER="xahpayroll_user"
   export DB_PASSWORD="xahpayroll_secure_2024"
   export DB_HOST="localhost"
   export DB_PORT="5432"
   export DB_NAME="xahpayroll_dev"  # or xahpayroll for prod
   ```

2. **Make Scripts Executable**:
   ```bash
   chmod +x scripts/backup-database.sh
   chmod +x scripts/verify-backup.sh
   ```

3. **Verify PostgreSQL Client Tools Installed**:
   ```bash
   which pg_dump
   which pg_restore
   which psql
   ```

### Phase 2: Execute Backup

1. **Run Backup Script**:
   ```bash
   # Development environment
   ./scripts/backup-database.sh dev

   # Production environment (use with caution)
   ./scripts/backup-database.sh prod
   ```

2. **Review Backup Output**:
   - Check for "✅ BACKUP COMPLETED SUCCESSFULLY" message
   - Note file sizes and paths
   - Review any warnings in the log

3. **Verify Files Created**:
   ```bash
   ls -lh backups/
   ```

   Expected output:
   ```
   -rw-r--r--  xahpayroll_pre_pathd_dev_20251222_143022.sql   (5-50 MB)
   -rw-r--r--  xahpayroll_pre_pathd_dev_20251222_143022.dump  (1-10 MB, compressed)
   -rw-r--r--  database_stats_dev_20251222_143022.txt         (5-20 KB)
   -rw-r--r--  BACKUP_MANIFEST_dev_20251222_143022.md         (2-5 KB)
   ```

### Phase 3: Verify Backup Integrity

1. **Run Verification Script**:
   ```bash
   # Find your backup file
   BACKUP_FILE=$(ls -t backups/xahpayroll_pre_pathd_dev_*.sql | head -1)

   # Verify
   ./scripts/verify-backup.sh "$BACKUP_FILE" sql
   ```

2. **Review Verification Output**:
   - Check for "✅ BACKUP VERIFICATION SUCCESSFUL" message
   - Review row counts match expectations
   - Confirm all tables present

3. **Review Database Statistics Baseline**:
   ```bash
   # Find your stats file
   STATS_FILE=$(ls -t backups/database_stats_dev_*.txt | head -1)

   # Review
   cat "$STATS_FILE"
   ```

### Phase 4: Secure Storage

1. **Copy Backups to Secure Location**:
   ```bash
   # Example: Copy to external drive
   cp -r backups/ /Volumes/ExternalBackup/xahpayroll/path_d_migration/

   # Example: Upload to AWS S3 (if configured)
   # aws s3 cp backups/ s3://xahpayroll-backups/path_d_migration/ --recursive

   # Example: Compress for storage
   tar -czf xahpayroll_backups_$(date +%Y%m%d).tar.gz backups/
   ```

2. **Verify Secure Copy**:
   ```bash
   # Check external drive
   ls -lh /Volumes/ExternalBackup/xahpayroll/path_d_migration/

   # Verify compressed archive
   tar -tzf xahpayroll_backups_$(date +%Y%m%d).tar.gz | head -20
   ```

---

## 🔄 Restore Procedures

### Quick Restore (Development)

```bash
# Restore SQL dump
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -h localhost -p 5432 -d xahpayroll_dev -f backups/xahpayroll_pre_pathd_dev_YYYYMMDD_HHMMSS.sql

# Restore custom dump (faster)
PGPASSWORD='xahpayroll_secure_2024' pg_restore -U xahpayroll_user -h localhost -p 5432 -d xahpayroll_dev --clean --if-exists backups/xahpayroll_pre_pathd_dev_YYYYMMDD_HHMMSS.dump
```

### Production Restore (Emergency)

**⚠️ CRITICAL: Only use in emergency rollback scenarios**

```bash
# 1. Stop backend services
pm2 stop backend  # or equivalent

# 2. Drop existing database
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -h localhost -p 5432 -d postgres -c "DROP DATABASE xahpayroll;"

# 3. Recreate database
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -h localhost -p 5432 -d postgres -c "CREATE DATABASE xahpayroll;"

# 4. Restore backup
PGPASSWORD='xahpayroll_secure_2024' pg_restore -U xahpayroll_user -h localhost -p 5432 -d xahpayroll --verbose backups/xahpayroll_pre_pathd_prod_YYYYMMDD_HHMMSS.dump

# 5. Verify restore
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -h localhost -p 5432 -d xahpayroll -c "SELECT COUNT(*) FROM payment_channels;"

# 6. Restart backend services
pm2 start backend
```

---

## 📊 Understanding Backup Formats

### SQL Dump (Plain Text)

**Format**: `.sql`
**Pros**:
- Human-readable, can be edited
- Standard SQL format
- Works across PostgreSQL versions

**Cons**:
- Larger file size (uncompressed)
- Slower restore process
- No parallel restore

**When to Use**:
- Debugging backup contents
- Manual inspection needed
- Cross-version compatibility required

### Custom Dump (Compressed)

**Format**: `.dump`
**Pros**:
- Compressed (smaller file size)
- Fast restore with parallel workers
- Selective restore (tables, schemas)

**Cons**:
- Binary format (not human-readable)
- PostgreSQL-specific format
- Requires pg_restore tool

**When to Use**:
- Production backups
- Fast restore required
- Large databases (> 1 GB)

---

## 🔍 Troubleshooting

### Issue: "pg_dump: command not found"

**Solution**: Install PostgreSQL client tools
```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql-client

# Verify installation
pg_dump --version
```

### Issue: "FATAL: password authentication failed"

**Solution**: Check database credentials
```bash
# Test connection
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -h localhost -p 5432 -d xahpayroll_dev -c "SELECT 1;"

# If fails, verify .env file in backend/
cat backend/.env | grep DB
```

### Issue: "permission denied" when running script

**Solution**: Make script executable
```bash
chmod +x scripts/backup-database.sh
chmod +x scripts/verify-backup.sh
```

### Issue: Backup file very large (> 500 MB)

**Solution**: Use custom dump format (compressed)
```bash
# Custom dump is already created by backup script
# Use the .dump file instead of .sql for restore
```

---

## ✅ Backup Completion Checklist

Use this checklist to verify backup is complete before proceeding with migration:

- [ ] **Backup script executed successfully** (`✅ BACKUP COMPLETED SUCCESSFULLY` message)
- [ ] **All backup files created**:
  - [ ] SQL dump (`.sql`)
  - [ ] Custom dump (`.dump`)
  - [ ] Statistics file (`.txt`)
  - [ ] Manifest file (`.md`)
  - [ ] Log file (`.log`)
- [ ] **Backup integrity verified** (`verify-backup.sh` passed)
- [ ] **Statistics baseline reviewed** (row counts, table sizes documented)
- [ ] **Backups stored securely** (external drive, S3, or other secure location)
- [ ] **Manifest reviewed** (restore commands tested and understood)
- [ ] **Team notified** (backup completion communicated to stakeholders)

**Only proceed with Path D migration after ALL items checked ✅**

---

## 📞 Support

**Backup Issues**: Check logs in `backups/backup_*_YYYYMMDD_HHMMSS.log`
**Restore Issues**: Review PostgreSQL error messages for specific failure reasons
**Questions**: Refer to PostgreSQL documentation: https://www.postgresql.org/docs/current/backup-dump.html

---

**Document Version**: 1.0
**Last Updated**: 2025-12-22
**Next Review**: After successful Path D deployment
