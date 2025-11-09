# XAH Payroll - Architecture Patterns

## Frontend Architecture

### State Management Pattern
**React Context API** (no Redux)
- `AuthContext` - User authentication, session management, user type
- `WalletContext` - XRPL wallet connections, transactions, balance
- `DataContext` - NGO/worker data, payment channels, work sessions

**Provider Nesting:**
```tsx
<AuthProvider>
  <WalletProvider>
    <DataProvider>
      <Router>
        <Routes />
      </Router>
    </DataProvider>
  </WalletProvider>
</AuthProvider>
```

### Component Patterns
- **Protected Routes**: `ProtectedRoute` wrapper enforces user type restrictions
- **Modal Components**: Reusable modals for worker management and payment channels
- **Context Consumers**: Custom hooks (`useAuth`, `useWallet`, `useData`)

### Multi-Wallet Abstraction
**Pattern**: Strategy pattern for wallet providers
- File: `utils/walletTransactions.ts`
- Function: `submitTransactionWithWallet(wallet, transaction)`
- Supported: Xaman (QR + deep linking), Crossmark, GemWallet, Manual

### Route Protection
- Employee routes: `/employee/*`
- NGO routes: `/ngo/*`
- Employer routes: `/employer/*`
- Public: `/`, `/signin`, `/terms`

## Backend Architecture

### API Design Pattern
**RESTful API with Express**
- Base path: `/api/`
- Route modules: xaman, users, organizations, payment-channels, workers
- Middleware: helmet, cors, rate-limiter, error handler

### Database Access Pattern
**Connection Pool + Parameterized Queries**
```javascript
const pool = new Pool({ connectionString })
const result = await pool.query('SELECT * FROM users WHERE wallet_address = $1', [address])
```

### Security Layers
1. **Helmet.js** - HTTP header security
2. **CORS** - Origin restrictions
3. **Rate Limiting** - 100 requests per 15 minutes
4. **JWT Tokens** - Session authentication
5. **Input Validation** - Joi schemas

### Error Handling Pattern
```javascript
try {
  // Operation
  res.json({ data, message: 'Success' })
} catch (error) {
  console.error(error)
  res.status(500).json({ error: error.message })
}
```

## Database Patterns

### Schema Design
**Relational Model with Foreign Keys**
- `users` (1) → (N) `organizations`
- `organizations` (1) → (N) `employees`
- `employees` (1) → (N) `work_sessions`
- `organizations` (1) → (N) `payment_channels`

### Key Constraints
- **Unique**: `wallet_address` in users, employees
- **Foreign Keys**: ON DELETE CASCADE for cleanup
- **Checks**: user_type IN ('employee', 'employer', 'ngo', 'admin')
- **Composite Unique**: (organization_id, employee_wallet_address)

## XRPL Integration Patterns

### Payment Channel Flow
1. NGO creates payment channel via `PaymentChannelCreate` transaction
2. Transaction signed by connected wallet (client-side)
3. Channel details stored in PostgreSQL
4. Worker logs hours → hourly payments released
5. Timeout or manual close → escrow returned

### Network Configuration
- Environment variable: `XRPL_NETWORK` (testnet | mainnet)
- Testnet: `wss://xahau-test.net`
- Mainnet: `wss://xahau.network`
- Auto-selected WebSocket URL based on network

## Design Patterns in Use

### Frontend
- **Context API**: State management
- **Strategy Pattern**: Multi-wallet support
- **Higher-Order Components**: Protected routes
- **Custom Hooks**: Context consumption

### Backend
- **Repository Pattern**: Database access abstraction
- **Middleware Pattern**: Express middleware chain
- **Factory Pattern**: XRPL client creation
- **Singleton Pattern**: Database connection pool

## Critical Design Decisions

### Why React Context over Redux?
- Simpler for medium-sized app
- Sufficient for wallet/auth state
- Less boilerplate, faster development

### Why Monorepo?
- Unified development workflow
- Shared types/interfaces possible
- Concurrent dev server startup
- Simplified deployment

### Why PostgreSQL over NoSQL?
- Strong relational data model (users-orgs-employees)
- ACID compliance for payment records
- Complex queries for analytics
- Mature ecosystem

### Why Payment Channels over Direct Transfers?
- Reduced transaction fees
- Instant microtransactions
- Automatic hourly payments
- Escrow security
