# Payment Channel Creation Testing Guide

## Overview
XahPayroll now supports **real on-chain payment channel creation** using native XRPL/Xahau payment channels.

## Multi-Wallet Support ✅

Payment channels work with **all supported wallets** without requiring custom configuration:

- ✅ **GemWallet** - Browser extension wallet
- ✅ **Crossmark** - Browser extension wallet  
- ✅ **Xaman (formerly Xumm)** - Mobile wallet with QR code signing
- ✅ **Manual Wallet** - Seed-based wallet for testing

### Why No Custom Configuration Needed?

Payment channels are a **native XRPL feature**, so all wallets handle them identically through standard XRPL transactions. The only difference is how each wallet's API submits the transaction:

- **GemWallet**: Uses `submitTransaction()` API
- **Crossmark**: Uses `signAndSubmit()` API
- **Xaman**: Creates a payload via backend, displays QR code
- **Manual**: Signs with seed and submits directly to network

The `submitTransactionWithWallet()` utility automatically detects your connected wallet and uses the appropriate submission method.

## Implementation Architecture

### Native Payment Channels (No Hooks Required)
- ✅ Uses built-in XRPL `PaymentChannelCreate` transaction
- ✅ Off-chain time tracking in PostgreSQL database
- ✅ Real-time balance accumulation visible to workers
- ✅ Signed claims generated periodically (hourly/30min/15min)
- ✅ Workers can claim anytime (encouraged to wait until end)
- ✅ Only 2 on-chain transactions (open + close)

## Testing Steps

### Prerequisites
1. **Backend running**: `cd backend && npm run dev`
2. **Frontend running**: `cd frontend && npm run dev`
3. **Wallet connected**: Any of the supported wallets (GemWallet, Crossmark, Xaman, or Manual)
4. **Test XAH** in your wallet (get from Xahau testnet faucet if testing)

### Wallet-Specific Setup

#### GemWallet
- Install browser extension from [GemWallet.app](https://gemwallet.app)
- Create/import wallet
- Connect to Xahau Mainnet or Testnet
- Click "Connect Wallet" in XahPayroll

#### Crossmark
- Install browser extension from [Crossmark.io](https://crossmark.io)
- Create/import wallet
- Ensure you're on Xahau network
- Click "Connect Wallet" in XahPayroll

#### Xaman (Mobile)
- Install Xaman app on iOS/Android
- Create/import wallet
- When creating payment channel, scan QR code with Xaman app
- Approve transaction in app

#### Manual Wallet (Testing Only)
- Use for development/testing with seed phrase
- Not recommended for production use
- Automatically signs transactions without prompts

### Test Flow

#### 1. Open Payment Channel Modal
- Navigate to NGO Dashboard
- Click "⚡ Open Payment Channel" button

#### 2. Fill Out Channel Details

**Job Information:**
- **Job Name**: e.g., "Website Development"
- **Worker Name**: e.g., "John Doe"
- **Worker Wallet Address**: Valid XRPL address starting with 'r'

**Payment Configuration:**
- **Hourly Rate**: e.g., 15.00 XAH
- **Max Hours/Day**: e.g., 8
- **Start Date**: Today
- **End Date**: 30 days from now

**Channel Settings:**
- **Claim Generation Frequency**: Hourly (recommended)
- **Settle Delay**: 24 Hours (recommended)
- **Funding Amount**: Auto-calculated or custom

#### 3. Submit Transaction

The transaction flow varies by wallet:

**GemWallet / Crossmark:**
- Click "Open Payment Channel"
- Browser extension popup appears
- Review transaction details:
  - **Type**: PaymentChannelCreate
  - **Destination**: Worker's address
  - **Amount**: Funding amount in drops
  - **SettleDelay**: In seconds
  - **CancelAfter**: Expiration timestamp
- Click "Approve" or "Sign"

**Xaman:**
- Click "Open Payment Channel"
- QR code appears or new tab opens
- Scan QR with Xaman mobile app
- Review transaction in app
- Swipe to sign

**Manual Wallet:**
- Click "Open Payment Channel"
- Transaction automatically signed and submitted
- No additional prompts

#### 4. Verify Creation
After successful transaction:
- ✅ Alert shows channel ID and details
- ✅ Dashboard refreshes automatically
- ✅ New channel appears in "Active Payment Channels"
- ✅ Channel shows:
  - Job name
  - Worker name
  - Escrow balance (funded amount)
  - Accumulated balance (0 initially)
  - Hourly rate
  - Hours tracked (0 initially)
  - Update frequency

#### 5. Database Verification
```sql
-- Check payment channel in database
SELECT 
  pc.id,
  pc.job_name,
  pc.channel_id,
  pc.hourly_rate,
  pc.escrow_funded_amount,
  pc.accumulated_balance,
  pc.status,
  e.full_name as worker,
  o.organization_name
FROM payment_channels pc
JOIN employees e ON pc.employee_id = e.id
JOIN organizations o ON pc.organization_id = o.id
WHERE pc.status = 'active';
```

## API Endpoints

### Create Payment Channel
```
POST /api/payment-channels/create
```

**Request Body:**
```json
{
  "organizationWalletAddress": "rXXX...",
  "workerWalletAddress": "rYYY...",
  "workerName": "John Doe",
  "jobName": "Website Development",
  "hourlyRate": 15.00,
  "fundingAmount": 3600.00,
  "channelId": "CH-1234567890-abc123",
  "settleDelay": 86400,
  "expiration": 1234567890,
  "balanceUpdateFrequency": "Hourly"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "channel": {
      "id": 1,
      "channelId": "CH-1234567890-abc123",
      "jobName": "Website Development",
      "worker": "John Doe",
      "workerAddress": "rYYY...",
      "hourlyRate": 15.00,
      "escrowFundedAmount": 3600.00,
      "balanceUpdateFrequency": "Hourly",
      "status": "active"
    }
  }
}
```

### Close Payment Channel
```
POST /api/payment-channels/:channelId/close
```

## Transaction Details

### PaymentChannelCreate Fields
- **TransactionType**: `PaymentChannelCreate`
- **Account**: NGO wallet address (source)
- **Destination**: Worker wallet address
- **Amount**: Funding amount in drops (1 XAH = 1,000,000 drops)
- **SettleDelay**: Time in seconds before channel can close after claim
- **CancelAfter**: Ripple epoch timestamp when channel auto-expires
- **PublicKey**: Automatically filled by wallet

### Example Transaction
```javascript
{
  TransactionType: 'PaymentChannelCreate',
  Account: 'ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW',
  Destination: 'rN7n7otQDd6FczFgLdlqtyMVrn3HMgk5j',
  Amount: '3600000000', // 3600 XAH in drops
  SettleDelay: 86400, // 24 hours
  CancelAfter: 789456123 // Ripple epoch timestamp
}
```

## Troubleshooting

### Common Issues

**1. "Wallet not connected"**
- Ensure your wallet extension/app is installed and unlocked
- Check that wallet is connected to correct network (Mainnet/Testnet)
- Try disconnecting and reconnecting wallet
- For Xaman: Ensure mobile app is open and ready

**2. "Insufficient balance"**
- Verify wallet has enough XAH for funding + transaction fee
- Check reserve requirements (2 XAH base + 2 XAH per object)

**3. "Transaction rejected"**
- User cancelled in wallet popup/app
- For GemWallet/Crossmark: Check transaction details in extension popup
- For Xaman: Ensure you swiped to approve (not reject) in mobile app
- Verify you have sufficient balance for transaction fee

**4. "Failed to save payment channel"**
- Backend API error
- Check backend logs for details
- Verify database connection

**5. "Invalid XRPL address"**
- Worker address must start with 'r'
- Must be 25-35 characters long
- Verify address is valid on the network you're using

## Next Steps

After successful channel creation:
1. **Time Tracking**: Workers clock in/out (tracked off-chain)
2. **Balance Accumulation**: System generates signed claims periodically
3. **Worker Claims**: Worker submits `PaymentChannelClaim` when ready
4. **Channel Closes**: After claim + settle delay, channel closes
5. **Unclaimed Funds**: Auto-return to NGO if channel expires

## Network Configuration

### Mainnet (Xahau)
- WebSocket: `wss://xahau.network`
- Explorer: https://explorer.xahau.network

### Testnet (Xahau)
- WebSocket: `wss://xahau-test.net`
- Explorer: https://explorer.xahau-test.net
- Faucet: https://faucet.xahau-test.net

## Files Modified

1. **Backend:**
   - `/backend/routes/paymentChannels.js` - New API endpoints
   - `/backend/server.js` - Route registration

2. **Frontend:**
   - `/frontend/src/utils/paymentChannels.ts` - Payment channel utilities
   - `/frontend/src/utils/walletTransactions.ts` - **Multi-wallet transaction submission**
   - `/frontend/src/components/CreatePaymentChannelModal.tsx` - Transaction signing with all wallets
   - `/frontend/src/pages/NgoDashboard.tsx` - Success callback
   - `/frontend/src/contexts/WalletContext.tsx` - Existing multi-wallet support

3. **Database:**
   - `payment_channels` table with `job_name` and `escrow_funded_amount` columns

## Multi-Wallet Implementation Details

### Transaction Submission Flow

```typescript
// Unified submission works with all wallets
const txResult = await submitTransactionWithWallet(
  paymentChannelTx,  // Prepared transaction
  provider,          // 'gemwallet' | 'crossmark' | 'xaman' | 'manual'
  network            // 'mainnet' | 'testnet'
)
```

### Wallet-Specific Implementations

**GemWallet:**
```typescript
const { submitTransaction } = await import('@gemwallet/api')
const result = await submitTransaction({ transaction })
```

**Crossmark:**
```typescript
const crossmark = window.crossmark
const result = await crossmark.signAndSubmit(transaction)
```

**Xaman:**
```typescript
// Creates payload via backend API
const response = await fetch('/api/xaman/create-payload', {
  body: JSON.stringify({ txjson: transaction })
})
// User scans QR code with mobile app
```

**Manual:**
```typescript
const client = new Client(wsUrl)
const result = await client.submitAndWait(signedTx)
```

### Why This Works

All wallets submit the **same PaymentChannelCreate transaction** to the XRPL/Xahau network. The transaction format is identical - only the signing and submission method differs per wallet's API.
