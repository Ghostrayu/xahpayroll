-- Migration: Remove One Channel Per Worker Constraint
-- Created: 2025-01-06
-- Purpose: Allow multiple payment channels per worker (different jobs)
--
-- Background:
-- The unique constraint payment_channels_organization_id_employee_id_key
-- prevents multiple payment channels for the same org-employee pair.
-- However, the business requirement (CLAUDE.md:140, README.md:246) states:
-- "Multiple payment channels can be created per worker (different jobs)"
--
-- This constraint is too restrictive and prevents the intended functionality.

-- Drop the unique constraint that limits one channel per org-employee pair
ALTER TABLE payment_channels
DROP CONSTRAINT IF EXISTS payment_channels_organization_id_employee_id_key;

-- Add comment explaining the removal
COMMENT ON TABLE payment_channels IS
'Payment channels between organizations and employees. Multiple channels per org-employee pair are allowed for different jobs/projects.';
