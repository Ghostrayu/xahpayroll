# Database Interface Guide

Minimalistic reference for XAH Payroll database architecture and patterns.

**Schema Version**: v1.2 (Production-synchronized as of 2026-01-16)

---

## Connection

**Configuration**: `backend/database/db.js`

```javascript
// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'xahpayroll',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
})
```

**Environment Variables** (`backend/.env`):
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=xahpayroll_dev
DB_USER=xahpayroll_user
DB_PASSWORD=your_secure_password_here
```

**Production**: Supabase PostgreSQL pooler
```bash
DB_HOST=your-production-host.pooler.supabase.com
DB_NAME=postgres
DB_USER=postgres.your_supabase_project_id
DB_PASSWORD=your_production_password_here
```

---

## Schema

**Canonical**: `backend/database/schema.sql` (14 tables)

**Initialize**:
```bash
cd backend
npm run init-db  # Applies schema.sql automatically
```

**Core Tables**:
```
users (wallet_address PK)
  ├─ organizations (escrow_wallet_address → users.wallet_address)
  ├─ employees (employee_wallet_address → users.wallet_address)
  ├─ sessions
  └─ notifications (user_id FK)

payment_channels (channel_id UNIQUE)
  ├─ FK: organization_id → organizations.id
  ├─ FK: employee_id → employees.id
  └─ work_sessions (payment_channel_id FK)
      └─ payments (session_id FK)

Notification Tables (3 separate systems):
  ├─ notifications (generic user notifications via user_id)
  ├─ ngo_notifications (NGO org notifications via organization_id)
  └─ worker_notifications (worker closure requests via worker_wallet_address)
```

---

## Critical Patterns

### 1. Wallet Address Restrictions

**RULE**: A wallet address can ONLY be `employee` OR `ngo`/`employer`, never both.

```sql
-- Enforced at application level (no DB constraint)
-- Check before creating payment channels
SELECT user_type FROM users WHERE wallet_address = $1;
```

### 2. Organization Mapping

**CRITICAL**: Organizations use `escrow_wallet_address` (NOT `user_id`) for lookups.

```javascript
// ✅ CORRECT
const org = await query(
  'SELECT id FROM organizations WHERE escrow_wallet_address = $1',
  [walletAddress]
)

// ❌ WRONG - Don't use user_id for API lookups
const org = await query(
  'SELECT id FROM organizations WHERE user_id = $1',
  [userId]
)
```

**Why**: Frontend sends wallet addresses, not user IDs. 1:1 mapping guaranteed.

### 3. Multi-Organization Workers

**PATTERN**: Same worker wallet can work for multiple organizations.

```sql
-- Worker can have multiple employee records
SELECT e.id, o.organization_name
FROM employees e
JOIN organizations o ON e.organization_id = o.id
WHERE e.employee_wallet_address = 'rWorkerWallet123';

-- Multiple payment channels per worker (different employers/jobs)
SELECT pc.*, o.organization_name
FROM payment_channels pc
JOIN employees e ON pc.employee_id = e.id
JOIN organizations o ON pc.organization_id = o.id
WHERE e.employee_wallet_address = 'rWorkerWallet123';
```

### 4. Payment Channel Lifecycle

**States**: `active` → `closing` → `closed`

```sql
-- Active: Normal operation, work sessions tracked
-- Closing: Expiration set, awaiting settlement delay
-- Closed: Finalized on ledger, closure_tx_hash stored

UPDATE payment_channels
SET status = 'closing',
    expiration_time = $1,
    closure_initiated_at = NOW()
WHERE id = $2;
```

**Critical Fields**:
- `channel_id`: 64-char hex from ledger (NEVER `TEMP-*`)
- `creation_tx_hash`: PaymentChannelCreate transaction hash (audit trail)
- `closure_tx_hash`: PaymentChannelClaim transaction hash
- `escrow_funded_amount`: Initial funding from ledger
- `off_chain_accumulated_balance`: Worker earnings (database tracking)

---

## API Endpoints

### Payment Channels

**Create**: `POST /api/payment-channels/create`
```javascript
{
  organizationWalletAddress: string,  // NGO wallet (maps to escrow_wallet_address)
  workerWalletAddress: string,        // Worker wallet
  workerName: string,
  jobName: string,
  hourlyRate: number,
  fundingAmount: number,
  channelId: string,                  // 64-char hex from ledger
  creationTxHash: string,             // Transaction hash (NEW)
  settleDelay: number,                // Seconds (default 86400)
  expiration: number                  // Ripple epoch time
}
```

**Close**: `POST /api/payment-channels/close`
```javascript
{
  channelId: string,
  closureTxHash: string,
  closedAt: string,
  closureReason: string
}
```

### Workers

**Add**: `POST /api/workers/add`
```javascript
{
  ngoWalletAddress: string,
  workerWalletAddress: string,
  workerName: string,
  hourlyRate: number
}
```

**List**: `GET /api/workers/list/:ngoWalletAddress`

**Worker Channels**: `GET /api/workers/:walletAddress/payment-channels`

---

## Migrations

**Location**: `backend/database/migrations/`

**Pattern**:
```sql
-- 001_create_payment_channels.sql
-- 002_add_payment_type_enum.sql
-- 003_add_on_chain_balance.sql
-- ...
-- 006_add_creation_tx_hash.sql (latest)
```

**Apply**:
```bash
# Development
PGPASSWORD='your_dev_password' psql -U xahpayroll_user -d xahpayroll_dev -h localhost -p 5432 \
  -f backend/database/migrations/XXX.sql

# Production (Supabase)
PGPASSWORD='your_production_password' psql -h your-production-host.pooler.supabase.com \
  -U postgres.your_supabase_project_id -d postgres -p 5432 \
  -f backend/database/migrations/XXX.sql
```

---

## Query Patterns

### Camel Case Transformation

**Backend returns snake_case, frontend expects camelCase.**

```javascript
// backend/routes/organizations.js
const transformToCamelCase = (row) => ({
  id: row.id,
  organizationName: row.organization_name,
  escrowWalletAddress: row.escrow_wallet_address,
  // ... all fields transformed
})
```

### Common Queries

**Get Active Channels for Worker**:
```sql
SELECT pc.*, o.organization_name, u.display_name as employer_name
FROM payment_channels pc
JOIN employees e ON pc.employee_id = e.id
JOIN organizations o ON pc.organization_id = o.id
JOIN users u ON o.user_id = u.id
WHERE e.employee_wallet_address = $1
  AND pc.status = 'active'
ORDER BY pc.created_at DESC;
```

**Get Work Sessions for Channel**:
```sql
SELECT * FROM work_sessions
WHERE payment_channel_id = $1
ORDER BY clock_in_time DESC;
```

**Check for Phantom Channels** (audit):
```sql
SELECT id, channel_id, job_name, status, created_at
FROM payment_channels
WHERE LENGTH(channel_id) != 64
   OR channel_id LIKE 'TEMP-%'
ORDER BY created_at DESC;
```

---

## Security

**Connection**: Environment variables only (never commit credentials)

**Access Control**: Application-level (no DB roles for users)

**Sensitive Fields**:
- `wallet_address`: Public addresses (not private keys)
- `escrow_wallet_address`: Public addresses (not private keys)
- Private keys NEVER stored in database

**Sessions**: JWT tokens in `sessions` table (not in DB for API auth)

---

## Diagnostic Commands

**Check Connection**:
```bash
PGPASSWORD='...' psql -U user -d db -h host -p 5432 -c "SELECT version();"
```

**List Tables**:
```bash
PGPASSWORD='...' psql -U user -d db -h host -p 5432 -c "\dt"
```

**Count Records**:
```bash
PGPASSWORD='...' psql -U user -d db -h host -p 5432 -c "
SELECT
  'users' as table_name, COUNT(*) FROM users
UNION ALL SELECT 'payment_channels', COUNT(*) FROM payment_channels
UNION ALL SELECT 'work_sessions', COUNT(*) FROM work_sessions;
"
```

**Schema Details**:
```bash
PGPASSWORD='...' psql -U user -d db -h host -p 5432 -c "\d payment_channels"
```

---

## Common Issues

### Issue: `column "worker_wallet_address" does not exist`
**Cause**: Production schema uses `employee_wallet_address` (via employees table join)
**Fix**: Use JOINs, not direct column access

### Issue: `ORG_NOT_FOUND` error
**Cause**: Looking up organization by `user_id` instead of `escrow_wallet_address`
**Fix**: Always use `escrow_wallet_address` for organization lookups from frontend

### Issue: Phantom channels (TEMP-* IDs)
**Cause**: Channel ID retrieval failure during creation
**Fix**: Enhanced retrieval logic (see `PHANTOM_CHANNEL_FIX_2026_01_16.md`)
**Audit**: Run phantom channel check query above

---

## Performance

**Indexes** (from schema.sql):
```sql
-- Payment channels
CREATE INDEX idx_payment_channels_channel_id ON payment_channels(channel_id);
CREATE INDEX idx_payment_channels_status ON payment_channels(status);
CREATE INDEX idx_payment_channels_employee ON payment_channels(employee_id);
CREATE INDEX idx_payment_channels_org ON payment_channels(organization_id);
CREATE INDEX idx_payment_channels_creation_tx_hash ON payment_channels(creation_tx_hash);

-- Work sessions
CREATE INDEX idx_work_sessions_channel ON work_sessions(payment_channel_id);
CREATE INDEX idx_work_sessions_clock_in ON work_sessions(clock_in_time);

-- Organizations
CREATE INDEX idx_organizations_escrow_wallet ON organizations(escrow_wallet_address);
```

**Connection Pooling**: Default max 10 connections (`db.js`)

---

## References

- **Schema**: `backend/database/schema.sql`
- **Setup Guide**: `DOCUMENTS/DATABASE_SETUP.md`
- **Migrations**: `backend/database/migrations/`
- **Phantom Channel Fix**: `backend/claudedocs/PHANTOM_CHANNEL_FIX_2026_01_16.md`
