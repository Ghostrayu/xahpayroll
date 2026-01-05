# XAH Payroll - System Architecture

## Table of Contents
- [Overview](#overview)
- [System Architecture Diagram](#system-architecture-diagram)
- [Component Interactions](#component-interactions)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Technology Stack](#technology-stack)
- [Design Patterns](#design-patterns)
- [Security Architecture](#security-architecture)
- [Network Architecture](#network-architecture)

---

## Overview

XAH Payroll is a decentralized hourly payroll system built on the XAH Ledger (Xahau) using payment channels for efficient payment settlement. The system enables NGOs and employers to manage worker payments with automatic hourly wage tracking and secure escrow-based payment channels.

**CRITICAL**: Workers are NOT paid hourly. Earnings accumulate in the database during work sessions, and workers receive a SINGLE payment when the channel closes, minimizing ledger fees.

### Architecture Principles
- **Decentralized**: Blockchain-based payment channels with non-custodial wallets
- **Secure**: Multi-layer security with wallet-based authentication
- **Scalable**: Monorepo structure with independent frontend/backend scaling
- **Privacy-First**: Worker data protected, payments secured via XRPL escrow

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         XAH PAYROLL SYSTEM                          │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐                    ┌──────────────────────┐
│   WORKER CLIENT      │                    │   NGO/EMPLOYER       │
│                      │                    │   CLIENT             │
│  ┌────────────────┐  │                    │  ┌────────────────┐  │
│  │ React SPA      │  │                    │  │ React SPA      │  │
│  │ (TypeScript)   │  │                    │  │ (TypeScript)   │  │
│  │                │  │                    │  │                │  │
│  │ • Dashboard    │  │                    │  │ • Dashboard    │  │
│  │ • Clock In/Out │  │                    │  │ • Add Workers  │  │
│  │ • Payment View │  │                    │  │ • Create Ch.   │  │
│  └────────┬───────┘  │                    │  └────────┬───────┘  │
└───────────┼──────────┘                    └───────────┼──────────┘
            │                                           │
            │ HTTPS/REST                 HTTPS/REST    │
            │                                           │
            └───────────────┬───────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────────────────┐
            │     BACKEND API SERVER (Express.js)       │
            │                                           │
            │  ┌─────────────────────────────────────┐ │
            │  │      API ROUTES (/api/*)            │ │
            │  │  • /xaman      • /users             │ │
            │  │  • /organizations                   │ │
            │  │  • /payment-channels                │ │
            │  │  • /workers    • /work-sessions     │ │
            │  └──────────────┬──────────────────────┘ │
            │                 │                         │
            │  ┌──────────────▼──────────────────────┐ │
            │  │   MIDDLEWARE STACK                  │ │
            │  │  • Helmet (Security Headers)        │ │
            │  │  • CORS (Origin Control)            │ │
            │  │  • Rate Limiter (100 req/15min)     │ │
            │  │  • Error Handler                    │ │
            │  └──────────────┬──────────────────────┘ │
            └─────────────────┼──────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
    ┌──────────────────┐ ┌─────────┐ ┌──────────────┐
    │   POSTGRESQL     │ │ XAMAN   │ │  XAHAU       │
    │   DATABASE       │ │ API     │ │  LEDGER      │
    │                  │ │         │ │  (XRPL)      │
    │ • users          │ │ QR Code │ │              │
    │ • organizations  │ │ Sign-in │ │ Payment      │
    │ • employees      │ │ Payloads│ │ Channels     │
    │ • payment_       │ │         │ │              │
    │   channels       │ │         │ │ Escrow       │
    │ • work_sessions  │ │         │ │ Funds        │
    │ • payments       │ │         │ │              │
    └──────────────────┘ └─────────┘ └──────────────┘
```

---

## Component Interactions

### Frontend Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    REACT APPLICATION                        │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │           CONTEXT PROVIDERS (State)                │    │
│  │                                                    │    │
│  │  ┌──────────────────────────────────────────────┐ │    │
│  │  │         AuthContext                          │ │    │
│  │  │  • User authentication                       │ │    │
│  │  │  • Session management                        │ │    │
│  │  │  • User type (employee/ngo/employer)         │ │    │
│  │  └─────────────┬────────────────────────────────┘ │    │
│  │                │                                   │    │
│  │  ┌─────────────▼──────────────────────────────┐   │    │
│  │  │         WalletContext                      │   │    │
│  │  │  • XRPL wallet connections                 │   │    │
│  │  │  • Transaction signing                     │   │    │
│  │  │  • Balance tracking                        │   │    │
│  │  │  • Xaman integration                       │   │    │
│  │  └─────────────┬──────────────────────────────┘   │    │
│  │                │                                   │    │
│  │  ┌─────────────▼──────────────────────────────┐   │    │
│  │  │         DataContext                        │   │    │
│  │  │  • NGO/worker data                         │   │    │
│  │  │  • Payment channels                        │   │    │
│  │  │  • Work sessions                           │   │    │
│  │  └────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │              ROUTING (React Router v6)             │    │
│  │                                                    │    │
│  │  • Protected Routes (user type based)             │    │
│  │  • /employee/* - Worker dashboard                 │    │
│  │  • /ngo/*      - NGO dashboard                    │    │
│  │  • /employer/* - Employer dashboard               │    │
│  │  • Public routes (/, /signin, /terms)             │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │                  COMPONENTS                        │    │
│  │                                                    │    │
│  │  Dashboards:                    Modals:           │    │
│  │  • WorkerDashboard              • AddWorkerModal  │    │
│  │  • NGODashboard                 • CreateChannel   │    │
│  │                                 • ProfileSettings │    │
│  │  Payment:                       Forms:            │    │
│  │  • PaymentChannelCard           • SignUpForm     │    │
│  │  • WorkSessionTracker           • SignInForm     │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Backend Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  EXPRESS.JS SERVER                          │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │            MIDDLEWARE PIPELINE                     │    │
│  │                                                    │    │
│  │  1. Helmet.js      → Security headers             │    │
│  │  2. CORS           → Origin validation            │    │
│  │  3. body-parser    → JSON parsing                 │    │
│  │  4. Rate Limiter   → 100 req/15min                │    │
│  │  5. Error Handler  → Global error handling        │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │              API ROUTE HANDLERS                    │    │
│  │                                                    │    │
│  │  /api/xaman           - Wallet integration         │    │
│  │    • POST /sign-in    - Create sign-in payload    │    │
│  │    • GET  /status/:id - Check payload status      │    │
│  │                                                    │    │
│  │  /api/users           - User management            │    │
│  │    • GET    /profile  - Get user profile          │    │
│  │    • PUT    /profile  - Update profile            │    │
│  │    • DELETE /profile  - Delete account            │    │
│  │                                                    │    │
│  │  /api/organizations   - NGO/Employer data          │    │
│  │    • POST   /create   - Create organization       │    │
│  │    • GET    /:wallet  - Get org details           │    │
│  │    • GET    /:wallet/stats - Organization stats   │    │
│  │                                                    │    │
│  │  /api/payment-channels - Payment channel ops      │    │
│  │    • POST /create     - Create payment channel    │    │
│  │    • POST /close      - Close payment channel     │    │
│  │    • POST /close/confirm - Confirm closure        │    │
│  │    • GET  /active/:wallet - Get active channels   │    │
│  │                                                    │    │
│  │  /api/workers         - Worker management          │    │
│  │    • POST /add        - Add worker to org         │    │
│  │    • GET  /list/:ngo  - List org workers          │    │
│  │    • GET  /:wallet/payment-channels               │    │
│  │                                                    │    │
│  │  /api/work-sessions   - Time tracking             │    │
│  │    • POST /clock-in   - Start work session        │    │
│  │    • POST /clock-out  - End work session          │    │
│  │    • GET  /active/:wallet - Get active sessions   │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │          DATABASE ACCESS LAYER                     │    │
│  │                                                    │    │
│  │  PostgreSQL Connection Pool                        │    │
│  │  • Parameterized queries (SQL injection safe)     │    │
│  │  • Transaction support                            │    │
│  │  • Connection pooling (max 20)                    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │          EXTERNAL INTEGRATIONS                     │    │
│  │                                                    │    │
│  │  Xaman API                    Xahau Ledger         │    │
│  │  • Create payloads            • Create channels    │    │
│  │  • Check status               • Close channels     │    │
│  │  • WebSocket events           • Query balances     │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

```
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE SCHEMA                          │
│                      (PostgreSQL)                           │
│                                                             │
│  ┌──────────────┐                                          │
│  │    users     │                                          │
│  ├──────────────┤                                          │
│  │ id (PK)      │───┐                                      │
│  │ wallet_addr  │   │                                      │
│  │ user_type    │   │                                      │
│  │ name         │   │                                      │
│  │ created_at   │   │                                      │
│  └──────────────┘   │                                      │
│                     │                                      │
│  ┌──────────────┐   │    ┌──────────────────┐             │
│  │organizations │◄──┘    │   employees      │             │
│  ├──────────────┤        ├──────────────────┤             │
│  │ id (PK)      │───┐    │ id (PK)          │             │
│  │ user_id (FK) │   │    │ org_id (FK)      │◄───┐        │
│  │ name         │   │    │ wallet_address   │    │        │
│  │ wallet_addr  │   │    │ name             │    │        │
│  │ created_at   │   │    │ hourly_rate      │    │        │
│  └──────────────┘   │    │ created_at       │    │        │
│                     │    └──────────────────┘    │        │
│                     │                            │        │
│  ┌──────────────┐   │    ┌──────────────────┐   │        │
│  │payment_      │   │    │  work_sessions   │   │        │
│  │channels      │◄──┘    ├──────────────────┤   │        │
│  ├──────────────┤        │ id (PK)          │   │        │
│  │ id (PK)      │───┐    │ channel_id (FK)  │───┤        │
│  │ org_id (FK)  │   │    │ employee_id (FK) │───┘        │
│  │ channel_id   │   │    │ clock_in_time    │            │
│  │ worker_wallet│   │    │ clock_out_time   │            │
│  │ job_title    │   │    │ hours_worked     │            │
│  │ hourly_rate  │   │    │ total_earned     │            │
│  │ escrow_amt   │   │    │ status           │            │
│  │ accum_bal    │   │    │ created_at       │            │
│  │ status       │   │    └──────────────────┘            │
│  │ created_at   │   │                                     │
│  └──────────────┘   │    ┌──────────────────┐            │
│                     │    │    payments      │            │
│                     │    ├──────────────────┤            │
│                     └───►│ id (PK)          │            │
│                          │ channel_id (FK)  │            │
│                          │ session_id (FK)  │            │
│                          │ amount           │            │
│                          │ status           │            │
│                          │ tx_hash          │            │
│                          │ created_at       │            │
│                          └──────────────────┘            │
└─────────────────────────────────────────────────────────────┘

Key Relationships:
• users 1:N organizations (one user can create multiple orgs)
• organizations 1:N employees (one org has many workers)
• organizations 1:N payment_channels (one org has many channels)
• employees 1:N work_sessions (one worker has many sessions)
• payment_channels 1:N work_sessions (one channel tracks many sessions)
• payment_channels 1:N payments (one channel has many payments)
```

---

## Data Flow Diagrams

### 1. User Authentication Flow (Xaman Wallet)

```
┌────────────┐                                    ┌──────────────┐
│   USER     │                                    │   BACKEND    │
│  (Browser) │                                    │              │
└─────┬──────┘                                    └──────┬───────┘
      │                                                  │
      │  1. Click "Connect Wallet"                       │
      ├─────────────────────────────────────────────────►│
      │                                                  │
      │                    2. Create sign-in payload     │
      │                       POST /api/xaman/sign-in    │
      │◄─────────────────────────────────────────────────┤
      │                                                  │
      │  3. Display QR Code                              │
      │     (payload UUID)                               │
      │                                                  │
      │                                    ┌─────────────┴───────────┐
      │                                    │   XAMAN APP (Mobile)    │
      │                                    └─────────────┬───────────┘
      │  4. Scan QR Code                                 │
      ├─────────────────────────────────────────────────►│
      │                                                  │
      │                    5. Approve sign-in            │
      │◄─────────────────────────────────────────────────┤
      │                                                  │
      │  6. Poll status                                  │
      │     GET /api/xaman/status/:uuid                  │
      ├─────────────────────────────────────────────────►│
      │                                                  │
      │  7. Return: signed, wallet_address               │
      │◄─────────────────────────────────────────────────┤
      │                                                  │
      │  8. Create/fetch user profile                    │
      │     POST /api/users/profile                      │
      ├─────────────────────────────────────────────────►│
      │                                                  │
      │  9. Return: user data, JWT token                 │
      │◄─────────────────────────────────────────────────┤
      │                                                  │
      │  10. Redirect to dashboard                       │
      │      (based on user_type)                        │
      │                                                  │
```

### 2. Payment Channel Creation Flow

```
┌────────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────────┐
│ NGO CLIENT │   │   BACKEND    │   │ DATABASE │   │ XAHAU LEDGER │
└─────┬──────┘   └──────┬───────┘   └────┬─────┘   └──────┬───────┘
      │                 │                 │                │
      │ 1. Select worker from dropdown   │                │
      │    (worker must be added to org) │                │
      │                 │                 │                │
      │ 2. Enter job details              │                │
      │    • Job title                    │                │
      │    • Hourly rate                  │                │
      │    • Escrow amount                │                │
      │                 │                 │                │
      │ 3. Click "Create Channel"         │                │
      ├────────────────►│                 │                │
      │                 │                 │                │
      │                 │ 4. Validate worker wallet exists │
      │                 │                 │                │
      │                 │                 │  Query ledger  │
      │                 │                 │  account_info  │
      │                 ├─────────────────┼───────────────►│
      │                 │                 │                │
      │                 │◄────────────────┼────────────────┤
      │                 │   Account active: YES/NO         │
      │                 │                 │                │
      │ 5. Return transaction details      │                │
      │    (PaymentChannelCreate)          │                │
      │◄────────────────┤                 │                │
      │                 │                 │                │
      │ 6. Sign transaction via Xaman     │                │
      │    (client-side)                  │                │
      │                 │                 │                │
      │                 │                 │  7. Submit tx  │
      ├─────────────────┼─────────────────┼───────────────►│
      │                 │                 │                │
      │                 │                 │  8. Channel    │
      │                 │                 │     created    │
      │◄────────────────┼─────────────────┼────────────────┤
      │                 │                 │                │
      │ 9. Query ledger for channel ID    │                │
      │    (64-char hex)                  │                │
      ├────────────────►│                 │                │
      │                 ├─────────────────┼───────────────►│
      │                 │  account_channels query          │
      │                 │◄────────────────┼────────────────┤
      │                 │                 │                │
      │                 │ 10. Store channel in DB          │
      │                 ├────────────────►│                │
      │                 │  INSERT payment_channels         │
      │                 │◄────────────────┤                │
      │                 │                 │                │
      │ 11. Return success                │                │
      │◄────────────────┤                 │                │
      │                 │                 │                │
      │ 12. Refresh dashboard             │                │
      │     (show new channel)            │                │
      │                 │                 │                │
```

### 3. Work Session Flow (Clock In/Out)

```
┌──────────────┐   ┌──────────────┐   ┌──────────┐
│WORKER CLIENT │   │   BACKEND    │   │ DATABASE │
└──────┬───────┘   └──────┬───────┘   └────┬─────┘
       │                  │                 │
       │ 1. View active payment channels   │
       ├─────────────────►│                 │
       │                  │  SELECT channels│
       │                  ├────────────────►│
       │                  │◄────────────────┤
       │◄─────────────────┤                 │
       │                  │                 │
       │ 2. Click "Clock In" for channel   │
       ├─────────────────►│                 │
       │                  │  INSERT work_   │
       │                  │  session        │
       │                  │  (clock_in_time)│
       │                  ├────────────────►│
       │                  │◄────────────────┤
       │◄─────────────────┤                 │
       │  Session ID: 123 │                 │
       │                  │                 │
       │ [Worker performs work for X hours]│
       │                  │                 │
       │ 3. Click "Clock Out"               │
       ├─────────────────►│                 │
       │                  │  UPDATE work_   │
       │                  │  session        │
       │                  │  • clock_out    │
       │                  │  • hours_worked │
       │                  │  • total_earned │
       │                  │  • status=done  │
       │                  ├────────────────►│
       │                  │◄────────────────┤
       │                  │                 │
       │                  │  UPDATE payment_│
       │                  │  channel        │
       │                  │  • accum_balance│
       │                  │    += earned    │
       │                  │  • hours_accum  │
       │                  │    += hours     │
       │                  ├────────────────►│
       │                  │◄────────────────┤
       │◄─────────────────┤                 │
       │  Success: earned │                 │
       │  $X for Y hours  │                 │
       │                  │                 │

IMPORTANT: No ledger transaction occurs during clock-out!
           Earnings accumulate in database only.
           Payment released when channel closes.
```

### 4. Payment Channel Closure Flow

```
┌────────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────────┐
│NGO/WORKER  │   │   BACKEND    │   │ DATABASE │   │ XAHAU LEDGER │
└─────┬──────┘   └──────┬───────┘   └────┬─────┘   └──────┬───────┘
      │                 │                 │                │
      │ 1. Click "Cancel Channel"         │                │
      ├────────────────►│                 │                │
      │                 │                 │                │
      │ 2. Confirm closure                │                │
      │    (modal with channel details)   │                │
      ├────────────────►│                 │                │
      │                 │                 │                │
      │                 │ 3. Fetch channel data            │
      │                 ├────────────────►│                │
      │                 │  • accumulated_ │                │
      │                 │    balance      │                │
      │                 │  • escrow_amt   │                │
      │                 │  • channel_id   │                │
      │                 │◄────────────────┤                │
      │                 │                 │                │
      │ 4. Return PaymentChannelClaim tx  │                │
      │    details (with tfClose flag)    │                │
      │◄────────────────┤                 │                │
      │                 │                 │                │
      │ 5. Sign transaction via wallet    │                │
      │    (Xaman)                        │                │
      │                 │                 │                │
      │                 │                 │  6. Submit tx  │
      ├─────────────────┼─────────────────┼───────────────►│
      │                 │                 │                │
      │                 │                 │  7. Execute:   │
      │                 │                 │  • Send balance│
      │                 │                 │    to worker   │
      │                 │                 │  • Return      │
      │                 │                 │    unused      │
      │                 │                 │    escrow to   │
      │                 │                 │    NGO         │
      │◄────────────────┼─────────────────┼────────────────┤
      │                 │                 │  Tx hash: 0xABC│
      │                 │                 │                │
      │ 8. Confirm closure in database    │                │
      │    POST /close/confirm            │                │
      ├────────────────►│                 │                │
      │                 │  UPDATE payment_│                │
      │                 │  channel        │                │
      │                 │  • status=closed│                │
      │                 │  • closure_tx   │                │
      │                 │  • closed_at    │                │
      │                 ├────────────────►│                │
      │                 │◄────────────────┤                │
      │◄────────────────┤                 │                │
      │  Success        │                 │                │
      │                 │                 │                │

PAYMENT OCCURS HERE: Worker receives accumulated balance.
                     NGO receives (escrow - accumulated balance).
```

---

## Technology Stack

### Frontend
| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | React 18 | UI component library |
| Language | TypeScript | Type safety |
| Build Tool | Vite | Fast development and production builds |
| Styling | TailwindCSS | Utility-first CSS framework |
| Routing | React Router v6 | Client-side routing |
| State | Context API | Global state management (Auth, Wallet, Data) |
| HTTP Client | Axios | API communication |
| Wallet | Xaman SDK | Xaman wallet integration |

### Backend
| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Node.js 18+ | JavaScript server runtime |
| Framework | Express.js | Web server framework |
| Database | PostgreSQL 14+ | Relational database |
| ORM | pg (node-postgres) | PostgreSQL client |
| Security | Helmet.js | HTTP security headers |
| Security | CORS | Cross-origin resource sharing |
| Security | express-rate-limit | Rate limiting middleware |
| Authentication | JWT | JSON Web Tokens |
| Validation | Joi | Input validation schemas |

### Blockchain
| Component | Technology | Purpose |
|-----------|------------|---------|
| Network | Xahau (XRPL fork) | Layer 1 blockchain |
| Protocol | XRPL | Payment channels, escrow |
| Wallet | Xaman (XUMM) | Non-custodial wallet |
| SDK | xrpl.js | XRPL JavaScript library |

### DevOps
| Tool | Purpose |
|------|---------|
| Git | Version control |
| npm | Package management |
| concurrently | Run frontend + backend simultaneously |
| PostgreSQL | Development database |

---

## Design Patterns

### Frontend Patterns

#### 1. Context API Pattern
**Purpose**: Global state management without Redux complexity

```typescript
// Provider nesting hierarchy
<AuthProvider>
  <WalletProvider>
    <DataProvider>
      <App />
    </DataProvider>
  </WalletProvider>
</AuthProvider>
```

**Contexts**:
- `AuthContext`: User authentication, session, user type
- `WalletContext`: XRPL wallet connection, transactions
- `DataContext`: Payment channels, work sessions, organizations

#### 2. Protected Route Pattern
**Purpose**: User type-based route authorization

```typescript
<ProtectedRoute allowedUserTypes={['employee']}>
  <WorkerDashboard />
</ProtectedRoute>
```

#### 3. Strategy Pattern (Wallet Abstraction)
**Purpose**: Multi-wallet support with unified interface

```typescript
async function submitTransactionWithWallet(
  wallet: WalletType,
  transaction: XRPLTransaction
) {
  switch (wallet.type) {
    case 'xaman': return submitViaXaman(transaction);
    case 'manual': return submitManual(transaction);
  }
}
```

### Backend Patterns

#### 1. Repository Pattern
**Purpose**: Database access abstraction

```javascript
// Database queries isolated in functions
async function getUserByWallet(walletAddress) {
  return pool.query(
    'SELECT * FROM users WHERE wallet_address = $1',
    [walletAddress]
  );
}
```

#### 2. Middleware Pattern
**Purpose**: Request/response processing pipeline

```javascript
app.use(helmet());       // Security headers
app.use(cors());         // CORS handling
app.use(rateLimiter);    // Rate limiting
app.use(errorHandler);   // Error handling
```

#### 3. Factory Pattern
**Purpose**: XRPL client creation

```javascript
function createXRPLClient(network) {
  const url = network === 'testnet'
    ? 'wss://xahau-test.net'
    : 'wss://xahau.network';
  return new Client(url);
}
```

#### 4. Singleton Pattern
**Purpose**: Database connection pool

```javascript
// Single instance shared across app
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20
});
```

---

## Security Architecture

### Multi-Layer Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                     SECURITY LAYERS                         │
└─────────────────────────────────────────────────────────────┘

Layer 1: NETWORK SECURITY
├─ HTTPS/TLS encryption for all traffic
├─ CORS origin restrictions (whitelist)
└─ DDoS protection (via hosting provider)

Layer 2: APPLICATION SECURITY
├─ Helmet.js (HTTP security headers)
│  • X-Frame-Options: DENY
│  • X-Content-Type-Options: nosniff
│  • Strict-Transport-Security
│  • Content-Security-Policy
├─ Rate Limiting (100 requests per 15 minutes)
└─ Input Validation (Joi schemas)

Layer 3: AUTHENTICATION
├─ Wallet-Based Authentication (non-custodial)
│  • Xaman sign-in (cryptographic proof)
│  • No passwords stored
│  • Session tokens (JWT)
└─ User Type Authorization
   • Route-level protection
   • API endpoint guards

Layer 4: DATABASE SECURITY
├─ Parameterized Queries (SQL injection prevention)
├─ Connection Pooling (resource management)
├─ Foreign Key Constraints (data integrity)
└─ User Permissions (PostgreSQL roles)

Layer 5: BLOCKCHAIN SECURITY
├─ XRPL Payment Channels (escrow protection)
├─ Client-Side Signing (keys never leave wallet)
├─ Transaction Validation (ledger consensus)
└─ SettleDelay Period (worker protection during closure)
```

### Critical Security Rules

1. **Wallet Address Restriction**: A wallet can ONLY be registered as employee OR ngo/employer, never both
2. **No Private Keys**: Private keys never leave user's wallet (Xaman handles signing)
3. **Client-Side Signing**: All transactions signed in user's wallet, not on server
4. **Escrow Protection**: Funds locked in XRPL payment channels, released only on closure
5. **Worker Protection**: SettleDelay gives workers 24+ hours to claim balance during channel closure
6. **Input Validation**: All API inputs validated with Joi schemas
7. **SQL Injection Prevention**: All queries use parameterized statements
8. **Rate Limiting**: Prevents brute force and DDoS attacks

---

## Network Architecture

### Development Environment

```
┌────────────────────────────────────────────────────┐
│            DEVELOPMENT (localhost)                 │
└────────────────────────────────────────────────────┘

Frontend: http://localhost:3000
Backend:  http://localhost:3001
Database: localhost:5432 (PostgreSQL)

Xahau Network: Testnet
└─ WebSocket: wss://xahau-test.net
└─ Faucet: https://xahau-test.net/accounts

Xaman API: apps.xumm.dev (testnet mode)
```

### Production Environment

```
┌────────────────────────────────────────────────────┐
│              PRODUCTION (deployed)                 │
└────────────────────────────────────────────────────┘

Frontend: https://xahpayroll.com (Netlify)
Backend:  https://api.xahpayroll.com (self-hosted)
Database: Managed PostgreSQL instance

Xahau Network: Mainnet
└─ WebSocket: wss://xahau.network

Xaman API: apps.xumm.dev (production mode)
```

### Network Configuration

Environment variables control network selection:

**Frontend** (`frontend/.env`):
```bash
VITE_XRPL_NETWORK=testnet  # or mainnet
VITE_BACKEND_URL=http://localhost:3001
```

**Backend** (`backend/.env`):
```bash
XRPL_NETWORK=testnet       # or mainnet
# WebSocket URL auto-selected based on network
```

**Important**: Always restart servers after changing network settings.

---

## Deployment Architecture

### Recommended Deployment Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                  DEPLOYMENT OPTIONS                         │
└─────────────────────────────────────────────────────────────┘

Option 1: DOCKER (Recommended)
├─ Audience: Developers, self-hosters, privacy-conscious users
├─ Deployment:
│  ├─ Frontend container (Vite build)
│  ├─ Backend container (Node.js + Express)
│  └─ PostgreSQL container
├─ Pros: Full control, free, privacy, customizable
└─ Cons: Requires Docker knowledge, manual HTTPS setup

Option 2: CLOUD PLATFORMS
├─ Audience: Non-technical users, quick demos
├─ Platforms:
│  ├─ Frontend: Netlify, Vercel
│  ├─ Backend: Railway, Render
│  └─ Database: Managed PostgreSQL
├─ Pros: Zero setup, automatic HTTPS, monitoring
└─ Cons: Monthly costs ($5-50), vendor lock-in

Option 3: HYBRID (Best of Both)
├─ Development: Docker (local)
├─ Staging: Cloud platform (testing)
└─ Production: Docker on VPS (privacy + control)
```

See [DEPLOYMENT_COMPARISON.md](./DEPLOYMENT_COMPARISON.md) for detailed comparison.

---

## Performance Considerations

### Frontend Optimization
- **Code Splitting**: React lazy loading for route-based splitting
- **Bundle Size**: Vite tree-shaking and minification
- **Caching**: Browser caching for static assets
- **API Calls**: Debounced inputs, optimistic UI updates

### Backend Optimization
- **Connection Pooling**: PostgreSQL connection pool (max 20)
- **Query Optimization**: Indexed foreign keys, optimized JOIN queries
- **Rate Limiting**: Prevent resource exhaustion (100 req/15min)
- **Caching**: Future consideration for frequently accessed data

### Database Optimization
- **Indexes**: Primary keys, foreign keys, wallet_address columns
- **Constraints**: Foreign key constraints with ON DELETE CASCADE
- **Transactions**: ACID compliance for payment operations
- **Connection Pool**: Reuse connections, prevent exhaustion

### Blockchain Optimization
- **Payment Channels**: Off-chain balance accumulation (no per-hour transactions)
- **Single Settlement**: One ledger transaction at channel closure
- **Escrow Efficiency**: Upfront funding eliminates per-payment transactions
- **WebSocket**: Real-time ledger events, not polling

---

## Monitoring and Observability

### Current State
- **Logging**: Console logs in development (backend and frontend)
- **Error Handling**: Global error handler in Express
- **Database**: Connection pool monitoring via pg events

### Future Enhancements
- **Application Monitoring**: Consider Sentry for error tracking
- **Performance Monitoring**: APM tools for backend performance
- **Database Monitoring**: Query performance analysis
- **Blockchain Monitoring**: Ledger transaction tracking and alerts

---

## Scalability Considerations

### Horizontal Scaling
- **Frontend**: Stateless React app (easily scaled via CDN)
- **Backend**: Stateless API (can run multiple instances behind load balancer)
- **Database**: PostgreSQL read replicas for query scaling

### Vertical Scaling
- **Database**: Increase PostgreSQL resources as data grows
- **Backend**: Increase server resources for concurrent requests

### Bottleneck Analysis
- **Database**: Primary bottleneck (connections, query performance)
- **XRPL**: Ledger transaction rate limits (mitigated by payment channels)
- **API**: Rate limiting protects from overload

---

## Related Documentation

- **Quick Start**: [QUICKSTART.md](./QUICKSTART.md)
- **Database Setup**: [DATABASE_SETUP.md](./DATABASE_SETUP.md)
- **Network Configuration**: [NETWORK_CONFIG.md](./NETWORK_CONFIG.md)
- **Wallet Integration**: [WALLET_INTEGRATION.md](./WALLET_INTEGRATION.md)
- **Deployment Guide**: [DEPLOYMENT_COMPARISON.md](./DEPLOYMENT_COMPARISON.md)
- **Testing Guide**: [TEST_COMPREHENSIVE_SUITE.md](./TEST_COMPREHENSIVE_SUITE.md)

---

**Last Updated**: 2026-01-04
**Version**: 1.0.0
**Maintained By**: Good Money Collective
