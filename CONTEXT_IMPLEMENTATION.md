# Context Implementation Checklist

Three-phase plan to implement React Context for state management in XAH Payroll application.

---

## Phase 1: Authentication Context (Priority: HIGH) ✅ COMPLETE

### Setup

- [x] Create `frontend/src/contexts/` directory
- [x] Create `AuthContext.tsx` file
- [x] Create `AuthProvider` component
- [x] Define `AuthContextType` interface

### Core Features

- [x] **Login State Management**
  - [x] `isLoggedIn` boolean state
  - [x] `userName` string state
  - [x] `userType` enum ('employee' | 'ngo' | 'employer')
  - [x] `walletAddress` string state (optional)

- [x] **Authentication Methods**
  - [x] `login(userName, userType, walletAddress)` function
  - [x] `logout()` function
  - [x] `updateUserInfo()` function

- [x] **Persistence**
  - [x] Save auth state to `localStorage`
  - [x] Load auth state on app mount
  - [x] Clear `localStorage` on logout
  - [x] Handle expired sessions

### Integration

- [x] **App.tsx Updates**
  - [x] Wrap `<Router>` with `<AuthProvider>`
  - [x] Import and configure AuthContext

- [x] **Navbar Component**
  - [x] Remove all auth props
  - [x] Use `useAuth()` hook instead
  - [x] Access `isLoggedIn`, `userName`, `userType` from context
  - [x] Call `logout()` from context

- [x] **Page Components**
  - [x] **NgoPage**: Use `login()` from context
  - [x] **WorkerPage**: Use `login()` from context
  - [x] **NgoDashboard**: Use `useAuth()` for user info
  - [x] **WorkerDashboard**: Use `useAuth()` for user info
  - [x] **HomePage**: No changes needed

### Protected Routes

- [x] Create `ProtectedRoute` component
- [x] Wrap dashboard routes with `ProtectedRoute`
- [x] Redirect to login if not authenticated
- [x] Redirect based on user type (NGO vs Worker)

### Testing

- [ ] Test login flow for NGO
- [ ] Test login flow for Worker
- [ ] Test logout functionality
- [ ] Test page refresh (persistence)
- [ ] Test protected route access
- [ ] Test unauthorized access redirect

---

## Phase 2: Wallet Context (Priority: MEDIUM)

### Setup

- [ ] Create `WalletContext.tsx` file
- [ ] Create `WalletProvider` component
- [ ] Define `WalletContextType` interface
- [ ] Install XRPL dependencies (if not already installed)

### Core Features

- [ ] **Wallet Connection**
  - [ ] `isConnected` boolean state
  - [ ] `walletAddress` string state
  - [ ] `balance` number state
  - [ ] `network` enum ('testnet' | 'mainnet')

- [ ] **Wallet Methods**
  - [ ] `connectWallet()` function
  - [ ] `disconnectWallet()` function
  - [ ] `getBalance()` function
  - [ ] `signTransaction()` function
  - [ ] `sendPayment()` function

- [ ] **XRPL Integration**
  - [ ] Initialize XRPL client
  - [ ] Connect to testnet WebSocket
  - [ ] Handle connection errors
  - [ ] Reconnection logic

### Wallet Providers Support

- [ ] **Xaman (formerly Xumm)**
  - [ ] Xaman SDK integration
  - [ ] QR code sign-in
  - [ ] Deep linking support

- [ ] **Crossmark**
  - [ ] Browser extension detection
  - [ ] Crossmark API integration
  - [ ] Transaction signing

- [ ] **GemWallet**
  - [ ] Browser extension detection
  - [ ] GemWallet API integration
  - [ ] Transaction signing

### Integration

- [ ] **App.tsx Updates**
  - [ ] Wrap app with `<WalletProvider>`
  - [ ] Nest inside `<AuthProvider>`

- [ ] **Login Pages**
  - [ ] Add wallet connection UI
  - [ ] Show wallet selection modal
  - [ ] Display connection status

- [ ] **Dashboard Pages**
  - [ ] Show wallet address
  - [ ] Display balance
  - [ ] Add disconnect button

- [ ] **Payment Components**
  - [ ] Use `sendPayment()` for transactions
  - [ ] Show transaction status
  - [ ] Handle errors

### Security

- [ ] Never store private keys
- [ ] Use secure signing methods
- [ ] Validate all transactions
- [ ] Add transaction confirmations

### Testing

- [ ] Test wallet connection (all providers)
- [ ] Test wallet disconnection
- [ ] Test balance fetching
- [ ] Test transaction signing
- [ ] Test error handling
- [ ] Test network switching

---

## Phase 3: Data Context (Priority: LOW)

### Setup

- [ ] Create `DataContext.tsx` file
- [ ] Create `DataProvider` component
- [ ] Define `DataContextType` interface
- [ ] Set up API client/service

### Core Features

- [ ] **NGO Data State**
  - [ ] `stats` object (workers, escrow, payments)
  - [ ] `activeWorkers` array
  - [ ] `recentActivity` array
  - [ ] `paymentHistory` array

- [ ] **Worker Data State**
  - [ ] `earnings` object (today, week, month)
  - [ ] `workSessions` array
  - [ ] `payments` array
  - [ ] `employmentInfo` object

- [ ] **Data Methods**
  - [ ] `fetchNgoData()` function
  - [ ] `fetchWorkerData()` function
  - [ ] `refreshData()` function
  - [ ] `updateStats()` function

### Backend Integration

- [ ] **API Service**
  - [ ] Create `services/api.ts`
  - [ ] Set up Axios/Fetch client
  - [ ] Add authentication headers
  - [ ] Handle API errors

- [ ] **API Endpoints**
  - [ ] GET `/api/ngo/stats`
  - [ ] GET `/api/ngo/workers`
  - [ ] GET `/api/ngo/activity`
  - [ ] GET `/api/worker/earnings`
  - [ ] GET `/api/worker/sessions`
  - [ ] GET `/api/worker/payments`

### Real-Time Updates

- [ ] **WebSocket Connection**
  - [ ] Connect to backend WebSocket
  - [ ] Subscribe to user-specific events
  - [ ] Handle reconnection

- [ ] **Event Handlers**
  - [ ] `onPaymentReceived` event
  - [ ] `onWorkerClockIn` event
  - [ ] `onWorkerClockOut` event
  - [ ] `onEscrowUpdate` event

### Caching & Optimization

- [ ] Implement data caching
- [ ] Add loading states
- [ ] Add error states
- [ ] Debounce API calls
- [ ] Implement pagination

### Integration

- [ ] **App.tsx Updates**
  - [ ] Wrap app with `<DataProvider>`
  - [ ] Nest inside `<WalletProvider>`

- [ ] **NgoDashboard**
  - [ ] Remove mock data
  - [ ] Use `useData()` hook
  - [ ] Display loading states
  - [ ] Handle errors

- [ ] **WorkerDashboard**
  - [ ] Remove mock data
  - [ ] Use `useData()` hook
  - [ ] Display loading states
  - [ ] Handle errors

### Testing

- [ ] Test data fetching
- [ ] Test real-time updates
- [ ] Test error handling
- [ ] Test loading states
- [ ] Test cache invalidation
- [ ] Test WebSocket reconnection

---

## Context Nesting Structure

Final app structure with all contexts:

```tsx
<AuthProvider>
  <WalletProvider>
    <DataProvider>
      <Router>
        <App />
      </Router>
    </DataProvider>
  </WalletProvider>
</AuthProvider>
```

---

## File Structure

```
frontend/src/
├── contexts/
│   ├── AuthContext.tsx       ✅ Phase 1
│   ├── WalletContext.tsx     ⏳ Phase 2
│   └── DataContext.tsx       ⏳ Phase 3
├── hooks/
│   ├── useAuth.ts            ✅ Phase 1
│   ├── useWallet.ts          ⏳ Phase 2
│   └── useData.ts            ⏳ Phase 3
├── services/
│   ├── api.ts                ⏳ Phase 3
│   ├── xrpl.ts               ⏳ Phase 2
│   └── websocket.ts          ⏳ Phase 3
├── components/
│   ├── ProtectedRoute.tsx    ✅ Phase 1
│   └── WalletModal.tsx       ⏳ Phase 2
└── types/
    ├── auth.types.ts         ✅ Phase 1
    ├── wallet.types.ts       ⏳ Phase 2
    └── data.types.ts         ⏳ Phase 3
```

---

## Benefits After Implementation

### Phase 1 Complete
- ✅ Centralized authentication
- ✅ Persistent login state
- ✅ Protected routes
- ✅ No prop drilling
- ✅ Clean component code

### Phase 2 Complete
- ✅ Real wallet integration
- ✅ XRPL transactions
- ✅ Multiple wallet support
- ✅ Secure signing
- ✅ Balance tracking

### Phase 3 Complete
- ✅ Real backend data
- ✅ Real-time updates
- ✅ Optimized performance
- ✅ Production-ready
- ✅ Scalable architecture

---

## Estimated Timeline

- **Phase 1**: 2-3 hours (Do this first!)
- **Phase 2**: 4-6 hours (After backend auth is ready)
- **Phase 3**: 6-8 hours (After backend APIs are built)

**Total**: ~12-17 hours of development time

---

## Next Steps

1. ✅ Review this checklist
2. ⏳ Start with Phase 1 (AuthContext)
3. ⏳ Test thoroughly before moving to Phase 2
4. ⏳ Implement Phase 2 when ready for wallet integration
5. ⏳ Implement Phase 3 when backend is ready

---

## Notes

- Each phase builds on the previous one
- Test thoroughly after each phase
- Don't skip Phase 1 - it's the foundation
- Phase 2 and 3 can be adjusted based on backend readiness
- Keep mock data during development for testing
- Document all context APIs for team members
