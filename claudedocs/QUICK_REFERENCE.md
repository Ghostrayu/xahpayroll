# XAH Payroll - Quick Reference Guide

**Last Updated**: 2025-11-18

---

## INSTANT COMMANDS

### Development
```bash
# Start everything (from root)
npm run dev

# Start individually
npm run dev:backend
npm run dev:frontend

# Install dependencies
npm run install:all

# Build frontend
npm run build

# Run tests
cd backend && npm test

# Check database
cd backend && npm run test:db

# Initialize database
cd backend && npm run init-db
```

---

## FILE LOCATIONS CHEAT SHEET

### Frontend Key Files
```
frontend/src/
├── App.tsx                           # Route definitions
├── types/api.ts                      # TypeScript interfaces (SINGLE SOURCE OF TRUTH)
├── contexts/
│   ├── AuthContext.tsx               # User authentication
│   ├── WalletContext.tsx             # XRPL wallet integration (600+ lines)
│   └── DataContext.tsx               # NGO/worker data
├── components/
│   ├── AddWorkerModal.tsx            # Add worker with QR scan
│   ├── CreatePaymentChannelModal.tsx # Create payment channel
│   ├── DeleteProfileModal.tsx        # Worker deletion
│   ├── NGONotifications.tsx          # Notification center
│   └── UnclaimedBalanceWarningModal.tsx # Unclaimed balance warnings
├── pages/
│   ├── NgoDashboard.tsx              # NGO dashboard
│   ├── WorkerDashboard.tsx           # Worker dashboard
│   ├── NgoSettings.tsx               # NGO settings
│   └── EmployeeSettings.tsx          # Worker settings (deletion trigger)
├── services/
│   └── api.ts                        # Centralized API client
└── utils/
    ├── walletTransactions.ts         # Multi-wallet transaction handling
    └── paymentChannels.ts            # Payment channel utilities
```

### Backend Key Files
```
backend/
├── server.js                         # Express server setup
├── database/
│   ├── db.js                         # PostgreSQL connection pool
│   └── migrations/
│       ├── 001_create_payment_channels.sql
│       ├── 002_add_closure_columns.sql
│       ├── 002_enhance_organizations_table.sql
│       └── 003_worker_deletion.sql   # Worker deletion system (NEW)
├── routes/
│   ├── xaman.js                      # Xaman wallet integration
│   ├── users.js                      # User profile management
│   ├── organizations.js              # NGO/employer management
│   ├── paymentChannels.js            # Payment channel operations
│   └── workers.js                    # Worker management (add, delete, export)
├── jobs/
│   ├── hardDelete.js                 # Hourly hard delete job
│   └── inactivityDeletion.js         # Daily inactivity job
└── tests/
    ├── workerDeletion.test.js        # Unit tests (870+ lines)
    └── workerDeletionIntegration.test.js # Integration tests (600+ lines)
```

---

## API ENDPOINTS QUICK REFERENCE

### Workers API (`/api/workers`)
```
POST   /api/workers/add                           # Add worker to organization
GET    /api/workers/list/:ngoWalletAddress        # List organization's workers
GET    /api/workers/:walletAddress/payment-channels # Worker's payment channels
GET    /api/workers/deletion-eligibility          # Check deletion eligibility
POST   /api/workers/delete-profile                # Initiate soft delete
POST   /api/workers/cancel-deletion               # Cancel deletion (48h window)
GET    /api/workers/deletion-status               # Check deletion status
GET    /api/workers/export-data                   # Export worker data (PDF)
```

### Payment Channels API (`/api/payment-channels`)
```
POST   /api/payment-channels/create               # Create payment channel
POST   /api/payment-channels/:id/close            # Initiate channel closure
POST   /api/payment-channels/:id/close/confirm    # Confirm closure after XRPL tx
GET    /api/payment-channels/:id                  # Get channel details
```

### Organizations API (`/api/organizations`)
```
GET    /api/organizations/:walletAddress/stats    # Organization statistics
POST   /api/organizations/create                  # Create organization
```

### NGO Notifications API (`/api/ngo-notifications`)
```
GET    /api/ngo-notifications                     # Fetch NGO notifications
PUT    /api/ngo-notifications/:id/read            # Mark notification as read
```

### Xaman API (`/api/xaman`)
```
POST   /api/xaman/sign-in                         # Xaman sign-in
GET    /api/xaman/payload/:uuid                   # Payload status
POST   /api/xaman/payload                         # Generic payload endpoint
```

---

## DATABASE TABLES QUICK REFERENCE

### Core Tables
```sql
users                  -- Wallet addresses, user types, profile data
  ├── deleted_at       -- Soft delete timestamp (NEW)
  ├── deletion_reason  -- Deletion reason (NEW)
  └── last_login_at    -- Track inactivity (NEW)

organizations          -- NGO/employer organizations
employees              -- Workers linked to organizations
payment_channels       -- Payment channel records with closure tracking
work_sessions          -- Clock in/out tracking
payments               -- Payment history
sessions               -- Authentication sessions

deletion_logs          -- Audit trail of deletions (NEW)
ngo_notifications      -- Notification system (NEW)
```

---

## TYPESCRIPT INTERFACES (Single Source of Truth)

**Location**: `frontend/src/types/api.ts`

```typescript
OrgStats                   // Organization statistics
Worker                     // Worker information
WorkerForChannel           // Worker details for payment channel dropdown
PaymentChannel             // Active payment channel information
Activity                   // Recent activity feed entries
WorkSession                // Individual work session tracking
WorkerEarnings             // Aggregated earnings data
CancelChannelData          // Payment channel cancellation response
ConfirmChannelData         // Payment channel confirmation response
```

**IMPORTANT**: Always import from `types/api.ts`, never duplicate type definitions.

---

## SCHEDULED JOBS

### Hard Delete Job
- **File**: `backend/jobs/hardDelete.js`
- **Schedule**: Runs hourly (`0 * * * *`)
- **Function**: Permanently deletes workers after 48h grace period

### Inactivity Deletion Job
- **File**: `backend/jobs/inactivityDeletion.js`
- **Schedule**: Runs daily at 2 AM (`0 2 * * *`)
- **Function**: Soft-deletes inactive workers (14+ days no login)

---

## ENVIRONMENT VARIABLES

### Frontend (`.env`)
```bash
VITE_BACKEND_URL=http://localhost:3001
VITE_XRPL_NETWORK=mainnet  # or testnet
```

### Backend (`.env`)
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=xahpayroll_dev
DB_USER=xahpayroll_user
DB_PASSWORD=your_secure_password_here

# Network
XRPL_NETWORK=mainnet  # or testnet

# Xaman
XAMAN_API_KEY=your_xaman_api_key
XAMAN_API_SECRET=your_xaman_api_secret

# Server
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
```

---

## COMMON TASKS

### Add a New API Endpoint
1. Create route handler in `backend/routes/[module].js`
2. Add route to `backend/server.js`
3. Add API client method in `frontend/src/services/api.ts`
4. Add TypeScript interface in `frontend/src/types/api.ts`
5. Use in component/page

### Add a New Frontend Component
1. Create component in `frontend/src/components/`
2. Follow ALL CAPS convention for user-facing text
3. Import types from `frontend/src/types/api.ts`
4. Use API client from `frontend/src/services/api.ts`

### Add a New Database Table
1. Create migration SQL in `backend/database/migrations/`
2. Run migration: `cd backend && npm run init-db`
3. Add TypeScript interface in `frontend/src/types/api.ts`
4. Update backend routes to transform snake_case → camelCase

### Run Tests
```bash
# All tests
cd backend && npm test

# Specific test file
cd backend && npx jest tests/workerDeletion.test.js

# Watch mode
cd backend && npm test -- --watch

# Coverage
cd backend && npm test -- --coverage
```

---

## DEBUGGING TIPS

### Frontend Issues
```bash
# Check browser console (F12)
# Check Network tab for API calls
# Verify wallet extension is unlocked
# Check VITE_BACKEND_URL is correct
# Verify VITE_XRPL_NETWORK matches backend
```

### Backend Issues
```bash
# Check logs: backend/logs/
# Test database: cd backend && npm run test:db
# Check environment variables: cat backend/.env
# Verify PostgreSQL is running: pg_isready
# Check port conflicts: lsof -i :3001
```

### Payment Channel Issues
```bash
# Verify wallet has sufficient XAH balance
# Check network setting (testnet vs mainnet)
# Verify wallet provider is connected
# Check browser console for XRPL errors
# Inspect payment_channels table in database
```

---

## CODE STYLE REMINDERS

### ALL CAPS Convention
**ALL user-facing text MUST use FULL CAPITALIZATION**

✅ Correct:
```typescript
alert('ORGANIZATION NAME AND WALLET ADDRESS REQUIRED')
<button>DELETE MY PROFILE</button>
<h2>⚠️ DANGER ZONE</h2>
```

❌ Wrong:
```typescript
alert('Organization name and wallet address required')
<button>Delete My Profile</button>
<h2>⚠️ Danger Zone</h2>
```

### Naming Conventions
- **Frontend**: camelCase (JavaScript/TypeScript convention)
- **Backend**: snake_case in database, transformed to camelCase in route handlers
- **Database columns**: snake_case
- **API responses**: camelCase

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Run tests: `cd backend && npm test`
- [ ] Build frontend: `npm run build`
- [ ] Check environment variables
- [ ] Test on testnet first
- [ ] Review database migrations
- [ ] Backup production database

### Deployment
- [ ] Deploy backend first
- [ ] Run database migrations
- [ ] Configure scheduled jobs (cron)
- [ ] Deploy frontend
- [ ] Test critical flows
- [ ] Monitor logs for errors

### Post-Deployment
- [ ] Verify health check: `/health`
- [ ] Test wallet connections
- [ ] Test payment channel creation
- [ ] Monitor scheduled job execution
- [ ] Check error logs

---

## EMERGENCY CONTACTS

### Rollback Procedure
1. Revert to previous git commit
2. Re-deploy previous version
3. Restore database from backup if needed
4. Check scheduled jobs are running

### Database Restore
```bash
# Backup
pg_dump -U xahpayroll_user xahpayroll_dev > backup.sql

# Restore
psql -U xahpayroll_user xahpayroll_dev < backup.sql
```

---

## USEFUL LINKS

- **GitHub**: Repository URL
- **Netlify**: Frontend deployment dashboard
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **XRPL Docs**: https://xrpl.org/
- **Xahau Docs**: https://docs.xahau.network/
- **Xaman Docs**: https://xumm.readme.io/

---

**Quick Reference Guide Created**: 2025-11-18
**For Full Documentation**: See `CLAUDE.md` and `README.md`
