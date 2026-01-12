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
 * Check if payment channel exists on Xahau ledger
 * Used to verify if channel was actually closed or just entered closing state
 *
 * @param {string} channelId - 64-character hex channel ID
 * @returns {Promise<Object|null>} - Channel data if exists, null if deleted, throws on error
 */
async function checkChannelExistsOnLedger(channelId) {
  const client = new Client(getNetworkUrl())

  try {
    await client.connect()
    console.log('[CHANNEL_EXISTS_CHECK] Connected to Xahau network')

    const response = await client.request({
      command: 'ledger_entry',
      payment_channel: channelId
    })

    console.log('[CHANNEL_EXISTS_CHECK] Channel found on ledger', {
      channelId,
      amount: response.result.node.Amount,
      balance: response.result.node.Balance,
      publicKey: response.result.node.PublicKey ? `${response.result.node.PublicKey.substring(0, 20)}...` : 'NOT_FOUND',
      expiration: response.result.node.Expiration,
      cancelAfter: response.result.node.CancelAfter
    })

    return response.result.node
  } catch (error) {
    if (error.data?.error === 'entryNotFound') {
      console.log('[CHANNEL_EXISTS_CHECK] Channel NOT found on ledger (properly closed)', { channelId })
      return null
    }
    console.error('[CHANNEL_EXISTS_CHECK_ERROR] Failed to query channel', error.message)
    throw error
  } finally {
    await client.disconnect()
  }
}

/**
 * Query Xahau ledger for payment channel's actual balance
 * SECURITY: Reads balance directly from ledger to prevent database manipulation
 *
 * @param {string} channelId - 64-character hex channel ID
 * @param {string} escrowWalletAddress - Source wallet address (NGO/employer)
 * @returns {Promise<number>} - Balance in XAH (not drops)
 * @throws {Error} - If channel not found on ledger or query fails
 */
async function getChannelBalanceFromLedger(channelId, escrowWalletAddress) {
  const client = new Client(getNetworkUrl())

  try {
    await client.connect()
    console.log('[LEDGER_BALANCE_QUERY] Connected to Xahau network')

    // Query account_channels for source wallet
    const accountChannelsResponse = await client.request({
      command: 'account_channels',
      account: escrowWalletAddress
    })

    console.log(`[LEDGER_BALANCE_QUERY] Queried channels for ${escrowWalletAddress}`)

    // Find the specific channel by ID
    const ledgerChannel = accountChannelsResponse.result.channels?.find(
      ch => ch.channel_id === channelId
    )

    if (!ledgerChannel) {
      throw new Error(`CHANNEL ${channelId} NOT FOUND ON LEDGER`)
    }

    // Extract balance (in drops) from ledger
    // NOTE: Use 'balance' field (worker's accumulated earnings), NOT 'amount' (total escrow)
    const balanceDrops = ledgerChannel.balance || '0'
    const balanceXAH = parseInt(balanceDrops) / 1000000

    console.log('[LEDGER_BALANCE_QUERY] Retrieved balance from ledger:', {
      channelId,
      balanceDrops,
      balanceXAH,
      settleDelay: ledgerChannel.settle_delay,
      expiration: ledgerChannel.expiration
    })

    return balanceXAH
  } catch (error) {
    console.error('[LEDGER_BALANCE_QUERY_ERROR]', {
      channelId,
      escrowWalletAddress,
      error: error.message
    })
    throw error
  } finally {
    if (client.isConnected()) {
      await client.disconnect()
      console.log('[LEDGER_BALANCE_QUERY] Disconnected from Xahau network')
    }
  }
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
      balanceUpdateFrequency,
      maxHoursPerDay
    } = req.body

    // Validate required fields
    if (!organizationWalletAddress || !workerWalletAddress || !workerName || !hourlyRate || !fundingAmount) {
      return res.status(400).json({
        success: false,
        error: { message: 'MISSING REQUIRED FIELDS' }
      })
    }

    // Validate max hours per day (optional field, but must be valid if provided)
    if (maxHoursPerDay !== undefined && maxHoursPerDay !== null) {
      const maxHours = parseFloat(maxHoursPerDay)
      if (isNaN(maxHours) || maxHours <= 0 || maxHours > 24) {
        return res.status(400).json({
          success: false,
          error: { message: 'INVALID MAX HOURS PER DAY. MUST BE BETWEEN 0 AND 24.' }
        })
      }
    }

    // CRITICAL LOOKUP: Find organization by escrow_wallet_address
    // This must match the NGO/employer's wallet_address (1:1 mapping)
    const orgResult = await query(
      `SELECT id, organization_name, escrow_wallet_address
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
        on_chain_balance,
        off_chain_accumulated_balance,
        hours_accumulated,
        max_daily_hours,
        settle_delay,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, $8, $9, 'active')
      RETURNING *`,
      [
        organization.id,
        employee.id,
        channelId,
        jobName || 'Unnamed Job',
        hourlyRate,
        balanceUpdateFrequency || 'hourly',
        fundingAmount,
        parseFloat(maxHoursPerDay) || 8.00,
        parseInt(settleDelay) || 86400 // Default 24 hours (86400 seconds) if not provided
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
          maxDailyHours: parseFloat(channel.max_daily_hours),
          settleDelay: channel.settle_delay,
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
 * POST /api/payment-channels/sync-from-ledger
 * Sync a payment channel from the Xahau ledger to the database
 *
 * This endpoint queries the ledger for channel details and creates/updates
 * the database record to match the ledger state. Used as a fallback when
 * the initial database save fails after channel creation.
 *
 * @param {string} channelId - 64-character hex channel ID from ledger
 * @param {string} organizationWalletAddress - NGO/employer wallet address
 * @param {string} workerWalletAddress - Worker wallet address
 * @param {string} [jobName] - Optional job name (defaults to 'PAYMENT CHANNEL')
 * @param {number} [hourlyRate] - Optional hourly rate (defaults to 20.00)
 * @param {string} [balanceUpdateFrequency] - Optional update frequency (defaults to 'Hourly')
 */
router.post('/sync-from-ledger', async (req, res) => {
  try {
    const {
      channelId,
      organizationWalletAddress,
      workerWalletAddress,
      jobName,
      hourlyRate,
      balanceUpdateFrequency
    } = req.body

    // Validate required fields
    if (!channelId || !organizationWalletAddress || !workerWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'MISSING REQUIRED FIELDS: channelId, organizationWalletAddress, workerWalletAddress' }
      })
    }

    // Validate channel ID format
    if (!isValidChannelId(channelId)) {
      return res.status(400).json({
        success: false,
        error: { message: 'INVALID CHANNEL ID FORMAT. EXPECTED 64-CHARACTER HEX STRING' }
      })
    }

    console.log(`[LEDGER_SYNC] Starting sync for channel ${channelId}`)

    // Step 1: Query Xahau ledger for channel details
    const client = new Client(getNetworkUrl())
    await client.connect()

    let ledgerChannel
    try {
      const channelResponse = await client.request({
        command: 'ledger_entry',
        payment_channel: channelId
      })
      ledgerChannel = channelResponse.result.node
      console.log('[LEDGER_SYNC] Channel found on ledger:', ledgerChannel)
    } catch (ledgerErr) {
      await client.disconnect()
      console.error('[LEDGER_SYNC] Channel not found on ledger:', ledgerErr.message)
      return res.status(404).json({
        success: false,
        error: { message: 'CHANNEL NOT FOUND ON LEDGER. MAY HAVE BEEN CLOSED.' }
      })
    }

    await client.disconnect()

    // Step 2: Verify channel participants match request
    if (ledgerChannel.Account !== organizationWalletAddress ||
        ledgerChannel.Destination !== workerWalletAddress) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'CHANNEL PARTICIPANT MISMATCH. LEDGER PARTICIPANTS DO NOT MATCH REQUEST.',
          ledgerAccount: ledgerChannel.Account,
          ledgerDestination: ledgerChannel.Destination,
          requestedAccount: organizationWalletAddress,
          requestedDestination: workerWalletAddress
        }
      })
    }

    // Step 3: Find or create organization record
    let orgResult = await query(
      `SELECT id, organization_name, escrow_wallet_address
       FROM organizations
       WHERE escrow_wallet_address = $1`,
      [organizationWalletAddress]
    )

    if (orgResult.rows.length === 0) {
      console.log('[LEDGER_SYNC] Organization not found, creating new record...')
      // Create organization if it doesn't exist
      orgResult = await query(
        `INSERT INTO organizations (organization_name, escrow_wallet_address)
         VALUES ($1, $2)
         RETURNING id, organization_name, escrow_wallet_address`,
        [`Organization ${organizationWalletAddress.substring(0, 8)}`, organizationWalletAddress]
      )
    }

    const organization = orgResult.rows[0]
    console.log('[LEDGER_SYNC] Organization:', organization)

    // Step 4: Find or create employee record
    let employeeResult = await query(
      `SELECT id, employee_wallet_address, full_name
       FROM employees
       WHERE employee_wallet_address = $1 AND organization_id = $2`,
      [workerWalletAddress, organization.id]
    )

    if (employeeResult.rows.length === 0) {
      console.log('[LEDGER_SYNC] Employee not found, creating new record...')
      // Create employee if doesn't exist
      employeeResult = await query(
        `INSERT INTO employees (full_name, employee_wallet_address, organization_id, hourly_rate)
         VALUES ($1, $2, $3, $4)
         RETURNING id, employee_wallet_address, full_name`,
        [
          `Worker ${workerWalletAddress.substring(0, 8)}`,
          workerWalletAddress,
          organization.id,
          20.00 // Default hourly rate
        ]
      )
    }

    const employee = employeeResult.rows[0]
    console.log('[LEDGER_SYNC] Employee:', employee)

    // Step 5: Check for existing closed channels and remove if blocking UNIQUE constraint
    const existingChannels = await query(
      `SELECT channel_id, status, closure_reason, closed_at
       FROM payment_channels
       WHERE organization_id = $1 AND employee_id = $2`,
      [organization.id, employee.id]
    )

    if (existingChannels.rows.length > 0) {
      console.log('[LEDGER_SYNC] Found existing channels:', existingChannels.rows)

      // Delete old closed channels to avoid UNIQUE constraint violation
      const closedChannels = existingChannels.rows.filter(ch => ch.status === 'closed')
      if (closedChannels.length > 0) {
        console.log(`[LEDGER_SYNC] Deleting ${closedChannels.length} old closed channels...`)
        await query(
          `DELETE FROM payment_channels
           WHERE organization_id = $1 AND employee_id = $2 AND status = 'closed'`,
          [organization.id, employee.id]
        )
      }

      // Check if the exact channel already exists
      const exactMatch = existingChannels.rows.find(ch => ch.channel_id === channelId)
      if (exactMatch) {
        console.log('[LEDGER_SYNC] Channel already exists in database:', exactMatch)
        return res.json({
          success: true,
          data: {
            message: 'CHANNEL ALREADY EXISTS IN DATABASE',
            channel: exactMatch
          }
        })
      }
    }

    // Step 6: Convert ledger amounts from drops to XAH
    const escrowAmountXAH = parseInt(ledgerChannel.Amount) / 1000000
    const balanceXAH = ledgerChannel.Balance ? parseInt(ledgerChannel.Balance) / 1000000 : 0

    // Step 7: Insert channel from ledger data
    const channelResult = await query(
      `INSERT INTO payment_channels (
        organization_id,
        employee_id,
        channel_id,
        job_name,
        hourly_rate,
        balance_update_frequency,
        off_chain_accumulated_balance,
        hours_accumulated,
        status,
        escrow_funded_amount,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *`,
      [
        organization.id,
        employee.id,
        channelId,
        jobName || 'PAYMENT CHANNEL', // Use provided job name or default
        hourlyRate || 20.00, // Use provided hourly rate or default
        balanceUpdateFrequency || 'Hourly', // Use provided frequency or default
        balanceXAH,
        0, // Default hours
        'active',
        escrowAmountXAH
      ]
    )

    console.log('[LEDGER_SYNC] Channel synced successfully:', channelResult.rows[0])

    return res.json({
      success: true,
      data: {
        message: 'CHANNEL SYNCED FROM LEDGER SUCCESSFULLY',
        channel: channelResult.rows[0],
        ledgerData: {
          account: ledgerChannel.Account,
          destination: ledgerChannel.Destination,
          amount: escrowAmountXAH,
          balance: balanceXAH,
          settleDelay: ledgerChannel.SettleDelay,
          publicKey: ledgerChannel.PublicKey
        }
      }
    })
  } catch (err) {
    console.error('[LEDGER_SYNC] Error syncing channel:', err)
    return res.status(500).json({
      success: false,
      error: {
        message: 'FAILED TO SYNC CHANNEL FROM LEDGER',
        details: err.message
      }
    })
  }
})

/**
 * POST /api/payment-channels/:channelId/claim
 * Claim accumulated balance WITHOUT closing channel
 *
 * Worker can claim their accumulated wages while keeping channel open.
 * Uses PaymentChannelClaim with Balance field but NO tfClose flag.
 *
 * Security: Only worker (destination) can claim balance
 */
router.post('/:channelId/claim', async (req, res) => {
  try {
    const { channelId } = req.params
    const { workerWalletAddress } = req.body

    // ============================================
    // STEP 1: VALIDATE INPUT
    // ============================================

    if (!workerWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'WORKER WALLET ADDRESS REQUIRED' }
      })
    }

    // Validate channel ID format (64-character hex string)
    if (!/^[A-F0-9]{64}$/i.test(channelId)) {
      return res.status(400).json({
        success: false,
        error: { message: 'INVALID CHANNEL ID FORMAT' }
      })
    }

    console.log('[CLAIM_BALANCE_INIT]', {
      channelId,
      workerWallet: workerWalletAddress,
      timestamp: new Date().toISOString()
    })

    // ============================================
    // STEP 2: VERIFY CHANNEL EXISTS AND IS ACTIVE
    // ============================================

    const channelResult = await query(
      `SELECT
        pc.channel_id,
        pc.organization_wallet_address,
        pc.employee_wallet_address,
        pc.off_chain_accumulated_balance,
        pc.escrow_funded_amount,
        pc.status,
        pc.job_name,
        o.organization_name
       FROM payment_channels pc
       LEFT JOIN organizations o ON pc.organization_wallet_address = o.escrow_wallet_address
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

    // Verify channel is active
    if (channel.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: { message: `CHANNEL IS ${channel.status.toUpperCase()}, CANNOT CLAIM BALANCE` }
      })
    }

    // ============================================
    // STEP 3: VERIFY AUTHORIZATION
    // ============================================

    // Only worker (destination) can claim balance
    if (workerWalletAddress !== channel.employee_wallet_address) {
      return res.status(403).json({
        success: false,
        error: { message: 'UNAUTHORIZED: ONLY WORKER CAN CLAIM BALANCE' }
      })
    }

    // ============================================
    // STEP 4: CHECK BALANCE AVAILABILITY
    // ============================================

    const accumulatedBalance = parseFloat(channel.off_chain_accumulated_balance) || 0

    if (accumulatedBalance <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_BALANCE',
          message: 'NO ACCUMULATED BALANCE TO CLAIM',
          currentBalance: accumulatedBalance
        }
      })
    }

    // ============================================
    // STEP 5: RETURN XRPL TRANSACTION DETAILS
    // ============================================

    // Convert XAH to drops (1 XAH = 1,000,000 drops)
    const balanceDrops = Math.floor(accumulatedBalance * 1000000).toString()

    console.log('[CLAIM_BALANCE_PREPARE]', {
      channelId,
      workerWallet: workerWalletAddress,
      accumulatedBalance,
      balanceDrops,
      timestamp: new Date().toISOString()
    })

    // Return XRPL transaction parameters for frontend to execute
    // Frontend will sign with worker's wallet
    return res.status(200).json({
      success: true,
      data: {
        channel: {
          channelId: channel.channel_id,
          accumulatedBalance: accumulatedBalance,
          jobName: channel.job_name || 'N/A',
          employer: channel.organization_name || 'Unknown'
        },
        xrplTransaction: {
          TransactionType: 'PaymentChannelClaim',
          Account: workerWalletAddress, // Worker wallet
          Channel: channelId,
          Balance: balanceDrops, // Amount worker will receive (in drops)
          // NO tfClose flag - channel stays open
        }
      }
    })

  } catch (error) {
    console.error('[CLAIM_BALANCE_ERROR]', error)
    return res.status(500).json({
      success: false,
      error: { message: 'INTERNAL SERVER ERROR DURING BALANCE CLAIM PREPARATION' }
    })
  }
})

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
    const { organizationWalletAddress, workerWalletAddress } = req.body

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
    // EXCEPTION: Allow finalization if channel is closing AND expired
    if (channel.status === 'closing') {
      const now = new Date()
      const expirationTime = channel.expiration_time ? new Date(channel.expiration_time) : null
      const isExpired = expirationTime && expirationTime < now

      // Block closure if still within SettleDelay period (not expired)
      if (!isExpired) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'PAYMENT CHANNEL IS CURRENTLY BEING CLOSED. PLEASE WAIT FOR VALIDATION TO COMPLETE.',
            status: 'closing',
            lastValidationAt: channel.last_validation_at,
            expirationTime: expirationTime?.toISOString()
          }
        })
      }

      // Allow finalization if expired
      console.log(`[FINALIZE_EXPIRED] Channel ${channelId} is closing and expired, allowing finalization`)
    }

    // ============================================
    // STEP 4.5: DETERMINE CLOSURE TYPE (SCHEDULED VS IMMEDIATE)
    // ============================================
    // CRITICAL FIX (2025-12-29): Reflect XRPL native behavior in app
    //
    // XRPL Payment Channel Closure Behavior:
    // 1. IMMEDIATE CLOSURE (NGO with balance = 0):
    //    - Channel closes immediately
    //    - Unused escrow returns to NGO
    //    - No SettleDelay period
    //
    // 2. SCHEDULED CLOSURE (NGO with balance > 0):
    //    - XRPL sets Expiration (SettleDelay period, typically 24 hours)
    //    - Channel enters "closing" status
    //    - Worker has time to claim accumulated balance
    //    - After SettleDelay expires, NGO can finalize closure
    //
    // 3. WORKER CLOSURE (always immediate):
    //    - Worker receives accumulated balance in same transaction
    //    - Unused escrow returns to NGO
    //    - Channel closes immediately

    const unpaidBalance = parseFloat(channel.off_chain_accumulated_balance) || 0

    const isScheduledClosure = unpaidBalance > 0 && isNGO
    const isImmediateClosure = (unpaidBalance === 0 && isNGO) || isWorker

    if (isScheduledClosure) {
      console.log('[SCHEDULED_CLOSURE] NGO requesting closure with unpaid balance', {
        channelId,
        unpaidBalance,
        settleDelayHours: channel.settle_delay / 3600,
        workerProtected: true,
        message: 'Channel will enter CLOSING status with SettleDelay'
      })
      // Continue to build transaction - XRPL will set SettleDelay
      // Response will indicate scheduled closure
    } else if (isImmediateClosure) {
      console.log('[IMMEDIATE_CLOSURE] Immediate closure requested', {
        channelId,
        unpaidBalance,
        closedBy: isWorker ? 'worker' : 'ngo',
        message: 'Channel will close immediately'
      })
    }

    // Workers always get immediate closure with balance included in claim
    if (isWorker && unpaidBalance > 0) {
      console.log('[WORKER_CLOSURE] Worker closing channel with accumulated balance', {
        channelId,
        unpaidBalance,
        message: 'Balance will be transferred in same transaction'
      })
    }

    // ============================================
    // STEP 5: DETERMINE BALANCE SOURCE
    // ============================================

    // CRITICAL DECISION: Which balance to use?
    // - Database balance: Tracks off-chain work sessions (clock in/out)
    // - Ledger balance: Tracks on-chain signed claims only
    //
    // SYSTEM ARCHITECTURE:
    // - Workers clock in/out → work_sessions table → off_chain_accumulated_balance (database)
    // - No on-chain claims until final closure → ledger Balance = 0
    // - Worker closure MUST use database balance (their earned wages)
    // - NGO closure of EXPIRED channels should verify ledger (race condition protection)

    let accumulatedBalance
    // Use off_chain_accumulated_balance (worker's earned wages from clock in/out)
    const databaseBalance = parseFloat(channel.off_chain_accumulated_balance) || 0
    const isExpired = channel.status === 'closing' &&
                     channel.expiration_time &&
                     new Date(channel.expiration_time) < new Date()

    // SECURITY CHECK: Only query ledger for expired channels closed by NGO
    // For active channels or worker closures, ALWAYS use database balance
    if (isNGO && isExpired) {
      // RACE CONDITION PROTECTION: Expired channel, NGO closing
      // Query ledger to prevent NGO from manipulating database balance before finalization
      console.log('[BALANCE_SOURCE] EXPIRED CHANNEL - NGO CLOSURE - USING LEDGER BALANCE')

      try {
        const ledgerBalance = await getChannelBalanceFromLedger(
          channel.channel_id,
          channel.escrow_wallet_address
        )

        accumulatedBalance = ledgerBalance

        console.log('[LEDGER_BALANCE_SECURITY]', {
          channelId,
          databaseBalance,
          ledgerBalance,
          discrepancy: Math.abs(ledgerBalance - databaseBalance) > 0.000001,
          discrepancyAmount: (ledgerBalance - databaseBalance).toFixed(6)
        })

        // Warn if significant discrepancy (> 0.01 XAH)
        if (Math.abs(ledgerBalance - databaseBalance) > 0.01) {
          console.warn('[LEDGER_BALANCE_MISMATCH] Database and ledger balances differ significantly!', {
            channelId,
            databaseBalance,
            ledgerBalance,
            difference: (ledgerBalance - databaseBalance).toFixed(6)
          })
        }
      } catch (error) {
        // CRITICAL FIX (2025-12-29): DO NOT fall back to database for expired channels
        // Ledger is the source of truth for security (race condition protection)
        // Falling back defeats the security mechanism and allows database manipulation
        console.error('[LEDGER_BALANCE_CRITICAL] FAILED TO QUERY LEDGER FOR EXPIRED CHANNEL', {
          channelId,
          error: error.message,
          impact: 'SECURITY VALIDATION BYPASSED - CANNOT VERIFY BALANCE',
          action: 'BLOCKING CLOSURE'
        })

        return res.status(500).json({
          success: false,
          error: {
            code: 'LEDGER_QUERY_FAILED',
            message: 'CANNOT VERIFY BALANCE FROM LEDGER. PLEASE RETRY IN A FEW MOMENTS OR CONTACT SUPPORT.',
            details: error.message
          }
        })
      }
    } else {
      // NORMAL OPERATION: Active channel or worker closure
      // Use database balance (tracks off-chain work sessions)
      console.log('[BALANCE_SOURCE] ACTIVE CHANNEL OR WORKER CLOSURE - USING DATABASE BALANCE', {
        channelId,
        databaseBalance,
        isNGO,
        isExpired,
        reason: isNGO ? 'Active channel' : 'Worker-initiated closure'
      })

      accumulatedBalance = databaseBalance
    }

    // ============================================
    // STEP 6: CALCULATE ESCROW RETURN
    // ============================================

    const escrowFunded = parseFloat(channel.escrow_funded_amount) || 0
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
    // STEP 7: OPTIMISTIC LOCKING (VALIDATION TRACKING)
    // ============================================

    // Track closure attempt without changing status
    // Status will be updated to 'closed' by /close/confirm after transaction succeeds
    // This allows retries if transaction fails (wallet rejection, network error, etc.)
    await query(
      `UPDATE payment_channels
       SET validation_attempts = validation_attempts + 1,
           last_validation_at = NOW(),
           updated_at = NOW()
       WHERE channel_id = $1`,
      [channelId]
    )

    console.log('[CHANNEL_CLOSE_ATTEMPT_TRACKED]', {
      channelId,
      currentStatus: channel.status, // Remains 'active' until confirm
      validationAttempt: (channel.validation_attempts || 0) + 1
    })

    // ============================================
    // STEP 7.5: QUERY LEDGER FOR CHANNEL'S PUBLIC KEY
    // ============================================
    // CRITICAL FIX (2025-12-28): PaymentChannelClaim requires the channel's PublicKey field
    // when closing from destination (worker) address to prevent temBAD_SIGNATURE errors
    //
    // IMPORTANT: The channel's PublicKey field IS the NGO's public key from channel creation
    // This is the correct key to use for worker (destination) closures

    let publicKey = null
    try {
      console.log('[PUBLIC_KEY_LOOKUP] Querying channel on ledger for PublicKey', {
        channelId
      })

      // Query the channel to get the NGO's public key
      const channelOnLedger = await checkChannelExistsOnLedger(channelId)

      if (channelOnLedger?.PublicKey) {
        publicKey = channelOnLedger.PublicKey
        console.log('[PUBLIC_KEY_LOOKUP] PublicKey retrieved from channel', {
          channelId,
          publicKey: publicKey.substring(0, 20) + '...'
        })
      } else {
        console.warn('[PUBLIC_KEY_LOOKUP] No PublicKey found in channel object')
      }
    } catch (error) {
      console.error('[PUBLIC_KEY_LOOKUP_ERROR] Failed to retrieve PublicKey from channel', {
        error: error.message,
        channelId
      })
      // Continue without PublicKey - let XRPL reject if required
      // This allows NGO closures (source) which don't need PublicKey
    }

    // ============================================
    // STEP 8: RETURN XRPL TRANSACTION DETAILS
    // ============================================

    // Convert XAH to drops (1 XAH = 1,000,000 drops)
    const balanceDrops = Math.floor(accumulatedBalance * 1000000).toString()

    // Log balance calculation for debugging
    console.log('[CLOSURE_BALANCE_CALCULATION]', {
      channelId,
      offChainBalance: databaseBalance,
      balanceDrops,
      source: 'off_chain_accumulated_balance'
    })

    console.log('[CHANNEL_CLOSE_INIT]', {
      channelId,
      organizationWallet: organizationWalletAddress,
      workerWallet: channel.employee_wallet_address,
      escrowFunded,
      accumulatedBalance,
      databaseBalance,
      escrowReturn,
      balanceSource: (isNGO && isExpired) ? 'ledger' : 'database',
      isNGO,
      isExpired,
      publicKeyIncluded: !!publicKey,
      timestamp: new Date().toISOString()
    })

    // ============================================
    // CRITICAL FIX (2025-12-29): VALIDATE PUBLICKEY REQUIREMENT
    // ============================================
    // XRPL requires PublicKey field for PaymentChannelClaim with tfClose when:
    // 1. Closing before SettleDelay expires (immediate closure)
    // 2. Any closure with accumulated balance > 0
    //
    // If PublicKey is required but missing, transaction will fail with temBAD_SIGNATURE
    // Better to catch this here and return clear error than let XRPL reject
    const requiresPublicKey = parseFloat(balanceDrops) > 0 || !isExpired

    if (requiresPublicKey && !publicKey) {
      console.error('[PUBLICKEY_VALIDATION_ERROR] PublicKey required but not available', {
        channelId,
        balanceDrops,
        isExpired,
        isNGO,
        isWorker,
        reason: parseFloat(balanceDrops) > 0 ? 'Balance > 0' : 'Not expired (immediate closure)'
      })

      return res.status(500).json({
        success: false,
        error: {
          code: 'MISSING_PUBLIC_KEY',
          message: 'PUBLIC KEY REQUIRED FOR THIS CLOSURE TYPE BUT NOT FOUND ON LEDGER. CHANNEL MAY BE IN INVALID STATE. PLEASE CONTACT SUPPORT.',
          details: {
            channelId,
            closureType: isExpired ? 'expired' : 'immediate',
            hasBalance: parseFloat(balanceDrops) > 0
          }
        }
      })
    }

    // Build XRPL transaction object
    const xrplTransaction = {
      TransactionType: 'PaymentChannelClaim',
      Channel: channel.channel_id,
      Balance: balanceDrops, // Amount to pay worker (in drops)
      Flags: 0x00020000 // tfClose flag (131072 decimal) - closes channel
    }

    // Add PublicKey if available (validated above when required)
    if (publicKey) {
      xrplTransaction.PublicKey = publicKey
    }

    // LOG TRANSACTION BEING RETURNED TO FRONTEND
    console.log('[CLOSE_RESPONSE] Returning transaction to frontend', {
      channelId,
      transactionIncludesPublicKey: !!xrplTransaction.PublicKey,
      publicKeyValue: xrplTransaction.PublicKey ? `${xrplTransaction.PublicKey.substring(0, 20)}...` : 'NOT_INCLUDED',
      balanceDrops: xrplTransaction.Balance,
      isWorkerClosure: isWorker,
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
          ngoWalletAddress: channel.escrow_wallet_address,
          organizationName: channel.organization_name,
          escrowFunded: escrowFunded,
          accumulatedBalance: accumulatedBalance,
          escrowReturn: escrowReturn,
          hoursAccumulated: parseFloat(channel.hours_accumulated) || 0,
          hourlyRate: parseFloat(channel.hourly_rate) || 0,
          closureType: isScheduledClosure ? 'scheduled' : 'immediate', // NEW: Reflects XRPL behavior
          settleDelayHours: isScheduledClosure ? (channel.settle_delay / 3600) : 0 // NEW: Use actual SettleDelay from database (convert seconds to hours)
        },
        // XRPL transaction details for PaymentChannelClaim
        // NOTE: Amount field is NOT included - escrow returns automatically on close
        // The Amount field was causing temBAD_AMOUNT errors because it's meant for
        // sending additional XAH from Account's balance, not for returning escrow
        // PublicKey is now included for worker closures to prevent temBAD_SIGNATURE errors
        xrplTransaction
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
    // STEP 3: VERIFY TRANSACTION VALIDATED ON LEDGER
    // ============================================
    // CRITICAL FIX (2025-12-28): Verify transaction actually succeeded before database update
    // Prevents database corruption when transactions fail validation (e.g., temBAD_SIGNATURE)

    console.log('[CONFIRM_CLOSURE] Step 3A: Verifying transaction on ledger', {
      channelId,
      txHash,
      callerWallet: callerWalletAddress,
      isNGO,
      isWorker
    })

    // Initialize XRPL client for validation
    const networkUrl = getNetworkUrl()
    const client = new Client(networkUrl)

    let txValidated = false
    let txResult = null

    try {
      await client.connect()
      console.log('[CONFIRM_CLOSURE] Connected to Xahau:', process.env.XRPL_NETWORK || 'testnet')

      // ============================================
      // CRITICAL FIX (2025-12-30): POLL FOR TRANSACTION VALIDATION
      // ============================================
      // Xahau needs 3-5 seconds to validate transactions and include them in a ledger
      // Frontend submits transaction → waits for hash → immediately calls confirm
      // But transaction may not be validated yet, causing false "NOT_VALIDATED" errors
      // Solution: Poll for validation with exponential backoff (max 30 seconds)

      const MAX_RETRIES = 10
      const INITIAL_DELAY = 1000 // 1 second
      const MAX_DELAY = 5000 // 5 seconds
      let attempt = 0
      let delay = INITIAL_DELAY

      console.log('[CONFIRM_CLOSURE] Polling for transaction validation', {
        txHash: txHash.substring(0, 20) + '...',
        maxRetries: MAX_RETRIES,
        initialDelay: INITIAL_DELAY,
        maxDelay: MAX_DELAY
      })

      while (attempt < MAX_RETRIES) {
        try {
          const txResponse = await client.request({
            command: 'tx',
            transaction: txHash,
            binary: false
          })

          const tx = txResponse.result
          txValidated = tx.validated
          txResult = tx.meta?.TransactionResult

          console.log('[CONFIRM_CLOSURE] Transaction query result', {
            txHash: txHash.substring(0, 20) + '...',
            attempt: attempt + 1,
            validated: txValidated,
            result: txResult
          })

          // If validated, break out of polling loop
          if (txValidated) {
            console.log('[CONFIRM_CLOSURE] Transaction validated after', attempt + 1, 'attempts ✅')
            break
          }

          // Not validated yet, wait and retry
          attempt++
          if (attempt < MAX_RETRIES) {
            console.log('[CONFIRM_CLOSURE] Transaction not validated yet, retrying in', delay, 'ms', {
              attempt: attempt + 1,
              maxRetries: MAX_RETRIES
            })
            await new Promise(resolve => setTimeout(resolve, delay))
            delay = Math.min(delay * 1.5, MAX_DELAY) // Exponential backoff with cap
          }
        } catch (txError) {
          // Transaction not found yet - this is normal for very recent transactions
          if (txError.message?.includes('txnNotFound') || txError.data?.error === 'txnNotFound') {
            attempt++
            if (attempt < MAX_RETRIES) {
              console.log('[CONFIRM_CLOSURE] Transaction not found on ledger yet, retrying in', delay, 'ms', {
                attempt: attempt + 1,
                maxRetries: MAX_RETRIES
              })
              await new Promise(resolve => setTimeout(resolve, delay))
              delay = Math.min(delay * 1.5, MAX_DELAY)
            }
          } else {
            // Different error - rethrow
            throw txError
          }
        }
      }

      // VALIDATION CHECK: Transaction must be validated AND successful
      if (!txValidated) {
        console.error('[CONFIRM_CLOSURE] Transaction not validated after polling', {
          txHash,
          channelId,
          attempts: attempt
        })
        await client.disconnect()
        return res.status(400).json({
          success: false,
          error: {
            message: 'TRANSACTION NOT VALIDATED BY NETWORK',
            code: 'NOT_VALIDATED',
            txHash,
            details: `The transaction was submitted but not validated after ${attempt} attempts over ${(attempt * INITIAL_DELAY) / 1000} seconds. Channel remains active.`
          }
        })
      }

      if (txResult !== 'tesSUCCESS') {
        console.error('[CONFIRM_CLOSURE] Transaction failed on ledger', {
          txHash,
          result: txResult,
          channelId
        })
        await client.disconnect()
        return res.status(400).json({
          success: false,
          error: {
            message: `TRANSACTION FAILED ON LEDGER: ${txResult}`,
            code: 'TRANSACTION_FAILED',
            txHash,
            result: txResult,
            details: 'The transaction was validated but failed. Channel remains active.'
          }
        })
      }

      console.log('[CONFIRM_CLOSURE] Transaction validated and succeeded ✅')

    } catch (txError) {
      console.error('[CONFIRM_CLOSURE] Error querying transaction', {
        error: txError.message,
        txHash,
        channelId
      })
      await client.disconnect()
      return res.status(500).json({
        success: false,
        error: {
          message: 'FAILED TO VERIFY TRANSACTION ON LEDGER',
          code: 'VERIFICATION_ERROR',
          details: txError.message
        }
      })
    }

    // ============================================
    // STEP 4: VERIFY CHANNEL STATE ON LEDGER
    // ============================================
    // Check if channel was actually deleted from ledger or just entered closing state
    // CRITICAL: tfClose flag does NOT guarantee immediate closure if channel has Expiration set
    // If Expiration exists and hasn't passed, channel enters SettleDelay period

    console.log('[CONFIRM_CLOSURE] Step 3B: Verifying channel state on ledger', {
      channelId,
      accumulatedBalance: channel.off_chain_accumulated_balance
    })

    // Query ledger to check if channel still exists
    const channelOnLedger = await checkChannelExistsOnLedger(channelId)

    // Disconnect client after validation complete
    await client.disconnect()
    console.log('[CONFIRM_CLOSURE] Disconnected from Xahau ledger')

    let finalStatus
    let expirationTime = null

    if (channelOnLedger === null) {
      // Channel successfully deleted from ledger - IMMEDIATE CLOSURE
      console.log('[CONFIRM_CLOSURE] Channel deleted from ledger (immediate closure)')
      finalStatus = 'closed'
    } else {
      // Channel still exists on ledger - ENTERED CLOSING STATE WITH SETTLE DELAY
      console.log('[CONFIRM_CLOSURE] Channel still on ledger (closing state with SettleDelay)', {
        expiration: channelOnLedger.Expiration,
        cancelAfter: channelOnLedger.CancelAfter,
        settleDelay: channelOnLedger.SettleDelay
      })
      finalStatus = 'closing'
      // Convert Ripple epoch to Unix timestamp
      if (channelOnLedger.Expiration) {
        expirationTime = new Date((channelOnLedger.Expiration + 946684800) * 1000)
      }
    }

    // ============================================
    // STEP 5: EXTRACT PAYMENT AMOUNT FROM TRANSACTION
    // ============================================
    // Extract the actual amount paid to worker from XRPL transaction
    // PaymentChannelClaim transactions have Balance field indicating amount delivered
    //
    // CRITICAL FIX (2026-01-10): Save off_chain_accumulated_balance BEFORE attempting extraction
    // The database balance is the authoritative source of worker earnings accumulated during work sessions
    // Ledger extraction is used for validation only
    //
    // BUG CONTEXT: Previously, if ledger extraction failed, the code would fall back to
    // channel.off_chain_accumulated_balance, which could be 0 if balance updates failed.
    // This caused payment records to not be created even though workers had earned wages.

    // SAVE the accumulated balance FIRST (authoritative source)
    const savedOffChainBalance = parseFloat(channel.off_chain_accumulated_balance) || 0

    let amountPaidXAH = savedOffChainBalance // Default to database balance
    let ledgerAmountXAH = 0 // For comparison/validation

    try {
      // Re-query the transaction to get full details including Balance
      await client.connect()
      const txDetailsResponse = await client.request({
        command: 'tx',
        transaction: txHash,
        binary: false
      })
      const txDetails = txDetailsResponse.result

      // Extract Balance from transaction (in drops)
      const balanceDrops = txDetails.Balance || txDetails.meta?.deliveredAmount || '0'
      ledgerAmountXAH = parseInt(balanceDrops) / 1_000_000

      console.log('[CONFIRM_CLOSURE] Extracted payment amount from ledger for validation', {
        channelId,
        txHash: txHash.substring(0, 20) + '...',
        balanceDrops,
        ledgerAmountXAH,
        databaseBalanceXAH: savedOffChainBalance,
        discrepancy: Math.abs(ledgerAmountXAH - savedOffChainBalance)
      })

      // Use ledger amount if extraction was successful and reasonable
      // Otherwise use database balance (workers' earned wages during work sessions)
      if (ledgerAmountXAH > 0) {
        amountPaidXAH = ledgerAmountXAH

        // Log warning if significant discrepancy between ledger and database
        const discrepancy = Math.abs(ledgerAmountXAH - savedOffChainBalance)
        if (discrepancy > 0.01) { // More than 1 cent difference
          console.warn('[CONFIRM_CLOSURE] ⚠️ BALANCE MISMATCH', {
            channelId,
            ledgerAmountXAH,
            databaseBalanceXAH: savedOffChainBalance,
            discrepancyXAH: discrepancy,
            usingSource: 'LEDGER'
          })
        }
      } else {
        console.log('[CONFIRM_CLOSURE] Using database balance (ledger extraction returned 0)', {
          channelId,
          amountPaidXAH: savedOffChainBalance
        })
      }

      await client.disconnect()
    } catch (extractError) {
      console.error('[CONFIRM_CLOSURE] Failed to extract payment amount from ledger, using database balance', {
        error: extractError.message,
        channelId,
        databaseBalanceXAH: savedOffChainBalance
      })
      // Already set to savedOffChainBalance above - no action needed
      // This ensures workers always get paid for their accumulated work sessions
    }

    // ============================================
    // STEP 6: UPDATE CHANNEL AND CREATE PAYMENT RECORD (TRANSACTION)
    // ============================================
    // Use database transaction to ensure atomicity
    // Both channel update and payment record creation must succeed or both fail

    let updatedChannel
    let paymentRecord

    try {
      await query('BEGIN')

      // Update channel with appropriate status
      // Clear off_chain_accumulated_balance (worker was paid via XRPL transaction)
      // Do NOT touch on_chain_balance (will sync from ledger separately)
      // CRITICAL FIX (2026-01-11): Only update expiration_time if it's NOT NULL
      // When finalizing an already-closing channel, expiration_time should remain unchanged
      const updateResult = await query(
        `UPDATE payment_channels
        SET
          status = $1,
          closure_tx_hash = $2,
          closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE NULL::timestamp END,
          expiration_time = CASE WHEN $3::timestamp IS NOT NULL THEN $3::timestamp ELSE expiration_time END,
          off_chain_accumulated_balance = 0,
          last_ledger_sync = NOW(),
          last_validation_at = NOW(),
          updated_at = NOW()
        WHERE channel_id = $4
        RETURNING *`,
        [finalStatus, txHash, expirationTime, channelId]
      )

      if (updateResult.rows.length === 0) {
        throw new Error('FAILED TO UPDATE CHANNEL')
      }

      updatedChannel = updateResult.rows[0]

      console.log('[CONFIRM_CLOSURE] Channel status updated', {
        channelId,
        txHash,
        finalStatus: updatedChannel.status,
        closedAt: updatedChannel.closed_at,
        expirationTime: updatedChannel.expiration_time
      })

      // Create payment record ONLY if channel is immediately closed
      // (not in 'closing' state with SettleDelay)
      if (finalStatus === 'closed' && amountPaidXAH > 0) {
        console.log('[CONFIRM_CLOSURE] Creating payment record', {
          channelId,
          amountPaidXAH,
          employeeId: channel.employee_id,
          organizationId: channel.organization_id
        })

        const paymentResult = await query(
          `INSERT INTO payments (
            employee_id,
            organization_id,
            amount,
            currency,
            payment_type,
            tx_hash,
            from_wallet,
            to_wallet,
            payment_status,
            payment_channel_id,
            paid_at,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          RETURNING *`,
          [
            channel.employee_id,
            channel.organization_id,
            amountPaidXAH,
            'XAH',
            'channel_closure',
            txHash,
            channel.escrow_wallet_address, // NGO wallet
            channel.employee_wallet_address, // Worker wallet
            'completed',
            channelId
          ]
        )

        paymentRecord = paymentResult.rows[0]

        console.log('[CONFIRM_CLOSURE] Payment record created ✅', {
          paymentId: paymentRecord.id,
          amount: paymentRecord.amount,
          txHash: paymentRecord.tx_hash
        })
      } else if (finalStatus === 'closing') {
        console.log('[CONFIRM_CLOSURE] Channel in closing state - payment record will be created on final closure')
      } else if (amountPaidXAH === 0) {
        console.log('[CONFIRM_CLOSURE] No payment amount - skipping payment record creation')
      }

      await query('COMMIT')
      console.log('[CONFIRM_CLOSURE] Database transaction committed ✅')

    } catch (dbError) {
      await query('ROLLBACK')
      console.error('[CONFIRM_CLOSURE] Database transaction rolled back', {
        error: dbError.message,
        channelId
      })
      return res.status(500).json({
        success: false,
        error: {
          message: 'FAILED TO UPDATE DATABASE',
          code: 'DATABASE_ERROR',
          details: dbError.message
        }
      })
    }

    // Generate appropriate message based on final status
    const message = updatedChannel.status === 'closed'
      ? 'PAYMENT CHANNEL CLOSED SUCCESSFULLY!'
      : 'PAYMENT CHANNEL ENTERING CLOSING STATE. FINAL CLOSURE AFTER EXPIRATION TIME.'

    res.json({
      success: true,
      message,
      data: {
        channel: {
          id: updatedChannel.id,
          channelId: updatedChannel.channel_id,
          status: updatedChannel.status,
          closureTxHash: updatedChannel.closure_tx_hash,
          closedAt: updatedChannel.closed_at,
          expirationTime: updatedChannel.expiration_time,
          jobName: updatedChannel.job_name
        }
      }
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

/**
 * POST /api/payment-channels/:channelId/request-worker-closure
 * NGO requests immediate closure from worker
 *
 * This endpoint allows NGOs to notify workers about closure requests,
 * enabling immediate closure when the NGO wants to close immediately
 * rather than waiting for the scheduled closure period (SettleDelay).
 *
 * Flow:
 * 1. NGO requests worker closure
 * 2. Notification created for worker
 * 3. Worker approves and closes channel from their dashboard
 * 4. Worker receives accumulated balance, escrow returns to NGO
 */
/**
 * POST /api/payment-channels/:channelId/sync-balance
 * Sync payment channel balance from XAH Ledger
 *
 * Rate Limited: Only allows sync if last_ledger_sync is NULL or >1 minute ago
 *
 * Process:
 * 1. Query ledger via account_channels command
 * 2. Find channel by channelId
 * 3. Update database with live balance/amount
 * 4. Update last_ledger_sync timestamp
 *
 * Returns:
 * - synced: true if sync executed
 * - recentlysynced: true if rate limited (synced <1 min ago)
 * - channel: updated channel data
 */
router.post('/:channelId/sync-balance', async (req, res) => {
  try {
    const { channelId } = req.params

    console.log('[LEDGER_SYNC] Sync request for channel:', channelId)

    // Validate channelId format (64-char hex)
    if (!channelId || channelId.length !== 64 || !/^[0-9A-F]+$/i.test(channelId)) {
      return res.status(400).json({
        success: false,
        error: { message: 'INVALID CHANNEL ID FORMAT. MUST BE 64-CHARACTER HEXADECIMAL STRING.' }
      })
    }

    // Get channel from database
    const channelResult = await query(
      `SELECT
        pc.id,
        pc.channel_id,
        pc.organization_id,
        pc.employee_id,
        pc.status,
        pc.last_ledger_sync,
        o.escrow_wallet_address as org_wallet,
        e.employee_wallet_address as worker_wallet
       FROM payment_channels pc
       JOIN organizations o ON pc.organization_id = o.id
       JOIN employees e ON pc.employee_id = e.id
       WHERE pc.channel_id = $1`,
      [channelId]
    )

    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'PAYMENT CHANNEL NOT FOUND IN DATABASE' }
      })
    }

    const channel = channelResult.rows[0]

    // Rate limiting: Check if synced within last 60 seconds
    if (channel.last_ledger_sync) {
      const lastSyncTime = new Date(channel.last_ledger_sync).getTime()
      const now = Date.now()
      const timeSinceSync = now - lastSyncTime

      if (timeSinceSync < 60000) { // 60 seconds = 60,000 milliseconds
        console.log('[LEDGER_SYNC] Rate limited - synced', Math.floor(timeSinceSync / 1000), 'seconds ago')

        return res.json({
          success: true,
          synced: false,
          recentlySynced: true,
          secondsSinceSync: Math.floor(timeSinceSync / 1000),
          message: 'CHANNEL WAS SYNCED RECENTLY. PLEASE WAIT BEFORE SYNCING AGAIN.',
          channel: {
            id: channel.id,
            channelId: channel.channel_id,
            lastLedgerSync: channel.last_ledger_sync
          }
        })
      }
    }

    // Connect to Xahau and query channel data
    const client = new Client(getNetworkUrl())

    try {
      await client.connect()
      console.log('[LEDGER_SYNC] Connected to Xahau network:', getNetworkUrl())

      // Query account_channels for the organization wallet
      const channelsResponse = await client.request({
        command: 'account_channels',
        account: channel.org_wallet,
        ledger_index: 'validated'
      })

      console.log('[LEDGER_SYNC] account_channels response:', {
        account: channel.org_wallet,
        channelCount: channelsResponse.result?.channels?.length || 0
      })

      // Find the specific channel by channel_id
      const ledgerChannels = channelsResponse.result?.channels || []
      const ledgerChannel = ledgerChannels.find(ch => ch.channel_id === channelId)

      if (!ledgerChannel) {
        await client.disconnect()

        // Channel not found on ledger - automatically mark as closed in database
        console.warn('[LEDGER_SYNC] Channel not found on ledger - marking as closed:', channelId)

        // Update channel status to 'closed' with closure reason
        await query(
          `UPDATE payment_channels
           SET
             status = 'closed',
             closed_at = NOW(),
             closure_reason = 'ledger_not_found',
             last_ledger_sync = NOW(),
             updated_at = NOW()
           WHERE channel_id = $1
           AND status NOT IN ('closed', 'closing')`,
          [channelId]
        )

        console.log('[LEDGER_SYNC] Channel marked as closed in database')

        return res.status(404).json({
          success: false,
          channelClosed: true,
          error: {
            message: 'CHANNEL NOT FOUND ON LEDGER. IT HAS BEEN CLOSED OR EXPIRED. DATABASE STATUS UPDATED TO CLOSED.',
            channelId: channelId
          }
        })
      }

      console.log('[LEDGER_SYNC] Found channel on ledger:', {
        channelId: ledgerChannel.channel_id,
        amount: ledgerChannel.amount,
        balance: ledgerChannel.balance,
        destination: ledgerChannel.destination_account
      })

      // Convert drops to XAH (1 XAH = 1,000,000 drops)
      const escrowAmountXah = parseFloat(ledgerChannel.amount || '0') / 1_000_000
      const balanceXah = parseFloat(ledgerChannel.balance || '0') / 1_000_000

      // Update database with live ledger data
      // CRITICAL: Update on_chain_balance (read-only from XRPL)
      // NEVER touch off_chain_accumulated_balance (worker earnings from clock in/out)
      const updateResult = await query(
        `UPDATE payment_channels
         SET
           escrow_funded_amount = $1,
           on_chain_balance = $2,
           last_ledger_sync = NOW(),
           updated_at = NOW()
         WHERE channel_id = $3
         RETURNING
           id,
           channel_id,
           escrow_funded_amount,
           on_chain_balance,
           off_chain_accumulated_balance,
           last_ledger_sync,
           status`,
        [escrowAmountXah, balanceXah, channelId]
      )

      await client.disconnect()

      const updatedChannel = updateResult.rows[0]

      // Log balance discrepancy (expected for active channels with off-chain work)
      const offChainBalance = parseFloat(updatedChannel.off_chain_accumulated_balance) || 0
      const onChainBalance = parseFloat(updatedChannel.on_chain_balance) || 0
      if (Math.abs(onChainBalance - offChainBalance) > 0.01) {
        console.warn('[BALANCE_DISCREPANCY]', {
          channelId: updatedChannel.channel_id,
          offChainBalance,
          onChainBalance,
          discrepancy: (onChainBalance - offChainBalance).toFixed(6),
          reason: 'Off-chain work tracking (expected for active channels)'
        })
      }

      console.log('[LEDGER_SYNC] ✅ Database updated successfully:', {
        channelId: updatedChannel.channel_id,
        escrowFundedAmount: updatedChannel.escrow_funded_amount,
        onChainBalance: updatedChannel.on_chain_balance,
        offChainAccumulatedBalance: updatedChannel.off_chain_accumulated_balance,
        lastLedgerSync: updatedChannel.last_ledger_sync
      })

      res.json({
        success: true,
        synced: true,
        recentlySynced: false,
        message: 'CHANNEL BALANCE SYNCED FROM LEDGER',
        channel: {
          id: updatedChannel.id,
          channelId: updatedChannel.channel_id,
          escrowFundedAmount: parseFloat(updatedChannel.escrow_funded_amount),
          accumulatedBalance: parseFloat(updatedChannel.off_chain_accumulated_balance),
          escrowBalance: parseFloat(updatedChannel.escrow_funded_amount) - parseFloat(updatedChannel.off_chain_accumulated_balance),
          lastLedgerSync: updatedChannel.last_ledger_sync,
          status: updatedChannel.status
        }
      })

    } catch (ledgerError) {
      console.error('[LEDGER_SYNC] Ledger query failed:', ledgerError)

      // Disconnect client on error
      await client.disconnect().catch(() => {})

      return res.status(500).json({
        success: false,
        error: {
          message: 'FAILED TO QUERY XAHAU',
          details: ledgerError.message
        }
      })
    }

  } catch (error) {
    console.error('[LEDGER_SYNC] Error syncing channel balance:', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO SYNC CHANNEL BALANCE', details: error.message }
    })
  }
})

/**
 * GET /api/payment-channels/:channelId/sync
 * Sync channel status from Xahau ledger
 *
 * This endpoint queries the XRPL ledger to determine actual channel state
 * and updates the database accordingly. Users trigger this manually after
 * closing a channel to avoid complex timing/validation issues.
 */
router.get('/:channelId/sync', async (req, res) => {
  try {
    const { channelId } = req.params

    console.log('[SYNC_CHANNEL] Starting sync for channel:', channelId)

    // Fetch channel from database
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
        error: { message: 'CHANNEL NOT FOUND' }
      })
    }

    const channel = channelResult.rows[0]

    // Connect to Xahau ledger
    const networkUrl = getNetworkUrl()
    const client = new Client(networkUrl)

    await client.connect()
    console.log('[SYNC_CHANNEL] Connected to Xahau:', process.env.XRPL_NETWORK || 'testnet')

    try {
      // Query channel from ledger
      const channelResponse = await client.request({
        command: 'ledger_entry',
        payment_channel: channelId
      })

      const ledgerChannel = channelResponse.result.node
      console.log('[SYNC_CHANNEL] Channel EXISTS on ledger', {
        channelId,
        expiration: ledgerChannel.Expiration,
        settleDelay: ledgerChannel.SettleDelay,
        balance: ledgerChannel.Balance,
        amount: ledgerChannel.Amount
      })

      // Channel exists - check if it has expiration (closing) or not (active)
      if (ledgerChannel.Expiration) {
        // Channel is scheduled for closure
        const expirationTimestamp = ledgerChannel.Expiration + 946684800 // XRPL Ripple time to Unix
        const escrowXah = parseInt(ledgerChannel.Amount) / 1_000_000
        const balanceXah = parseInt(ledgerChannel.Balance) / 1_000_000

        // CRITICAL: Do NOT overwrite off_chain_accumulated_balance - it tracks off-chain work sessions
        // Ledger Balance only tracks on-chain signed claims, not database work sessions
        await query(
          `UPDATE payment_channels
          SET
            status = 'closing',
            expiration_time = to_timestamp($1),
            escrow_funded_amount = $2,
            settle_delay = $3,
            last_ledger_sync = NOW(),
            updated_at = NOW()
          WHERE channel_id = $4`,
          [expirationTimestamp, escrowXah, ledgerChannel.SettleDelay, channelId]
        )

        await client.disconnect()
        return res.json({
          success: true,
          status: 'closing',
          message: 'CHANNEL IS SCHEDULED FOR CLOSURE',
          data: {
            channelId,
            status: 'closing',
            expirationTime: new Date(expirationTimestamp * 1000).toISOString(),
            escrowAmount: escrowXah,
            balance: balanceXah,
            settleDelay: ledgerChannel.SettleDelay
          }
        })
      } else {
        // Channel is active (no expiration set)
        const escrowXah = parseInt(ledgerChannel.Amount) / 1_000_000
        const balanceXah = parseInt(ledgerChannel.Balance) / 1_000_000

        // CRITICAL: Do NOT overwrite off_chain_accumulated_balance - it tracks off-chain work sessions
        // Ledger Balance only tracks on-chain signed claims, not database work sessions
        await query(
          `UPDATE payment_channels
          SET
            status = 'active',
            escrow_funded_amount = $1,
            settle_delay = $2,
            last_ledger_sync = NOW(),
            updated_at = NOW()
          WHERE channel_id = $3`,
          [escrowXah, ledgerChannel.SettleDelay, channelId]
        )

        await client.disconnect()
        return res.json({
          success: true,
          status: 'active',
          message: 'CHANNEL IS ACTIVE',
          data: {
            channelId,
            status: 'active',
            escrowAmount: escrowXah,
            balance: balanceXah,
            settleDelay: ledgerChannel.SettleDelay
          }
        })
      }
    } catch (ledgerError) {
      // Channel not found on ledger = it was closed
      if (ledgerError.data?.error === 'entryNotFound' || ledgerError.message?.includes('not found')) {
        console.log('[SYNC_CHANNEL] Channel NOT FOUND on ledger - marking as closed', { channelId })

        await query(
          `UPDATE payment_channels
          SET
            status = 'closed',
            closed_at = NOW(),
            off_chain_accumulated_balance = 0,
            last_ledger_sync = NOW(),
            updated_at = NOW()
          WHERE channel_id = $1`,
          [channelId]
        )

        await client.disconnect()
        return res.json({
          success: true,
          status: 'closed',
          message: 'CHANNEL CLOSED SUCCESSFULLY',
          data: {
            channelId,
            status: 'closed',
            closedAt: new Date().toISOString()
          }
        })
      }

      // Unexpected error
      console.error('[SYNC_CHANNEL] Unexpected ledger error:', ledgerError)
      await client.disconnect()
      return res.status(500).json({
        success: false,
        error: {
          message: 'FAILED TO QUERY LEDGER',
          details: ledgerError.message
        }
      })
    }
  } catch (error) {
    console.error('[SYNC_CHANNEL] Error:', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO SYNC CHANNEL', details: error.message }
    })
  }
})

/**
 * POST /api/payment-channels/sync-expired-closing
 * Sync all channels in 'closing' status past their expiration time
 * This endpoint checks if expired channels still exist on ledger and updates database accordingly
 */
router.post('/sync-expired-closing', async (req, res) => {
  const client = new Client(getNetworkUrl())

  try {
    console.log('[SYNC_EXPIRED] Starting sync of expired closing channels')

    // Find all expired 'closing' channels
    const expiredResult = await query(
      `SELECT
        pc.channel_id,
        o.escrow_wallet_address,
        e.employee_wallet_address,
        pc.expiration_time,
        pc.off_chain_accumulated_balance
      FROM payment_channels pc
      JOIN organizations o ON pc.organization_id = o.id
      JOIN employees e ON pc.employee_id = e.id
      WHERE pc.status = 'closing'
        AND pc.expiration_time IS NOT NULL
        AND pc.expiration_time < NOW()
      ORDER BY pc.expiration_time ASC`,
      []
    )

    if (expiredResult.rows.length === 0) {
      return res.json({
        success: true,
        message: 'NO EXPIRED CLOSING CHANNELS FOUND',
        data: { processed: 0, updated: 0 }
      })
    }

    console.log(`[SYNC_EXPIRED] Found ${expiredResult.rows.length} expired channel(s)`)

    await client.connect()
    let updated = 0
    const results = []

    for (const channel of expiredResult.rows) {
      try {
        // Check if channel still exists on ledger
        const accountChannelsResponse = await client.request({
          command: 'account_channels',
          account: channel.escrow_wallet_address
        })

        const ledgerChannel = accountChannelsResponse.result.channels?.find(
          ch => ch.channel_id === channel.channel_id
        )

        if (!ledgerChannel) {
          // Channel removed from ledger - update database to closed
          console.log(`[SYNC_EXPIRED] Channel ${channel.channel_id} NOT FOUND on ledger - marking closed`)

          await query(
            `UPDATE payment_channels
             SET
               status = 'closed',
               closed_at = NOW(),
               off_chain_accumulated_balance = 0,
               last_ledger_sync = NOW(),
               updated_at = NOW()
             WHERE channel_id = $1`,
            [channel.channel_id]
          )

          updated++
          results.push({
            channelId: channel.channel_id,
            action: 'marked_closed',
            reason: 'channel_not_found_on_ledger'
          })
        } else {
          // Channel still exists - needs manual finalization
          console.log(`[SYNC_EXPIRED] Channel ${channel.channel_id} still exists on ledger - needs finalization`)

          results.push({
            channelId: channel.channel_id,
            action: 'needs_finalization',
            reason: 'channel_still_active_on_ledger',
            expiration: channel.expiration_time
          })
        }
      } catch (error) {
        console.error(`[SYNC_EXPIRED] Error processing channel ${channel.channel_id}:`, error.message)
        results.push({
          channelId: channel.channel_id,
          action: 'error',
          error: error.message
        })
      }
    }

    await client.disconnect()

    res.json({
      success: true,
      message: `SYNC COMPLETED: ${updated} CHANNELS UPDATED`,
      data: {
        processed: expiredResult.rows.length,
        updated,
        results
      }
    })

  } catch (error) {
    console.error('[SYNC_EXPIRED] Error:', error)
    if (client.isConnected()) {
      await client.disconnect()
    }
    res.status(500).json({
      success: false,
      error: {
        message: 'FAILED TO SYNC EXPIRED CHANNELS',
        details: error.message
      }
    })
  }
})

module.exports = router
