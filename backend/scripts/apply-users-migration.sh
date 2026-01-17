#!/bin/bash
# Apply users table migration to fix worker deletion trigger error
# Date: 2026-01-10
# Bug: record "new" has no field "updated_at"

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}XAH Payroll - Users Table Migration${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Check if migration file exists
MIGRATION_FILE="database/migrations/005_add_users_updated_at.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
  echo -e "${RED}❌ Migration file not found: $MIGRATION_FILE${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Migration file found${NC}"
echo ""

# Database connection details (use environment variables or update these)
DB_HOST="${DB_HOST:-your-production-host.pooler.supabase.com}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres.your_supabase_project_id}"
DB_NAME="${DB_NAME:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-your_production_password_here}"

echo -e "${YELLOW}Database:${NC} $DB_NAME"
echo -e "${YELLOW}Host:${NC} $DB_HOST"
echo ""

# Confirm before proceeding
read -p "Apply migration to PRODUCTION database? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo -e "${RED}❌ Migration cancelled${NC}"
  exit 0
fi

echo ""
echo -e "${YELLOW}Applying migration...${NC}"

# Apply migration
PGPASSWORD="$DB_PASSWORD" psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✅ Migration applied successfully!${NC}"
  echo ""

  # Verify columns exist
  echo -e "${YELLOW}Verifying columns...${NC}"
  PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('updated_at', 'deleted_at', 'deletion_reason', 'display_name') ORDER BY column_name;"

  echo ""
  echo -e "${YELLOW}Verifying trigger...${NC}"
  PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "SELECT trigger_name, event_manipulation FROM information_schema.triggers WHERE event_object_table = 'users' AND trigger_name = 'update_users_updated_at';"

  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}Migration Complete!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Test worker deletion in production"
  echo "2. Monitor error logs for 24 hours"
  echo "3. Update deployment documentation"
else
  echo ""
  echo -e "${RED}❌ Migration failed!${NC}"
  echo -e "${RED}Check error messages above${NC}"
  exit 1
fi
