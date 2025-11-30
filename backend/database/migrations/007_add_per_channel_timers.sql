-- Migration: 007_add_per_channel_timers.sql
-- Date: 2025-11-30
-- Description: Add per-channel timer support with max daily hours enforcement
-- Related: PRD_PER_CHANNEL_CLOCK_IN.md

-- ============================================================
-- PART 1: Add max_daily_hours column to payment_channels table
-- This ACTIVATES the existing frontend field by storing its value
-- ============================================================

ALTER TABLE payment_channels
  ADD COLUMN IF NOT EXISTS max_daily_hours DECIMAL(4,2) DEFAULT 8.00
  CHECK (max_daily_hours > 0 AND max_daily_hours <= 24);

COMMENT ON COLUMN payment_channels.max_daily_hours IS 'Maximum hours worker can work per day for this channel (auto-stop timer at limit). Maps to frontend maxHoursPerDay field. Default: 8 hours (standard workday).';

-- ============================================================
-- PART 2: Add payment_channel_id to work_sessions table
-- This enables per-channel time tracking (core requirement)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_sessions'
      AND column_name = 'payment_channel_id'
  ) THEN
    ALTER TABLE work_sessions
      ADD COLUMN payment_channel_id INTEGER REFERENCES payment_channels(id) ON DELETE CASCADE;

    COMMENT ON COLUMN work_sessions.payment_channel_id IS 'Links work session to specific payment channel for per-job time tracking';
  ELSE
    RAISE NOTICE 'Column payment_channel_id already exists in work_sessions table';
  END IF;
END $$;

-- ============================================================
-- PART 3: Performance Indexes
-- ============================================================

-- Index for fast lookup of active sessions by payment channel
CREATE INDEX IF NOT EXISTS idx_work_sessions_payment_channel
  ON work_sessions(payment_channel_id);

-- Index for fast lookup of active sessions by status
CREATE INDEX IF NOT EXISTS idx_work_sessions_status
  ON work_sessions(session_status) WHERE session_status = 'active';

-- Composite index for worker's active sessions (performance optimization)
CREATE INDEX IF NOT EXISTS idx_work_sessions_employee_active
  ON work_sessions(employee_id, session_status) WHERE session_status = 'active';

-- ============================================================
-- PART 4: Data Backfill (Optional)
-- ============================================================

-- Backfill existing work_sessions with payment_channel_id (if possible)
-- This query attempts to match existing sessions to payment channels based on employee_id and organization_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_sessions'
      AND column_name = 'payment_channel_id'
  ) THEN
    UPDATE work_sessions ws
    SET payment_channel_id = (
      SELECT pc.id
      FROM payment_channels pc
      WHERE pc.employee_id = ws.employee_id
        AND pc.organization_id = ws.organization_id
        AND pc.status = 'active'
      LIMIT 1
    )
    WHERE ws.payment_channel_id IS NULL;

    RAISE NOTICE 'Backfilled payment_channel_id for existing work_sessions';
  END IF;
END $$;

-- ============================================================
-- PART 5: Verification Queries (For Testing)
-- ============================================================

-- Verify max_daily_hours column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'payment_channels'
      AND column_name = 'max_daily_hours'
  ) THEN
    RAISE NOTICE '✅ payment_channels.max_daily_hours column added successfully';
  ELSE
    RAISE EXCEPTION '❌ payment_channels.max_daily_hours column was not created';
  END IF;
END $$;

-- Verify payment_channel_id column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'work_sessions'
      AND column_name = 'payment_channel_id'
  ) THEN
    RAISE NOTICE '✅ work_sessions.payment_channel_id column added successfully';
  ELSE
    RAISE EXCEPTION '❌ work_sessions.payment_channel_id column was not created';
  END IF;
END $$;

-- Verify indexes were created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE tablename = 'work_sessions'
      AND indexname = 'idx_work_sessions_payment_channel'
  ) THEN
    RAISE NOTICE '✅ idx_work_sessions_payment_channel index created successfully';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE tablename = 'work_sessions'
      AND indexname = 'idx_work_sessions_status'
  ) THEN
    RAISE NOTICE '✅ idx_work_sessions_status index created successfully';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE tablename = 'work_sessions'
      AND indexname = 'idx_work_sessions_employee_active'
  ) THEN
    RAISE NOTICE '✅ idx_work_sessions_employee_active index created successfully';
  END IF;
END $$;

-- Grant permissions
GRANT ALL PRIVILEGES ON payment_channels TO xahpayroll_user;
GRANT ALL PRIVILEGES ON work_sessions TO xahpayroll_user;

-- ============================================================
-- Migration Complete
-- ============================================================
