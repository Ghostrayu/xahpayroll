# Multi-Step Signup Implementation Specification

**Status**: Proposed
**Created**: 2025-11-11
**Priority**: High
**Category**: User Experience, Architecture Improvement

## Executive Summary

Implement a multi-step signup flow that collects organization information during account creation for NGOs/Employers, eliminating the need for auto-creation workarounds and improving data quality.

### Simplified Organization Schema

**Organization Table Fields**:
- `organization_name` (required) - Organization display name
- `escrow_wallet_address` (required) - **MUST match user's wallet_address (1:1 mapping)**
- `website` (optional) - Organization website URL
- `description` (optional) - Mission statement (max 2000 characters)

**Key Design Decision**: Simplified from original proposal (removed: registration_number, tax_id, business_address, contact_email, contact_phone) to reduce signup friction while maintaining essential information.

### Critical Payment Channel Mapping

**Problem**: Payment channels fail with "Organization not found" error when organization record doesn't exist.

**Solution**: Establish 1:1 mapping during signup:
```
users.wallet_address ↔ organizations.escrow_wallet_address
```

**Flow**:
1. NGO signup → Create user with `wallet_address = "rABC123..."`
2. Org setup → Create organization with `escrow_wallet_address = "rABC123..."` (same value)
3. Payment channel creation → Lookup: `SELECT * FROM organizations WHERE escrow_wallet_address = "rABC123..."`
4. Success → Use `organization.id` for `payment_channels.organization_id` foreign key

**Why This Works**: Payment channels always use the NGO's wallet address to find the organization, ensuring the mapping always succeeds.

## Rationale

### Why Option A (Multi-Step Signup)?

1. ✅ **Cleaner Architecture**: Proper separation of concerns between users and organizations
2. ✅ **Better Data Quality**: Real information instead of defaults
3. ✅ **Future-Proof**: Supports multi-user organizations, org hierarchies
4. ✅ **User Trust**: Complete org profiles build worker confidence
5. ⚠️ **Acceptable Trade-off**: Slightly longer signup is worth the benefits

### Current Problems

**Auto-Creation Issues:**
- Organization data duplicated between `users.organization_name` and `organizations` table
- Generic defaults created on first payment channel (not during signup)
- Auto-creation logic adds complexity to `paymentChannels.js`
- NGOs unaware that organization record exists separately

**Code Location of Current Auto-Creation:**
- `backend/routes/paymentChannels.js:33-80` - Auto-creates organization from user profile

## Current vs Proposed State

### Current Flow

```
1. Wallet Connection → 2. Profile Setup → 3. Dashboard
                           ↓
                    users table populated
                           ↓
              organizations table EMPTY
                           ↓
         (auto-created on first payment channel)
```

### Proposed Flow

```
1. Wallet Connection → 2. User Profile → 3. Organization Setup → 4. Dashboard
                           ↓                    ↓
                    users table            organizations table
                                                ↓
                                    BOTH populated during signup
```

## Technical Specifications

### Database Schema Changes

#### Phase 1: Add Optional Fields to Organizations Table

```sql
-- Migration: 002_enhance_organizations_table.sql

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
```

#### Phase 2 (Optional): Remove Redundancy

```sql
-- OPTIONAL: Drop organization_name from users table after migration
-- This can be done later once we're confident in the new system

ALTER TABLE users DROP COLUMN organization_name;
```

**Recommendation**: Keep `users.organization_name` for backward compatibility initially, drop in Phase 4.

### API Changes

#### New Endpoint: POST /api/organizations

**File**: `backend/routes/organizations.js`

**Request Body**:
```json
{
  "organizationName": "Red Cross NGO",
  "escrowWalletAddress": "rQHERc4...",
  "website": "https://redcross.org",
  "description": "Humanitarian aid organization providing disaster relief and support"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": 1,
      "organizationName": "Red Cross NGO",
      "escrowWalletAddress": "rQHERc4...",
      "website": "https://redcross.org",
      "description": "Humanitarian aid organization providing disaster relief and support",
      "createdAt": "2025-11-11T10:30:45.123Z"
    }
  }
}
```

**Validation Rules**:
- `organizationName` (required, 3-100 characters)
- `escrowWalletAddress` (required, valid XRPL address format) **⚠️ CRITICAL: Must match NGO/employer wallet address**
- `website` (optional, valid URL format)
- `description` (optional, max 2000 characters)

**Error Cases**:
- 400: Missing required fields (organizationName, escrowWalletAddress)
- 400: Invalid wallet address format
- 400: Invalid URL format (website)
- 409: Organization already exists for this wallet address
- 500: Database error

**Critical Business Rule**:
The `escrowWalletAddress` must exactly match the NGO/employer user's `wallet_address` from the `users` table. This 1:1 mapping ensures payment channels can correctly identify the organization during creation. If these don't match, payment channel creation will fail with "Organization not found" error.

**Implementation**:
```javascript
router.post('/', async (req, res) => {
  try {
    const {
      organizationName,
      escrowWalletAddress,
      website,
      description
    } = req.body

    // Validate required fields
    if (!organizationName || !escrowWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'Organization name and wallet address required' }
      })
    }

    // Validate XRPL address format
    const xrplAddressPattern = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/
    if (!xrplAddressPattern.test(escrowWalletAddress)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid XRPL wallet address format' }
      })
    }

    // Validate website if provided
    if (website) {
      try {
        new URL(website)
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid website URL format' }
        })
      }
    }

    // Validate description length
    if (description && description.length > 2000) {
      return res.status(400).json({
        success: false,
        error: { message: 'Description must be 2000 characters or less' }
      })
    }

    // CRITICAL: Check if organization already exists for this wallet
    // This prevents duplicate organizations and ensures 1:1 mapping
    const existing = await query(
      'SELECT * FROM organizations WHERE escrow_wallet_address = $1',
      [escrowWalletAddress]
    )

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: { message: 'Organization already exists for this wallet address' }
      })
    }

    // Create organization with simplified schema
    const result = await query(
      `INSERT INTO organizations (
        organization_name, escrow_wallet_address,
        website, description, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING *`,
      [
        organizationName,
        escrowWalletAddress,
        website || null,
        description || null
      ]
    )

    console.log('[ORG_CREATE_SUCCESS]', {
      organizationId: result.rows[0].id,
      walletAddress: escrowWalletAddress,
      // Log for payment channel mapping verification
      mapping: 'escrow_wallet_address matches user wallet_address'
    })

    res.json({
      success: true,
      data: { organization: result.rows[0] }
    })
  } catch (error) {
    console.error('[ORG_CREATE_ERROR]', error)
    res.status(500).json({
      success: false,
      error: { message: 'Failed to create organization' }
    })
  }
})
```

#### Update Endpoint: POST /api/users/profile

**Changes**: Add organization creation for NGO/Employer user types

**File**: `backend/routes/users.js:108-136`

**Modified Logic**:
```javascript
// After creating user profile (line 115)
if (userType === 'ngo' || userType === 'employer') {
  // CRITICAL: Create organization record with escrow_wallet_address = user's wallet_address
  // This 1:1 mapping is essential for payment channel creation
  try {
    await query(
      `INSERT INTO organizations (
        organization_name,
        escrow_wallet_address,
        created_at
      ) VALUES ($1, $2, NOW())`,
      [organizationName, walletAddress]
    )
    console.log('[ORG_AUTO_CREATE]', {
      message: 'Organization created during user signup',
      walletAddress,
      mapping: 'escrow_wallet_address = wallet_address (1:1 mapping established)'
    })
  } catch (orgError) {
    // If organization already exists, that's okay (might be duplicate signup attempt)
    if (orgError.code !== '23505') { // 23505 = unique violation
      throw orgError
    }
    console.log('[ORG_EXISTS]', { walletAddress, status: 'Organization already exists' })
  }
}
```

**Important Notes**:
1. The `escrow_wallet_address` MUST equal the user's `wallet_address` from the `users` table
2. This creates the critical 1:1 relationship: `users.wallet_address ↔ organizations.escrow_wallet_address`
3. Payment channels will query `organizations` using the NGO's wallet address to find `organization.id`
4. Website and description can be added later via organization profile editing (Phase 6)

#### Cleanup: POST /api/payment-channels/create

**Changes**: Remove auto-creation logic, replace with simple lookup + proper error handling

**File**: `backend/routes/paymentChannels.js:33-80`

**Before** (80 lines of auto-creation):
```javascript
let orgResult = await query(
  'SELECT * FROM organizations WHERE escrow_wallet_address = $1',
  [organizationWalletAddress]
)

let organization
if (orgResult.rows.length === 0) {
  // [48 lines of auto-creation logic...]
  organization = newOrgResult.rows[0]
} else {
  organization = orgResult.rows[0]
}
```

**After** (simple lookup with mapping verification):
```javascript
// CRITICAL LOOKUP: Find organization by escrow_wallet_address
// This must match the NGO/employer's wallet_address (1:1 mapping)
const orgResult = await query(
  'SELECT id, organization_name, escrow_wallet_address, website, description
   FROM organizations
   WHERE escrow_wallet_address = $1',
  [organizationWalletAddress]
)

if (orgResult.rows.length === 0) {
  console.error('[ORG_NOT_FOUND]', {
    walletAddress: organizationWalletAddress,
    reason: 'No organization record exists with this escrow_wallet_address',
    solution: 'User must complete organization setup during signup'
  })

  return res.status(404).json({
    success: false,
    error: {
      code: 'ORG_NOT_FOUND',
      message: 'Organization not found. Please complete your organization setup in your profile settings.',
      details: 'Organizations must be created during signup. Contact support if you need assistance.'
    }
  })
}

const organization = orgResult.rows[0]
console.log('[ORG_FOUND]', {
  organizationId: organization.id,
  walletAddress: organization.escrow_wallet_address,
  mapping: 'Successfully mapped wallet address to organization ID'
})

// Continue with payment channel creation using organization.id
```

**Critical Mapping Flow**:
1. NGO creates user profile → `users.wallet_address` = "rABC123..."
2. System auto-creates organization → `organizations.escrow_wallet_address` = "rABC123..." (same value)
3. NGO creates payment channel → Query: `SELECT * FROM organizations WHERE escrow_wallet_address = 'rABC123...'`
4. Success: `organization.id` found and used for `payment_channels.organization_id`

**Preventing "Organization Not Found" Error**:
- ✅ **Correct**: Create organization during NGO signup with `escrow_wallet_address = wallet_address`
- ❌ **Wrong**: Skip organization creation, rely on auto-creation (removed in this spec)
- ✅ **Correct**: Use same wallet address for organization lookup during payment channel creation
- ❌ **Wrong**: Use different address or manual input that doesn't match

**Note**: Keep old auto-creation logic commented out during Phase 2-3 for rollback capability.

### Frontend Changes

#### Component Structure

**New Components**:
1. `MultiStepSignupModal.tsx` - Orchestrates signup flow
2. `UserProfileStep.tsx` - Step 1: User information
3. `OrganizationSetupStep.tsx` - Step 2: Organization details (NGO/Employer only)

**Modified Components**:
1. `ProfileSetupModal.tsx` - Refactor into multi-step or keep as-is for employees

#### Component: MultiStepSignupModal.tsx

**File**: `frontend/src/components/MultiStepSignupModal.tsx`

**Props**:
```typescript
interface MultiStepSignupModalProps {
  isOpen: boolean
  onComplete: () => void
  userType: UserType
  walletAddress: string
}
```

**State Management**:
```typescript
const [step, setStep] = useState<1 | 2>(1)
const [userProfileData, setUserProfileData] = useState<UserProfileData | null>(null)
```

**Flow Logic**:
```typescript
// Step 1: User Profile
if (step === 1) {
  return (
    <UserProfileStep
      walletAddress={walletAddress}
      userType={userType}
      onComplete={(data) => {
        setUserProfileData(data)
        if (userType === 'employee') {
          // Employees skip org setup
          handleFinalSubmit(data)
        } else {
          // NGOs/Employers go to step 2
          setStep(2)
        }
      }}
    />
  )
}

// Step 2: Organization Setup (NGO/Employer only)
if (step === 2 && (userType === 'ngo' || userType === 'employer')) {
  return (
    <OrganizationSetupStep
      walletAddress={walletAddress}
      userProfileData={userProfileData!}
      onComplete={handleFinalSubmit}
      onBack={() => setStep(1)}
    />
  )
}
```

#### Component: OrganizationSetupStep.tsx

**File**: `frontend/src/components/OrganizationSetupStep.tsx`

**Form Fields**:

**Required**:
- Organization Name (pre-filled from step 1)

**Optional**:
- Website (URL)
- Description/Mission Statement (textarea, max 2000 characters)

**UI Layout**:
```
┌──────────────────────────────────────────┐
│ ORGANIZATION DETAILS (2/2)               │
│ ● ──────────────────────── ○            │ (Progress indicator)
├──────────────────────────────────────────┤
│                                          │
│ Organization Name *                      │
│ [Good Money Collective               ]   │
│                                          │
│ Website (Optional)                       │
│ [https://goodmoney.org               ]   │
│ 💡 Help workers learn more about you     │
│                                          │
│ Mission Statement (Optional)             │
│ ┌──────────────────────────────────────┐ │
│ │ We provide financial services to     │ │
│ │ underserved communities in rural     │ │
│ │ areas, focusing on microloans and    │ │
│ │ financial literacy education.        │ │
│ └──────────────────────────────────────┘ │
│ 0/2000 characters                        │
│                                          │
│ ℹ️ Complete profiles help workers trust  │
│    your organization                     │
│                                          │
│ [← BACK]          [COMPLETE SETUP →]     │
└──────────────────────────────────────────┘
```

**Validation**:
```typescript
const validateForm = (): boolean => {
  const newErrors: Record<string, string> = {}

  // Required: Organization name
  if (!formData.organizationName.trim()) {
    newErrors.organizationName = 'Organization name is required'
  }

  // Optional: Website URL validation
  if (formData.website && formData.website.trim()) {
    try {
      new URL(formData.website)
    } catch (e) {
      newErrors.website = 'Invalid website URL (must start with http:// or https://)'
    }
  }

  // Optional: Description length validation
  if (formData.description && formData.description.length > 2000) {
    newErrors.description = 'Description must be 2000 characters or less'
  }

  setErrors(newErrors)
  return Object.keys(newErrors).length === 0
}
```

**Submit Handler**:
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  if (!validateForm()) return

  setIsSaving(true)

  try {
    // CRITICAL: Create organization with escrow_wallet_address = user's wallet address
    // This establishes the 1:1 mapping needed for payment channel creation
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
    const response = await fetch(`${backendUrl}/api/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationName: formData.organizationName,
        escrowWalletAddress: walletAddress, // CRITICAL: Must match user's wallet_address
        website: formData.website || null,
        description: formData.description || null
      })
    })

    if (!response.ok) {
      const errorData = await response.json()

      // Handle specific error cases
      if (response.status === 409) {
        throw new Error('An organization already exists for this wallet address')
      }

      throw new Error(errorData.error?.message || 'Failed to create organization')
    }

    const result = await response.json()
    console.log('[ORG_CREATED_CLIENT]', {
      organizationId: result.data.organization.id,
      walletAddress: result.data.organization.escrowWalletAddress,
      mapping: 'Client confirmed 1:1 mapping established'
    })

    // Call completion callback to proceed to dashboard
    onComplete()
  } catch (error: any) {
    console.error('[ORG_CREATE_ERROR_CLIENT]', error)
    setErrors({ submit: error.message || 'Failed to create organization' })
  } finally {
    setIsSaving(false)
  }
}
```

#### Updated: ProfileSetupModal.tsx

**Option 1: Refactor to UserProfileStep** (Recommended)
- Extract user profile form into `UserProfileStep.tsx`
- Use `MultiStepSignupModal.tsx` as wrapper
- Remove organization-specific logic

**Option 2: Keep as-is for Employees**
- Employees continue using current `ProfileSetupModal.tsx`
- NGOs/Employers use new `MultiStepSignupModal.tsx`
- Conditional rendering in parent component

**Recommendation**: Option 1 for consistency

### API Service Integration

**File**: `frontend/src/services/api.ts`

**Add Organization API Methods**:
```typescript
// Organization API - Simplified schema
export const organizationApi = {
  create: async (data: {
    organizationName: string
    escrowWalletAddress: string  // MUST match user wallet_address
    website?: string
    description?: string
  }) => {
    const response = await fetch(`${API_BASE_URL}/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Failed to create organization')
    }

    return response.json()
  },

  get: async (walletAddress: string) => {
    const response = await fetch(`${API_BASE_URL}/organizations/${walletAddress}`)
    if (!response.ok) throw new Error('Failed to fetch organization')
    return response.json()
  },

  update: async (walletAddress: string, data: Partial<OrganizationData>) => {
    const response = await fetch(`${API_BASE_URL}/organizations/${walletAddress}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Failed to update organization')
    return response.json()
  }
}
```

### Type Definitions

**File**: `frontend/src/types/api.ts`

**Add Organization Types**:
```typescript
/**
 * Organization data - Simplified schema
 * CRITICAL: escrowWalletAddress MUST match user's wallet_address (1:1 mapping)
 */
export interface OrganizationData {
  id: number
  organizationName: string
  escrowWalletAddress: string  // Must match users.wallet_address
  website?: string
  description?: string
  createdAt: string
  updatedAt?: string
}

/**
 * Organization creation request
 * Used during signup (step 2 for NGO/Employer)
 */
export interface OrganizationCreateRequest {
  organizationName: string
  escrowWalletAddress: string  // MUST match logged-in user's wallet address
  website?: string
  description?: string
}

/**
 * Organization update request
 * Used for profile editing (Phase 6)
 */
export interface OrganizationUpdateRequest {
  organizationName?: string
  website?: string
  description?: string
}
```

## Implementation Phases

### Phase 1: Database Migration (1-2 hours)
**Risk**: Low
**Rollback**: Easy (just drop columns)

**Tasks**:
- [ ] Create migration file `002_enhance_organizations_table.sql`
- [ ] Add optional columns to organizations table
- [ ] Test migration on local database
- [ ] Document rollback procedure

**Testing**:
```bash
cd backend
npm run init-db  # Apply migration
psql -U xah_payroll_user -d xah_payroll -c "\d organizations"  # Verify columns
```

### Phase 2: Backend API Development (4-6 hours)
**Risk**: Medium
**Rollback**: Keep auto-creation as fallback

**Tasks**:
- [ ] Create POST /api/organizations endpoint
- [ ] Add validation (wallet address, email, URL formats)
- [ ] Update POST /api/users/profile to create organization
- [ ] Add GET /api/organizations/:walletAddress endpoint
- [ ] Add PUT /api/organizations/:walletAddress endpoint (for future editing)
- [ ] Write API tests
- [ ] Document API endpoints

**Testing**:
```bash
# Test organization creation (simplified schema)
curl -X POST http://localhost:3001/api/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Test NGO",
    "escrowWalletAddress": "rTest123...",
    "website": "https://testngo.org",
    "description": "A test organization for humanitarian work"
  }'

# Test user profile creation with org (auto-creates organization)
curl -X POST http://localhost:3001/api/users/profile \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "rTest123...",
    "displayName": "Test User",
    "organizationName": "Test NGO",
    "userType": "ngo"
  }'

# Verify organization mapping for payment channel
curl http://localhost:3001/api/organizations/rTest123...

# Expected response should include organization.id for payment channel reference
```

### Phase 3: Frontend UI Development (8-12 hours)
**Risk**: High (User-facing changes)
**Rollback**: Feature flag to revert to old modal

**Tasks**:
- [ ] Create `OrganizationSetupStep.tsx` component (simplified: name, website, description)
- [ ] Create `UserProfileStep.tsx` component (refactor from ProfileSetupModal)
- [ ] Create `MultiStepSignupModal.tsx` orchestrator
- [ ] Add progress indicator (Step 1/2, Step 2/2)
- [ ] Add form validation (organization name required, URL format, 2000 char limit)
- [ ] Add loading states and error handling
- [ ] Update API service with simplified organization methods
- [ ] Add TypeScript types for organization data
- [ ] Write component tests

**Testing**:
- [ ] Test employee signup (should skip org step)
- [ ] Test NGO signup (should show both steps)
- [ ] Test form validation:
  - [ ] Organization name required
  - [ ] Website URL format validation (optional field)
  - [ ] Description character limit (2000 chars)
- [ ] Test back button functionality
- [ ] Test error handling:
  - [ ] API failures
  - [ ] Network errors
  - [ ] Duplicate organization (409 conflict)
- [ ] Test with all wallet providers (Xaman, Crossmark, GemWallet)
- [ ] **CRITICAL**: Test payment channel creation after signup:
  - [ ] Verify organization.id is found by escrow_wallet_address
  - [ ] Confirm no "Organization not found" errors

### Phase 4: Cleanup & Migration (2-4 hours)
**Risk**: Low
**Rollback**: Restore auto-creation logic

**Tasks**:
- [ ] Remove auto-creation logic from `paymentChannels.js`
- [ ] Add helpful error message for missing organization
- [ ] Create data migration script for existing users
- [ ] Send "Complete Your Organization Profile" emails to existing NGOs
- [ ] Add banner in dashboard for incomplete org profiles
- [ ] Monitor error rates and user feedback
- [ ] (Optional) Drop `users.organization_name` column after 30 days

**Migration Script for Existing Users**:
```javascript
// scripts/migrate_organizations.js
const { query } = require('../backend/database/db')

async function migrateExistingOrganizations() {
  console.log('[MIGRATION_START] Migrating existing NGO/Employer users to organizations table')

  // CRITICAL: Find NGO/Employer users without organization records
  // Uses escrow_wallet_address to establish 1:1 mapping
  const usersWithoutOrgs = await query(`
    SELECT u.* FROM users u
    LEFT JOIN organizations o ON u.wallet_address = o.escrow_wallet_address
    WHERE (u.user_type = 'ngo' OR u.user_type = 'employer')
    AND o.id IS NULL
  `)

  console.log(`[MIGRATION_FOUND] ${usersWithoutOrgs.rows.length} users without organizations`)

  let successCount = 0
  let failCount = 0

  // Create organization records with simplified schema
  for (const user of usersWithoutOrgs.rows) {
    try {
      // CRITICAL: escrow_wallet_address = user.wallet_address (1:1 mapping)
      await query(`
        INSERT INTO organizations (
          organization_name, escrow_wallet_address, created_at
        ) VALUES ($1, $2, NOW())
      `, [
        user.organization_name || user.display_name,
        user.wallet_address  // CRITICAL: Establishes 1:1 mapping
      ])

      console.log(`✅ [MIGRATION_SUCCESS] ${user.wallet_address}`)
      successCount++
    } catch (error) {
      console.error(`❌ [MIGRATION_FAIL] ${user.wallet_address}:`, error.message)
      failCount++
    }
  }

  console.log('[MIGRATION_COMPLETE]', {
    total: usersWithoutOrgs.rows.length,
    success: successCount,
    failed: failCount
  })

  // Verify all NGO/Employer users now have organizations
  const verification = await query(`
    SELECT COUNT(*) as missing_orgs FROM users u
    LEFT JOIN organizations o ON u.wallet_address = o.escrow_wallet_address
    WHERE (u.user_type = 'ngo' OR u.user_type = 'employer')
    AND o.id IS NULL
  `)

  if (verification.rows[0].missing_orgs > 0) {
    console.warn(`⚠️ [MIGRATION_WARNING] ${verification.rows[0].missing_orgs} users still missing organizations`)
  } else {
    console.log('✅ [MIGRATION_VERIFIED] All NGO/Employer users have organizations')
  }
}

migrateExistingOrganizations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[MIGRATION_ERROR]', error)
    process.exit(1)
  })
```

### Phase 5: Monitoring & Optimization (Ongoing)
**Risk**: Low
**Focus**: User experience and data quality

**Tasks**:
- [ ] Monitor signup completion rates
- [ ] Track field completion rates (which optional fields are filled)
- [ ] Collect user feedback via in-app survey
- [ ] A/B test different field orderings
- [ ] Optimize form field labels and help text
- [ ] Add inline validation feedback
- [ ] Consider progressive save (save step 1 even if step 2 abandoned)

## Testing Strategy

### Unit Tests

**Backend Tests** (`backend/tests/organizations.test.js`):
```javascript
describe('POST /api/organizations', () => {
  it('should create organization with required fields only', async () => {
    const response = await request(app)
      .post('/api/organizations')
      .send({
        organizationName: 'Test NGO',
        escrowWalletAddress: 'rTest123...'
      })
    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.organization.id).toBeDefined()
  })

  it('should create organization with all fields (simplified schema)', async () => {
    const response = await request(app)
      .post('/api/organizations')
      .send({
        organizationName: 'Test NGO',
        escrowWalletAddress: 'rTest456...',
        website: 'https://testngo.org',
        description: 'A humanitarian organization providing aid'
      })
    expect(response.status).toBe(200)
    expect(response.body.data.organization.website).toBe('https://testngo.org')
    expect(response.body.data.organization.description).toBeTruthy()
  })

  it('should reject invalid wallet address', async () => {
    const response = await request(app)
      .post('/api/organizations')
      .send({
        organizationName: 'Test NGO',
        escrowWalletAddress: 'invalid'
      })
    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('Invalid XRPL')
  })

  it('should reject invalid URL format', async () => {
    const response = await request(app)
      .post('/api/organizations')
      .send({
        organizationName: 'Test NGO',
        escrowWalletAddress: 'rTest789...',
        website: 'not-a-url'
      })
    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('Invalid website URL')
  })

  it('should reject duplicate organization (same wallet)', async () => {
    // Create first org
    await request(app).post('/api/organizations').send({
      organizationName: 'Test NGO',
      escrowWalletAddress: 'rTestDup123...'
    })

    // Try to create duplicate with same wallet address
    const response = await request(app)
      .post('/api/organizations')
      .send({
        organizationName: 'Another NGO',
        escrowWalletAddress: 'rTestDup123...'  // Same wallet
      })
    expect(response.status).toBe(409)
    expect(response.body.error.message).toContain('already exists')
  })

  it('should enforce 1:1 mapping for payment channel creation', async () => {
    const walletAddress = 'rTestMapping123...'

    // Create organization
    await request(app).post('/api/organizations').send({
      organizationName: 'Mapping Test NGO',
      escrowWalletAddress: walletAddress
    })

    // Verify organization can be found by wallet address
    const orgLookup = await query(
      'SELECT * FROM organizations WHERE escrow_wallet_address = $1',
      [walletAddress]
    )

    expect(orgLookup.rows.length).toBe(1)
    expect(orgLookup.rows[0].organization_name).toBe('Mapping Test NGO')
    expect(orgLookup.rows[0].id).toBeDefined()

    // This organization.id should now be usable for payment channel creation
  })
})
```

**Frontend Tests** (`frontend/src/components/__tests__/OrganizationSetupStep.test.tsx`):
```typescript
describe('OrganizationSetupStep', () => {
  it('should render simplified form fields', () => {
    render(<OrganizationSetupStep {...defaultProps} />)
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mission statement|description/i)).toBeInTheDocument()
  })

  it('should validate required organization name', async () => {
    render(<OrganizationSetupStep {...defaultProps} />)
    const submitButton = screen.getByText(/complete setup/i)

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/organization name is required/i)).toBeInTheDocument()
    })
  })

  it('should validate URL format for website', async () => {
    render(<OrganizationSetupStep {...defaultProps} />)
    const websiteInput = screen.getByLabelText(/website/i)

    fireEvent.change(websiteInput, { target: { value: 'not-a-url' } })
    fireEvent.blur(websiteInput)

    await waitFor(() => {
      expect(screen.getByText(/invalid website url/i)).toBeInTheDocument()
    })
  })

  it('should validate description character limit', async () => {
    render(<OrganizationSetupStep {...defaultProps} />)
    const descriptionInput = screen.getByLabelText(/mission statement|description/i)

    const longDescription = 'a'.repeat(2001)  // 2001 characters
    fireEvent.change(descriptionInput, { target: { value: longDescription } })
    fireEvent.blur(descriptionInput)

    await waitFor(() => {
      expect(screen.getByText(/2000 characters or less/i)).toBeInTheDocument()
    })
  })

  it('should allow optional fields to be empty', async () => {
    const onComplete = jest.fn()
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { organization: {} } })
      })
    )

    render(<OrganizationSetupStep {...defaultProps} onComplete={onComplete} />)

    // Only fill required field
    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: 'Test NGO' }
    })
    fireEvent.click(screen.getByText(/complete setup/i))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    })
  })

  it('should call API with correct payload (simplified schema)', async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { organization: { id: 1 } }
        })
      })
    )
    global.fetch = mockFetch

    render(<OrganizationSetupStep {...defaultProps} walletAddress="rTest123..." />)

    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: 'Test NGO' }
    })
    fireEvent.change(screen.getByLabelText(/website/i), {
      target: { value: 'https://testngo.org' }
    })
    fireEvent.click(screen.getByText(/complete setup/i))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"escrowWalletAddress":"rTest123..."')
        })
      )
    })
  })

  it('should handle 409 duplicate organization error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          error: { message: 'Organization already exists' }
        })
      })
    )

    render(<OrganizationSetupStep {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: 'Test NGO' }
    })
    fireEvent.click(screen.getByText(/complete setup/i))

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })
  })

  it('should handle network errors gracefully', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error')))

    render(<OrganizationSetupStep {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: 'Test NGO' }
    })
    fireEvent.click(screen.getByText(/complete setup/i))

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })
})
```

### Integration Tests

**End-to-End Signup Flow**:
```typescript
describe('Multi-Step Signup Flow', () => {
  it('should complete full NGO signup', async () => {
    // Step 1: Connect wallet
    await connectWallet('Xaman', 'rTestNGO123...')

    // Step 2: User profile
    await fillUserProfile({
      displayName: 'Test NGO Admin',
      organizationName: 'Test NGO',
      email: 'admin@testngo.org'
    })
    await clickNext()

    // Step 3: Organization details (simplified schema)
    expect(screen.getByText(/organization details/i)).toBeInTheDocument()
    await fillOrganizationDetails({
      website: 'https://testngo.org',
      description: 'Humanitarian aid organization'
    })
    await clickCompleteSetup()

    // Verify redirection to dashboard
    await waitFor(() => {
      expect(screen.getByText(/ngo dashboard/i)).toBeInTheDocument()
    })

    // CRITICAL: Verify organization created with correct mapping
    const org = await query(
      'SELECT * FROM organizations WHERE escrow_wallet_address = $1',
      ['rTestNGO123...']
    )
    expect(org.rows.length).toBe(1)
    expect(org.rows[0].organization_name).toBe('Test NGO')
    expect(org.rows[0].escrow_wallet_address).toBe('rTestNGO123...')
    expect(org.rows[0].id).toBeDefined()

    // CRITICAL: Verify payment channel can find this organization
    const paymentChannelLookup = await query(
      'SELECT * FROM organizations WHERE escrow_wallet_address = $1',
      ['rTestNGO123...']
    )
    expect(paymentChannelLookup.rows[0].id).toBe(org.rows[0].id)
  })

  it('should skip org setup for employees', async () => {
    await connectWallet('Xaman', 'rTestEmployee123...')

    await fillUserProfile({
      displayName: 'Test Worker',
      userType: 'employee'
    })
    await clickCompleteSetup()

    // Should go directly to dashboard (no step 2)
    await waitFor(() => {
      expect(screen.getByText(/worker dashboard/i)).toBeInTheDocument()
    })

    // Verify NO organization created
    const org = await query(
      'SELECT * FROM organizations WHERE escrow_wallet_address = $1',
      ['rTestEmployee123...']
    )
    expect(org.rows.length).toBe(0)
  })
})
```

### Manual Testing Checklist

- [ ] **NGO Signup Flow**
  - [ ] Connect with Xaman wallet
  - [ ] Fill user profile (step 1): display name, organization name
  - [ ] Click "Next"
  - [ ] Fill organization details (step 2):
    - [ ] Organization name (pre-filled, required)
    - [ ] Website (optional, test with valid URL)
    - [ ] Description (optional, test character counter)
  - [ ] Click "Complete Setup"
  - [ ] Verify redirection to NGO Dashboard
  - [ ] Check database:
    - [ ] `users` record created with correct wallet_address
    - [ ] `organizations` record created with escrow_wallet_address = wallet_address
    - [ ] Organization has valid ID for payment channel reference

- [ ] **Employee Signup Flow**
  - [ ] Connect with Crossmark wallet
  - [ ] Fill user profile
  - [ ] Click "Complete Setup"
  - [ ] Verify immediate redirect to Worker Dashboard (no step 2)
  - [ ] Check database: only users record created

- [ ] **Validation Testing**
  - [ ] Leave organization name empty → error: "Organization name is required"
  - [ ] Enter invalid URL → error: "Invalid website URL format"
  - [ ] Test website field with:
    - [ ] Valid: `https://example.org` ✅
    - [ ] Valid: `http://example.com` ✅
    - [ ] Invalid: `example.com` ❌
    - [ ] Invalid: `not a url` ❌
  - [ ] Test description character limit:
    - [ ] 1999 characters → accepted ✅
    - [ ] 2000 characters → accepted ✅
    - [ ] 2001 characters → error ❌
  - [ ] Test optional fields can be empty ✅

- [ ] **Back Button Testing**
  - [ ] Fill step 1 → Next → Back → verify data persisted
  - [ ] Change data in step 1 after going back → verify updates

- [ ] **Error Handling**
  - [ ] Disconnect network → submit form → verify error message
  - [ ] Simulate 500 server error → verify user-friendly message
  - [ ] Submit duplicate organization → verify conflict error

- [ ] **Payment Channel Creation (CRITICAL TEST)**
  - [ ] Complete signup as NGO with wallet address `rABC123...`
  - [ ] Verify organization created in database:
    ```sql
    SELECT * FROM organizations WHERE escrow_wallet_address = 'rABC123...';
    -- Expected: 1 row with organization.id
    ```
  - [ ] Navigate to "Create Payment Channel" in dashboard
  - [ ] Select worker from dropdown
  - [ ] Fill in job details and hourly rate
  - [ ] Submit payment channel creation
  - [ ] **VERIFY SUCCESS**: Payment channel created without errors
  - [ ] **VERIFY NO "Organization not found" error**
  - [ ] Check backend logs:
    - [ ] Look for `[ORG_FOUND]` log with correct organization ID
    - [ ] NO `[ORG_NOT_FOUND]` errors should appear
    - [ ] NO auto-creation logic should trigger
  - [ ] Verify database:
    ```sql
    SELECT pc.*, o.organization_name
    FROM payment_channels pc
    JOIN organizations o ON pc.organization_id = o.id
    WHERE o.escrow_wallet_address = 'rABC123...';
    -- Expected: Payment channel with correct organization_id reference
    ```
  - [ ] **Test edge case**: Try creating payment channel before completing org signup → should fail with helpful error

- [ ] **Multi-Wallet Testing**
  - [ ] Test with Xaman
  - [ ] Test with Crossmark
  - [ ] Test with GemWallet
  - [ ] Test with Manual wallet

## Migration Plan for Existing Users

### Automated Migration

**Script**: `backend/scripts/migrate_organizations.js` (see Phase 4 above)

**Execution**:
```bash
cd backend
node scripts/migrate_organizations.js
```

**Dry Run Mode**:
```javascript
// Add --dry-run flag to preview without making changes
if (process.argv.includes('--dry-run')) {
  console.log('DRY RUN MODE: No changes will be made')
  console.log(`Would create ${usersWithoutOrgs.rows.length} organization records`)
  return
}
```

### Manual Intervention

**For NGOs with Incomplete Profiles**:

1. **Dashboard Banner**:
```
┌────────────────────────────────────────────┐
│ ⚠️ Complete Your Organization Profile     │
│                                            │
│ Help workers trust your organization by   │
│ adding registration details.               │
│                                            │
│ [COMPLETE PROFILE →]                       │
└────────────────────────────────────────────┘
```

2. **Email Notification**:
```
Subject: Complete Your Organization Profile on XAH Payroll

Hi [Display Name],

We've improved XAH Payroll with better organization profiles!

Add details like registration number, tax ID, and website to help
workers trust your organization and receive payments confidently.

Complete your profile: [LINK]

- XAH Payroll Team
```

3. **In-App Prompt**:
- Show modal on first login after update
- "We've upgraded! Complete your organization profile"
- Skip button available but encourage completion

## Success Metrics

### Data Quality Metrics

**Baseline (Before)**:
- Organizations with complete data: ~30% (auto-created with defaults)
- Organizations with registration numbers: 0%
- Organizations with website: 0%

**Target (3 months after)**:
- Organizations with complete data: >80%
- Organizations with registration numbers: >60%
- Organizations with website: >70%

### User Experience Metrics

**Signup Completion Rate**:
- Baseline: ~95% (current single-step)
- Target: >85% (multi-step)
- Alert threshold: <75%

**Time to Complete Signup**:
- Baseline: ~1 minute (current)
- Target: <3 minutes (multi-step)
- Alert threshold: >5 minutes

**Support Tickets**:
- "Organization not found" errors: 0 (currently ~5% of channels)
- Signup help requests: <2% of signups

### Technical Metrics

**API Performance**:
- Organization creation endpoint: <200ms p95
- Signup flow total time: <1 second p95

**Error Rates**:
- Organization creation failures: <0.5%
- Validation errors: <5%
- Duplicate organization errors: <1%

### Monitoring Dashboard

**Key Metrics to Track**:
```yaml
signup_funnel:
  - wallet_connected
  - step_1_started
  - step_1_completed
  - step_2_started (NGO/Employer only)
  - step_2_completed
  - redirected_to_dashboard

field_completion:
  - registration_number_filled
  - tax_id_filled
  - business_address_filled
  - website_filled
  - description_filled

user_behavior:
  - avg_time_step_1
  - avg_time_step_2
  - back_button_clicks
  - form_abandonment_rate
  - optional_fields_expanded_rate
```

## Rollback Plan

### Phase 2 Rollback (Backend API)

**If**: New API endpoints cause issues

**Action**:
1. Comment out new organization creation in `users.js`
2. Restore auto-creation logic in `paymentChannels.js`
3. Keep new organizations table columns (no harm)

**Rollback Command**:
```bash
git revert <commit-hash>
npm run restart:backend
```

### Phase 3 Rollback (Frontend UI)

**If**: Signup completion rate drops below 75%

**Action**:
1. Feature flag: `VITE_ENABLE_MULTI_STEP_SIGNUP=false`
2. Revert to old `ProfileSetupModal.tsx`
3. Keep backend changes (backward compatible)

**Rollback Command**:
```bash
# In frontend/.env
VITE_ENABLE_MULTI_STEP_SIGNUP=false

# Redeploy frontend
npm run build && npm run deploy
```

### Full Rollback

**If**: Critical issues affecting all signups

**Action**:
1. Rollback frontend deployment
2. Rollback backend deployment
3. Keep database migrations (data preserved)
4. Run reverse migration if needed:
```sql
ALTER TABLE organizations DROP COLUMN IF EXISTS registration_number;
ALTER TABLE organizations DROP COLUMN IF EXISTS tax_id;
-- etc.
```

## Future Enhancements

### Phase 6: Organization Editing (Post-Launch)

**Feature**: Allow NGOs to edit organization details after signup

**UI**: Settings page with organization profile section

**API**: PUT /api/organizations/:walletAddress (already planned)

### Phase 7: Multi-User Organizations

**Feature**: Multiple users can manage same organization

**Schema Changes**:
```sql
CREATE TABLE organization_users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id),
  user_wallet_address VARCHAR(34) REFERENCES users(wallet_address),
  role VARCHAR(20) NOT NULL, -- 'admin', 'manager', 'accountant'
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 8: Organization Verification

**Feature**: Verified badge for organizations with confirmed details

**Process**:
1. NGO submits verification documents
2. Admin reviews and approves
3. Badge shown to workers

**Schema**:
```sql
ALTER TABLE organizations ADD COLUMN verified BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN verification_date TIMESTAMP;
ALTER TABLE organizations ADD COLUMN verifier_notes TEXT;
```

### Phase 9: Public Organization Profiles

**Feature**: Workers can browse verified organizations before applying

**URL**: `/organizations/:walletAddress/profile`

**Public Fields**:
- Organization name
- Description/mission
- Website
- Verified badge
- Active payment channels count
- Average worker rating (future)

## Open Questions

### Design Decisions Needed

1. **Required vs Optional Fields**
   - Which fields should be mandatory for org creation?
   - Current proposal: Only organization name required, rest optional
   - Alternative: Require registration number for verification eligibility

2. **Signup Flow Style**
   - Multi-step modal (2 separate pages)
   - Single page with sections (all fields visible)
   - Hybrid (single page with progressive disclosure)

3. **Migration Strategy**
   - Auto-migrate all existing users immediately?
   - Gradual migration with prompts?
   - Only migrate when user tries to create payment channel?

4. **Validation Strictness**
   - Strict URL validation (must be valid domain)?
   - Lenient (any text allowed)?
   - Auto-format (add https:// if missing)?

5. **Data Retention**
   - Keep `users.organization_name` for backward compatibility?
   - Drop after 30 days?
   - Never drop (keep as denormalized cache)?

### User Feedback Needed

1. **Field Priority**: Which optional fields are most important to workers?
2. **Form Length**: Is 7-10 fields too much for initial signup?
3. **Progressive Save**: Should we save step 1 even if user abandons step 2?
4. **Help Text**: What explanations do NGOs need for each field?

## Implementation Timeline

### Estimated Timeline: 2-3 weeks

**Week 1**:
- Day 1-2: Database migration + backend API development
- Day 3-4: Backend testing + API documentation
- Day 5: Code review + merge to staging

**Week 2**:
- Day 1-3: Frontend component development
- Day 4-5: Frontend testing + UI polish

**Week 3**:
- Day 1: Integration testing
- Day 2: User acceptance testing (UAT)
- Day 3: Staging deployment + smoke testing
- Day 4: Production deployment + monitoring
- Day 5: Migration of existing users + support

### Quick Wins (Can Ship Incrementally)

**Week 1 Only** (Backend foundation):
- Database migration
- New organization API endpoint
- Keep auto-creation as fallback
- Test on staging

**Week 1-2** (Backend + minimal frontend):
- Add optional organization fields to current ProfileSetupModal
- Keep single-step flow
- Create org record during profile creation
- No multi-step UI yet

**Full Implementation** (All features):
- Multi-step modal
- Complete field set
- Remove auto-creation
- Full migration

## Resources

### Documentation
- [XRPL Address Format](https://xrpl.org/accounts.html#addresses)
- [Payment Channel Guide](https://xrpl.org/payment-channels.html)
- [React Hook Form](https://react-hook-form.com/) (if we want to switch from manual forms)
- [Yup Validation](https://github.com/jquense/yup) (for schema-based validation)

### Reference Implementations
- [Stripe Organization Setup](https://stripe.com/docs/connect/onboarding) - Multi-step business profile
- [Shopify Account Creation](https://www.shopify.com/signup) - Progressive disclosure
- [Square Sign Up](https://squareup.com/signup) - Simple to complex flow

### Internal References
- Current: `frontend/src/components/ProfileSetupModal.tsx`
- Current: `backend/routes/users.js`
- Current: `backend/routes/paymentChannels.js:33-80` (auto-creation)
- Schema: `backend/database/migrations/001_create_payment_channels.sql`

## Approval & Sign-off

**Stakeholders**:
- [ ] Product Owner: Approve user experience design
- [ ] Technical Lead: Approve architecture decisions
- [ ] Backend Developer: Commit to implementation timeline
- [ ] Frontend Developer: Commit to UI/UX implementation
- [ ] QA Engineer: Review testing strategy
- [ ] DevOps: Review deployment plan

**Before Starting Implementation**:
- [ ] All open questions resolved
- [ ] Design mockups approved
- [ ] API contracts finalized
- [ ] Timeline agreed upon
- [ ] Success metrics defined

---

**Document Version**: 1.0
**Last Updated**: 2025-11-11
**Next Review**: After Phase 2 completion
