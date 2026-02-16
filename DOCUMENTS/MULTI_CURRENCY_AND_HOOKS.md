# Multi-Currency & Multi-Network Support

## Table of Contents
1. [Overview](#overview)
2. [Current Architecture (XAH-Only)](#current-architecture)
3. [Phase 1: Multi-Network Support (XRP on XRPL + XAH on Xahau)](#phase-1-multi-network-support)
4. [Phase 2: Multi-Currency on Xahau (Native IOU Payment Channels)](#phase-2-multi-currency-on-xahau)
5. [Implementation Comparison](#implementation-comparison)
6. [References](#references)

---

## Overview

XAH Payroll currently supports only the native XAH currency on Xahau. This document covers two expansion phases:

| Phase | What It Enables | Complexity |
|-------|----------------|------------|
| **Phase 1: Multi-Network** | XRP payments on XRPL mainnet | Low-Medium |
| **Phase 2: Native IOU Channels** | Any issued currency on Xahau (stablecoins, tokens) | Medium |

**Key discovery**: Xahau natively extended `PaymentChannelCreate` to support issued currencies (IOUs) at the protocol level. This means multi-currency payment channels work using the same transaction types we already use — no smart contracts or Hooks required.

---

## Current Architecture

### Payment Flow (XAH Only)
```
NGO creates PaymentChannelCreate (XAH in drops)
  → Worker accumulates hours (database only)
  → Channel closure via PaymentChannelClaim (single XAH payment)
```

### Hardcoded XAH References
- **Frontend**: `xahToDrops()` / `dropsToXah()` conversion functions
- **Backend**: `currency VARCHAR(10) DEFAULT 'XAH'` in schema
- **Transactions**: `Amount` field always in drops (string of native currency)
- **Display**: All UI shows "XAH" labels
- **Xaman**: `force_network: 'XAHAU'` or `'XAHAUTESTNET'`

### Network Configuration
- WebSocket: `wss://xahau.network` (mainnet) / `wss://xahau-test.net` (testnet)
- Explorer: `explorer.xahau.network` / `explorer.xahau-test.net`
- Single env var: `XRPL_NETWORK=testnet|mainnet`

---

## Phase 1: Multi-Network Support

### XRP on XRPL — Fully Feasible

The `PaymentChannelCreate` / `PaymentChannelClaim` / `PaymentChannelFund` transaction types exist on both XRPL and Xahau. The `xrpl` npm package supports both networks natively. The core payment channel logic is identical — only connection URLs, currency labels, and Xaman network forcing differ.

### Network Configuration Matrix

| Config | Xahau Mainnet | Xahau Testnet | XRPL Mainnet | XRPL Testnet |
|--------|---------------|---------------|--------------|--------------|
| **WebSocket** | `wss://xahau.network` | `wss://xahau-test.net` | `wss://xrplcluster.com` | `wss://s.altnet.rippletest.net:51233` |
| **Explorer** | `explorer.xahau.network` | `explorer.xahau-test.net` | `livenet.xrpl.org` | `testnet.xrpl.org` |
| **Xaman force_network** | `XAHAU` | `XAHAUTESTNET` | `MAINNET` | `TESTNET` |
| **Native Currency** | XAH | XAH | XRP | XRP |
| **Drops Ratio** | 1:1,000,000 | 1:1,000,000 | 1:1,000,000 | 1:1,000,000 |
| **IOU Channels** | YES | YES | NO | NO |
| **Base Reserve** | ~1 XAH | ~1 XAH | 10 XRP | 10 XRP |

### Required Changes

#### Environment Variables
```env
# New: chain selection (alongside existing testnet/mainnet)
XRPL_CHAIN=xahau          # xahau | xrpl
XRPL_NETWORK=testnet      # testnet | mainnet
```

#### Network URL Resolution
```typescript
// Current: only Xahau
const wsUrl = network === 'testnet' ? 'wss://xahau-test.net' : 'wss://xahau.network'

// New: chain-aware
function getNetworkUrl(chain: string, network: string): string {
  const urls = {
    xahau: { mainnet: 'wss://xahau.network', testnet: 'wss://xahau-test.net' },
    xrpl:  { mainnet: 'wss://xrplcluster.com', testnet: 'wss://s.altnet.rippletest.net:51233' }
  }
  return urls[chain][network]
}
```

#### Xaman Network Forcing
```typescript
// Current
const forceNetwork = network === 'mainnet' ? 'XAHAU' : 'XAHAUTESTNET'

// New: chain-aware
function getXamanNetwork(chain: string, network: string): string {
  const networks = {
    xahau: { mainnet: 'XAHAU', testnet: 'XAHAUTESTNET' },
    xrpl:  { mainnet: 'MAINNET', testnet: 'TESTNET' }
  }
  return networks[chain][network]
}
```

#### Currency Display
```typescript
function getNativeCurrency(chain: string): string {
  return chain === 'xahau' ? 'XAH' : 'XRP'
}
```

### Files That Need Changes

| File | Change |
|------|--------|
| `frontend/.env` | Add `VITE_XRPL_CHAIN` |
| `backend/.env` | Add `XRPL_CHAIN` |
| `frontend/src/contexts/WalletContext.tsx` | Chain-aware URL selection |
| `frontend/src/utils/paymentChannels.ts` | Chain-aware `getNetworkUrl()` |
| `frontend/src/utils/walletTransactions.ts` | Chain-aware WebSocket |
| `frontend/src/utils/networkUtils.ts` | Chain-aware explorer URLs |
| `backend/routes/xaman.js` | Chain-aware `force_network` |
| `backend/routes/paymentChannels.js` | Chain-aware `getNetworkUrl()` |
| `backend/routes/organizations.js` | Chain-aware `getNetworkUrl()` |
| `backend/server.js` | Expose chain in `/health` |
| `frontend/src/App.tsx` | Validate chain + network sync |
| All UI components showing "XAH" | Dynamic currency label |

### Limitation
**XRPL does NOT support IOU payment channels.** Multi-currency is Xahau-only. When running on XRPL, only native XRP is available for payment channels.

---

## Phase 2: Multi-Currency on Xahau

### Native IOU Payment Channels

Xahau extended `PaymentChannelCreate` to accept issued currency amounts at the protocol level. This is a Xahau-specific feature not available on standard XRPL. The same `PaymentChannelCreate`, `PaymentChannelClaim`, and `PaymentChannelFund` transaction types are used — the only difference is the `Amount` field format.

### How It Works

#### XAH (Native) — Current Flow
```json
{
  "TransactionType": "PaymentChannelCreate",
  "Account": "rNGO...",
  "Destination": "rWorker...",
  "Amount": "10000000",
  "SettleDelay": 86400
}
```
`Amount` is a string of drops (1 XAH = 1,000,000 drops).

#### IOU (Issued Currency) — New Flow
```json
{
  "TransactionType": "PaymentChannelCreate",
  "Account": "rNGO...",
  "Destination": "rWorker...",
  "Amount": {
    "value": "100.00",
    "currency": "USD",
    "issuer": "rIssuerAddress..."
  },
  "SettleDelay": 86400
}
```
`Amount` is an object with `value`, `currency`, and `issuer`.

#### PaymentChannelClaim with IOU
```json
{
  "TransactionType": "PaymentChannelClaim",
  "Channel": "C1AE...",
  "Balance": {
    "value": "75.50",
    "currency": "USD",
    "issuer": "rIssuerAddress..."
  },
  "Flags": 65536
}
```

### Trust Line Requirement

**Workers MUST have a trust line to the currency issuer before receiving IOU payments.**

A trust line is created via `TrustSet` transaction:
```json
{
  "TransactionType": "TrustSet",
  "Account": "rWorker...",
  "LimitAmount": {
    "currency": "USD",
    "issuer": "rIssuerAddress...",
    "value": "10000"
  }
}
```

The app should:
1. Check if worker has the required trust line before channel creation
2. Guide workers through trust line setup if missing
3. Each trust line costs ~0.2 XAH in account reserve

### Amount Handling Differences

| Aspect | XAH (Native) | IOU (Issued) |
|--------|-------------|--------------|
| **Format** | String of drops: `"10000000"` | Object: `{value, currency, issuer}` |
| **Precision** | Integer drops (6 decimals max) | Decimal string (15 significant digits) |
| **Conversion** | `xahToDrops()` / `dropsToXah()` | No conversion needed (decimal string) |
| **Trust Line** | Not needed | Required (worker → issuer) |
| **Account Reserve** | Base reserve only | Base + 0.2 XAH per trust line |

### Database Schema Changes

```sql
-- payment_channels: add currency tracking
ALTER TABLE payment_channels
  ADD COLUMN currency_code VARCHAR(10) DEFAULT 'XAH',
  ADD COLUMN currency_issuer VARCHAR(64) DEFAULT NULL;

-- employees: add issuer tracking (currency column exists)
ALTER TABLE employees
  ADD COLUMN currency_issuer VARCHAR(64) DEFAULT NULL;

-- payments: add issuer tracking (currency column exists)
ALTER TABLE payments
  ADD COLUMN currency_issuer VARCHAR(64) DEFAULT NULL;
```

### Frontend Changes

#### Currency-Aware Amount Formatting
```typescript
interface CurrencyAmount {
  value: string
  currency: string
  issuer?: string  // null for native XAH/XRP
}

function formatTransactionAmount(amount: CurrencyAmount): string | object {
  if (!amount.issuer) {
    // Native currency — convert to drops
    return Math.floor(parseFloat(amount.value) * 1_000_000).toString()
  }
  // IOU — return currency object
  return { value: amount.value, currency: amount.currency, issuer: amount.issuer }
}
```

#### Currency Selector in CreatePaymentChannelModal
- Dropdown: Native XAH + configured IOU tokens
- When IOU selected: show issuer address, verify worker trust line
- Different amount display (no drops conversion for IOUs)

---

## Implementation Comparison

### Decision Matrix

| Factor | Phase 1: Multi-Network (XRP+XAH) | Phase 2: Native IOU Channels |
|--------|:-:|:-:|
| **Effort** | Low-Medium | Medium |
| **Timeline** | 1-2 weeks | 2-4 weeks |
| **Risk** | Low | Low-Medium |
| **New language** | No | No |
| **Currencies supported** | Native only (XRP or XAH) | Native + any IOU on Xahau |
| **Escrow guarantee** | Yes (PaymentChannel) | Yes (PaymentChannel) |
| **Trust lines needed** | No | Yes (worker → issuer) |
| **Testing complexity** | Low | Medium |

### Recommended Path

```
Phase 1: Multi-Network Support (XRP on XRPL + XAH on Xahau)
         → Broadens user base with minimal code changes
         → Same PaymentChannel flow, different network config

Phase 2: Native IOU Payment Channels on Xahau
         → Enables stablecoins and tokens
         → Same transaction types, different Amount format
         → Requires trust line management UX
```

Both phases use standard XRPL/Xahau protocol features with no custom smart contracts required.

---

## References

- [Xahau vs XRPL Differences](https://docs.xahau.network/readme/what-is-different)
- [Xahau Network Features](https://xahau.network/features/)
- [XRPL Payment Channels](https://xrpl.org/payment-channels.html)
- [Xahau Escrow (IOU Support)](https://docs.xahau.network/technical/protocol-reference/ledger-data/ledger-objects-types/escrow)
- [Xahau PaymentChannelFund](https://docs.xahau.network/technical/protocol-reference/transactions/transaction-types/paymentchannelfund)
