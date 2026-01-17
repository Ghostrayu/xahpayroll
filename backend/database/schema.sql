-- XAH Payroll Database Schema
-- Production-ready table definitions, indexes, functions, and triggers
--
-- This file is used by init-db.js for automated database initialization
-- DO NOT include database/user creation here - those are handled separately
--
-- Schema Version: v1.2 (Production-synchronized)
-- Last updated: 2026-01-16
-- Production Source: Supabase PostgreSQL
-- Changes: See DOCUMENTS/SCHEMA_SYNC_2026_01_16.md

-- =====================================================
-- TABLE CREATION (In correct order)
-- =====================================================

-- 1. Users Table (FIRST - no dependencies)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(64) UNIQUE NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('employee', 'employer', 'ngo', 'admin')),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  profile_data JSONB,
  deleted_at TIMESTAMP DEFAULT NULL,
  deletion_reason VARCHAR(255) DEFAULT NULL,
  last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  display_name VARCHAR(255),
  organization_name VARCHAR(255),
  phone_number VARCHAR(50),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Core user accounts identified by XAH wallet addresses';
COMMENT ON COLUMN users.updated_at IS 'Timestamp of last update (auto-updated via trigger)';
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp (NULL = not deleted)';
COMMENT ON COLUMN users.deletion_reason IS 'Reason for account deletion';
COMMENT ON COLUMN users.display_name IS 'User display name (fallback for full_name)';
COMMENT ON COLUMN users.organization_name IS 'Organization name for NGO/employer users';
COMMENT ON COLUMN users.phone_number IS 'Contact phone number';
COMMENT ON COLUMN users.last_login_at IS 'Last login timestamp for inactivity tracking';

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_name VARCHAR(255) NOT NULL,
  organization_type VARCHAR(50) CHECK (organization_type IN ('ngo', 'company', 'individual')),
  registration_number VARCHAR(100),
  country VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  escrow_wallet_address VARCHAR(64) UNIQUE NOT NULL,
  escrow_balance DECIMAL(20, 8) DEFAULT 0,
  total_workers INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE organizations IS 'NGOs and employers who hire workers';

-- 3. Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  full_name VARCHAR(255),
  employee_wallet_address VARCHAR(64) NOT NULL,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'XAH',
  employment_status VARCHAR(20) DEFAULT 'active' CHECK (employment_status IN ('active', 'inactive', 'terminated')),
  hire_date DATE DEFAULT CURRENT_DATE,
  termination_date DATE,
  total_hours_worked DECIMAL(10, 2) DEFAULT 0,
  total_earnings DECIMAL(20, 8) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, employee_wallet_address)
);

COMMENT ON TABLE employees IS 'Workers employed by organizations';

-- 4. Work Sessions Table
CREATE TABLE IF NOT EXISTS work_sessions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  clock_in TIMESTAMP NOT NULL,
  clock_out TIMESTAMP,
  hours_worked DECIMAL(5, 2),
  hourly_rate DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(20, 8),
  session_status VARCHAR(20) DEFAULT 'active' CHECK (session_status IN ('active', 'completed', 'timeout', 'cancelled')),
  timeout_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  payment_channel_id INTEGER REFERENCES payment_channels(id) ON DELETE CASCADE
);

COMMENT ON TABLE work_sessions IS 'Individual work shifts with clock in/out times';

-- 5. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES work_sessions(id) ON DELETE SET NULL,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(10) DEFAULT 'XAH',
  payment_type VARCHAR(20) CHECK (payment_type IN ('hourly', 'bonus', 'adjustment', 'refund')),
  tx_hash VARCHAR(128) UNIQUE,
  from_wallet VARCHAR(64) NOT NULL,
  to_wallet VARCHAR(64) NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  payment_channel_id VARCHAR(128),
  hook_verification_hash VARCHAR(128),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'All payment transactions from escrow to workers';

-- 6. Escrow Transactions Table
CREATE TABLE IF NOT EXISTS escrow_transactions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) CHECK (transaction_type IN ('deposit', 'withdrawal', 'payment', 'refund')),
  amount DECIMAL(20, 8) NOT NULL,
  balance_before DECIMAL(20, 8) NOT NULL,
  balance_after DECIMAL(20, 8) NOT NULL,
  tx_hash VARCHAR(128),
  wallet_address VARCHAR(64),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE escrow_transactions IS 'Audit trail of all escrow account movements';

-- 7. Payment Configurations Table
CREATE TABLE IF NOT EXISTS payment_configurations (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  timeout_threshold_minutes INTEGER DEFAULT 60,
  payment_frequency_minutes INTEGER DEFAULT 60,
  auto_payment_enabled BOOLEAN DEFAULT true,
  require_manual_approval BOOLEAN DEFAULT false,
  minimum_session_minutes INTEGER DEFAULT 15,
  grace_period_minutes INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id)
);

COMMENT ON TABLE payment_configurations IS 'Customizable payment rules per organization';

-- 8. Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  description TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE activity_logs IS 'Audit trail of all user actions';

-- 9. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  action_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'User notifications for important events';

-- 10. API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  key_name VARCHAR(100),
  permissions JSONB,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE api_keys IS 'API keys for programmatic access';

-- =====================================================
-- INDEXES (Performance Optimization)
-- =====================================================

-- Users indexes
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_users_active ON users(is_active);

-- Organizations indexes
CREATE INDEX idx_organizations_user ON organizations(user_id);
CREATE INDEX idx_organizations_escrow ON organizations(escrow_wallet_address);
CREATE INDEX idx_organizations_status ON organizations(status);

-- Employees indexes
CREATE INDEX idx_employees_org ON employees(organization_id);
CREATE INDEX idx_employees_user ON employees(user_id);
CREATE INDEX idx_employees_wallet ON employees(employee_wallet_address);
CREATE INDEX idx_employees_status ON employees(employment_status);

-- Work sessions indexes
CREATE INDEX idx_sessions_employee ON work_sessions(employee_id);
CREATE INDEX idx_sessions_org ON work_sessions(organization_id);
CREATE INDEX idx_sessions_status ON work_sessions(session_status);
CREATE INDEX idx_sessions_clock_in ON work_sessions(clock_in);
CREATE INDEX idx_sessions_created ON work_sessions(created_at);
CREATE INDEX idx_work_sessions_employee_active ON work_sessions(employee_id, session_status) WHERE session_status = 'active';
CREATE INDEX idx_work_sessions_payment_channel ON work_sessions(payment_channel_id);
CREATE INDEX idx_work_sessions_status ON work_sessions(session_status) WHERE session_status = 'active';

-- Payments indexes
CREATE INDEX idx_payments_employee ON payments(employee_id);
CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_session ON payments(session_id);
CREATE INDEX idx_payments_tx ON payments(tx_hash);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_created ON payments(created_at);

-- Escrow transactions indexes
CREATE INDEX idx_escrow_org ON escrow_transactions(organization_id);
CREATE INDEX idx_escrow_type ON escrow_transactions(transaction_type);
CREATE INDEX idx_escrow_created ON escrow_transactions(created_at);

-- Activity logs indexes
CREATE INDEX idx_logs_user ON activity_logs(user_id);
CREATE INDEX idx_logs_org ON activity_logs(organization_id);
CREATE INDEX idx_logs_action ON activity_logs(action_type);
CREATE INDEX idx_logs_created ON activity_logs(created_at);

-- Notifications indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- =====================================================
-- HELPER FUNCTIONS AND TRIGGERS
-- =====================================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for auto-update
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
BEFORE UPDATE ON work_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_configs_updated_at
BEFORE UPDATE ON payment_configurations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- CRITICAL PRODUCTION TABLES (From migrations)
-- =====================================================

-- 11. Payment Channels Table (CORE FUNCTIONALITY)
-- Source: migrations/001_create_payment_channels.sql
CREATE TABLE IF NOT EXISTS payment_channels (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  channel_id VARCHAR(128) UNIQUE NOT NULL, -- XRPL payment channel ID (64-char hex)
  job_name VARCHAR(255) NOT NULL,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  escrow_funded_amount DECIMAL(20, 8) NOT NULL,
  accumulated_balance DECIMAL(20, 8) DEFAULT 0, -- Legacy balance field (kept for backward compatibility)
  hours_accumulated DECIMAL(10, 2) DEFAULT 0,
  balance_update_frequency VARCHAR(20) DEFAULT 'hourly' CHECK (balance_update_frequency IN ('hourly', '30min', '15min', '5min')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closing', 'closed')),
  public_key VARCHAR(128), -- XRPL public key for channel
  settle_delay INTEGER DEFAULT 86400, -- In seconds (24 hours default)
  cancel_after INTEGER, -- Optional cancel_after time for channel
  expiration_time TIMESTAMP, -- When settle delay period expires
  closure_initiated_at TIMESTAMP, -- When closure was initiated (for SettleDelay tracking)
  closure_tx_hash VARCHAR(128), -- Transaction hash of PaymentChannelClaim
  closed_at TIMESTAMP, -- When channel was closed
  closure_reason VARCHAR(50), -- Reason: manual, timeout, claim, expired
  last_ledger_sync TIMESTAMP, -- Last time ledger was checked for balance updates
  off_chain_accumulated_balance DECIMAL(20, 8) DEFAULT 0, -- Off-chain balance tracking (primary balance field)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  -- Additional production columns (2026-01-10)
  channel_address VARCHAR(64), -- XRPL account address for payment channel
  last_claim_amount DECIMAL(20, 8), -- Last claimed amount for reconciliation
  last_claim_date TIMESTAMP, -- When last claim was made
  legacy_accumulated_balance DECIMAL(20, 8) DEFAULT 0, -- For migrating from old balance tracking
  validation_attempts INTEGER DEFAULT 0, -- Number of ledger validation attempts
  last_validation_at TIMESTAMP, -- When channel was last validated against ledger
  max_daily_hours DECIMAL(4, 2) DEFAULT 8.00, -- Maximum hours worker can log per day
  on_chain_balance DECIMAL(20, 8) NOT NULL DEFAULT 0, -- Actual XRPL ledger balance (synced from chain)
  creation_tx_hash VARCHAR(128) -- Transaction hash of PaymentChannelCreate
);

COMMENT ON TABLE payment_channels IS 'XRPL payment channels for hourly worker payments';
COMMENT ON COLUMN payment_channels.channel_id IS 'Unique XRPL payment channel identifier (64-char hex)';
COMMENT ON COLUMN payment_channels.closure_tx_hash IS 'Transaction hash of PaymentChannelClaim that closed the channel';
COMMENT ON COLUMN payment_channels.closed_at IS 'Timestamp when channel was closed';
COMMENT ON COLUMN payment_channels.closure_reason IS 'Reason for closure: manual, timeout, claim, expired';
COMMENT ON COLUMN payment_channels.settle_delay IS 'XRPL SettleDelay in seconds (protection period for workers)';
COMMENT ON COLUMN payment_channels.expiration_time IS 'When the SettleDelay period expires (closure_initiated_at + settle_delay)';
COMMENT ON COLUMN payment_channels.creation_tx_hash IS 'Transaction hash of PaymentChannelCreate that created the channel';
COMMENT ON COLUMN payment_channels.on_chain_balance IS 'Actual XRPL ledger balance (synced from chain)';

-- Payment channels indexes
CREATE INDEX IF NOT EXISTS idx_payment_channels_org ON payment_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_employee ON payment_channels(employee_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_status ON payment_channels(status);
CREATE INDEX IF NOT EXISTS idx_payment_channels_channel_id ON payment_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_closed_at ON payment_channels(closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_channels_expiration ON payment_channels(expiration_time) WHERE expiration_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_channels_creation_tx_hash ON payment_channels(creation_tx_hash);

-- Add trigger for payment_channels auto-update
CREATE TRIGGER update_payment_channels_updated_at
BEFORE UPDATE ON payment_channels
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add constraint: balance cannot exceed escrow (PRODUCTION CRITICAL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_balance_not_exceed_escrow'
  ) THEN
    ALTER TABLE payment_channels
    ADD CONSTRAINT check_balance_not_exceed_escrow
    CHECK (off_chain_accumulated_balance <= escrow_funded_amount);
  END IF;
END $$;

-- 12. Deletion Logs Table (AUDIT TRAIL)
-- Source: migrations/003_worker_deletion.sql
CREATE TABLE IF NOT EXISTS deletion_logs (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(100) NOT NULL,
  user_type VARCHAR(50) NOT NULL,
  deleted_by VARCHAR(50) NOT NULL, -- 'self', 'ngo', 'system'
  deletion_reason VARCHAR(255),
  organizations_affected TEXT[], -- Array of organization names
  channels_closed INT DEFAULT 0,
  data_export_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hard_deleted_at TIMESTAMP DEFAULT NULL
);

COMMENT ON TABLE deletion_logs IS 'Audit trail for all worker profile deletions';

-- Deletion logs indexes
CREATE INDEX IF NOT EXISTS idx_deletion_logs_wallet ON deletion_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_deletion_logs_created_at ON deletion_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_deletion_logs_hard_deleted ON deletion_logs(hard_deleted_at) WHERE hard_deleted_at IS NOT NULL;

-- 13. NGO Notifications Table (NOTIFICATION SYSTEM)
-- Source: migrations/003_worker_deletion.sql
CREATE TABLE IF NOT EXISTS ngo_notifications (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL, -- 'worker_deleted', 'worker_removed', 'deletion_error'
  worker_wallet_address VARCHAR(100) NOT NULL,
  worker_name VARCHAR(255),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- Additional context
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ngo_notifications IS 'Notification system for NGO organizations about worker events';

-- NGO notifications indexes
CREATE INDEX IF NOT EXISTS idx_ngo_notifications_org ON ngo_notifications(organization_id, is_read);
CREATE INDEX IF NOT EXISTS idx_ngo_notifications_created_at ON ngo_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_ngo_notifications_type ON ngo_notifications(notification_type);

-- 14. Worker Notifications Table (CLOSURE REQUESTS & ALERTS)
-- Source: migrations/006_create_worker_notifications.sql
-- Date: 2025-11-28
-- Purpose: Enable NGO to request immediate channel closure from workers
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

COMMENT ON TABLE worker_notifications IS 'Notifications for workers including closure requests from NGOs';
COMMENT ON COLUMN worker_notifications.type IS 'Notification type: closure_request, payment_received, channel_created, etc.';
COMMENT ON COLUMN worker_notifications.closure_approved IS 'TRUE if worker approved the closure request (only for closure_request type)';

-- Worker notifications indexes
CREATE INDEX IF NOT EXISTS idx_worker_notifications_wallet_unread
ON worker_notifications(worker_wallet_address, is_read)
WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_worker_notifications_channel
ON worker_notifications(channel_id)
WHERE channel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_worker_notifications_type
ON worker_notifications(type, created_at DESC);

-- =====================================================
-- USER TABLE ENHANCEMENTS (Deletion tracking)
-- =====================================================
-- Source: migrations/003_worker_deletion.sql
-- Note: Core columns (deleted_at, deletion_reason, last_login_at) are now in main users table definition above
-- This section only adds indexes for those columns

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at) WHERE user_type = 'employee';

-- =====================================================
-- CHANNEL CLOSURE REQUESTS (Migration 005)
-- =====================================================
-- Source: migrations/005_channel_closure_requests.sql
-- Created: 2026-01-16
--
-- ARCHITECTURAL CHANGE:
-- Workers can NO LONGER directly close payment channels with accumulated balances.
-- This implements a request-approval workflow where:
-- 1. Workers submit closure requests
-- 2. NGOs receive notifications
-- 3. NGOs approve and execute closures
--
-- RATIONALE:
-- XRPL PaymentChannelClaim requires NGO signature when worker (destination)
-- attempts to claim accumulated balance. Without NGO's private key, workers
-- cannot generate the required Signature field, causing temBAD_SIGNATURE errors.

CREATE TABLE IF NOT EXISTS channel_closure_requests (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(128) NOT NULL REFERENCES payment_channels(channel_id) ON DELETE CASCADE,

  -- Requester details (always worker)
  requester_wallet_address VARCHAR(100) NOT NULL,
  requester_name VARCHAR(255),

  -- Channel owner details (NGO/employer)
  ngo_wallet_address VARCHAR(100) NOT NULL,
  organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,

  -- Request metadata
  accumulated_balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
  escrow_amount NUMERIC(20, 8) NOT NULL DEFAULT 0,
  job_title VARCHAR(255),

  -- Request status lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),

  -- Approval tracking
  approved_by VARCHAR(100),
  approved_at TIMESTAMP,
  rejection_reason TEXT,

  -- Completion tracking
  closure_tx_hash VARCHAR(128),
  completed_at TIMESTAMP,

  -- Metadata
  request_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE channel_closure_requests IS 'Worker-initiated payment channel closure requests requiring NGO approval';
COMMENT ON COLUMN channel_closure_requests.status IS 'pending: awaiting NGO action | approved: NGO approved, awaiting closure | rejected: NGO declined | completed: channel closed | cancelled: worker cancelled';
COMMENT ON COLUMN channel_closure_requests.accumulated_balance IS 'Worker earned balance at time of request';
COMMENT ON COLUMN channel_closure_requests.escrow_amount IS 'Total channel escrow at time of request';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_closure_requests_ngo_status ON channel_closure_requests(ngo_wallet_address, status);
CREATE INDEX IF NOT EXISTS idx_closure_requests_worker ON channel_closure_requests(requester_wallet_address, status);
CREATE INDEX IF NOT EXISTS idx_closure_requests_channel ON channel_closure_requests(channel_id, status);
CREATE INDEX IF NOT EXISTS idx_closure_requests_created_at ON channel_closure_requests(created_at DESC);

-- Triggers
CREATE OR REPLACE FUNCTION update_closure_requests_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER closure_requests_updated_at
  BEFORE UPDATE ON channel_closure_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_closure_requests_timestamp();

CREATE OR REPLACE FUNCTION notify_ngo_on_closure_request()
RETURNS TRIGGER AS $$
DECLARE
  org_id INT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'pending') THEN
    SELECT id INTO org_id FROM organizations WHERE escrow_wallet_address = NEW.ngo_wallet_address;
    IF org_id IS NOT NULL THEN
      INSERT INTO ngo_notifications (
        organization_id, notification_type, worker_wallet_address, worker_name, message, metadata
      ) VALUES (
        org_id, 'closure_requested', NEW.requester_wallet_address, NEW.requester_name,
        FORMAT('WORKER %s HAS REQUESTED CLOSURE OF PAYMENT CHANNEL FOR JOB "%s". ACCUMULATED BALANCE: %s XAH',
          COALESCE(NEW.requester_name, NEW.requester_wallet_address), NEW.job_title, NEW.accumulated_balance),
        jsonb_build_object('request_id', NEW.id, 'channel_id', NEW.channel_id,
          'accumulated_balance', NEW.accumulated_balance, 'escrow_amount', NEW.escrow_amount, 'job_title', NEW.job_title)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_ngo_closure_request
  AFTER INSERT ON channel_closure_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_ngo_on_closure_request();

-- Helper function
CREATE OR REPLACE FUNCTION get_pending_closure_requests(ngo_wallet VARCHAR)
RETURNS TABLE (
  request_id INT, channel_id VARCHAR, worker_name VARCHAR, worker_wallet VARCHAR,
  accumulated_balance NUMERIC, job_title VARCHAR, requested_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT id, ccr.channel_id, requester_name, requester_wallet_address,
    ccr.accumulated_balance, ccr.job_title, created_at
  FROM channel_closure_requests ccr
  WHERE ccr.ngo_wallet_address = ngo_wallet AND status = 'pending'
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_pending_closure_requests IS 'Get all pending closure requests for an NGO organization';

-- Cancel requests when channel closes
CREATE OR REPLACE FUNCTION cancel_closure_requests_on_channel_close()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status != 'closed' AND NEW.status = 'closed') THEN
    UPDATE channel_closure_requests SET status = 'cancelled', updated_at = NOW()
    WHERE channel_id = NEW.channel_id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cancel_requests_on_channel_close
  AFTER UPDATE ON payment_channels
  FOR EACH ROW
  EXECUTE FUNCTION cancel_closure_requests_on_channel_close();

-- Unique constraint: only one pending request per channel
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_closure_request
  ON channel_closure_requests(channel_id) WHERE status = 'pending';

COMMENT ON INDEX idx_unique_pending_closure_request IS 'Ensure only one pending closure request per channel at a time';
