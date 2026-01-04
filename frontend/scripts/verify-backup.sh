#!/bin/bash

################################################################################
# XAH Payroll Backup Verification Script
# Purpose: Verify backup integrity by restoring to test database
# Usage: ./scripts/verify-backup.sh <backup-file> [sql|custom]
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Database credentials for test environment
TEST_DB_USER="${DB_USER:-xahpayroll_user}"
TEST_DB_HOST="${DB_HOST:-localhost}"
TEST_DB_PORT="${DB_PORT:-5432}"
TEST_DB_PASSWORD="${DB_PASSWORD:-your_database_password_here}"
TEST_DB_NAME="xahpayroll_backup_verify_test"

# Backup file and format
BACKUP_FILE="${1:-}"
BACKUP_FORMAT="${2:-sql}"  # sql or custom

################################################################################
# Functions
################################################################################

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ ERROR: $1" >&2
  exit 1
}

success() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1"
}

cleanup() {
  log "🧹 Cleaning up test database..."
  PGPASSWORD="$TEST_DB_PASSWORD" psql -U "$TEST_DB_USER" -h "$TEST_DB_HOST" -p "$TEST_DB_PORT" -d postgres \
    -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" &> /dev/null || true
  log "Cleanup complete"
}

################################################################################
# Pre-flight Checks
################################################################################

log "🔍 Starting backup verification process..."

# Check arguments
if [ -z "$BACKUP_FILE" ]; then
  error "Usage: $0 <backup-file> [sql|custom]"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  error "Backup file not found: $BACKUP_FILE"
fi

# Check PostgreSQL client tools
if ! command -v psql &> /dev/null; then
  error "psql not found. Please install PostgreSQL client tools."
fi

# Check format-specific tools
if [ "$BACKUP_FORMAT" = "custom" ] && ! command -v pg_restore &> /dev/null; then
  error "pg_restore not found. Please install PostgreSQL client tools."
fi

success "Pre-flight checks passed"

# Trap cleanup on exit
trap cleanup EXIT

################################################################################
# Drop Existing Test Database (if exists)
################################################################################

log "Dropping existing test database (if exists)..."
PGPASSWORD="$TEST_DB_PASSWORD" psql -U "$TEST_DB_USER" -h "$TEST_DB_HOST" -p "$TEST_DB_PORT" -d postgres \
  -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" &> /dev/null || true

################################################################################
# Create Test Database
################################################################################

log "Creating test database: $TEST_DB_NAME..."
if ! PGPASSWORD="$TEST_DB_PASSWORD" psql -U "$TEST_DB_USER" -h "$TEST_DB_HOST" -p "$TEST_DB_PORT" -d postgres \
  -c "CREATE DATABASE $TEST_DB_NAME;" &> /dev/null; then
  error "Failed to create test database"
fi
success "Test database created"

################################################################################
# Restore Backup
################################################################################

log "Restoring backup to test database..."
log "Backup file: $BACKUP_FILE"
log "Format: $BACKUP_FORMAT"

if [ "$BACKUP_FORMAT" = "sql" ]; then
  # Restore SQL dump
  if PGPASSWORD="$TEST_DB_PASSWORD" psql -U "$TEST_DB_USER" -h "$TEST_DB_HOST" -p "$TEST_DB_PORT" -d "$TEST_DB_NAME" \
    -f "$BACKUP_FILE" &> /dev/null; then
    success "SQL backup restored successfully"
  else
    error "Failed to restore SQL backup"
  fi

elif [ "$BACKUP_FORMAT" = "custom" ]; then
  # Restore custom dump
  if PGPASSWORD="$TEST_DB_PASSWORD" pg_restore -U "$TEST_DB_USER" -h "$TEST_DB_HOST" -p "$TEST_DB_PORT" -d "$TEST_DB_NAME" \
    --verbose "$BACKUP_FILE" &> /dev/null; then
    success "Custom backup restored successfully"
  else
    error "Failed to restore custom backup"
  fi

else
  error "Invalid backup format: $BACKUP_FORMAT (use 'sql' or 'custom')"
fi

################################################################################
# Verify Restore Integrity
################################################################################

log "Verifying restore integrity..."

# Check table existence
log "Checking for required tables..."
TABLES=(
  "users"
  "organizations"
  "employees"
  "payment_channels"
  "work_sessions"
  "sessions"
)

for table in "${TABLES[@]}"; do
  if PGPASSWORD="$TEST_DB_PASSWORD" psql -U "$TEST_DB_USER" -h "$TEST_DB_HOST" -p "$TEST_DB_PORT" -d "$TEST_DB_NAME" \
    -c "SELECT 1 FROM $table LIMIT 1;" &> /dev/null; then
    log "  ✓ Table exists: $table"
  else
    error "Table missing or inaccessible: $table"
  fi
done

success "All required tables present"

# Get row counts
log "Comparing row counts..."
echo ""
echo "📊 Restored Database Statistics:"
PGPASSWORD="$TEST_DB_PASSWORD" psql -U "$TEST_DB_USER" -h "$TEST_DB_HOST" -p "$TEST_DB_PORT" -d "$TEST_DB_NAME" -c "
SELECT
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
"

echo ""
log "Checking payment_channels baseline..."
PGPASSWORD="$TEST_DB_PASSWORD" psql -U "$TEST_DB_USER" -h "$TEST_DB_HOST" -p "$TEST_DB_PORT" -d "$TEST_DB_NAME" -c "
SELECT
  COUNT(*) as total_channels,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_channels,
  SUM(accumulated_balance) as total_accumulated,
  MAX(accumulated_balance) as max_balance
FROM payment_channels;
"

# Test sample query
log "Testing sample query (payment channels with balance > 0)..."
CHANNELS_WITH_BALANCE=$(PGPASSWORD="$TEST_DB_PASSWORD" psql -U "$TEST_DB_USER" -h "$TEST_DB_HOST" -p "$TEST_DB_PORT" -d "$TEST_DB_NAME" -t -c "
SELECT COUNT(*) FROM payment_channels WHERE accumulated_balance > 0;
" | xargs)

log "Channels with balance > 0: $CHANNELS_WITH_BALANCE"

################################################################################
# Final Summary
################################################################################

echo ""
echo "========================================"
echo "✅ BACKUP VERIFICATION SUCCESSFUL"
echo "========================================"
echo ""
echo "📂 Verified Backup: $(basename "$BACKUP_FILE")"
echo "📊 Test Database: $TEST_DB_NAME"
echo "🔢 Channels with Balance: $CHANNELS_WITH_BALANCE"
echo ""
echo "✅ Backup Integrity: CONFIRMED"
echo "✅ All Tables Present: YES"
echo "✅ Data Accessible: YES"
echo ""
echo "🎉 This backup is SAFE to use for rollback if needed"
echo ""
echo "⚠️  IMPORTANT: Test database will be dropped on exit"
echo "              Re-run this script anytime to re-verify backup integrity"
echo ""

success "Backup verification completed successfully"

# Cleanup happens automatically via trap EXIT
exit 0
