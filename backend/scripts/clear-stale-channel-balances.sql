/**
 * Clear Stale Channel Balances
 *
 * Fixes Channel 4 and any similar channels where:
 * - status = 'closed'
 * - closure_tx_hash is NOT NULL (transaction succeeded)
 * - accumulated_balance > 0 (stale data)
 * - last_ledger_sync IS NULL (never verified after closure)
 *
 * These channels have already paid their workers via the closure transaction,
 * but the database was never synced to reflect this.
 */

-- Fix Channel 4 specifically (verified via ledger check on 2025-12-06)
UPDATE payment_channels
SET
  accumulated_balance = 0,
  last_ledger_sync = NOW(),
  updated_at = NOW()
WHERE id = 4
  AND channel_id = 'A798F6B1E5E47E99E1F340F5A4997919B4C26C5F6560BE85E119E9293143A29A'
  AND status = 'closed'
  AND closure_tx_hash = 'ABA67907F4552832F75AFCA10ECD6B24620991BE0068AA190D7C0B1673199546';

-- Show what was fixed
SELECT
  id,
  channel_id,
  status,
  accumulated_balance,
  closure_tx_hash,
  closed_at,
  last_ledger_sync,
  closure_reason
FROM payment_channels
WHERE id = 4;

-- Optional: Find any other channels with similar stale balance issues
-- (Run this separately if you want to check for other affected channels)
/*
SELECT
  id,
  channel_id,
  status,
  accumulated_balance,
  closure_tx_hash,
  closed_at,
  last_ledger_sync,
  closure_reason
FROM payment_channels
WHERE status = 'closed'
  AND closure_tx_hash IS NOT NULL
  AND accumulated_balance > 0
  AND last_ledger_sync IS NULL;
*/
