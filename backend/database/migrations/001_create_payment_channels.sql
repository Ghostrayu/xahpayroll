-- Migration: Create payment_channels table
-- Date: 2025-11-09
-- Description: Add payment_channels table for tracking XRPL payment channels

-- Create payment_channels table
CREATE TABLE IF NOT EXISTS payment_channels (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  channel_id VARCHAR(128) UNIQUE NOT NULL, -- XRPL payment channel ID
  job_name VARCHAR(255) NOT NULL,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  escrow_funded_amount DECIMAL(20, 8) NOT NULL,
  accumulated_balance DECIMAL(20, 8) DEFAULT 0,
  hours_accumulated DECIMAL(10, 2) DEFAULT 0,
  balance_update_frequency VARCHAR(20) DEFAULT 'hourly' CHECK (balance_update_frequency IN ('hourly', '30min', '15min', '5min')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  public_key VARCHAR(128),
  settle_delay INTEGER,
  cancel_after INTEGER,
  closure_tx_hash VARCHAR(128),
  closed_at TIMESTAMP,
  closure_reason VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add comments (only if table was just created)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_channels') THEN
    COMMENT ON TABLE payment_channels IS 'XRPL payment channels for hourly worker payments';
    COMMENT ON COLUMN payment_channels.channel_id IS 'Unique XRPL payment channel identifier (64-char hex)';

    -- Only comment on closure columns if they exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_channels' AND column_name = 'closure_tx_hash') THEN
      COMMENT ON COLUMN payment_channels.closure_tx_hash IS 'Transaction hash of PaymentChannelClaim that closed the channel';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_channels' AND column_name = 'closed_at') THEN
      COMMENT ON COLUMN payment_channels.closed_at IS 'Timestamp when channel was closed';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_channels' AND column_name = 'closure_reason') THEN
      COMMENT ON COLUMN payment_channels.closure_reason IS 'Reason for closure: manual, timeout, claim, expired';
    END IF;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_channels_org ON payment_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_employee ON payment_channels(employee_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_status ON payment_channels(status);
CREATE INDEX IF NOT EXISTS idx_payment_channels_channel_id ON payment_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_closed_at ON payment_channels(closed_at) WHERE closed_at IS NOT NULL;

-- Grant permissions
GRANT ALL PRIVILEGES ON payment_channels TO xahpayroll_user;
GRANT ALL PRIVILEGES ON SEQUENCE payment_channels_id_seq TO xahpayroll_user;
