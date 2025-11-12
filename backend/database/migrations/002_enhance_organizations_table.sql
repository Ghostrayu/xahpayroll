-- Migration: 002_enhance_organizations_table.sql
-- Purpose: Add optional fields to organizations table for multi-step signup
-- Date: 2025-11-12
-- Rollback: DROP COLUMN IF EXISTS website, description

-- Add only essential fields: website and description
-- organization_name and escrow_wallet_address already exist in base schema
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;

-- Add indexes for common queries
-- CRITICAL: escrow_wallet_address index ensures fast lookup during payment channel creation
CREATE INDEX IF NOT EXISTS idx_organizations_escrow_wallet ON organizations(escrow_wallet_address);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON organizations(created_at);

-- Add comments for documentation
COMMENT ON COLUMN organizations.website IS 'Organization website URL';
COMMENT ON COLUMN organizations.description IS 'Mission statement or organization description';

-- Note: escrow_wallet_address MUST match the NGO/employer user's wallet_address
-- This mapping is critical for payment channel creation to find the correct organization
COMMENT ON COLUMN organizations.escrow_wallet_address IS 'NGO/Employer wallet address - MUST match users.wallet_address for payment channel mapping';
