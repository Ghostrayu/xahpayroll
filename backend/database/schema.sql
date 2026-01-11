-- XAH Payroll Database Schema
-- Production-ready table definitions, indexes, functions, and triggers
--
-- This file is used by init-db.js for automated database initialization
-- DO NOT include database/user creation here - those are handled separately
--
-- Generated from: setup_database.sql
-- Last updated: 2026-01-02

-- =====================================================
-- TABLE CREATION (In correct order)
-- =====================================================

-- 1. Users Table (FIRST - no dependencies)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(64) UNIQUE NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('employee', 'employer', 'ngo', 'admin')),
  email VARCHAR(255),
  display_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  profile_data JSONB,
  deleted_at TIMESTAMP DEFAULT NULL,
  deletion_reason TEXT DEFAULT NULL
);

COMMENT ON TABLE users IS 'Core user accounts identified by XAH wallet addresses';
COMMENT ON COLUMN users.updated_at IS 'Timestamp of last update (auto-updated via trigger)';
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp (NULL = not deleted)';
COMMENT ON COLUMN users.deletion_reason IS 'Reason for account deletion';
COMMENT ON COLUMN users.display_name IS 'User display name (fallback for full_name)';

-- 2. Organizations Table
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
CREATE TABLE employees (
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
CREATE TABLE work_sessions (
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
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE work_sessions IS 'Individual work shifts with clock in/out times';

-- 5. Payments Table
CREATE TABLE payments (
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
CREATE TABLE escrow_transactions (
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
CREATE TABLE payment_configurations (
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
CREATE TABLE activity_logs (
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
CREATE TABLE notifications (
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
CREATE TABLE api_keys (
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
  on_chain_balance DECIMAL(20, 8) NOT NULL DEFAULT 0 -- Actual XRPL ledger balance (synced from chain)
);

COMMENT ON TABLE payment_channels IS 'XRPL payment channels for hourly worker payments';
COMMENT ON COLUMN payment_channels.channel_id IS 'Unique XRPL payment channel identifier (64-char hex)';
COMMENT ON COLUMN payment_channels.closure_tx_hash IS 'Transaction hash of PaymentChannelClaim that closed the channel';
COMMENT ON COLUMN payment_channels.closed_at IS 'Timestamp when channel was closed';
COMMENT ON COLUMN payment_channels.closure_reason IS 'Reason for closure: manual, timeout, claim, expired';
COMMENT ON COLUMN payment_channels.settle_delay IS 'XRPL SettleDelay in seconds (protection period for workers)';
COMMENT ON COLUMN payment_channels.expiration_time IS 'When the SettleDelay period expires (closure_initiated_at + settle_delay)';

-- Payment channels indexes
CREATE INDEX IF NOT EXISTS idx_payment_channels_org ON payment_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_employee ON payment_channels(employee_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_status ON payment_channels(status);
CREATE INDEX IF NOT EXISTS idx_payment_channels_channel_id ON payment_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_closed_at ON payment_channels(closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_channels_expiration ON payment_channels(expiration_time) WHERE expiration_time IS NOT NULL;

-- Add trigger for payment_channels auto-update
CREATE TRIGGER update_payment_channels_updated_at
BEFORE UPDATE ON payment_channels
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- =====================================================
-- USER TABLE ENHANCEMENTS (Deletion tracking)
-- =====================================================
-- Source: migrations/003_worker_deletion.sql

-- Add deletion tracking columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deletion_reason VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at) WHERE user_type = 'employee';

COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp for 48-hour grace period';
COMMENT ON COLUMN users.deletion_reason IS 'Reason provided by user for deletion';
COMMENT ON COLUMN users.last_login_at IS 'Last login timestamp for inactivity tracking';
