const express = require('express')
const { XummSdk } = require('xumm-sdk')
const router = express.Router()

// Initialize Xumm SDK
const xumm = new XummSdk(
  process.env.XAMAN_API_KEY,
  process.env.XAMAN_API_SECRET
)

/**
 * POST /api/xaman/create-signin
 * Create a Xaman sign-in payload
 */
router.post('/create-signin', async (req, res) => {
  try {
    const { returnUrl } = req.body

    console.log('Creating Xaman sign-in payload...')

    // Create a sign-in request
    const payload = await xumm.payload.create({
      txjson: {
        TransactionType: 'SignIn'
      },
      options: {
        submit: false,
        return_url: {
          web: returnUrl || process.env.FRONTEND_URL || 'http://localhost:3000'
        }
      },
      custom_meta: {
        instruction: 'Sign in to XAH Payroll'
      }
    })

    console.log('Xaman payload created:', payload.uuid)

    // Return the payload details to frontend
    res.json({
      success: true,
      data: {
        uuid: payload.uuid,
        qrUrl: payload.refs.qr_png,
        qrSvg: payload.refs.qr_svg,
        deepLink: payload.next.always,
        websocketUrl: payload.refs.websocket_status
      }
    })
  } catch (error) {
    console.error('Error creating Xaman payload:', error)
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to create Xaman sign-in request',
        details: error.response?.data || null
      }
    })
  }
})

/**
 * GET /api/xaman/payload/:uuid
 * Get payload status and details
 */
router.get('/payload/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params

    console.log('Fetching payload status:', uuid)

    const payload = await xumm.payload.get(uuid)

    res.json({
      success: true,
      data: {
        uuid: payload.meta.uuid,
        signed: payload.meta.signed,
        resolved: payload.meta.resolved,
        expired: payload.meta.expired,
        account: payload.response?.account || null,
        txid: payload.response?.txid || null
      }
    })
  } catch (error) {
    console.error('Error fetching payload:', error)
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to fetch payload status',
        details: error.response?.data || null
      }
    })
  }
})

/**
 * POST /api/xaman/cancel/:uuid
 * Cancel a pending payload
 */
router.post('/cancel/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params

    console.log('Cancelling payload:', uuid)

    const result = await xumm.payload.cancel(uuid)

    res.json({
      success: true,
      data: {
        cancelled: result.cancelled,
        reason: result.reason
      }
    })
  } catch (error) {
    console.error('Error cancelling payload:', error)
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to cancel payload',
        details: error.response?.data || null
      }
    })
  }
})

/**
 * POST /api/xaman/create-payload
 * Create a generic Xaman payload for any transaction type
 * This endpoint accepts any XRPL transaction (PaymentChannelCreate, Payment, etc.)
 */
router.post('/create-payload', async (req, res) => {
  try {
    const { txjson, options } = req.body

    // Validate required fields
    if (!txjson || !txjson.TransactionType) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required field: txjson.TransactionType'
        }
      })
    }

    console.log('Creating Xaman payload for transaction:', txjson.TransactionType)

    // Determine the correct Xahau network based on environment
    // Xaman force_network values: MAINNET (XRPL), TESTNET (XRPL), XAHAU (Xahau Mainnet), XAHAUTESTNET (Xahau Testnet)
    const network = process.env.XRPL_NETWORK || 'testnet'
    const forceNetwork = network === 'mainnet' ? 'XAHAU' : 'XAHAUTESTNET'

    console.log(`Enforcing Xahau network: ${forceNetwork} (based on XRPL_NETWORK=${network})`)

    // Merge user-provided options with network enforcement
    const defaultOptions = {
      submit: true,
      force_network: forceNetwork, // Force Xaman to switch to Xahau network
      return_url: {
        web: process.env.FRONTEND_URL || 'http://localhost:3000'
      }
    }

    // Create payload with provided transaction
    const payload = await xumm.payload.create({
      txjson,
      options: options ? { ...defaultOptions, ...options } : defaultOptions,
      custom_meta: {
        instruction: 'Please ensure you are connected to Xahau network in Xaman. You may be prompted to switch networks.'
      }
    })

    // Check if payload creation was successful
    if (!payload || !payload.uuid) {
      console.error('Xumm SDK returned null or invalid payload:', payload)
      return res.status(500).json({
        success: false,
        error: {
          message: 'Xaman API failed to create payload. Please check API credentials and network configuration.',
          details: payload
        }
      })
    }

    console.log('Xaman payload created:', payload.uuid)

    res.json({
      success: true,
      uuid: payload.uuid,
      next: payload.next,
      refs: payload.refs,
      pushed: payload.pushed
    })
  } catch (error) {
    console.error('Error creating Xaman payload:', error)
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to create Xaman payload',
        details: error.response?.data || null
      }
    })
  }
})

/**
 * POST /api/xaman/create-payment
 * Create a payment transaction payload
 */
router.post('/create-payment', async (req, res) => {
  try {
    const { account, destination, amount, memo } = req.body

    // Validate required fields
    if (!account || !destination || !amount) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields: account, destination, amount'
        }
      })
    }

    console.log('Creating payment payload:', { account, destination, amount })

    // Build payment transaction
    const txjson = {
      TransactionType: 'Payment',
      Account: account,
      Destination: destination,
      Amount: String(Math.floor(parseFloat(amount) * 1000000)) // Convert XRP to drops
    }

    // Add memo if provided
    if (memo) {
      txjson.Memos = [{
        Memo: {
          MemoData: Buffer.from(memo, 'utf8').toString('hex').toUpperCase()
        }
      }]
    }

    const payload = await xumm.payload.create({
      txjson,
      options: {
        submit: true,
        return_url: {
          web: process.env.FRONTEND_URL || 'http://localhost:3000'
        }
      }
    })

    console.log('Payment payload created:', payload.uuid)

    res.json({
      success: true,
      data: {
        uuid: payload.uuid,
        qrUrl: payload.refs.qr_png,
        deepLink: payload.next.always,
        websocketUrl: payload.refs.websocket_status
      }
    })
  } catch (error) {
    console.error('Error creating payment payload:', error)
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to create payment request',
        details: error.response?.data || null
      }
    })
  }
})

module.exports = router
