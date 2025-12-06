-- Migration 008: Add Ledger Sync Tracking
-- Purpose: Track when payment channels were last synced with XAH Ledger for real-time balance updates
-- Date: 2025-12-06

-- Add last_ledger_sync column to payment_channels table
-- This tracks when channel data was last synced from the Xahau ledger
-- Used for rate limiting sync operations and showing "SYNCED" status in UI
ALTER TABLE payment_channels
ADD COLUMN IF NOT EXISTS last_ledger_sync TIMESTAMP DEFAULT NULL;

-- Add index for efficient queries filtering by last sync time
CREATE INDEX IF NOT EXISTS idx_payment_channels_last_sync
ON payment_channels(last_ledger_sync DESC)
WHERE status = 'active';

-- Add comment documenting the column
COMMENT ON COLUMN payment_channels.last_ledger_sync IS
'Timestamp when channel balance was last synced from XAH Ledger. NULL = never synced. Used for rate limiting and UI status display.';
