#!/bin/bash

# Script to run migration 007 as the table owner (iranrayu)
# This is required because work_sessions table is owned by iranrayu, not xahpayroll_user

echo "📦 Running migration: 007_add_per_channel_timers.sql AS TABLE OWNER"
echo "================================================"
echo ""
echo "⚠️  This requires your PostgreSQL password for user 'iranrayu'"
echo ""

# Run migration as iranrayu (table owner)
psql -U iranrayu -d xahpayroll_dev -f database/migrations/007_add_per_channel_timers.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "================================================"
    echo "✅ Migration completed successfully!"
    echo "================================================"
else
    echo ""
    echo "❌ Migration failed"
    echo "Please check the error messages above"
    exit 1
fi
