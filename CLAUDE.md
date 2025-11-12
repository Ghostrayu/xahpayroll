# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XAH Payroll is a decentralized hourly payroll system built on the XAH Ledger (Xahau). It enables automatic hourly wage payments through XRP/XAH payment channels, with multi-wallet support and role-based access control.

## Development Commands

### Quick Start
```bash
# Install all dependencies (root, frontend, backend)
npm run install:all

# Start both servers (backend on :3001, frontend on :3000)
npm run dev

# Start servers individually
npm run dev:backend   # Backend only
npm run dev:frontend  # Frontend only
```

### Building & Testing
```bash
# Build frontend for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Test database connection
cd backend && npm run test:db

# Initialize database schema
cd backend && npm run init-db
```

### Deployment
```bash
# Deploy to production (Netlify)
npm run deploy

# Deploy preview
npm run deploy:preview
```

## Architecture

### Monorepo Structure
```
xahaupayroll/
├── frontend/          # React + TypeScript + Vite
├── backend/           # Node.js + Express + PostgreSQL
└── package.json       # Root scripts for running both
```

### Frontend Architecture

**Tech Stack**: React 18, TypeScript, Vite, TailwindCSS, React Router v6

**State Management**: React Context API (no Redux)
- `AuthContext` - User authentication and session management
- `WalletContext` - XRPL wallet connections and transactions

**Key Patterns**:
- Protected routes based on user type (`employee` vs `ngo`/`employer`)
- Multi-wallet abstraction layer in `utils/walletTransactions.ts`
- Context providers nested: `AuthProvider > WalletProvider > Router`

**Wallet Support**:
- Xaman (QR code + deep linking via Xaman SDK)
- Crossmark (browser extension)
- GemWallet (browser extension)
- Manual (seed/address input for testing)

Transaction signing is handled per-wallet in `utils/walletTransactions.ts` via `submitTransactionWithWallet()`.

### Backend Architecture

**Tech Stack**: Express.js, PostgreSQL, XRPL SDK

**API Routes** (all under `/api/`):
- `/xaman` - Xaman wallet integration endpoints (sign-in, payload status, payment requests)
- `/users` - User profile management
- `/organizations` - NGO/employer management and statistics
- `/payment-channels` - Payment channel creation and tracking
- `/workers` - Worker management (add, list workers per organization)

**Database**: PostgreSQL with existing schema
- `users` table - wallet addresses, user types, profile data
- `sessions` table - authentication sessions
- `organizations` table - NGO/employer organizations
- `employees` table - workers linked to organizations (supports multi-org workers)
- `payment_channels` table - payment channel records
- `work_sessions` table - clock in/out tracking
- `payments` table - payment history

**Security**: Helmet, CORS, rate limiting (100 req/15min), JWT tokens

### Network Configuration

The app supports both **testnet** and **mainnet** via environment variables:

**Frontend** (`frontend/.env`):
```bash
VITE_XRPL_NETWORK=testnet  # or mainnet
VITE_BACKEND_URL=http://localhost:3001
```

**Backend** (`backend/.env`):
```bash
XRPL_NETWORK=testnet
# Xahau WebSocket URLs are auto-selected based on network:
# testnet: wss://xahau-test.net
# mainnet: wss://xahau.network
```

**Important**: Always restart dev server after changing network settings.

## Critical Business Rules

### Wallet Address Restrictions
**A wallet address can ONLY be registered as either an employee OR an ngo/employer, never both.**

This is enforced at the database and application level. Users must use separate wallet addresses for different account types.

### Worker Management Flow
1. **Add Worker**: NGO adds worker to organization via AddWorkerModal
   - Option to scan worker's Xaman wallet QR code for address
   - Worker wallet address validated (cannot be NGO/employer address)
   - Worker added to `employees` table
   - Same worker can be added to multiple organizations
2. **Create Payment Channel**: NGO selects worker from dropdown
   - Only shows workers already added to the organization
   - Worker's wallet address displayed below selection
   - Multiple payment channels can be created per worker (different jobs)

### Payment Channel Flow
1. NGO/Employer creates payment channel with worker (selected from dropdown)
2. Channel funded with XAH escrow
3. Worker logs hours via dashboard
4. Hourly payments released automatically from channel
5. Timeout/inactivity ends session and returns unused escrow

### User Types
- `employee` - Workers who receive payments
- `ngo` / `employer` - Organizations that create payment channels and pay workers

Routes are protected based on user type via `ProtectedRoute` component.

## Database Setup

PostgreSQL 14+ required. Setup instructions in `DATABASE_SETUP.md` and `setup_database.sql`.

```bash
# Initialize database
cd backend
npm run init-db

# Test connection
npm run test:db
```

**Security Note**: `setup_database.sql` contains placeholder password `CHANGE_THIS_PASSWORD`. Generate a secure password before running:
```bash
openssl rand -base64 32
```

## Worker Management API

**POST /api/workers/add**
- Add a worker to an organization
- Validates XRPL address format
- Prevents duplicate workers per organization
- Prevents NGO/Employer wallets from being workers
- Creates user record if doesn't exist

**GET /api/workers/list/:ngoWalletAddress**
- Fetch all active workers for an organization
- Returns workers sorted alphabetically by name
- Used by CreatePaymentChannelModal dropdown

**Key Features**:
- Same worker wallet can work for multiple organizations
- Each organization can set different hourly rates per worker
- Workers must be added before creating payment channels
- "Scan with Xaman" QR code feature in AddWorkerModal for easy address input

## Payment Channel Implementation

Payment channels use native XRPL `PaymentChannelCreate` transactions.

**Key Files**:
- `frontend/src/utils/paymentChannels.ts` - Channel utilities (create, close)
- `frontend/src/utils/walletTransactions.ts` - Multi-wallet transaction handler
- `frontend/src/services/api.ts` - API client with `paymentChannelApi` (cancel, confirm)
- `backend/routes/paymentChannels.js` - API endpoints (create, close, confirm)
- `backend/routes/workers.js` - Worker management API
- `backend/database/migrations/001_create_payment_channels.sql` - Database schema

**Creation Process**:
1. NGO adds workers via "Add Worker" button (optional: scan Xaman QR code)
2. NGO creates channel via `CreatePaymentChannelModal` (selects worker from dropdown)
3. Transaction signed by connected wallet (Xaman/Crossmark/GemWallet)
4. Channel details stored in database with job name, worker, hourly rate
5. Dashboard displays active channels and escrow balances

**Cancellation Process**:
1. NGO clicks "Cancel Channel" button on active channel
2. Confirmation modal displays channel details and escrow return amount
3. NGO confirms cancellation
4. Backend API returns XRPL transaction details (`POST /close`)
5. Frontend executes `PaymentChannelClaim` transaction with wallet
6. Worker receives accumulated balance, unused escrow returns to NGO
7. Frontend confirms closure in database (`POST /close/confirm`)
8. Channel status updated to 'closed' with transaction hash stored

See `PAYMENT_CHANNEL_TESTING.md` for detailed testing guide.

## Important Files

### Configuration
- `frontend/.env.example` - Frontend environment template
- `backend/.env.example` - Backend environment template (comprehensive)
- `frontend/vite.config.ts` - Vite config with path aliases (`@/` = `src/`)

### Documentation
- `README.md` - Full project documentation
- `CONTEXT_IMPLEMENTATION.md` - React Context implementation checklist
- `PAYMENT_CHANNEL_TESTING.md` - Payment channel testing guide
- `NETWORK_CONFIG.md` - Network switching instructions
- `DATABASE_SETUP.md` - Database setup guide
- `WALLET_INTEGRATION.md` - Wallet integration details

### Core Application Files
- `frontend/src/App.tsx` - Route definitions and provider nesting
- `frontend/src/types/api.ts` - Centralized TypeScript type definitions (single source of truth)
- `frontend/src/contexts/WalletContext.tsx` - XRPL wallet integration (600+ lines)
- `frontend/src/contexts/AuthContext.tsx` - User authentication
- `frontend/src/contexts/DataContext.tsx` - NGO/worker data management
- `frontend/src/components/AddWorkerModal.tsx` - Add worker with Xaman QR scan
- `frontend/src/components/CreatePaymentChannelModal.tsx` - Create payment channel with worker dropdown
- `frontend/src/services/api.ts` - Centralized API client
- `backend/server.js` - Express server setup and middleware
- `backend/database/db.js` - PostgreSQL connection pool
- `backend/routes/workers.js` - Worker management endpoints
- `backend/routes/organizations.js` - Organization data endpoints (transforms to camelCase)
- `backend/routes/xaman.js` - Xaman wallet integration endpoints

## Recent Updates & Features

### Worker Management System (Added)
- **Add Worker Modal**: NGOs can add workers to their organization
  - "Scan with Xaman" QR code feature for easy wallet address input
  - Validates XRPL address format
  - Prevents adding NGO/employer wallets as workers
  - Supports multi-organization workers (same wallet can work for multiple NGOs)

- **Worker Selection Dropdown**: CreatePaymentChannelModal now shows dropdown
  - Only displays workers already added to organization
  - Worker's wallet address shown below selection in greyed box
  - Prevents manual entry errors
  - Workers must be added before creating payment channels

### Payment Channel Cancellation (Added)
- **Complete Cancel Flow**: NGOs can cancel active payment channels with automatic escrow return
  - **Backend Endpoints**:
    - `POST /api/payment-channels/:channelId/close` - Initiates cancellation, returns XRPL transaction details
    - `POST /api/payment-channels/:channelId/close/confirm` - Confirms closure after XRPL transaction succeeds
  - **Authorization**: Only channel owner (NGO) can cancel
  - **State Validation**: Cannot cancel already-closed channels
  - **Escrow Return**: Calculates and returns unused escrow to NGO wallet
  - **Worker Payment**: Worker receives accumulated unpaid balance
  - **2-Phase Commit**: Database updates only after successful XRPL transaction

- **XRPL Integration**:
  - `frontend/src/utils/paymentChannels.ts` - `closePaymentChannel()` function
  - Builds `PaymentChannelClaim` transaction with tfClose flag
  - Multi-wallet support: Xaman, Crossmark, GemWallet
  - Converts XAH to drops (1 XAH = 1,000,000 drops)

- **Frontend UI** (`frontend/src/pages/NgoDashboard.tsx`):
  - Red "Cancel Channel" button on active channels
  - Confirmation modal with channel details
  - Shows escrow return amount before cancellation
  - 3-step flow: API → XRPL → Confirm
  - Loading states: "Canceling..." during processing
  - Success/error alerts with detailed feedback
  - Auto-refresh dashboard after completion

- **Database Schema** (`backend/database/migrations/001_create_payment_channels.sql`):
  - Complete `payment_channels` table with closure tracking
  - `closure_tx_hash` - Transaction hash of PaymentChannelClaim
  - `closed_at` - Timestamp when channel was closed
  - `closure_reason` - Reason for closure (manual, timeout, claim, expired)

**Security Features**:
- Authorization check: Only channel owner can cancel
- State validation: Cannot cancel already-closed channels
- Input validation: Wallet address and channel ID format checks
- Re-validation on confirm: Never trust client, verify again
- Atomic operations: DB update only after XRPL tx succeeds
- Escrow safety: Prevents negative returns, handles edge cases

**Testing Checklist**:
- [ ] Create payment channel with testnet XAH
- [ ] Click "Cancel Channel" button
- [ ] Review confirmation modal
- [ ] Sign PaymentChannelClaim transaction
- [ ] Verify escrow returned to NGO wallet
- [ ] Verify worker receives accumulated balance
- [ ] Check database: status='closed', closure_tx_hash populated
- [ ] Test unauthorized cancel (different wallet)
- [ ] Test already-closed channel
- [ ] Test all 3 wallet providers

### TypeScript Interface Standardization (Added - 2025-01)
- **Centralized Type Definitions**: Created `frontend/src/types/api.ts` as single source of truth
  - All API response interfaces now use consistent camelCase naming
  - Comprehensive documentation for each interface
  - Backend endpoint mappings and component usage locations documented
  - Field-by-field descriptions with data types and constraints

- **Naming Convention Standard**:
  - **Frontend**: All TypeScript interfaces use camelCase (JavaScript/TypeScript convention)
  - **Backend**: Database columns remain snake_case, transformed to camelCase in route handlers
  - **Transformation Point**: Backend routes (`backend/routes/*.js`) map database results to camelCase
  - **Examples**:
    - Database: `employee_wallet_address` → API Response: `employeeWalletAddress`
    - Database: `balance_update_frequency` → API Response: `balanceUpdateFrequency`
    - Database: `job_name` → API Response: `jobName`

- **Updated Files**:
  - `frontend/src/types/api.ts` - Centralized type definitions (NEW)
  - `frontend/src/services/api.ts` - Imports from centralized types
  - `frontend/src/contexts/DataContext.tsx` - Uses centralized types
  - `frontend/src/pages/NgoDashboard.tsx` - Updated property access to camelCase
  - `frontend/src/components/CreatePaymentChannelModal.tsx` - Uses WorkerForChannel type
  - `backend/routes/organizations.js` - Transforms worker data to camelCase

- **Type Definitions Available**:
  - `OrgStats` - Organization statistics for NGO dashboard
  - `Worker` - Worker information for dashboard workers list
  - `WorkerForChannel` - Worker details for payment channel creation dropdown
  - `PaymentChannel` - Active payment channel information
  - `Activity` - Recent activity feed entries
  - `WorkSession` - Individual work session tracking
  - `WorkerEarnings` - Aggregated earnings data
  - `CancelChannelData` - Payment channel cancellation response
  - `ConfirmChannelData` - Payment channel confirmation response

- **Benefits**:
  - Eliminates snake_case vs camelCase confusion between backend and frontend
  - Single source of truth prevents type drift and inconsistencies
  - Self-documenting code with inline comments showing backend endpoints
  - Better IDE autocomplete and type checking
  - Easier onboarding for new developers

### API Response Structure (Fixed)
- All organization endpoints now return data directly in `response.data`
- Fixed SQL type mismatch in activity query (`NULL::numeric`)
- Corrected payment channels endpoint path

### UI Improvements
- NGO Dashboard: Changed "ACTIVE" to "CLOCKED IN" for clarity
- Payment Channel Modal: Prominent info box about adding workers first
- Worker dropdown sorted alphabetically by name

## Testing Notes

- Always test on testnet before mainnet deployment
- Test all three wallet providers (Xaman, Crossmark, GemWallet)
- Verify wallet address restrictions (employee vs ngo)
- Test "Scan with Xaman" QR code feature in AddWorkerModal
- Test worker dropdown selection in CreatePaymentChannelModal
- Check payment channel creation with real XAH amounts
- Validate network switching (testnet ↔ mainnet)
- Test multi-organization worker scenarios

## Common Gotchas

1. **Network Mismatch**: Frontend and backend must use same network (testnet vs mainnet)
2. **Port Conflicts**: Frontend (3000), Backend (3001) - ensure ports are free
3. **Database Connection**: PostgreSQL must be running before starting backend
4. **Wallet Extensions**: Browser extensions (Crossmark, GemWallet) must be installed and unlocked
5. **Environment Variables**: Copy `.env.example` to `.env` in both frontend and backend
6. **Concurrent Startup**: Use `npm run dev` from root, not individual starts (avoids race conditions)

## Development Workflow

1. Ensure PostgreSQL is running
2. Copy and configure `.env` files in frontend and backend
3. Run `npm run install:all` (first time only)
4. Run `npm run dev` from root directory
5. Frontend opens automatically at http://localhost:3000
6. Backend API available at http://localhost:3001
7. Health check: http://localhost:3001/health

## Security Best Practices

- Never commit `.env` files (already in `.gitignore`)
- Never store private keys in environment variables or code
- Use testnet wallets for development
- Validate all user inputs on backend
- All wallet signing happens client-side via wallet providers
- Database credentials should be rotated between environments

## Code Style Conventions

### Error Messages
- **Capitalization**: ALL error messages MUST use FULL CAPITALIZATION (ALL CAPS)
- **Format**: Every word in error messages should be fully capitalized
- **Examples**:
  - ✅ Correct: `'ORGANIZATION NAME AND WALLET ADDRESS REQUIRED'`
  - ✅ Correct: `'INVALID XRPL WALLET ADDRESS FORMAT'`
  - ✅ Correct: `'FAILED TO CREATE ORGANIZATION'`
  - ✅ Correct: `'ORGANIZATION NOT FOUND'`
  - ❌ Wrong: `'Organization name and wallet address required'`
  - ❌ Wrong: `'Invalid XRPL wallet address format'`

**Rationale**: ALL CAPS provides immediate visual distinction for error messages and ensures consistency across frontend and backend.
