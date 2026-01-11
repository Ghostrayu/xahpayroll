# XAH PAYROLL - JUDGE QUICK START GUIDE

**PLATFORM**: https://xahpayroll.xyz (Production - Mainnet)
**TIME REQUIRED**: 10-15 minutes
**PURPOSE**: Demonstrate decentralized hourly payroll using Xahau payment channels

---

## 📱 PREREQUISITES

- **Xaman Wallet** with 250+ XAH on **mainnet** (download: https://xaman.app)
- **Two wallets**: One for employer, one for worker (same wallet cannot be both)
- **Mobile device** for Xaman QR code scanning

---

## 🎯 TEST FLOW

You'll create an employer account, hire a worker, fund a payment channel with 240 XAH escrow, have the worker log time, then close the channel to release payment.

---

## PART 1: EMPLOYER SETUP (5 MIN)

### 1. Connect as Employer
1. Visit **https://xahpayroll.xyz**
2. Click **"REGISTER AS EMPLOYER"**
3. Scan QR code with Xaman (employer wallet)
4. Sign in Xaman app

### 2. Create Profile
- **Organization Name**: "Test Organization"
- **Account Type**: NGO/EMPLOYER
- Check terms → **"COMPLETE PROFILE"**

**✅ Expected**: Dashboard shows organization name and wallet address

### 3. Add Worker
1. Click **"ADD WORKER"**
2. Enter:
   - **Name**: "Test Worker"
   - **Wallet**: [Your worker wallet address - or scan QR]
   - **Rate**: 15 XAH/hour
3. Click **"ADD WORKER"**

**✅ Expected**: Worker appears in list

### 4. Create Payment Channel
1. Click **"CREATE PAYMENT CHANNEL"**
2. Select worker from dropdown
3. Set:
   - **Job**: "Testing Job"
   - **Escrow**: 240 XAH (16 hours × 15 XAH/hr)
   - **Settle Delay**: 1 hour
4. **Sign transaction in Xaman** (PaymentChannelCreate)

**✅ Expected**:
- Channel appears as **● ACTIVE**
- 240 XAH escrowed on Xahau ledger
- Dashboard shows Escrow: 240 XAH, Balance: 0 XAH

---

## PART 2: WORKER WORKFLOW (3 MIN)

### 1. Connect as Worker
1. **Disconnect employer wallet** (click disconnect)
2. Click **"GET STARTED AS WORKER"**
3. Scan QR with Xaman (**different wallet**)
4. Complete profile:
   - **Name**: "Test Worker"
   - **Account Type**: EMPLOYEE

**✅ Expected**: Worker dashboard shows active payment channel

### 2. Log Work Hours
1. Find payment channel for "Testing Job"
2. Click **"CLOCK IN"**
3. Wait 10-30 seconds (simulates work)
4. Click **"CLOCK OUT"**

**✅ Expected**:
- Hours logged (~0.01 hours for 30 seconds)
- Balance updates (~0.15 XAH for 30 seconds at 15 XAH/hr)

**Note**: In production, workers log full work shifts. Short sessions demonstrate the mechanic.

---

## PART 3: CLOSE CHANNEL & PAYMENT (5 MIN)

### 1. Return to Employer
1. **Disconnect worker wallet**
2. Connect with **employer wallet** again
3. Navigate to dashboard

### 2. Close Payment Channel
1. Find "Testing Job" channel
2. Click **"CANCEL CHANNEL"**
3. Review:
   - Worker balance: ~0.15 XAH (earned)
   - Escrow return: ~239.85 XAH (unused)
4. **Confirm** → **Sign in Xaman** (PaymentChannelClaim)

**✅ Expected**:
- Channel closes
- Worker receives earned balance (~0.15 XAH)
- Unused escrow returns to employer (~239.85 XAH)
- Single ledger transaction settles everything

---

## ✅ WHAT YOU VALIDATED

1. **Xaman Integration**: QR code + deep linking for wallet auth
2. **Payment Channels**: XRPL PaymentChannelCreate & PaymentChannelClaim
3. **Hourly Payroll**: Workers clock in/out, earnings accumulate off-chain
4. **Atomic Settlement**: Single transaction releases payment + returns escrow
5. **Role Separation**: Employers and workers use different wallets
6. **Production Ready**: Mainnet deployment with real XAH

---

## 🔍 KEY FEATURES

### Off-Chain Efficiency
- Workers log hours in database (no ledger transactions)
- Earnings accumulate without blockchain fees
- Only 2 ledger transactions: channel open + close

### Worker Protection
- **SettleDelay**: Workers have 1 hour to claim after employer initiates closure
- **Immediate Closure**: Workers can close channel anytime to claim earnings
- **Escrow Safety**: Funds locked on ledger until channel closes

### Multi-Job Support
- Workers can have multiple active channels (different jobs, same employer)
- Per-channel time tracking with separate hourly rates
- Max daily hours enforcement per channel

---

## 🐛 TROUBLESHOOTING

**"WALLET ALREADY REGISTERED AS [TYPE]"**
→ Use separate wallets for employer and worker roles

**"WORKER WALLET NOT ACTIVATED"**
→ Worker wallet needs 10-20 XAH to activate on mainnet

**Channel not appearing?**
→ Refresh page or check Xahau Explorer for transaction confirmation

---

## 📊 ARCHITECTURE HIGHLIGHTS

**Frontend**: React + TypeScript + Vite
**Backend**: Node.js + Express + PostgreSQL
**Blockchain**: Xahau (XRPL sidechain)
**Wallet**: Xaman SDK for authentication & transactions
**Deployment**: Netlify (frontend) + Render (backend) + Supabase (database)

**Core Innovation**: Combines XRPL payment channels with off-chain hourly tracking for gas-efficient payroll with worker protection.

---

## 📝 PRODUCTION NOTES

- **Network**: Xahau Mainnet (real XAH)
- **Database**: Production PostgreSQL (Supabase)
- **Escrow**: Real funds locked on ledger
- **Testing**: Use small amounts for validation

**For questions**: Contact via GitHub issues or admin@xahpayroll.xyz

---

**LAST UPDATED**: 2026-01-11
**VERSION**: 1.0.0
**CONTEST**: Xahaud Integration Demo
