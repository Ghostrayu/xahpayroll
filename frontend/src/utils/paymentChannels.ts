import { Client, PaymentChannelCreate, PaymentChannelClaim } from 'xrpl'
import type { WalletProvider } from '../contexts/WalletContext'
import { submitTransactionWithWallet } from './walletTransactions'

export interface PaymentChannelParams {
  sourceAddress: string
  destinationAddress: string
  amount: string // In drops (1 XAH = 1,000,000 drops)
  settleDelay: number // In seconds
  publicKey?: string
  cancelAfter?: number // Ripple epoch timestamp
}

export interface PaymentChannelResult {
  success: boolean
  channelId?: string
  txHash?: string
  error?: string
}

/**
 * Get the appropriate XRPL/Xahau WebSocket URL based on network
 */
export const getNetworkUrl = (network: string): string => {
  if (network === 'mainnet') {
    return 'wss://xahau.network' // Xahau Mainnet
  } else {
    return 'wss://xahau-test.net' // Xahau Testnet
  }
}

/**
 * Convert XAH to drops (1 XAH = 1,000,000 drops)
 */
export const xahToDrops = (xah: number | string): string => {
  const amount = typeof xah === 'string' ? parseFloat(xah) : xah
  return Math.floor(amount * 1_000_000).toString()
}

/**
 * Convert drops to XAH
 */
export const dropsToXah = (drops: number | string): number => {
  const amount = typeof drops === 'string' ? parseFloat(drops) : drops
  return amount / 1_000_000
}

/**
 * Prepare a PayChannelCreate transaction
 * This returns the transaction object that needs to be signed by the wallet
 */
export const preparePaymentChannelTransaction = (
  params: PaymentChannelParams
): Omit<PaymentChannelCreate, 'PublicKey'> & { PublicKey?: string } => {
  const tx: any = {
    TransactionType: 'PaymentChannelCreate',
    Account: params.sourceAddress,
    Destination: params.destinationAddress,
    Amount: params.amount, // Should be in drops
    SettleDelay: params.settleDelay,
  }

  // PublicKey is required by XRPL but will be auto-filled by the wallet during signing
  // Wallets like Xaman, Crossmark, and GemWallet automatically add the user's public key
  if (params.publicKey) {
    tx.PublicKey = params.publicKey
  }

  if (params.cancelAfter) {
    tx.CancelAfter = params.cancelAfter
  }

  return tx
}

/**
 * Get the actual Payment Channel ID from a validated transaction
 * The channel ID is found in the transaction metadata under CreatedNode > LedgerIndex
 *
 * @param txHash - Transaction hash from the PaymentChannelCreate transaction
 * @param account - Source account address
 * @param network - Network (testnet or mainnet)
 * @returns The actual 64-character hex channel ID from the ledger
 */
export const getChannelIdFromTransaction = async (
  txHash: string,
  account: string,
  network: string
): Promise<string> => {
  const client = new Client(getNetworkUrl(network))

  try {
    await client.connect()

    // Query the validated transaction by hash
    // Note: Xahau does not support 'binary: false' parameter, so we omit it
    const txResponse = await client.request({
      command: 'tx',
      transaction: txHash
    })

    await client.disconnect()

    // Look for the CreatedNode with LedgerEntryType: "PayChannel" in the metadata
    if (txResponse.result.meta && typeof txResponse.result.meta === 'object') {
      const meta = txResponse.result.meta as any

      if (meta.AffectedNodes) {
        for (const node of meta.AffectedNodes) {
          if (node.CreatedNode?.LedgerEntryType === 'PayChannel') {
            // The LedgerIndex is the actual Channel ID
            const channelId = node.CreatedNode.LedgerIndex
            console.log('✅ Found actual channel ID from ledger:', channelId)
            return channelId
          }
        }
      }
    }

    // Fallback: Generate temporary ID if we can't find it (shouldn't happen)
    console.warn('⚠️ Could not find channel ID in transaction metadata, using fallback')
    return generateFallbackChannelId(txHash, account)
  } catch (error) {
    console.error('Error querying channel ID from ledger:', error)
    await client.disconnect().catch(() => {})
    // Fallback to generated ID
    return generateFallbackChannelId(txHash, account)
  }
}

/**
 * Fallback: Generate a temporary channel ID
 * Only used if ledger query fails (should not happen in normal operation)
 */
const generateFallbackChannelId = (txHash: string, account: string): string => {
  const timestamp = Date.now()
  const shortHash = txHash.substring(0, 8)
  const shortAccount = account.substring(0, 6)
  return `TEMP-${shortAccount}-${timestamp}-${shortHash}`
}

/**
 * Calculate Ripple epoch timestamp from JavaScript Date
 * Ripple epoch starts at January 1, 2000 (00:00 UTC)
 */
export const toRippleTime = (date: Date): number => {
  const RIPPLE_EPOCH = 946684800 // January 1, 2000 (00:00 UTC) in Unix time
  return Math.floor(date.getTime() / 1000) - RIPPLE_EPOCH
}

/**
 * Convert Ripple epoch timestamp to JavaScript Date
 */
export const fromRippleTime = (rippleTime: number): Date => {
  const RIPPLE_EPOCH = 946684800
  return new Date((rippleTime + RIPPLE_EPOCH) * 1000)
}

/**
 * Validate XRPL address format
 */
export const isValidXrplAddress = (address: string): boolean => {
  // XRPL classic addresses start with 'r' and are 25-35 characters
  return address.startsWith('r') && address.length >= 25 && address.length <= 35
}

/**
 * Get payment channel details from the ledger
 * This would query the actual on-chain payment channel
 */
export const getPaymentChannelDetails = async (
  channelId: string,
  network: string
): Promise<any> => {
  const client = new Client(getNetworkUrl(network))

  try {
    await client.connect()

    // Query the ledger for payment channel details
    const response = await client.request({
      command: 'ledger_entry',
      payment_channel: channelId
    })

    await client.disconnect()

    return response.result
  } catch (error) {
    console.error('Error fetching payment channel details:', error)
    await client.disconnect()
    throw error
  }
}

/**
 * Parameters for closing a payment channel
 */
export interface CloseChannelParams {
  channelId: string
  balance: string // Amount owed to worker (in drops)
  escrowReturn: string // Amount to return to NGO (in drops)
  account: string // NGO wallet address (channel owner)
  publicKey?: string
}

/**
 * Result from closing a payment channel
 */
export interface CloseChannelResult {
  success: boolean
  hash?: string
  error?: string
}

/**
 * Close payment channel on XRPL
 * This settles the channel and returns unused escrow to NGO
 *
 * @param params - Channel closure parameters
 * @param provider - Connected wallet provider
 * @param network - Network ('testnet' or 'mainnet')
 * @returns Result with transaction hash or error
 */
export const closePaymentChannel = async (
  params: CloseChannelParams,
  provider: WalletProvider | null,
  network: string
): Promise<CloseChannelResult> => {
  if (!provider) {
    return { success: false, error: 'No wallet connected' }
  }

  try {
    // Build PaymentChannelClaim transaction with close flag
    const transaction: PaymentChannelClaim = {
      TransactionType: 'PaymentChannelClaim',
      Account: params.account, // NGO wallet address (channel owner)
      Channel: params.channelId,
      Balance: params.balance, // Final balance for worker
      Amount: params.escrowReturn, // Return to sender (NGO)
      Flags: 0x00010000, // tfClose flag (closes channel)
    }

    // Add public key if available
    if (params.publicKey) {
      transaction.PublicKey = params.publicKey
    }

    console.log('[CLOSE_CHANNEL] Submitting PaymentChannelClaim transaction', {
      channelId: params.channelId,
      balance: params.balance,
      escrowReturn: params.escrowReturn,
      provider,
      network
    })

    // Sign and submit via multi-wallet abstraction
    const result = await submitTransactionWithWallet(
      transaction,
      provider,
      network
    )

    if (result.success && result.hash) {
      console.log('[CLOSE_CHANNEL_SUCCESS]', {
        hash: result.hash,
        channelId: params.channelId
      })

      return {
        success: true,
        hash: result.hash
      }
    }

    console.error('[CLOSE_CHANNEL_FAILED]', {
      error: result.error,
      channelId: params.channelId
    })

    return {
      success: false,
      error: result.error || 'Transaction failed'
    }
  } catch (error: any) {
    console.error('[CLOSE_CHANNEL_ERROR]', {
      error: error.message,
      channelId: params.channelId
    })

    return {
      success: false,
      error: error.message || 'Failed to close payment channel'
    }
  }
}
