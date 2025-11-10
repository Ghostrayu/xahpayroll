import { Client, Wallet, Payment, PaymentChannelCreate, PaymentChannelClaim } from 'xrpl'
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
): PaymentChannelCreate => {
  const tx: PaymentChannelCreate = {
    TransactionType: 'PaymentChannelCreate',
    Account: params.sourceAddress,
    Destination: params.destinationAddress,
    Amount: params.amount, // Should be in drops
    SettleDelay: params.settleDelay,
    PublicKey: params.publicKey || '', // Will be filled by wallet
  }

  if (params.cancelAfter) {
    tx.CancelAfter = params.cancelAfter
  }

  return tx
}

/**
 * Generate a unique channel ID from transaction hash and account
 * This is a simplified version - the actual channel ID comes from the ledger
 */
export const generateChannelId = (txHash: string, account: string): string => {
  // In production, you'd query the ledger for the actual channel ID
  // For now, we'll use a combination of timestamp and hash
  const timestamp = Date.now()
  const shortHash = txHash.substring(0, 8)
  return `CH-${timestamp}-${shortHash}`
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
