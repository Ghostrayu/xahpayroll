-- Migration: Create worker_notifications table for closure requests and alerts
-- Date: 2025-11-28
-- Purpose: Enable NGO to request immediate channel closure from workers

-- Create worker_notifications table
CREATE TABLE IF NOT EXISTS worker_notifications (
  id SERIAL PRIMARY KEY,
  worker_wallet_address VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL,
  channel_id VARCHAR(64),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP,

  -- For closure request tracking
  closure_approved BOOLEAN DEFAULT FALSE,
  closure_approved_at TIMESTAMP,
  closure_tx_hash VARCHAR(64),

  -- Metadata
  ngo_wallet_address VARCHAR(50),
  job_name VARCHAR(255)
);

-- Create indexes for performance
CREATE INDEX idx_worker_notifications_wallet_unread
ON worker_notifications(worker_wallet_address, is_read)
WHERE is_read = FALSE;

CREATE INDEX idx_worker_notifications_channel
ON worker_notifications(channel_id)
WHERE channel_id IS NOT NULL;

CREATE INDEX idx_worker_notifications_type
ON worker_notifications(type, created_at DESC);

-- Add comments
COMMENT ON TABLE worker_notifications IS
'Notifications for workers including closure requests from NGOs';

COMMENT ON COLUMN worker_notifications.type IS
'Notification type: closure_request, payment_received, channel_created, etc.';

COMMENT ON COLUMN worker_notifications.closure_approved IS
'TRUE if worker approved the closure request (only for closure_request type)';
