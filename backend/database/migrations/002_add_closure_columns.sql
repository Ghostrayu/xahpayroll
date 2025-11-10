-- Migration: Add closure tracking columns to payment_channels
-- Date: 2025-11-09
-- Description: Add columns for tracking payment channel closures

-- Add closure tracking columns if they don't exist
DO $$
BEGIN
  -- Add closure_tx_hash column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_channels'
    AND column_name = 'closure_tx_hash'
  ) THEN
    ALTER TABLE payment_channels
    ADD COLUMN closure_tx_hash VARCHAR(128);
  END IF;

  -- Add closed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_channels'
    AND column_name = 'closed_at'
  ) THEN
    ALTER TABLE payment_channels
    ADD COLUMN closed_at TIMESTAMP;
  END IF;

  -- Add closure_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_channels'
    AND column_name = 'closure_reason'
  ) THEN
    ALTER TABLE payment_channels
    ADD COLUMN closure_reason VARCHAR(50);
  END IF;
END $$;

-- Add comments for the new columns
COMMENT ON COLUMN payment_channels.closure_tx_hash IS 'Transaction hash of PaymentChannelClaim that closed the channel';
COMMENT ON COLUMN payment_channels.closed_at IS 'Timestamp when channel was closed';
COMMENT ON COLUMN payment_channels.closure_reason IS 'Reason for closure: manual, timeout, claim, expired';

-- Create index on closed_at for performance
CREATE INDEX IF NOT EXISTS idx_payment_channels_closed_at ON payment_channels(closed_at);

-- Output success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 002: Closure columns added successfully';
END $$;
