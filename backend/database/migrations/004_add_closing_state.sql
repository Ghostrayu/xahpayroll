-- Migration: Add 'closing' state to payment_channels
-- Date: 2025-11-28
-- Description: Add 'closing' intermediate state for post-transaction validation
--
-- Context: Prevent database-ledger mismatches by introducing validation state
-- between user-initiated closure and confirmed ledger closure
--
-- Status flow:
-- - active → closing (user initiates, XRPL transaction submitted)
-- - closing → closed (ledger validation confirmed)
-- - closing → active (validation failed, rollback)

-- Drop existing constraint
ALTER TABLE payment_channels
  DROP CONSTRAINT IF EXISTS payment_channels_status_check;

-- Add new constraint with 'closing' state
ALTER TABLE payment_channels
  ADD CONSTRAINT payment_channels_status_check
  CHECK (status IN ('active', 'closing', 'closed'));

-- Add validation tracking columns
ALTER TABLE payment_channels
  ADD COLUMN IF NOT EXISTS validation_attempts INTEGER DEFAULT 0;

ALTER TABLE payment_channels
  ADD COLUMN IF NOT EXISTS last_validation_at TIMESTAMP;

-- Add comments
COMMENT ON COLUMN payment_channels.status IS 'Channel status: active (operating), closing (pending validation), closed (confirmed)';
COMMENT ON COLUMN payment_channels.validation_attempts IS 'Number of times channel closure was attempted to be validated';
COMMENT ON COLUMN payment_channels.last_validation_at IS 'Timestamp of last validation check against ledger';

-- Create index for validation monitoring
CREATE INDEX IF NOT EXISTS idx_payment_channels_closing_state
  ON payment_channels(status, last_validation_at)
  WHERE status = 'closing';

-- Grant permissions
GRANT ALL PRIVILEGES ON payment_channels TO xahpayroll_user;
