import { Client } from 'xrpl'
import type { WalletProvider } from '../contexts/WalletContext'

export interface TransactionResult {
  success: boolean
  hash?: string
  error?: string
}

/**
 * Submit a transaction using the appropriate wallet provider
 * This handles Xaman and Manual wallets
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
 * Submit transaction using Xaman (formerly Xumm)
 * FIXED 2025-11-28: Now waits for actual transaction hash instead of returning payload UUID
 */
async function submitWithXaman(transaction: any, _network: string, customDescription?: string): Promise<TransactionResult> {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

    // Build request body with optional custom description
    // IMPORTANT: Do NOT set return_url for transaction payloads
    // Setting return_url causes Xaman to redirect back to the page after signing,
    // which triggers a page refresh and interrupts the polling loop (Steps 2-3).
    // The frontend polling loop will wait for transaction completion without redirect.
    const requestBody: any = {
      txjson: transaction,
      options: {
        submit: true
        // NO return_url - prevents page refresh during transaction flow
      }
    }

    if (customDescription) {
      requestBody.custom_meta = {
        instruction: customDescription
      }
    }

    // Step 1: Create Xaman payload
    const response = await fetch(`${backendUrl}/api/xaman/create-payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      return { success: false, error: 'FAILED TO CREATE XAMAN PAYLOAD' }
    }

    const data = await response.json()
    const payloadUuid = data.uuid

    console.log('[XAMAN] Created payload:', payloadUuid)

    // Step 2: Open Xaman app/website for signing
    if (data.refs?.qr_png || data.next?.always) {
      window.open(data.next.always, '_blank')
    }

    // Step 3: Poll for transaction result (check every 2 seconds for up to 5 minutes)
    console.log('[XAMAN] Waiting for user to sign transaction...')
    const maxAttempts = 150 // 5 minutes (150 * 2 seconds)
    let attempts = 0

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
      attempts++

      try {
        // Query payload status
        const statusResponse = await fetch(
          `${backendUrl}/api/xaman/payload/${payloadUuid}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        )

        if (!statusResponse.ok) {
          console.warn('[XAMAN] Failed to fetch payload status, retrying...')
          continue
        }

        const statusData = await statusResponse.json()

        // Validate response structure
        if (!statusData || !statusData.data) {
          console.warn('[XAMAN] Invalid payload status response, retrying...', statusData)
          continue
        }

        const { signed, resolved, expired, txid } = statusData.data

        console.log('[XAMAN] Payload status:', { signed, resolved, expired, txid, attempt: attempts })

        // Check if payload expired
        if (expired === true) {
          console.error('[XAMAN] ❌ Payload expired')
          return {
            success: false,
            error: 'XAMAN PAYLOAD EXPIRED. PLEASE TRY AGAIN.'
          }
        }

        // Check if user rejected (resolved=true but not signed)
        if (resolved === true && signed === false) {
          console.error('[XAMAN] ❌ Transaction rejected by user')
          return {
            success: false,
            error: 'TRANSACTION REJECTED IN XAMAN. PLEASE TRY AGAIN.'
          }
        }

        // Check if transaction was signed and submitted successfully
        if (signed && resolved && txid) {
          console.log('[XAMAN] ✅ Transaction signed successfully. TX Hash:', txid)

          // ✅ FIXED: Return actual transaction hash, not UUID
          return {
            success: true,
            hash: txid // Real XRPL transaction hash
          }
        }

        // Not resolved yet, continue polling
        console.log(`[XAMAN] Waiting... (${attempts}/${maxAttempts})`)

      } catch (pollError: any) {
        console.error('[XAMAN] Error polling payload status:', pollError)
        // Continue polling on error
      }
    }

    // Timeout after 5 minutes
    console.error('[XAMAN] ❌ Timeout: User did not sign transaction within 5 minutes')
    return {
      success: false,
      error:
        'TIMEOUT: XAMAN SIGNATURE NOT RECEIVED WITHIN 5 MINUTES.\n\n' +
        'POSSIBLE CAUSES:\n' +
        '• WALLET NOT ACTIVATED ON XAHAU (NEED 10+ XAH)\n' +
        '• NETWORK MISMATCH (CHECK XAMAN NETWORK SETTINGS)\n' +
        '• XAMAN APP CLOSED OR DISCONNECTED\n\n' +
        'TROUBLESHOOTING:\n' +
        '1. VERIFY YOUR WALLET HAS FUNDS ON XAHAU LEDGER\n' +
        '2. CHECK XAMAN SETTINGS → NETWORK → "XAHAU TESTNET"\n' +
        '3. REFRESH PAGE AND TRY AGAIN'
    }

  } catch (error: any) {
    console.error('[XAMAN] Transaction submission error:', error)
    return {
      success: false,
      error: error.message || 'XAMAN TRANSACTION FAILED'
    }
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
