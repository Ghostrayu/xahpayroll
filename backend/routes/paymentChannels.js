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
        max_daily_hours,
        settle_delay,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $8, $9, 'active')
      RETURNING *`,
      [
        organization.id,
        employee.id,
        channelId,
        jobName || 'Unnamed Job',
        hourlyRate,
        balanceUpdateFrequency || 'Hourly',
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
        accumulated_balance,
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
        pc.accumulated_balance,
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

    const accumulatedBalance = parseFloat(channel.accumulated_balance) || 0

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
    // STEP 4.5: UNCLAIMED BALANCE WARNING (NGO ONLY)
    // ============================================

    const unpaidBalance = parseFloat(channel.accumulated_balance) || 0

    // CRITICAL: Only warn for NGO/Source closures
    // Worker/Destination closures claim the balance IN THE SAME TRANSACTION
    // via the Balance field in PaymentChannelClaim with tfClose flag
    //
    // XRPL Behavior:
    // - Source (NGO) closure with balance > 0: Sets Expiration (delayed closure)
    //   Worker must claim balance before channel expires or loses wages
    // - Destination (Worker) closure: ALWAYS immediate, Balance transferred in same tx
    //   Worker CANNOT close without receiving owed balance (enforced by XRPL)
    if (unpaidBalance > 0 && !forceClose && !isWorker) {
      const warningMessage = `WARNING: WORKER HAS ${unpaidBalance.toFixed(2)} XAH IN UNCLAIMED WAGES. ENSURE PAYMENT BEFORE CLOSING.`

      return res.status(400).json({
        success: false,
        error: {
          code: 'UNCLAIMED_BALANCE',
          message: warningMessage,
          unpaidBalance: unpaidBalance,
          requiresForceClose: true,
          callerType: 'ngo'
        }
      })
    }

    // For worker closures, proceed directly to transaction preparation
    // The Balance field ensures worker receives accumulated wages atomically

    // ============================================
    // STEP 5: DETERMINE BALANCE SOURCE
    // ============================================

    // CRITICAL DECISION: Which balance to use?
    // - Database balance: Tracks off-chain work sessions (clock in/out)
    // - Ledger balance: Tracks on-chain signed claims only
    //
    // SYSTEM ARCHITECTURE:
    // - Workers clock in/out → work_sessions table → accumulated_balance (database)
    // - No on-chain claims until final closure → ledger Balance = 0
    // - Worker closure MUST use database balance (their earned wages)
    // - NGO closure of EXPIRED channels should verify ledger (race condition protection)

    let accumulatedBalance
    const databaseBalance = parseFloat(channel.accumulated_balance) || 0
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
        // Fallback to database balance if ledger query fails
        console.error('[LEDGER_BALANCE_FALLBACK] Failed to query ledger, using database balance', {
          channelId,
          error: error.message,
          databaseBalance
        })
        accumulatedBalance = databaseBalance
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
    // STEP 8: RETURN XRPL TRANSACTION DETAILS
    // ============================================

    // Convert XAH to drops (1 XAH = 1,000,000 drops)
    const balanceDrops = Math.floor(accumulatedBalance * 1000000).toString()

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
          Flags: 0x00020000 // tfClose flag (131072 decimal) - closes channel
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
    // STEP 3: IMMEDIATE CLOSURE (tfClose FLAG)
    // ============================================
    // The /close endpoint always uses tfClose flag (immediate closure)
    // Worker receives accumulated balance, channel closes immediately
    // No SettleDelay period needed for worker-initiated closures

    console.log('[CONFIRM_CLOSURE] Immediate closure with tfClose flag', {
      channelId,
      txHash,
      callerWallet: callerWalletAddress,
      isNGO,
      isWorker,
      accumulatedBalance: channel.accumulated_balance
    })

    // Update channel - IMMEDIATE CLOSURE
    // Status: 'closed' (not 'closing')
    // Clear accumulated_balance (worker was paid via XRPL transaction)
    const updateResult = await query(
      `UPDATE payment_channels
      SET
        status = 'closed',
        closure_tx_hash = $1,
        closed_at = NOW(),
        accumulated_balance = 0,
        last_ledger_sync = NOW(),
        last_validation_at = NOW(),
        updated_at = NOW()
      WHERE channel_id = $2
      RETURNING *`,
      [txHash, channelId]
    )

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'FAILED TO UPDATE CHANNEL' }
      })
    }

    const updatedChannel = updateResult.rows[0]

    console.log('[CONFIRM_CLOSURE] Channel closed immediately', {
      channelId,
      txHash,
      finalStatus: updatedChannel.status,
      closedAt: updatedChannel.closed_at
    })

    res.json({
      success: true,
      message: 'PAYMENT CHANNEL CLOSED SUCCESSFULLY!',
      data: {
        channel: {
          id: updatedChannel.id,
          channelId: updatedChannel.channel_id,
          status: updatedChannel.status,
          closureTxHash: updatedChannel.closure_tx_hash,
          closedAt: updatedChannel.closed_at,
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
      const updateResult = await query(
        `UPDATE payment_channels
         SET
           escrow_funded_amount = $1,
           accumulated_balance = $2,
           last_ledger_sync = NOW(),
           updated_at = NOW()
         WHERE channel_id = $3
         RETURNING
           id,
           channel_id,
           escrow_funded_amount,
           accumulated_balance,
           last_ledger_sync,
           status`,
        [escrowAmountXah, balanceXah, channelId]
      )

      await client.disconnect()

      const updatedChannel = updateResult.rows[0]

      console.log('[LEDGER_SYNC] ✅ Database updated successfully:', {
        channelId: updatedChannel.channel_id,
        escrowFundedAmount: updatedChannel.escrow_funded_amount,
        accumulatedBalance: updatedChannel.accumulated_balance,
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
          accumulatedBalance: parseFloat(updatedChannel.accumulated_balance),
          escrowBalance: parseFloat(updatedChannel.escrow_funded_amount) - parseFloat(updatedChannel.accumulated_balance),
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
          message: 'FAILED TO QUERY XAHAU LEDGER',
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

        // CRITICAL: Do NOT overwrite accumulated_balance - it tracks off-chain work sessions
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

        // CRITICAL: Do NOT overwrite accumulated_balance - it tracks off-chain work sessions
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
            accumulated_balance = 0,
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
        pc.accumulated_balance
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
               accumulated_balance = 0,
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
