const express = require('express')
const router = express.Router()
const { query } = require('../database/db')
const { Client } = require('xrpl')

/**
 * Get XRPL network URL based on environment
 */
function getNetworkUrl() {
  const network = process.env.XRPL_NETWORK || 'testnet'
  return network === 'mainnet' ? 'wss://xahau.network' : 'wss://xahau-test.net'
}

/**
 * POST /api/payment-channels/create
 * Create a new payment channel record in the database
 * The actual on-chain PayChannelCreate transaction is signed by the frontend wallet
 */
router.post('/create', async (req, res) => {
  try {
    const {
      organizationWalletAddress,
      workerWalletAddress,
      workerName,
      jobName,
      hourlyRate,
      fundingAmount,
      channelId,
      settleDelay,
      expiration,
      balanceUpdateFrequency
    } = req.body

    // Validate required fields
    if (!organizationWalletAddress || !workerWalletAddress || !workerName || !hourlyRate || !fundingAmount) {
      return res.status(400).json({
        success: false,
        error: { message: 'MISSING REQUIRED FIELDS' }
      })
    }

    // CRITICAL LOOKUP: Find organization by escrow_wallet_address
    // This must match the NGO/employer's wallet_address (1:1 mapping)
    const orgResult = await query(
      `SELECT id, organization_name, escrow_wallet_address, website, description
       FROM organizations
       WHERE escrow_wallet_address = $1`,
      [organizationWalletAddress]
    )

    if (orgResult.rows.length === 0) {
      console.error('[ORG_NOT_FOUND]', {
        walletAddress: organizationWalletAddress,
        reason: 'No organization record exists with this escrow_wallet_address',
        solution: 'User must complete organization setup during signup'
      })

      return res.status(404).json({
        success: false,
        error: {
          code: 'ORG_NOT_FOUND',
          message: 'ORGANIZATION NOT FOUND. PLEASE COMPLETE YOUR ORGANIZATION SETUP IN YOUR PROFILE SETTINGS.',
          details: 'Organizations must be created during signup. Contact support if you need assistance.'
        }
      })
    }

    const organization = orgResult.rows[0]
    console.log('[ORG_FOUND]', {
      organizationId: organization.id,
      walletAddress: organization.escrow_wallet_address,
      mapping: 'Successfully mapped wallet address to organization ID'
    })

    // Check if employee exists, if not create them
    let employeeResult = await query(
      'SELECT * FROM employees WHERE employee_wallet_address = $1 AND organization_id = $2',
      [workerWalletAddress, organization.id]
    )

    let employee
    if (employeeResult.rows.length === 0) {
      // Create new employee
      const newEmployeeResult = await query(
        `INSERT INTO employees (
          organization_id,
          full_name,
          employee_wallet_address,
          hourly_rate,
          employment_status
        ) VALUES ($1, $2, $3, $4, 'active')
        RETURNING *`,
        [organization.id, workerName, workerWalletAddress, hourlyRate]
      )
      employee = newEmployeeResult.rows[0]
    } else {
      employee = employeeResult.rows[0]
    }

    // Check if payment channel already exists for this org-employee pair
    const existingChannelResult = await query(
      'SELECT * FROM payment_channels WHERE organization_id = $1 AND employee_id = $2 AND status = $3',
      [organization.id, employee.id, 'active']
    )

    if (existingChannelResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'ACTIVE PAYMENT CHANNEL ALREADY EXISTS FOR THIS WORKER' }
      })
    }

    // Create payment channel record
    const channelResult = await query(
      `INSERT INTO payment_channels (
        organization_id,
        employee_id,
        channel_id,
        job_name,
        hourly_rate,
        balance_update_frequency,
        escrow_funded_amount,
        accumulated_balance,
        hours_accumulated,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 'active')
      RETURNING *`,
      [
        organization.id,
        employee.id,
        channelId,
        jobName || 'Unnamed Job',
        hourlyRate,
        balanceUpdateFrequency || 'Hourly',
        fundingAmount
      ]
    )

    const channel = channelResult.rows[0]

    res.json({
      success: true,
      data: {
        channel: {
          id: channel.id,
          channelId: channel.channel_id,
          jobName: channel.job_name,
          worker: workerName,
          workerAddress: workerWalletAddress,
          hourlyRate: parseFloat(channel.hourly_rate),
          escrowFundedAmount: parseFloat(channel.escrow_funded_amount),
          balanceUpdateFrequency: channel.balance_update_frequency,
          status: channel.status
        }
      }
    })
  } catch (error) {
    console.error('Error creating payment channel:', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO CREATE PAYMENT CHANNEL', details: error.message }
    })
  }
})

/**
 * Validate Xahau wallet address format
 * Xahau addresses follow the same format as XRPL: start with 'r' followed by 25-34 base58 characters
 * @param {string} address - Wallet address to validate
 * @returns {boolean} - True if valid Xahau address
 */
const isValidXahauAddress = (address) => {
  // Xahau addresses: 'r' + 25-34 base58 characters (no 0, O, I, l)
  const xahauAddressPattern = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/
  return xahauAddressPattern.test(address)
}

/**
 * Validate Xahau payment channel ID format
 * Channel IDs are 64-character hexadecimal strings
 * @param {string} channelId - Channel ID to validate
 * @returns {boolean} - True if valid 64-character hex string
 */
const isValidChannelId = (channelId) => {
  // Xahau channel IDs are 64-character hexadecimal strings
  const channelIdPattern = /^[0-9A-Fa-f]{64}$/
  return channelIdPattern.test(channelId)
}

/**
 * POST /api/payment-channels/:channelId/close
 * Initiate payment channel closure - returns XRPL transaction details
 *
 * This endpoint prepares the channel for closure but does NOT update the database.
 * The database is updated only after the XRPL transaction succeeds (via /close/confirm).
 *
 * Security: Validates input formats, authorization, and channel state before processing
 */
router.post('/:channelId/close', async (req, res) => {
  try {
    const { channelId } = req.params
    const { organizationWalletAddress, workerWalletAddress, forceClose } = req.body

    // ============================================
    // STEP 1: INPUT VALIDATION
    // ============================================

    // Validate that at least one wallet address is provided
    const callerWalletAddress = organizationWalletAddress || workerWalletAddress
    if (!callerWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'WALLET ADDRESS IS REQUIRED (ORGANIZATION OR WORKER)' }
      })
    }

    // Validate channelId parameter exists
    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: { message: 'CHANNEL ID IS REQUIRED' }
      })
    }

    // Validate Xahau wallet address format
    if (!isValidXahauAddress(callerWalletAddress)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'INVALID XAHAU WALLET ADDRESS FORMAT. MUST BE A VALID ADDRESS STARTING WITH "R"'
        }
      })
    }

    // Validate channel ID format (64-character hex string)
    if (!isValidChannelId(channelId)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'INVALID CHANNEL ID FORMAT. MUST BE A 64-CHARACTER HEXADECIMAL STRING'
        }
      })
    }

    // ============================================
    // STEP 2: FETCH CHANNEL WITH AUTHORIZATION CHECK
    // ============================================

    // Fetch channel with organization and employee details
    const channelResult = await query(
      `SELECT
        pc.*,
        o.escrow_wallet_address,
        o.organization_name,
        e.employee_wallet_address,
        e.full_name as employee_name
      FROM payment_channels pc
      JOIN organizations o ON pc.organization_id = o.id
      JOIN employees e ON pc.employee_id = e.id
      WHERE pc.channel_id = $1`,
      [channelId]
    )

    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'PAYMENT CHANNEL NOT FOUND' }
      })
    }

    const channel = channelResult.rows[0]

    // ============================================
    // STEP 3: AUTHORIZATION CHECK
    // ============================================

    // Determine caller type (NGO or Worker)
    const isNGO = channel.escrow_wallet_address === callerWalletAddress
    const isWorker = channel.employee_wallet_address === callerWalletAddress

    // Verify caller is authorized (either NGO or worker)
    if (!isNGO && !isWorker) {
      return res.status(403).json({
        success: false,
        error: { message: 'UNAUTHORIZED: YOU DO NOT HAVE PERMISSION TO CLOSE THIS PAYMENT CHANNEL' }
      })
    }

    // ============================================
    // STEP 4: VALIDATE CHANNEL STATE
    // ============================================

    // Check channel is not already closed
    if (channel.status === 'closed') {
      return res.status(400).json({
        success: false,
        error: { message: 'PAYMENT CHANNEL IS ALREADY CLOSED' }
      })
    }

    // Check channel is not already in closing state
    if (channel.status === 'closing') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'PAYMENT CHANNEL IS CURRENTLY BEING CLOSED. PLEASE WAIT FOR VALIDATION TO COMPLETE.',
          status: 'closing',
          lastValidationAt: channel.last_validation_at
        }
      })
    }

    // ============================================
    // STEP 4.5: UNCLAIMED BALANCE WARNING
    // ============================================

    const unpaidBalance = parseFloat(channel.accumulated_balance) || 0

    // Check if there's an unclaimed balance
    if (unpaidBalance > 0 && !forceClose) {
      const warningMessage = isWorker
        ? `WARNING: YOU HAVE ${unpaidBalance.toFixed(2)} XAH IN UNCLAIMED WAGES. CLAIM BEFORE CLOSING OR FORFEIT YOUR EARNINGS.`
        : `WARNING: WORKER HAS ${unpaidBalance.toFixed(2)} XAH IN UNCLAIMED WAGES. ENSURE PAYMENT BEFORE CLOSING.`

      return res.status(400).json({
        success: false,
        error: {
          code: 'UNCLAIMED_BALANCE',
          message: warningMessage,
          unpaidBalance: unpaidBalance,
          requiresForceClose: true,
          callerType: isWorker ? 'worker' : 'ngo'
        }
      })
    }

    // ============================================
    // STEP 5: CALCULATE ESCROW RETURN
    // ============================================

    const escrowFunded = parseFloat(channel.escrow_funded_amount) || 0
    const accumulatedBalance = parseFloat(channel.accumulated_balance) || 0
    let escrowReturn = escrowFunded - accumulatedBalance

    // Validate calculation - prevent negative escrow return
    if (escrowReturn < 0) {
      console.warn('[CHANNEL_CLOSE] Negative escrow return detected', {
        channelId,
        escrowFunded,
        accumulatedBalance,
        organizationWallet: organizationWalletAddress
      })
      escrowReturn = 0 // No refund if worker is owed more than escrow
    }

    // ============================================
    // STEP 6: SET CHANNEL TO 'CLOSING' STATE
    // ============================================

    // Update channel status to 'closing' to prevent concurrent closure attempts
    // This provides optimistic locking - transaction will proceed, but database
    // won't be marked as 'closed' until validation confirms it
    await query(
      `UPDATE payment_channels
       SET status = 'closing',
           validation_attempts = validation_attempts + 1,
           last_validation_at = NOW(),
           updated_at = NOW()
       WHERE channel_id = $1`,
      [channelId]
    )

    console.log('[CHANNEL_STATUS_CLOSING]', {
      channelId,
      status: 'closing',
      validationAttempt: (channel.validation_attempts || 0) + 1
    })

    // ============================================
    // STEP 7: RETURN XRPL TRANSACTION DETAILS
    // ============================================

    // Convert XAH to drops (1 XAH = 1,000,000 drops)
    const balanceDrops = Math.floor(accumulatedBalance * 1000000).toString()

    console.log('[CHANNEL_CLOSE_INIT]', {
      channelId,
      organizationWallet: organizationWalletAddress,
      workerWallet: channel.employee_wallet_address,
      escrowFunded,
      accumulatedBalance,
      escrowReturn,
      timestamp: new Date().toISOString()
    })

    res.json({
      success: true,
      data: {
        channel: {
          id: channel.id,
          channelId: channel.channel_id,
          status: channel.status,
          jobName: channel.job_name,
          workerAddress: channel.employee_wallet_address,
          workerName: channel.employee_name,
          escrowFunded: escrowFunded,
          accumulatedBalance: accumulatedBalance,
          escrowReturn: escrowReturn,
          hoursAccumulated: parseFloat(channel.hours_accumulated) || 0,
          hourlyRate: parseFloat(channel.hourly_rate) || 0
        },
        // XRPL transaction details for PaymentChannelClaim
        // NOTE: Amount field is NOT included - escrow returns automatically on close
        // The Amount field was causing temBAD_AMOUNT errors because it's meant for
        // sending additional XAH from Account's balance, not for returning escrow
        xrplTransaction: {
          TransactionType: 'PaymentChannelClaim',
          Channel: channel.channel_id,
          Balance: balanceDrops, // Amount to pay worker (in drops)
          Flags: 0x00010000 // tfClose flag (closes channel)
        }
      }
    })
  } catch (error) {
    console.error('[CHANNEL_CLOSE_ERROR]', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO PREPARE CHANNEL CLOSURE', details: error.message }
    })
  }
})

/**
 * POST /api/payment-channels/:channelId/close/confirm
 * Confirm payment channel closure after XRPL transaction succeeds
 *
 * This endpoint updates the database AFTER the XRPL PaymentChannelClaim transaction
 * has been successfully submitted and confirmed on-chain.
 *
 * Security: Re-validates authorization before updating database
 */
router.post('/:channelId/close/confirm', async (req, res) => {
  try {
    const { channelId } = req.params
    const { txHash, organizationWalletAddress, workerWalletAddress } = req.body

    // ============================================
    // STEP 1: INPUT VALIDATION
    // ============================================

    if (!txHash) {
      return res.status(400).json({
        success: false,
        error: { message: 'TRANSACTION HASH IS REQUIRED' }
      })
    }

    const callerWalletAddress = organizationWalletAddress || workerWalletAddress
    if (!callerWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'WALLET ADDRESS IS REQUIRED (ORGANIZATION OR WORKER)' }
      })
    }

    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: { message: 'CHANNEL ID IS REQUIRED' }
      })
    }

    // Validate formats
    if (!isValidXahauAddress(callerWalletAddress)) {
      return res.status(400).json({
        success: false,
        error: { message: 'INVALID WALLET ADDRESS FORMAT' }
      })
    }

    if (!isValidChannelId(channelId)) {
      return res.status(400).json({
        success: false,
        error: { message: 'INVALID CHANNEL ID FORMAT' }
      })
    }

    // ============================================
    // STEP 2: RE-VERIFY AUTHORIZATION
    // ============================================

    // Fetch channel with organization and employee details
    const channelResult = await query(
      `SELECT pc.*, o.escrow_wallet_address, e.employee_wallet_address
      FROM payment_channels pc
      JOIN organizations o ON pc.organization_id = o.id
      JOIN employees e ON pc.employee_id = e.id
      WHERE pc.channel_id = $1`,
      [channelId]
    )

    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'PAYMENT CHANNEL NOT FOUND' }
      })
    }

    const channel = channelResult.rows[0]

    // Verify authorization again (security: never trust client)
    const isNGO = channel.escrow_wallet_address === callerWalletAddress
    const isWorker = channel.employee_wallet_address === callerWalletAddress

    if (!isNGO && !isWorker) {
      return res.status(403).json({
        success: false,
        error: { message: 'UNAUTHORIZED: YOU DO NOT HAVE PERMISSION TO CLOSE THIS PAYMENT CHANNEL' }
      })
    }

    // ============================================
    // STEP 3: VERIFY CHANNEL CLOSURE ON LEDGER
    // ============================================

    const client = new Client(getNetworkUrl())
    let validationResult = {
      success: false,
      validated: false,
      channelRemoved: false,
      error: null
    }

    try {
      await client.connect()
      console.log('[VERIFY_CLOSURE] Connected to Xahau', { channelId, txHash })

      // STEP 3.1: Verify transaction was validated
      let transactionValidated = false
      let transactionResult = ''

      try {
        const txResponse = await client.request({
          command: 'tx',
          transaction: txHash
        })

        transactionValidated = txResponse.result.validated === true
        transactionResult = txResponse.result.meta?.TransactionResult || 'UNKNOWN'

        console.log('[VERIFY_CLOSURE] Transaction check', {
          validated: transactionValidated,
          result: transactionResult
        })

        if (!transactionValidated) {
          validationResult.error = 'TRANSACTION NOT VALIDATED ON LEDGER'
          validationResult.validated = false
        } else if (transactionResult !== 'tesSUCCESS') {
          validationResult.error = `TRANSACTION FAILED: ${transactionResult}`
          validationResult.validated = true
        } else {
          validationResult.validated = true
        }
      } catch (txError) {
        console.error('[VERIFY_CLOSURE] Failed to verify transaction', txError)
        validationResult.error = `FAILED TO QUERY TRANSACTION: ${txError.message}`
      }

      // STEP 3.2: Verify channel no longer exists on ledger
      if (validationResult.validated && !validationResult.error) {
        try {
          await client.request({
            command: 'ledger_entry',
            payment_channel: channelId
          })

          // Channel still exists - validation failed
          console.warn('[VERIFY_CLOSURE] Channel still exists on ledger', { channelId, txHash })
          validationResult.error = 'CHANNEL STILL EXISTS ON LEDGER'
          validationResult.channelRemoved = false
        } catch (channelError) {
          // Expected error: channel not found (successfully removed)
          if (channelError.data?.error === 'entryNotFound' ||
              channelError.message?.includes('not found')) {
            console.log('[VERIFY_CLOSURE] ✅ Channel successfully removed from ledger', {
              channelId,
              txHash
            })
            validationResult.channelRemoved = true
            validationResult.success = true
          } else {
            console.error('[VERIFY_CLOSURE] Unexpected error querying channel', channelError)
            validationResult.error = `FAILED TO VERIFY CHANNEL REMOVAL: ${channelError.message}`
          }
        }
      }

      await client.disconnect()
    } catch (error) {
      console.error('[VERIFY_CLOSURE] Critical error during validation', error)
      await client.disconnect().catch(() => {})
      validationResult.error = `VALIDATION ERROR: ${error.message}`
    }

    // ============================================
    // STEP 4: UPDATE DATABASE BASED ON VALIDATION
    // ============================================

    if (validationResult.success) {
      // SUCCESS: Transaction validated AND channel removed from ledger
      const updateResult = await query(
        `UPDATE payment_channels
        SET
          status = 'closed',
          closure_tx_hash = $1,
          closed_at = NOW(),
          updated_at = NOW()
        WHERE channel_id = $2
        RETURNING *`,
        [txHash, channelId]
      )

      console.log('[CHANNEL_CLOSE_SUCCESS]', {
        channelId,
        txHash,
        organizationWallet: organizationWalletAddress,
        timestamp: new Date().toISOString()
      })

      res.json({
        success: true,
        data: { channel: updateResult.rows[0] }
      })
    } else {
      // FAILURE: Validation failed, rollback to 'active' state
      await query(
        `UPDATE payment_channels
        SET
          status = 'active',
          last_validation_at = NOW(),
          updated_at = NOW()
        WHERE channel_id = $1`,
        [channelId]
      )

      console.error('[CHANNEL_CLOSE_VALIDATION_FAILED]', {
        channelId,
        txHash,
        error: validationResult.error,
        validated: validationResult.validated,
        channelRemoved: validationResult.channelRemoved,
        timestamp: new Date().toISOString()
      })

      // ============================================
      // STEP 5: CREATE NOTIFICATION FOR VALIDATION FAILURE
      // ============================================

      try {
        // Get worker details for notification
        const workerResult = await query(
          `SELECT e.employee_wallet_address, e.name, pc.job_name
          FROM employees e
          JOIN payment_channels pc ON e.id = pc.employee_id
          WHERE pc.channel_id = $1`,
          [channelId]
        )

        if (workerResult.rows.length > 0) {
          const worker = workerResult.rows[0]
          const notificationMessage = `CHANNEL CLOSURE VALIDATION FAILED FOR ${worker.job_name || 'PAYMENT CHANNEL'}. CHANNEL AUTOMATICALLY ROLLED BACK TO ACTIVE STATE.`

          await query(
            `INSERT INTO ngo_notifications (
              organization_id,
              notification_type,
              worker_wallet_address,
              worker_name,
              message,
              metadata,
              is_read,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              channel.organization_id,
              'channel_closure_failed',
              worker.employee_wallet_address,
              worker.name,
              notificationMessage,
              JSON.stringify({
                channelId,
                txHash,
                error: validationResult.error,
                validated: validationResult.validated,
                channelRemoved: validationResult.channelRemoved,
                jobName: worker.job_name
              }),
              false
            ]
          )

          console.log('[NOTIFICATION_CREATED] Validation failure notification sent to organization', {
            organizationId: channel.organization_id,
            channelId
          })
        }
      } catch (notifError) {
        // Don't fail the request if notification creation fails
        console.error('[NOTIFICATION_ERROR] Failed to create validation failure notification', notifError)
      }

      return res.status(400).json({
        success: false,
        error: {
          message: 'CHANNEL CLOSURE VALIDATION FAILED',
          details: validationResult.error,
          validated: validationResult.validated,
          channelRemoved: validationResult.channelRemoved
        }
      })
    }
  } catch (error) {
    console.error('[CHANNEL_CLOSE_CONFIRM_ERROR]', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO CONFIRM CHANNEL CLOSURE', details: error.message }
    })
  }
})

module.exports = router
