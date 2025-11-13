-- =====================================================
-- Worker Profile Deletion Migration
-- Version: 1.0
-- Date: 2025-11-12
-- Description: Adds worker deletion, notifications, and scheduled cleanup
-- =====================================================

-- =====================================================
-- 1. UPDATE USERS TABLE
-- =====================================================

-- Add deletion tracking columns
ALTER TABLE users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deletion_reason VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_users_deleted_at
ON users(deleted_at)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_last_login
ON users(last_login_at)
WHERE user_type = 'employee';

-- =====================================================
-- 2. CREATE DELETION_LOGS TABLE
-- =====================================================

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_deletion_logs_wallet
ON deletion_logs(wallet_address);

CREATE INDEX IF NOT EXISTS idx_deletion_logs_created_at
ON deletion_logs(created_at);

-- Add comment
COMMENT ON TABLE deletion_logs IS 'Audit trail for all worker profile deletions';

-- =====================================================
-- 3. CREATE NGO_NOTIFICATIONS TABLE
-- =====================================================

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ngo_notifications_org
ON ngo_notifications(organization_id, is_read);

CREATE INDEX IF NOT EXISTS idx_ngo_notifications_created_at
ON ngo_notifications(created_at);

-- Add comment
COMMENT ON TABLE ngo_notifications IS 'Notification system for NGO organizations about worker events';

-- =====================================================
-- 4. UPDATE CASCADE BEHAVIOR
-- =====================================================

-- Update work_sessions foreign key for cascade delete
ALTER TABLE work_sessions
    DROP CONSTRAINT IF EXISTS work_sessions_employee_id_fkey,
    ADD CONSTRAINT work_sessions_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;

-- Update payments foreign key for cascade delete
ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS payments_employee_id_fkey,
    ADD CONSTRAINT payments_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;

-- =====================================================
-- 5. VERIFICATION QUERIES
-- =====================================================

-- Verify new columns exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'deleted_at') THEN
        RAISE EXCEPTION 'Migration failed: deleted_at column not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'deletion_logs') THEN
        RAISE EXCEPTION 'Migration failed: deletion_logs table not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'ngo_notifications') THEN
        RAISE EXCEPTION 'Migration failed: ngo_notifications table not created';
    END IF;

    RAISE NOTICE 'Migration 003_worker_deletion completed successfully';
END $$;

-- =====================================================
-- 6. ROLLBACK SCRIPT (For reference - do not execute)
-- =====================================================

/*
-- To rollback this migration, execute the following:

-- Drop tables
DROP TABLE IF EXISTS ngo_notifications CASCADE;
DROP TABLE IF EXISTS deletion_logs CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_users_deleted_at;
DROP INDEX IF EXISTS idx_users_last_login;

-- Remove columns from users table
ALTER TABLE users
DROP COLUMN IF EXISTS deleted_at,
DROP COLUMN IF EXISTS deletion_reason,
DROP COLUMN IF EXISTS last_login_at;

-- Restore original foreign key constraints (if needed)
-- ALTER TABLE work_sessions ...
-- ALTER TABLE payments ...

*/
