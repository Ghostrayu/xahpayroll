-- Migration: Add expiration_time for scheduled channel closures
-- Date: 2025-11-28
-- Purpose: Support XRPL scheduled closure behavior for source address closures

-- Add expiration_time column to payment_channels table
ALTER TABLE payment_channels
ADD COLUMN expiration_time TIMESTAMP;

-- Add comment explaining the field
COMMENT ON COLUMN payment_channels.expiration_time IS
'Scheduled expiration time for channels in closing state. Set when source address (NGO) initiates closure with tfClose flag and channel has XRP remaining. Channel will automatically close after this time according to XRPL SettleDelay specification.';

-- Add index for querying channels approaching expiration
CREATE INDEX idx_payment_channels_expiration
ON payment_channels(expiration_time)
WHERE status = 'closing' AND expiration_time IS NOT NULL;

COMMENT ON INDEX idx_payment_channels_expiration IS
'Optimize queries for finding channels approaching scheduled expiration time';
