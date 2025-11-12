import { Client } from 'xrpl'
import type { WalletProvider } from '../contexts/WalletContext'

export interface TransactionResult {
  success: boolean
  hash?: string
  error?: string
}

/**
 * Submit a transaction using the appropriate wallet provider
 * This handles GemWallet, Crossmark, Xaman, and Manual wallets
 */
export const submitTransactionWithWallet = async (
  transaction: any,
  provider: WalletProvider | null,
  network: string,
  customDescription?: string
): Promise<TransactionResult> => {
  if (!provider) {
    return { success: false, error: 'No wallet provider connected' }
  }

  try {
    switch (provider) {
      case 'gemwallet':
        return await submitWithGemWallet(transaction)

      case 'crossmark':
        return await submitWithCrossmark(transaction)

      case 'xaman':
        return await submitWithXaman(transaction, network, customDescription)

      case 'manual':
        return await submitWithManual(transaction, network)

      default:
        return { success: false, error: `Unsupported wallet provider: ${provider}` }
    }
  } catch (error: any) {
    console.error('Transaction submission error:', error)
    return {
      success: false,
      error: error.message || 'Failed to submit transaction'
    }
  }
}

/**
 * Submit transaction using GemWallet
 */
async function submitWithGemWallet(transaction: any): Promise<TransactionResult> {
  try {
    const { submitTransaction } = await import('@gemwallet/api')
    
    const result = await submitTransaction({
      transaction: transaction
    })

    if (!result || result.type === 'reject') {
      return { success: false, error: 'Transaction rejected by user' }
    }

    return {
      success: true,
      hash: result.result?.hash
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'GemWallet transaction failed' }
  }
}

/**
 * Submit transaction using Crossmark
 */
async function submitWithCrossmark(transaction: any): Promise<TransactionResult> {
  try {
    if (typeof window === 'undefined' || !(window as any).crossmark) {
      return { success: false, error: 'Crossmark wallet not found' }
    }

    const crossmark = (window as any).crossmark
    const result = await crossmark.signAndSubmit(transaction)

    if (!result || result.response?.data?.resp === 'Rejected') {
      return { success: false, error: 'Transaction rejected by user' }
    }

    return {
      success: true,
      hash: result.response?.data?.txHash || result.response?.data?.hash
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Crossmark transaction failed' }
  }
}

/**
 * Submit transaction using Xaman (formerly Xumm)
 */
async function submitWithXaman(transaction: any, _network: string, customDescription?: string): Promise<TransactionResult> {
  try {
    // Xaman uses a different flow - create a payload and wait for signing
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

    // Build request body with optional custom description
    const requestBody: any = {
      txjson: transaction,
      options: {
        submit: true,
        return_url: {
          web: window.location.href
        }
      }
    }

    // Add custom_meta if description is provided
    if (customDescription) {
      requestBody.custom_meta = {
        instruction: customDescription
      }
    }

    // Send transaction to backend to create Xaman payload
    const response = await fetch(`${backendUrl}/api/xaman/create-payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      return { success: false, error: 'Failed to create Xaman payload' }
    }

    const data = await response.json()
    
    // Open Xaman app/website for signing
    if (data.refs?.qr_png) {
      // Show QR code or redirect to Xaman
      window.open(data.next.always, '_blank')
    }

    // Poll for transaction result
    // In production, you'd use websockets or webhooks
    return {
      success: true,
      hash: data.uuid // Xaman payload UUID
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Xaman transaction failed' }
  }
}

/**
 * Submit transaction using Manual wallet (seed-based)
 */
async function submitWithManual(transaction: any, network: string): Promise<TransactionResult> {
  try {
    const wsUrl = network === 'testnet' 
      ? 'wss://xahau-test.net'
      : 'wss://xahau.network'

    const client = new Client(wsUrl)
    await client.connect()

    // Transaction should already be signed by WalletContext.signTransaction
    const result = await client.submitAndWait(transaction.tx_blob || transaction)
    
    await client.disconnect()

    if (result.result.meta && typeof result.result.meta === 'object' && 'TransactionResult' in result.result.meta) {
      const txResult = (result.result.meta as any).TransactionResult
      if (txResult === 'tesSUCCESS') {
        return {
          success: true,
          hash: result.result.hash
        }
      }
    }

    return { 
      success: false, 
      error: `Transaction failed: ${JSON.stringify(result.result.meta)}` 
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Manual wallet transaction failed' }
  }
}
