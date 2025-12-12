-- Fix Payment Channel with Placeholder Data
-- This script updates a channel that was imported with placeholder data

-- INSTRUCTIONS:
-- 1. Replace the placeholder values below with your actual data
-- 2. Run this script in psql or your PostgreSQL client
-- 3. Refresh your NGO dashboard to see updated data

-- STEP 1: Find the channel you want to fix
-- (Uncomment and run this first to identify the correct channel)
/*
SELECT
    pc.id,
    pc.channel_id,
    pc.job_name,
    pc.hourly_rate,
    e.full_name as worker_name,
    e.employee_wallet_address,
    o.organization_name,
    o.escrow_wallet_address as ngo_wallet
FROM payment_channels pc
JOIN employees e ON pc.employee_id = e.id
JOIN organizations o ON pc.organization_id = o.id
WHERE pc.job_name = '[IMPORTED - EDIT JOB NAME]'
ORDER BY pc.created_at DESC;
*/

-- STEP 2: Update the channel with correct data
-- Replace these values:
--   - 123: The channel ID from the query above
--   - 'YOUR ACTUAL JOB NAME': The job name from your form
--   - 25.00: The hourly rate from your form

UPDATE payment_channels
SET
    job_name = 'YOUR ACTUAL JOB NAME',  -- ← REPLACE THIS
    hourly_rate = 25.00,                 -- ← REPLACE THIS
    updated_at = NOW()
WHERE id = 123;  -- ← REPLACE THIS WITH CHANNEL ID FROM STEP 1

-- STEP 3: Verify the update
SELECT
    pc.id,
    pc.channel_id,
    pc.job_name,
    pc.hourly_rate,
    pc.updated_at,
    e.full_name as worker_name
FROM payment_channels pc
JOIN employees e ON pc.employee_id = e.id
WHERE pc.id = 123;  -- ← REPLACE THIS WITH CHANNEL ID
