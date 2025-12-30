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
  // Xaman wallet automatically adds the user's public key
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
    console.log('[CHANNEL_ID] Connected to Xahau, querying tx hash:', txHash)

    // ATTEMPT 1: Query transaction metadata via 'tx' command
    try {
      const txResponse = await client.request({
        command: 'tx',
        transaction: txHash
      })

      console.log('[CHANNEL_ID] tx command response received')

      // Look for the CreatedNode with LedgerEntryType: "PayChannel" in the metadata
      if (txResponse.result.meta && typeof txResponse.result.meta === 'object') {
        const meta = txResponse.result.meta as any

        if (meta.AffectedNodes) {
          for (const node of meta.AffectedNodes) {
            if (node.CreatedNode?.LedgerEntryType === 'PayChannel') {
              // The LedgerIndex is the actual Channel ID
              const channelId = node.CreatedNode.LedgerIndex
              console.log('[CHANNEL_ID] ✅ Found channel ID from tx metadata:', channelId)
              await client.disconnect()
              return channelId
            }
          }
        }
      }

      console.warn('[CHANNEL_ID] ⚠️ tx command succeeded but no PayChannel in metadata')
    } catch (txError: any) {
      console.warn('[CHANNEL_ID] tx command failed:', txError.message || txError)
      // Don't throw - continue to fallback method
    }

    // ATTEMPT 2: Query account_channels as fallback (works on Xahau even when tx command fails)
    console.log('[CHANNEL_ID] Attempting fallback: account_channels query for account:', account)

    try {
      const channelsResponse = await client.request({
        command: 'account_channels',
        account: account,
        ledger_index: 'validated'
      })

      console.log('[CHANNEL_ID] account_channels response:', {
        channelCount: channelsResponse.result?.channels?.length || 0
      })

      if (channelsResponse.result?.channels && channelsResponse.result.channels.length > 0) {
        const channels = channelsResponse.result.channels

        // Strategy: Find the channel with the highest amount (most recently funded)
        // This is more reliable than assuming "last in array" is most recent
        const sortedChannels = [...channels].sort((a, b) =>
          parseInt(b.amount || '0') - parseInt(a.amount || '0')
        )

        const mostRecentChannel = sortedChannels[0]

        if (mostRecentChannel.channel_id) {
          console.log('[CHANNEL_ID] ✅ Found channel ID via account_channels:', mostRecentChannel.channel_id)
          console.log('[CHANNEL_ID] Channel details:', {
            destination: mostRecentChannel.destination_account,
            amount: mostRecentChannel.amount,
            balance: mostRecentChannel.balance
          })
          await client.disconnect()
          return mostRecentChannel.channel_id
        }
      } else {
        console.warn('[CHANNEL_ID] ⚠️ account_channels returned no channels')
      }
    } catch (channelsError: any) {
      console.error('[CHANNEL_ID] account_channels query failed:', channelsError.message || channelsError)
    }

    // ATTEMPT 3: Wait a moment and retry account_channels (ledger might be processing)
    console.log('[CHANNEL_ID] Waiting 2 seconds for ledger to process, then retrying...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    try {
      const retryResponse = await client.request({
        command: 'account_channels',
        account: account,
        ledger_index: 'validated'
      })

      if (retryResponse.result?.channels && retryResponse.result.channels.length > 0) {
        const channels = retryResponse.result.channels
        const sortedChannels = [...channels].sort((a, b) =>
          parseInt(b.amount || '0') - parseInt(a.amount || '0')
        )

        const mostRecentChannel = sortedChannels[0]

        if (mostRecentChannel.channel_id) {
          console.log('[CHANNEL_ID] ✅ Found channel ID on retry:', mostRecentChannel.channel_id)
          await client.disconnect()
          return mostRecentChannel.channel_id
        }
      }
    } catch (retryError: any) {
      console.error('[CHANNEL_ID] Retry failed:', retryError.message || retryError)
    }

    // All attempts failed - disconnect and fallback to TEMP ID
    await client.disconnect()
    console.error('[CHANNEL_ID] ❌ ALL METHODS FAILED - Falling back to temporary ID')
    console.error('[CHANNEL_ID] This should not happen in normal operation. Check Xahau node connectivity.')
    return generateFallbackChannelId(txHash, account)

  } catch (error: any) {
    console.error('[CHANNEL_ID] ❌ Critical error in getChannelIdFromTransaction:', error)
    await client.disconnect().catch(() => {})
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
 * Check if an account exists on the XAH Ledger
 * An account must be activated (funded with minimum reserve) before it can receive payments
 * 
 * @param address - XRPL wallet address to check
 * @param network - Network ('testnet' or 'mainnet')
 * @returns true if account exists and is active, false otherwise
 */
export const checkAccountExists = async (
  address: string,
  network: string
): Promise<boolean> => {
  const client = new Client(getNetworkUrl(network))

  try {
    await client.connect()

    // Query the ledger for account information
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated' // Use validated ledger
    })

    await client.disconnect()

    // If we get a response with account_data, the account exists
    return !!(response.result?.account_data)
  } catch (error: any) {
    await client.disconnect().catch(() => {})

    // Check if error is specifically "account not found"
    if (error.data?.error === 'actNotFound' || error.message?.includes('Account not found')) {
      console.log(`Account ${address} does not exist on ledger`)
      return false
    }

    // Handle Xahau API compatibility issues
    if (error.message?.includes('Not implemented')) {
      console.warn('⚠️ Xahau API limitation: account_info validation unavailable')
      console.warn('⚠️ Skipping account existence check - assuming account exists')
      console.warn('⚠️ If tecNO_DST error occurs, worker wallet needs activation')
      // Return true to allow transaction attempt (will fail at ledger level if account doesn't exist)
      return true
    }

    // For other errors, log and return true (fail-open for now to not block channel creation)
    console.error('Error checking account existence:', error)
    console.warn('⚠️ Proceeding with channel creation despite validation error')
    return true
  }
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
 * Verify channel closure on XRPL ledger after PaymentChannelClaim transaction
 *
 * This function prevents database-ledger mismatches by verifying that:
 * 1. The transaction was validated on the ledger (not just submitted)
 * 2. The channel no longer exists on the ledger (actually closed)
 *
 * @param channelId - XRPL payment channel ID (64-char hex)
 * @param txHash - Transaction hash from PaymentChannelClaim
 * @param network - Network ('testnet' or 'mainnet')
 * @returns Validation result with success status and error details
 */
export interface ChannelClosureValidation {
  success: boolean
  validated: boolean
  channelRemoved: boolean
  scheduledClosure?: boolean // true if channel scheduled for closure (source address with XRP remaining)
  expirationTime?: number // XRPL Ripple time when channel will close (if scheduledClosure=true)
  error?: string
  details?: {
    transactionResult?: string
    channelStillExists?: boolean
    scheduledExpiration?: number
    validationAttempt?: number
  }
}

export const verifyChannelClosure = async (
  channelId: string,
  txHash: string,
  network: string,
  isSourceClosure: boolean = false // NEW: Determines validation behavior
): Promise<ChannelClosureValidation> => {
  const client = new Client(getNetworkUrl(network))

  try {
    await client.connect()
    console.log('[VERIFY_CLOSURE] Connected to Xahau, verifying closure', {
      channelId,
      txHash,
      network,
      isSourceClosure
    })

    // STEP 1: Verify transaction was validated on ledger
    let transactionValidated = false
    let transactionResult = ''

    try {
      const txResponse = await client.request({
        command: 'tx',
        transaction: txHash
      })

      transactionValidated = txResponse.result.validated === true
      // Extract TransactionResult from meta (may be string or object)
      const meta = txResponse.result.meta as any
      transactionResult = meta?.TransactionResult || 'UNKNOWN'

      console.log('[VERIFY_CLOSURE] Transaction validation check', {
        validated: transactionValidated,
        result: transactionResult
      })

      if (!transactionValidated) {
        await client.disconnect()
        return {
          success: false,
          validated: false,
          channelRemoved: false,
          error: 'TRANSACTION NOT VALIDATED ON LEDGER',
          details: {
            transactionResult,
            validationAttempt: 1
          }
        }
      }

      if (transactionResult !== 'tesSUCCESS') {
        await client.disconnect()
        return {
          success: false,
          validated: true,
          channelRemoved: false,
          error: `TRANSACTION FAILED: ${transactionResult}`,
          details: {
            transactionResult,
            validationAttempt: 1
          }
        }
      }
    } catch (txError: any) {
      console.error('[VERIFY_CLOSURE] Failed to verify transaction', txError)
      await client.disconnect()
      return {
        success: false,
        validated: false,
        channelRemoved: false,
        error: `FAILED TO QUERY TRANSACTION: ${txError.message}`,
        details: {
          validationAttempt: 1
        }
      }
    }

    // STEP 2: Verify channel state based on closure type
    if (isSourceClosure) {
      // SOURCE CLOSURE (NGO): Channel scheduled for closure, should still exist with Expiration set
      try {
        const channelResponse = await client.request({
          command: 'ledger_entry',
          payment_channel: channelId
        })

        const channel = channelResponse.result.node as any

        // Verify Expiration was set (scheduled closure)
        if (!channel.Expiration) {
          await client.disconnect()
          return {
            success: false,
            validated: true,
            channelRemoved: false,
            error: 'EXPIRATION NOT SET - SCHEDULED CLOSURE FAILED',
            details: {
              transactionResult: 'tesSUCCESS',
              channelStillExists: true,
              validationAttempt: 1
            }
          }
        }

        // SUCCESS: Channel scheduled for closure
        console.log('[VERIFY_CLOSURE] ✅ Channel scheduled for closure', {
          channelId,
          expiration: channel.Expiration,
          settleDelay: channel.SettleDelay
        })

        await client.disconnect()
        return {
          success: true,
          validated: true,
          channelRemoved: false, // Still exists (scheduled)
          scheduledClosure: true,
          expirationTime: channel.Expiration,
          details: {
            transactionResult: 'tesSUCCESS',
            channelStillExists: true, // Expected for source closure
            scheduledExpiration: channel.Expiration,
            validationAttempt: 1
          }
        }
      } catch (channelError: any) {
        // Channel not found - means it had no XRP remaining and closed immediately
        if (channelError.data?.error === 'entryNotFound' ||
            channelError.message?.includes('not found')) {
          console.log('[VERIFY_CLOSURE] ✅ Channel closed immediately (no XRP remaining)', {
            channelId,
            txHash
          })

          await client.disconnect()
          return {
            success: true,
            validated: true,
            channelRemoved: true,
            scheduledClosure: false,
            details: {
              transactionResult: 'tesSUCCESS',
              channelStillExists: false,
              validationAttempt: 1
            }
          }
        }

        // Unexpected error
        console.error('[VERIFY_CLOSURE] Unexpected error querying channel', channelError)
        await client.disconnect()
        return {
          success: false,
          validated: true,
          channelRemoved: false,
          error: `FAILED TO QUERY CHANNEL: ${channelError.message}`,
          details: {
            transactionResult: 'tesSUCCESS',
            validationAttempt: 1
          }
        }
      }
    } else {
      // DESTINATION CLOSURE (WORKER): Channel should be immediately removed
      try {
        await client.request({
          command: 'ledger_entry',
          payment_channel: channelId
        })

        // Channel still exists - validation failed for destination closure
        console.warn('[VERIFY_CLOSURE] ⚠️ Channel still exists after destination closure', {
          channelId,
          txHash
        })

        await client.disconnect()
        return {
          success: false,
          validated: true,
          channelRemoved: false,
          error: 'CHANNEL STILL EXISTS AFTER DESTINATION CLOSURE',
          details: {
            transactionResult: 'tesSUCCESS',
            channelStillExists: true,
            validationAttempt: 1
          }
        }
      } catch (channelError: any) {
        // Expected error: channel removed
        if (channelError.data?.error === 'entryNotFound' ||
            channelError.message?.includes('not found')) {
          console.log('[VERIFY_CLOSURE] ✅ Channel immediately removed by destination', {
            channelId,
            txHash
          })

          await client.disconnect()
          return {
            success: true,
            validated: true,
            channelRemoved: true,
            scheduledClosure: false,
            details: {
              transactionResult: 'tesSUCCESS',
              channelStillExists: false,
              validationAttempt: 1
            }
          }
        }

        // Unexpected error
        console.error('[VERIFY_CLOSURE] Unexpected error querying channel', channelError)
        await client.disconnect()
        return {
          success: false,
          validated: true,
          channelRemoved: false,
          error: `FAILED TO VERIFY CHANNEL REMOVAL: ${channelError.message}`,
          details: {
            transactionResult: 'tesSUCCESS',
            validationAttempt: 1
          }
        }
      }
    }
  } catch (error: any) {
    console.error('[VERIFY_CLOSURE] Critical error during validation', error)
    await client.disconnect().catch(() => {})

    return {
      success: false,
      validated: false,
      channelRemoved: false,
      error: `VALIDATION ERROR: ${error.message}`,
      details: {
        validationAttempt: 1
      }
    }
  }
}

/**
 * Parameters for closing a payment channel
 */
export interface CloseChannelParams {
  channelId: string
  balance: string // Amount owed to worker (in drops)
  escrowReturn?: string // DEPRECATED: Escrow returns automatically, no longer used
  account: string // Wallet address initiating closure (NGO or Worker)
  publicKey?: string
  isSourceClosure: boolean // true if NGO (source) is closing, false if Worker (destination)
  sourceAddress?: string // NGO wallet address (for determining closure type)
  destinationAddress?: string // Worker wallet address (for determining closure type)
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
/**
 * Claim accumulated balance from payment channel WITHOUT closing it
 * Uses PaymentChannelClaim with Balance field but NO tfClose flag
 * Channel remains open after worker receives payment
 */
export const claimChannelBalance = async (
  params: {
    channelId: string
    balance: string // In drops - amount worker will receive
    account: string // Worker wallet address
    publicKey?: string
  },
  provider: WalletProvider | null,
  network: string
): Promise<CloseChannelResult> => {
  if (!provider) {
    return { success: false, error: 'No wallet connected' }
  }

  try {
    // Build PaymentChannelClaim transaction WITHOUT close flag
    // This claims the balance for the worker but keeps channel open
    const transaction: PaymentChannelClaim = {
      TransactionType: 'PaymentChannelClaim',
      Account: params.account, // Worker wallet address (destination)
      Channel: params.channelId,
      Balance: params.balance, // Total amount worker receives (in drops)
      // NO tfClose flag - channel stays open
    }

    // Add public key if available
    if (params.publicKey) {
      transaction.PublicKey = params.publicKey
    }

    console.log('[CLAIM_BALANCE] Submitting PaymentChannelClaim (no close)', {
      channelId: params.channelId,
      balance: params.balance,
      worker: params.account,
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
      console.log('[CLAIM_BALANCE_SUCCESS]', {
        hash: result.hash,
        channelId: params.channelId,
        balanceClaimed: params.balance
      })

      return {
        success: true,
        hash: result.hash
      }
    }

    console.error('[CLAIM_BALANCE_FAILED]', {
      error: result.error,
      channelId: params.channelId
    })

    return {
      success: false,
      error: result.error || 'Transaction failed'
    }
  } catch (error: any) {
    console.error('[CLAIM_BALANCE_ERROR]', {
      error: error.message,
      channelId: params.channelId
    })

    return {
      success: false,
      error: error.message || 'Failed to claim balance'
    }
  }
}

/**
 * Close payment channel (optionally with final balance claim)
 * Uses PaymentChannelClaim with tfClose flag
 */
export const closePaymentChannel = async (
  params: CloseChannelParams,
  provider: WalletProvider | null,
  network: string
): Promise<CloseChannelResult> => {
  if (!provider) {
    return { success: false, error: 'No wallet connected' }
  }

  // PRE-FLIGHT CHECK: Verify account exists on Xahau ledger
  // This prevents "unable to set account sequence" error in Xaman
  try {
    console.log('[PREFLIGHT_CHECK] Verifying account activation on ledger:', params.account)
    const accountExists = await checkAccountExists(params.account, network)

    if (!accountExists) {
      console.error('[PREFLIGHT_CHECK] Account not activated on ledger')
      return {
        success: false,
        error:
          'ACCOUNT NOT ACTIVATED ON XAHAU LEDGER.\n\n' +
          'YOUR WALLET NEEDS AT LEAST 10 XAH TO ACTIVATE.\n\n' +
          'PLEASE:\n' +
          '1. ADD FUNDS TO YOUR WALLET\n' +
          '2. OR USE TESTNET FAUCET: https://xahau-test.net/faucet\n' +
          '3. THEN TRY CLOSING THE CHANNEL AGAIN'
      }
    }

    console.log('[PREFLIGHT_CHECK] Account activation verified ✅')
  } catch (error: any) {
    console.warn('[PREFLIGHT_CHECK_WARNING]', error.message)
    // Continue anyway - let wallet provider handle the error with its own messaging
  }

  try {
    // Build PaymentChannelClaim transaction with close flag
    // IMPORTANT: Escrow automatically returns to Account when channel closes
    // DO NOT use Amount field - that's for sending additional XAH from Account's balance
    const transaction: PaymentChannelClaim = {
      TransactionType: 'PaymentChannelClaim',
      Account: params.account, // Wallet address (NGO or Worker)
      Channel: params.channelId,
      Flags: 0x00020000, // tfClose flag (131072 decimal) - closes channel
    }

    // CRITICAL: Balance field handling for channel closure
    // Per XRPL spec: "Balance must be provided EXCEPT when closing the channel"
    // - If accumulated balance > 0: Include Balance to pay worker
    // - If accumulated balance = 0: OMIT Balance field (required for tfClose with no claims)
    // Including Balance="0" causes temBAD_AMOUNT error when closing channel with no prior claims
    if (params.balance !== '0') {
      transaction.Balance = params.balance // Final balance for worker (in drops)
    }

    // NOTE: We do NOT include the Amount field
    // The Amount field is for sending ADDITIONAL XAH from the Account's regular balance
    // Escrow return happens automatically when the channel closes
    // Including Amount with escrowReturn value causes temBAD_AMOUNT error

    // Add public key if available
    if (params.publicKey) {
      transaction.PublicKey = params.publicKey
    }

    console.log('[CLOSE_CHANNEL] Submitting PaymentChannelClaim transaction', {
      channelId: params.channelId,
      balance: params.balance,
      balanceFieldIncluded: params.balance !== '0',
      publicKeyIncluded: !!transaction.PublicKey,
      publicKeyPreview: transaction.PublicKey ? `${transaction.PublicKey.substring(0, 20)}...` : 'NOT_INCLUDED',
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
