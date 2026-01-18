# XAH Payroll Database Schema Evolution History

## Overview

This document chronicles the major database schema changes during XAH Payroll development. The project now uses a **single canonical schema** (`backend/database/schema.sql` v1.2) as the source of truth, loaded directly by `init-db.js`.

**Current Schema**: `backend/database/schema.sql` (v1.2, production-synchronized 2026-01-16)
**Tables**: 15 production tables
**Migration System**: Not implemented - schema.sql is used for all database initialization

---

## Critical Schema Changes

### 2025-11-09: Payment Channel Closure Tracking

**Migration**: 002_add_closure_columns.sql
**Impact**: HIGH - Core payment channel functionality

**Changes**:
- Added `closure_tx_hash VARCHAR(128)` to track PaymentChannelClaim transaction
- Added `closed_at TIMESTAMP` to record closure timestamp
- Enabled audit trail for payment channel lifecycle

**Rationale**: Required for tracking complete payment channel lifecycle from creation through closure, essential for financial audit and transparency.

---

### 2025-11-12: Multi-Step Organization Signup

**Migration**: 002_enhance_organizations_table.sql
**Impact**: MEDIUM - User experience improvement

**Changes**:
- Added `website VARCHAR(255)` for organization website URL
- Added `description TEXT` for mission statements
- Created indexes: `idx_organizations_escrow_wallet`, `idx_organizations_created_at`

**Rationale**: Enhanced organization profiles with optional fields for better NGO representation and searchability.

---

### 2025-11-12: Worker Profile Deletion System

**Migration**: 003_worker_deletion.sql
**Impact**: HIGH - GDPR compliance and data management

**Changes**:
- **Users table enhancements**:
  - Added `deleted_at TIMESTAMP` for soft delete tracking
  - Added `deletion_reason VARCHAR(255)` for audit trail
  - Added `last_login_at TIMESTAMP` for inactivity detection
  - Created indexes: `idx_users_deleted_at`, `idx_users_last_login`

- **New table: deletion_logs** (audit trail):
  - Tracks all worker deletions with full context
  - Records: wallet_address, user_type, deleted_by, deletion_reason
  - Stores: organizations_affected, channels_closed, data_export_url
  - Timestamps: created_at, hard_deleted_at

- **New table: ngo_notifications**:
  - Notification system for NGO organizations
  - Types: worker_deleted, worker_removed, deletion_error
  - Tracks read status and metadata

- **Cascade behavior updates**:
  - Updated `work_sessions` and `payments` foreign keys for CASCADE DELETE
  - Ensures orphaned records are automatically cleaned up

**Rationale**: GDPR compliance requirement allowing workers to delete their profiles, with proper notification system for affected NGOs and comprehensive audit trail.

---

### 2025-12-23: Two-Field Balance System (CRITICAL BUG FIX)

**Migration**: 006_two_field_balance_system.sql
**Impact**: CRITICAL - Worker wage protection

**Problem Solved**:
Ledger sync was overwriting `accumulated_balance` with XRPL's on-chain Balance field (always 0 for off-chain work tracking), causing worker wages to be lost when payment channels closed.

**Changes**:
- **New fields**:
  - `off_chain_accumulated_balance NUMERIC(20, 8)` - Worker earnings from clock in/out (SOURCE OF TRUTH)
  - `on_chain_balance NUMERIC(20, 8)` - XRPL ledger Balance field (read-only, audit only)
  - `legacy_accumulated_balance NUMERIC(20, 8)` - Renamed original field (rollback safety)

- **Data migration**:
  - Migrated existing `accumulated_balance` → `off_chain_accumulated_balance`
  - Initialized `on_chain_balance` to 0
  - Preserved original field as `legacy_accumulated_balance`

- **Performance indexes**:
  - `idx_payment_channels_off_chain_balance` (WHERE status = 'active')
  - `idx_payment_channels_on_chain_balance` (WHERE status = 'active')
  - `idx_payment_channels_balance_comparison` (composite index for discrepancy detection)

- **Column comments** added for developer guidance

**Implementation Details**:
- Transaction-safe migration with comprehensive validation
- Idempotent script (can be safely re-run)
- Pre-migration and post-migration verification checks
- Rollback script included (commented)

**Rationale**: Separation of concerns - off-chain earnings (worker wages) must never be overwritten by on-chain ledger sync. This change prevented a critical production bug where workers would lose accumulated wages upon channel closure.

**Post-Deployment**:
- Backend code updated to use `off_chain_accumulated_balance` for all wage calculations
- Ledger sync updates `on_chain_balance` only (read-only field)
- Payment channel closure uses `off_chain_accumulated_balance` as payment amount

---

### 2025-11-28: Worker Notifications System

**Migration**: 006_create_worker_notifications.sql
**Impact**: MEDIUM - Worker communication

**Changes**:
- **New table: worker_notifications**:
  - Notification system for worker alerts
  - Types: closure_request, payment_received, channel_closed
  - Tracks read status, approval status, transaction hashes
  - Channel-specific notifications with metadata support

**Rationale**: Enable NGOs to notify workers about payment channel events and closure requests, improving communication and transparency.

---

### 2025-12-28: Payment Channel CancelAfter Field

**Migration**: 007_add_cancel_after_field.sql
**Impact**: HIGH - Channel expiration management

**Changes**:
- Added `cancel_after TIMESTAMP` to `payment_channels` table
- Set to 24 hours after creation for automatic expiration
- Created index: `idx_payment_channels_cancel_after`
- Added CHECK constraint: `balance_update_frequency IN ('hourly', '30min', '15min', '5min')`

**Rationale**: XRPL PaymentChannelCreate requires CancelAfter field (Ripple timestamp). Enables automatic channel expiration after 24 hours if not closed earlier, preventing indefinite open channels.

---

### 2026-01-06: Channel Closure Payment Type

**Migration**: 002_add_channel_closure_payment_type.sql
**Impact**: MEDIUM - Payment record accuracy

**Changes**:
- Updated `payments.payment_type` constraint
- Added 'channel_closure' to allowed values: `('hourly', 'bonus', 'adjustment', 'refund', 'channel_closure')`

**Rationale**: Payment records created during channel closure needed dedicated payment type for accurate financial reporting and audit trail.

---

### 2026-01-15: Channel Closure Request Workflow (ARCHITECTURAL CHANGE)

**Migration**: 005_channel_closure_requests.sql
**Impact**: CRITICAL - Payment channel security architecture

**Problem Solved**:
Workers cannot directly close payment channels with accumulated balances because XRPL PaymentChannelClaim requires NGO signature. Worker attempts caused `temBAD_SIGNATURE` errors.

**Changes**:
- **New table: channel_closure_requests**:
  - Worker-initiated closure request workflow
  - Status lifecycle: pending → approved/rejected → completed/cancelled
  - Stores: requester details, NGO details, accumulated_balance, escrow_amount
  - Tracks: approval/rejection, completion, transaction hash

- **Indexes**:
  - `idx_closure_requests_ngo_status` - NGO queries for pending requests
  - `idx_closure_requests_worker` - Worker request history
  - `idx_closure_requests_channel` - Channel lookup
  - `idx_unique_pending_closure_request` - Prevent duplicate pending requests

- **Triggers**:
  - `closure_requests_updated_at` - Auto-update timestamp
  - `notify_ngo_closure_request` - Create ngo_notification on request
  - `cancel_requests_on_channel_close` - Auto-cancel pending requests when channel closes

- **Helper functions**:
  - `get_pending_closure_requests(ngo_wallet)` - Query pending requests

**Architectural Change**:
Workers can NO LONGER directly close payment channels. New workflow:
1. Worker submits closure request
2. NGO receives notification
3. NGO approves or rejects request
4. NGO executes closure (has private key for signature)

**Rationale**: XRPL protocol requirement - PaymentChannelClaim with accumulated balance requires channel owner (NGO) signature. Request-approval workflow provides security while maintaining worker autonomy.

**Impact on UX**:
- Workers see "Request Closure" button instead of "Close Channel"
- NGOs have dedicated "Closure Requests" tab in dashboard
- Improved transparency and audit trail for all closures

---

### 2026-01-16: Payment Channel Creation Transaction Hash

**Migration**: 006_add_creation_tx_hash.sql
**Impact**: MEDIUM - Channel ID recovery

**Changes**:
- Added `creation_tx_hash VARCHAR(128)` to `payment_channels` table
- Created index: `idx_payment_channels_creation_tx_hash`
- Added column comment for developer guidance

**Rationale**: Store PaymentChannelCreate transaction hash for manual channel ID recovery if automated retrieval fails. Critical for orphaned channel debugging and ledger-database reconciliation.

---

### 2026-01-17: Closure Notification Trigger Removal

**Migration**: 006_disable_closure_notification_trigger.sql
**Impact**: LOW - UI/UX clarity

**Changes**:
- Dropped trigger: `notify_ngo_closure_request` on `channel_closure_requests`
- Function retained for potential future use

**Rationale**: Closure requests managed exclusively in dedicated "Closure Requests" tab with approve/reject workflow. Notifications in general "Notifications" tab created confusion and duplicated information.

**Architectural Decision**: Closure requests require workflow interface, not just passive notifications.

---

## Schema Evolution Patterns

### Pattern: Field Separation for Data Integrity

**Example**: Two-field balance system (off_chain vs on_chain)

**Principle**: Separate fields with different data sources prevents unintended overwrites
- Off-chain fields: Application-managed, source of truth for business logic
- On-chain fields: Ledger-synced, read-only, for audit and verification

**Application**: Extended to other dual-source scenarios in the system

---

### Pattern: Soft Delete with Audit Trail

**Example**: Worker deletion system

**Principle**: Never hard-delete immediately, maintain audit trail
- Soft delete via `deleted_at` timestamp
- Dedicated `deletion_logs` table for complete audit history
- Grace period before hard delete (48 hours or instant if no dependencies)
- Cascade delete configuration for dependent records

**Application**: Used for all user-facing data deletion workflows

---

### Pattern: Request-Approval Workflow

**Example**: Channel closure requests

**Principle**: Security-sensitive operations require approval workflow
- Request table with status lifecycle
- Notification trigger for approvers
- Metadata storage for audit trail
- Unique constraint to prevent duplicate requests

**Application**: Can be extended for other multi-party approval scenarios

---

## Database Initialization

### Current System (v1.2)

**File**: `backend/database/schema.sql` (611 lines)
**Script**: `backend/scripts/init-db.js`
**Method**: Direct SQL execution

```javascript
const schemaPath = path.join(__dirname, '../database/schema.sql')
const schema = fs.readFileSync(schemaPath, 'utf8')
await client.query(schema)
```

**Usage**:
```bash
cd backend
npm run init-db
```

**Behavior**:
1. Checks if tables exist
2. Prompts for DROP/RECREATE confirmation
3. Executes entire schema.sql as single transaction
4. Verifies table structure post-creation

---

### Why No Migration System?

**Decision Rationale**:
1. **Simple deployment**: Single schema file easier to manage than 23+ migrations
2. **Fresh environments**: Development and testing always start from clean slate
3. **Production sync**: Schema.sql maintained in sync with production (Supabase)
4. **Team size**: Small team doesn't need complex migration orchestration

**When Migration System Would Be Needed**:
- Frequent incremental schema changes in production
- Multiple simultaneous developers making schema changes
- Need for granular rollback capability
- Distributed deployment across multiple production instances

**Implementation Path** (if needed in future):
1. Install migration runner: `npm install knex` or `npm install sequelize`
2. Generate baseline migration from current schema.sql
3. Create migrations table for version tracking
4. Update init-db.js to run migrations after baseline
5. Document migration workflow in CONTRIBUTING.md

---

## Production Schema Synchronization

### Current Process (Manual)

**Workflow**:
1. Schema changes developed locally using schema.sql
2. Changes tested in local PostgreSQL
3. Manual SQL migration applied to Supabase production
4. schema.sql updated to match production
5. Schema version bumped in schema.sql header
6. Sync documented in DOCUMENTS/SCHEMA_SYNC_*.md

**Latest Sync**: 2026-01-16 (v1.2)
**Documentation**: DOCUMENTS/SCHEMA_SYNC_2026_01_16.md

---

## Current Schema (v1.2)

### 15 Production Tables

1. **users** - Core user accounts (wallet addresses, user types, profile data)
2. **sessions** - Authentication sessions
3. **organizations** - NGO/employer organizations
4. **employees** - Workers linked to organizations
5. **payment_channels** - XRPL payment channel records (CORE TABLE)
6. **work_sessions** - Clock in/out tracking
7. **payments** - Payment transaction history
8. **escrow_transactions** - Escrow transaction audit trail
9. **payment_configurations** - Configurable payment rules
10. **activity_logs** - User action audit trail
11. **api_keys** - API access keys
12. **deletion_logs** - Profile deletion audit trail
13. **ngo_notifications** - NGO event notifications
14. **worker_notifications** - Worker alerts and closure requests
15. **channel_closure_requests** - Closure request workflow table

### Critical Indexes

**Performance-critical**:
- `idx_payment_channels_off_chain_balance` - Dashboard queries
- `idx_payment_channels_status` - Active channel filtering
- `idx_closure_requests_ngo_status` - Pending requests lookup

**Data integrity**:
- `idx_unique_pending_closure_request` - One pending request per channel
- `idx_users_wallet_address` - Unique wallet constraint

---

## Lessons Learned

### Migration Management
- Manual migrations without tracking led to duplicate numbering
- Schema.sql consolidation simplified deployment
- Historical migration files became obsolete but weren't cleaned up

### Data Integrity
- Separation of off-chain and on-chain data prevented critical bug
- Soft delete patterns provide audit trail and rollback capability
- Request-approval workflows better than direct operations for security

### Production Deployment
- Manual sync between development and production requires discipline
- Schema version tracking in comments essential
- Documentation of schema changes critical for team coordination

---

## Future Considerations

### Potential Enhancements

1. **Migration System Implementation**:
   - If team grows or deployment complexity increases
   - Use knex.js or sequelize for migration orchestration
   - Generate baseline migration from current schema.sql

2. **Automated Schema Validation**:
   - CI/CD checks for schema consistency
   - Automated comparison of local vs production schema
   - Alert on schema drift

3. **Schema Versioning**:
   - Formal versioning beyond comments
   - Schema migrations table with version tracking
   - Rollback capability for production changes

---

## References

**Current Schema**: `backend/database/schema.sql` (v1.2)
**Initialization**: `backend/scripts/init-db.js`
**Database Setup**: `DOCUMENTS/DATABASE_SETUP.md`
**Production Sync**: `DOCUMENTS/SCHEMA_SYNC_2026_01_16.md`

**Related Memories**:
- `migrations_cleanup_analysis_2026_01_17` - Migration folder analysis
- `payment_system_architecture_verified` - Payment architecture documentation
- `session_2026_01_16_balance_reset_fix` - Balance system fixes

---

**Document Version**: 1.0
**Last Updated**: 2026-01-17
**Maintainer**: Development Team
