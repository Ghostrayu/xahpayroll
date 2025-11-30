#!/bin/bash

# Script to run migration 007_add_per_channel_timers.sql
# This requires database superuser privileges

echo "📦 Running migration: 007_add_per_channel_timers.sql"
echo "================================================"
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Run migration
psql $DATABASE_URL -f database/migrations/007_add_per_channel_timers.sql

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
