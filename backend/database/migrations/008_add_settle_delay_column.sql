-- Migration 008: Add settle_delay column to payment_channels table
-- Date: 2025-12-13
-- Purpose: Store XRPL SettleDelay (claim interval) parameter for payment channels

-- Add settle_delay column (in seconds)
ALTER TABLE payment_channels
ADD COLUMN IF NOT EXISTS settle_delay INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN payment_channels.settle_delay IS 'XRPL SettleDelay parameter in seconds - time window worker must wait before closing channel unilaterally';

-- Add index for querying channels by settle delay
CREATE INDEX IF NOT EXISTS idx_payment_channels_settle_delay
ON payment_channels(settle_delay);

-- Backfill existing channels with default 24-hour settle delay (86400 seconds)
-- XRPL default is typically 24 hours (1 day)
UPDATE payment_channels
SET settle_delay = 86400
WHERE settle_delay IS NULL AND status IN ('active', 'closing');

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 008 completed: settle_delay column added to payment_channels';
  RAISE NOTICE '   - Default value (86400 seconds = 24 hours) backfilled for existing channels';
END $$;
