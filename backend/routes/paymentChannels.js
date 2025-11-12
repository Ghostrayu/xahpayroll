const express = require('express')
const router = express.Router()
const { query } = require('../database/db')

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
          employment_status,
          role
        ) VALUES ($1, $2, $3, $4, 'active', 'worker')
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
    const { organizationWalletAddress } = req.body

    // ============================================
    // STEP 1: INPUT VALIDATION
    // ============================================

    // Validate organizationWalletAddress is provided
    if (!organizationWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'ORGANIZATION WALLET ADDRESS IS REQUIRED' }
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
    if (!isValidXahauAddress(organizationWalletAddress)) {
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

    // Verify organization owns this channel
    if (channel.escrow_wallet_address !== organizationWalletAddress) {
      return res.status(403).json({
        success: false,
        error: { message: 'UNAUTHORIZED: YOU DO NOT OWN THIS PAYMENT CHANNEL' }
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
    // STEP 6: RETURN XRPL TRANSACTION DETAILS
    // ============================================

    // Convert XAH to drops (1 XAH = 1,000,000 drops)
    const balanceDrops = Math.floor(accumulatedBalance * 1000000).toString()
    const amountDrops = Math.floor(escrowReturn * 1000000).toString()

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
        xrplTransaction: {
          TransactionType: 'PaymentChannelClaim',
          Channel: channel.channel_id,
          Balance: balanceDrops, // Amount to pay worker (in drops)
          Amount: amountDrops,   // Escrow return to NGO (in drops)
          Flags: 0x00010000      // tfClose flag (closes channel)
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
    const { txHash, organizationWalletAddress } = req.body

    // ============================================
    // STEP 1: INPUT VALIDATION
    // ============================================

    if (!txHash) {
      return res.status(400).json({
        success: false,
        error: { message: 'TRANSACTION HASH IS REQUIRED' }
      })
    }

    if (!organizationWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'ORGANIZATION WALLET ADDRESS IS REQUIRED' }
      })
    }

    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: { message: 'CHANNEL ID IS REQUIRED' }
      })
    }

    // Validate formats
    if (!isValidXahauAddress(organizationWalletAddress)) {
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

    // Fetch channel with organization details
    const channelResult = await query(
      `SELECT pc.*, o.escrow_wallet_address
      FROM payment_channels pc
      JOIN organizations o ON pc.organization_id = o.id
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
    if (channel.escrow_wallet_address !== organizationWalletAddress) {
      return res.status(403).json({
        success: false,
        error: { message: 'UNAUTHORIZED: YOU DO NOT OWN THIS PAYMENT CHANNEL' }
      })
    }

    // ============================================
    // STEP 3: UPDATE DATABASE
    // ============================================

    // Update channel status with transaction hash
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
