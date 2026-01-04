#!/bin/bash

################################################################################
# XAH Payroll Database Backup Script
# Purpose: Create timestamped backup of production database before Path D migration
# Usage: ./scripts/backup-database.sh [dev|test|prod]
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database credentials (from environment or defaults)
DB_USER="${DB_USER:-xahpayroll_user}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_PASSWORD="${DB_PASSWORD:-your_database_password_here}"

# Determine environment
ENVIRONMENT="${1:-dev}"

case "$ENVIRONMENT" in
  dev)
    DB_NAME="${DB_NAME:-xahpayroll_dev}"
    ;;
  test)
    DB_NAME="${DB_NAME:-xahpayroll_test}"
    ;;
  prod)
    DB_NAME="${DB_NAME:-xahpayroll}"
    ;;
  *)
    echo "❌ ERROR: Invalid environment. Use: dev, test, or prod"
    exit 1
    ;;
esac

# Backup file paths
BACKUP_FILE="$BACKUP_DIR/xahpayroll_pre_pathd_${ENVIRONMENT}_${TIMESTAMP}.sql"
BACKUP_CUSTOM="$BACKUP_DIR/xahpayroll_pre_pathd_${ENVIRONMENT}_${TIMESTAMP}.dump"
BACKUP_LOG="$BACKUP_DIR/backup_${ENVIRONMENT}_${TIMESTAMP}.log"

################################################################################
# Functions
################################################################################

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$BACKUP_LOG"
}

error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ ERROR: $1" | tee -a "$BACKUP_LOG" >&2
  exit 1
}

success() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1" | tee -a "$BACKUP_LOG"
}

################################################################################
# Pre-flight Checks
################################################################################

log "🚀 Starting database backup process..."
log "Environment: $ENVIRONMENT"
log "Database: $DB_NAME"
log "Backup Directory: $BACKUP_DIR"

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# Check PostgreSQL client is installed
if ! command -v pg_dump &> /dev/null; then
  error "pg_dump not found. Please install PostgreSQL client tools."
fi

if ! command -v psql &> /dev/null; then
  error "psql not found. Please install PostgreSQL client tools."
fi

# Test database connection
log "Testing database connection..."
if ! PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
  error "Cannot connect to database. Check credentials and connection settings."
fi
success "Database connection successful"

################################################################################
# Create SQL Dump (Human-Readable)
################################################################################

log "Creating SQL dump (plain text format)..."
if PGPASSWORD="$DB_PASSWORD" pg_dump \
  -U "$DB_USER" \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -d "$DB_NAME" \
  --format=plain \
  --no-owner \
  --no-acl \
  --verbose \
  --file="$BACKUP_FILE" \
  2>> "$BACKUP_LOG"; then

  success "SQL dump created: $BACKUP_FILE"

  # Get file size
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log "Backup size: $BACKUP_SIZE"
else
  error "Failed to create SQL dump"
fi

################################################################################
# Create Custom Format Dump (For Fast Restore)
################################################################################

log "Creating custom format dump (for pg_restore)..."
if PGPASSWORD="$DB_PASSWORD" pg_dump \
  -U "$DB_USER" \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -d "$DB_NAME" \
  --format=custom \
  --compress=9 \
  --verbose \
  --file="$BACKUP_CUSTOM" \
  2>> "$BACKUP_LOG"; then

  success "Custom dump created: $BACKUP_CUSTOM"

  # Get file size
  CUSTOM_SIZE=$(du -h "$BACKUP_CUSTOM" | cut -f1)
  log "Compressed backup size: $CUSTOM_SIZE"
else
  error "Failed to create custom dump"
fi

################################################################################
# Capture Database Statistics
################################################################################

log "Capturing database statistics..."
STATS_FILE="$BACKUP_DIR/database_stats_${ENVIRONMENT}_${TIMESTAMP}.txt"

{
  echo "========================================"
  echo "Database Statistics - $DB_NAME"
  echo "Timestamp: $(date)"
  echo "========================================"
  echo ""

  echo "📊 Table Counts:"
  PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "
    SELECT
      schemaname,
      tablename,
      n_live_tup as row_count
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC;
  "

  echo ""
  echo "💾 Database Size:"
  PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "
    SELECT
      pg_size_pretty(pg_database_size('$DB_NAME')) as database_size;
  "

  echo ""
  echo "📋 Payment Channels Baseline:"
  PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "
    SELECT
      COUNT(*) as total_channels,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_channels,
      COUNT(CASE WHEN status = 'closing' THEN 1 END) as closing_channels,
      COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_channels,
      SUM(accumulated_balance) as total_accumulated,
      MAX(accumulated_balance) as max_balance
    FROM payment_channels;
  "

} > "$STATS_FILE" 2>&1

success "Statistics saved: $STATS_FILE"

################################################################################
# Create Backup Manifest
################################################################################

log "Creating backup manifest..."
MANIFEST_FILE="$BACKUP_DIR/BACKUP_MANIFEST_${ENVIRONMENT}_${TIMESTAMP}.md"

cat > "$MANIFEST_FILE" << EOF
# Database Backup Manifest

**Environment**: $ENVIRONMENT
**Database**: $DB_NAME
**Timestamp**: $(date)
**Backup Version**: pre_pathd

---

## Backup Files

### SQL Dump (Plain Text)
- **File**: $(basename "$BACKUP_FILE")
- **Size**: $BACKUP_SIZE
- **Format**: Plain SQL
- **Use Case**: Human-readable, can be edited, slower restore
- **Restore Command**:
  \`\`\`bash
  PGPASSWORD='$DB_PASSWORD' psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -f $BACKUP_FILE
  \`\`\`

### Custom Dump (Compressed)
- **File**: $(basename "$BACKUP_CUSTOM")
- **Size**: $CUSTOM_SIZE
- **Format**: PostgreSQL custom format (compressed)
- **Use Case**: Fast restore, parallel restore, selective restore
- **Restore Command**:
  \`\`\`bash
  PGPASSWORD='$DB_PASSWORD' pg_restore -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME --clean --if-exists $BACKUP_CUSTOM
  \`\`\`

### Statistics File
- **File**: $(basename "$STATS_FILE")
- **Purpose**: Baseline metrics for post-migration validation

---

## Database Statistics Summary

$(PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "
SELECT
  'Total Payment Channels: ' || COUNT(*) || E'\n' ||
  'Active Channels: ' || COUNT(CASE WHEN status = 'active' THEN 1 END) || E'\n' ||
  'Total Accumulated Balance: ' || COALESCE(SUM(accumulated_balance), 0) || ' XAH' || E'\n' ||
  'Max Channel Balance: ' || COALESCE(MAX(accumulated_balance), 0) || ' XAH'
FROM payment_channels;
")

---

## Verification Checklist

- [ ] Backup files created successfully
- [ ] Backup integrity verified (restore test on dev)
- [ ] Statistics baseline captured
- [ ] Backup stored in secure location
- [ ] Backup manifest reviewed
- [ ] Team notified of backup completion

---

## Next Steps

1. **Verify Backup Integrity**: Run restore test on dev environment
2. **Secure Storage**: Move backups to secure location (AWS S3, external drive, etc.)
3. **Document Baseline**: Review statistics for post-migration comparison
4. **Proceed with Migration**: Ready to execute Phase 2 (Database Migration)

---

**Generated by**: backup-database.sh
**Backup Log**: $(basename "$BACKUP_LOG")
EOF

success "Manifest created: $MANIFEST_FILE"

################################################################################
# Final Summary
################################################################################

echo ""
echo "========================================"
echo "✅ BACKUP COMPLETED SUCCESSFULLY"
echo "========================================"
echo ""
echo "📂 Backup Files Created:"
echo "  - SQL Dump: $BACKUP_FILE ($BACKUP_SIZE)"
echo "  - Custom Dump: $BACKUP_CUSTOM ($CUSTOM_SIZE)"
echo "  - Statistics: $STATS_FILE"
echo "  - Manifest: $MANIFEST_FILE"
echo "  - Log: $BACKUP_LOG"
echo ""
echo "📋 Next Steps:"
echo "  1. Verify backup integrity (see manifest for restore commands)"
echo "  2. Store backups in secure location"
echo "  3. Review database statistics baseline"
echo "  4. Update PATH_D_IMPLEMENTATION_CHECKLIST.md (Phase 1.1 complete)"
echo ""
echo "⚠️  IMPORTANT: Test restore on dev environment before proceeding with migration!"
echo ""

log "🎉 Backup process completed successfully"
exit 0
