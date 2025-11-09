# XAH Payroll - Project Overview

## Purpose
Decentralized hourly payroll system built on XAH Ledger (Xahau) enabling automatic hourly wage payments through XRP/XAH payment channels with multi-wallet support and role-based access control.

## Tech Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Routing**: React Router v6
- **State Management**: React Context API (AuthContext, WalletContext, DataContext)
- **Blockchain**: XRPL SDK v3.0.0, Xumm SDK, GemWallet API

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: PostgreSQL 14+
- **Blockchain**: XRPL SDK v3.0.0, Xumm SDK
- **Security**: Helmet, CORS, express-rate-limit, JWT
- **Validation**: Joi
- **Logging**: Winston

### Database Schema
- `users` - Wallet addresses, user types, profile data
- `sessions` - Authentication sessions
- `organizations` - NGO/employer organizations
- `employees` - Workers linked to organizations (multi-org support)
- `payment_channels` - Payment channel records
- `work_sessions` - Clock in/out tracking
- `payments` - Payment history

## Architecture
**Monorepo Structure:**
```
xahaupayroll/
├── frontend/          # React SPA (port 3000)
├── backend/           # Express API (port 3001)
└── package.json       # Root orchestration scripts
```

## Key Features
- Hourly automatic payments via XRPL payment channels
- Multi-wallet support (Xaman, Crossmark, GemWallet)
- Worker management with QR code scanning
- Escrow fund management
- Real-time work session tracking
- Role-based access (employee vs ngo/employer)
- Network support (testnet/mainnet)

## Critical Business Rules
1. Wallet address can ONLY be employee OR ngo/employer, never both
2. Workers must be added to organization before creating payment channels
3. Same worker wallet can work for multiple organizations
4. Payment channels use native XRPL PaymentChannelCreate transactions
