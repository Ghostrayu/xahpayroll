# XAH Payroll - Code Style & Conventions

## Naming Conventions

### Frontend (TypeScript/React)
- **Files**: PascalCase for components (`AddWorkerModal.tsx`), camelCase for utilities (`walletTransactions.ts`)
- **Components**: PascalCase (`CreatePaymentChannelModal`)
- **Variables/Functions**: camelCase (`submitTransaction`, `walletAddress`)
- **Constants**: UPPER_SNAKE_CASE (`BACKEND_URL`, `XRPL_NETWORK`)
- **Types/Interfaces**: PascalCase with descriptive names (`WalletContextType`, `PaymentChannel`)

### Backend (JavaScript/Node.js)
- **Files**: kebab-case for routes (`payment-channels.js`), camelCase for utilities
- **Functions**: camelCase (`createPaymentChannel`, `validateWalletAddress`)
- **Constants**: UPPER_SNAKE_CASE for environment variables
- **Database**: snake_case for tables/columns (`wallet_address`, `user_type`)

## Project Structure Patterns

### Frontend
```
src/
├── components/     # React components
├── contexts/       # React Context providers
├── pages/          # Page-level components
├── services/       # API client and external services
├── utils/          # Helper functions and utilities
├── types/          # TypeScript type definitions
├── styles/         # Global styles
└── assets/         # Static assets
```

### Backend
```
backend/
├── routes/         # Express route handlers
├── database/       # DB connection and queries
├── scripts/        # Utility scripts (init-db, etc.)
└── server.js       # Main entry point
```

## Code Patterns

### Context Usage (Frontend)
- Provider nesting order: `AuthProvider > WalletProvider > DataProvider > Router`
- All wallet operations abstracted through WalletContext
- Protected routes enforce user type restrictions

### API Communication
- Centralized API client in `services/api.ts`
- All endpoints under `/api/` prefix
- Consistent error handling with try-catch
- Response structure: `{ data, error, message }`

### Wallet Integration
- Multi-wallet abstraction in `utils/walletTransactions.ts`
- Per-wallet signing via `submitTransactionWithWallet()`
- Support for Xaman (QR + deep linking), Crossmark, GemWallet

### Database Queries
- Parameterized queries to prevent SQL injection
- Transaction handling for multi-step operations
- Connection pooling via `pg.Pool`

## TypeScript Configuration
- Strict mode enabled
- Path aliases: `@/` → `src/`
- Target: ES2020
- Module: ESNext

## Environment Variables
- Frontend: `VITE_` prefix required (e.g., `VITE_XRPL_NETWORK`)
- Backend: Standard naming (e.g., `XRPL_NETWORK`, `DATABASE_URL`)
- Never commit `.env` files (in `.gitignore`)

## Security Conventions
- Wallet signing happens client-side only
- No private keys in environment variables
- Rate limiting: 100 requests per 15 minutes
- Helmet.js for HTTP headers
- CORS configuration for API access
- Input validation with Joi on backend
