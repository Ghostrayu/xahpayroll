-- XAH Payroll Database Setup Script
-- This script creates the complete database schema for the XAH Payroll system

-- ⚠️  SECURITY WARNING ⚠️
-- This file contains a placeholder password for demonstration purposes only.
-- NEVER use this password in production or any real environment.
-- 
-- BEFORE RUNNING THIS SCRIPT:
-- 1. Replace 'CHANGE_THIS_PASSWORD' with a strong, unique password
-- 2. Store the password securely (password manager, environment variables)
-- 3. Never commit the actual password to version control
-- 4. Use different passwords for development, staging, and production
--
-- Generate a strong password: openssl rand -base64 32

-- Create the database
CREATE DATABASE xahpayroll_dev;

-- Create a dedicated user with a SECURE password (CHANGE THIS!)
CREATE USER xahpayroll_user WITH ENCRYPTED PASSWORD 'CHANGE_THIS_PASSWORD';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE xahpayroll_dev TO xahpayroll_user;

-- Connect to the new database
\c xahpayroll_dev

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO xahpayroll_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO xahpayroll_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO xahpayroll_user;

-- =====================================================
-- TABLE CREATION (In correct order)
-- =====================================================

-- 1. Users Table (FIRST - no dependencies)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(64) UNIQUE NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('employee', 'employer', 'ngo', 'admin')),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  profile_data JSONB
);

COMMENT ON TABLE users IS 'Core user accounts identified by XAH wallet addresses';

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

-- Grant permissions on new tables and sequences
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO xahpayroll_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO xahpayroll_user;

-- =====================================================
-- SAMPLE DATA (For Testing)
-- =====================================================

-- Insert NGO user
INSERT INTO users (wallet_address, user_type, email) 
VALUES ('rNGO1TestWallet123456789', 'ngo', 'ngo@example.com');

-- Insert organization
INSERT INTO organizations (
  user_id, 
  organization_name, 
  organization_type,
  escrow_wallet_address,
  escrow_balance
) VALUES (
  1,
  'Test NGO',
  'ngo',
  'rEscrowTestWallet123456789',
  10000.00
);

-- Insert employee user
INSERT INTO users (wallet_address, user_type, email) 
VALUES ('rWorker1TestWallet123456789', 'employee', 'worker@example.com');

-- Insert employee
INSERT INTO employees (
  user_id,
  organization_id,
  full_name,
  employee_wallet_address,
  hourly_rate
) VALUES (
  2,
  1,
  'John Doe',
  'rWorker1TestWallet123456789',
  15.00
);

-- Insert payment configuration
INSERT INTO payment_configurations (
  organization_id,
  timeout_threshold_minutes,
  payment_frequency_minutes,
  auto_payment_enabled
) VALUES (
  1,
  60,
  60,
  true
);

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Show all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Show record counts
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL
SELECT 'employees', COUNT(*) FROM employees
UNION ALL
SELECT 'work_sessions', COUNT(*) FROM work_sessions
UNION ALL
SELECT 'payments', COUNT(*) FROM payments;
