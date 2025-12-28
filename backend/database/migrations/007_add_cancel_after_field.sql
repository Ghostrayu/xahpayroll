-- Migration 007: Add CancelAfter field for worker protection
-- Date: 2025-12-28
-- Purpose: Enable workers to force-close payment channels after 24 hours
--
-- XRPL CancelAfter Field:
-- - Immutable expiration timestamp (Ripple Epoch format)
-- - After expiration, workers can close without NGO signature
-- - Protects workers from indefinite fund locking
--
-- Ripple Epoch: Seconds since January 1, 2000 00:00:00 UTC
-- Conversion: Ripple Time = Unix Time - 946684800

-- ============================================
-- MIGRATION UP
-- ============================================

BEGIN;

-- Add cancel_after column to payment_channels table
ALTER TABLE payment_channels
ADD COLUMN cancel_after INTEGER;

-- Add comment explaining the field
COMMENT ON COLUMN payment_channels.cancel_after IS
'Immutable expiration timestamp in Ripple Epoch format (seconds since Jan 1, 2000 UTC). After this time, workers can unilaterally close the channel without NGO signature. NULL for legacy channels created before this migration.';

-- Create index for efficient querying of expiring channels
-- Only indexes active channels with CancelAfter set
CREATE INDEX idx_payment_channels_cancel_after
ON payment_channels (cancel_after)
WHERE status = 'active' AND cancel_after IS NOT NULL;

COMMENT ON INDEX idx_payment_channels_cancel_after IS
'Partial index for efficient queries of active channels approaching expiration. Used by dashboard warnings and cleanup jobs.';

-- Create index for worker force-close eligibility checks
-- Finds channels past their CancelAfter that workers can force-close
CREATE INDEX idx_payment_channels_force_close_eligible
ON payment_channels (employee_id, cancel_after)
WHERE status = 'active' AND cancel_after IS NOT NULL;

COMMENT ON INDEX idx_payment_channels_force_close_eligible IS
'Partial index for worker dashboard to quickly identify channels eligible for force-close.';

COMMIT;

-- ============================================
-- VALIDATION QUERIES
-- ============================================

-- Verify column was added
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'payment_channels'
  AND column_name = 'cancel_after';
-- Expected: column_name='cancel_after', data_type='integer', is_nullable='YES'

-- Verify indexes were created
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'payment_channels'
  AND indexname IN ('idx_payment_channels_cancel_after', 'idx_payment_channels_force_close_eligible');
-- Expected: 2 rows returned

-- Check existing channels (should have NULL cancel_after)
SELECT
  channel_id,
  status,
  cancel_after,
  created_at
FROM payment_channels
ORDER BY created_at DESC;
-- Expected: All existing channels have cancel_after = NULL

-- ============================================
-- EXAMPLE USAGE QUERIES
-- ============================================

-- Find channels expiring in next 24 hours (for NGO warnings)
-- Example query (replace 'current ripple time' with actual value)
SELECT
  pc.channel_id,
  pc.cancel_after,
  (pc.cancel_after + 946684800) * 1000 AS expiration_unix_ms,
  pc.off_chain_accumulated_balance,
  o.name AS organization_name,
  e.name AS worker_name
FROM payment_channels pc
JOIN organizations o ON pc.organization_id = o.organization_id
JOIN employees e ON pc.employee_id = e.employee_id
WHERE pc.status = 'active'
  AND pc.cancel_after IS NOT NULL
  AND pc.cancel_after <= EXTRACT(EPOCH FROM NOW() + INTERVAL '24 hours') - 946684800
ORDER BY pc.cancel_after ASC;

-- Find expired channels (workers can force-close)
SELECT
  pc.channel_id,
  pc.cancel_after,
  (pc.cancel_after + 946684800) * 1000 AS expiration_unix_ms,
  pc.off_chain_accumulated_balance,
  e.employee_wallet_address,
  e.name AS worker_name
FROM payment_channels pc
JOIN employees e ON pc.employee_id = e.employee_id
WHERE pc.status = 'active'
  AND pc.cancel_after IS NOT NULL
  AND pc.cancel_after <= EXTRACT(EPOCH FROM NOW()) - 946684800
ORDER BY pc.cancel_after ASC;

-- Count channels by expiration status
SELECT
  CASE
    WHEN cancel_after IS NULL THEN 'Legacy (No CancelAfter)'
    WHEN cancel_after <= EXTRACT(EPOCH FROM NOW()) - 946684800 THEN 'Expired (Can Force-Close)'
    WHEN cancel_after <= EXTRACT(EPOCH FROM NOW() + INTERVAL '24 hours') - 946684800 THEN 'Expiring Soon (<24h)'
    ELSE 'Active (>24h remaining)'
  END AS expiration_status,
  COUNT(*) AS channel_count,
  SUM(off_chain_accumulated_balance) AS total_accumulated_balance
FROM payment_channels
WHERE status = 'active'
GROUP BY expiration_status
ORDER BY
  CASE expiration_status
    WHEN 'Expired (Can Force-Close)' THEN 1
    WHEN 'Expiring Soon (<24h)' THEN 2
    WHEN 'Active (>24h remaining)' THEN 3
    WHEN 'Legacy (No CancelAfter)' THEN 4
  END;

-- ============================================
-- ROLLBACK SCRIPT
-- ============================================
-- To rollback this migration if needed:
--
-- BEGIN;
-- DROP INDEX IF EXISTS idx_payment_channels_force_close_eligible;
-- DROP INDEX IF EXISTS idx_payment_channels_cancel_after;
-- ALTER TABLE payment_channels DROP COLUMN IF EXISTS cancel_after;
-- COMMIT;

-- ============================================
-- MIGRATION METADATA
-- ============================================
-- Migration Number: 007
-- Applied: 2025-12-28
-- Description: Add CancelAfter field for worker protection (24-hour force-close)
-- Rollback Available: Yes (see above)
-- Breaking Changes: No (column is nullable, defaults to NULL)
-- Data Loss Risk: None (additive migration only)

-- ============================================
-- TESTING NOTES
-- ============================================
-- 1. Run migration on dev database
-- 2. Verify existing channels have cancel_after = NULL
-- 3. Create new channel with CancelAfter = now + 24 hours
-- 4. Query indexes to verify they're being used (EXPLAIN ANALYZE)
-- 5. Test rollback on separate dev instance before production
-- 6. Backup production database before applying migration
