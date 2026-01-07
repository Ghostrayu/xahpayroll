const express = require('express')
const router = express.Router()
const { query } = require('../database/db')
const { Client } = require('xrpl')
const { generateNGODataPDF } = require('../utils/pdfGenerator')

/**
 * Helper function to get Xahau network URL based on environment
 */
function getNetworkUrl() {
  const network = process.env.XRPL_NETWORK || 'testnet'
  return network === 'mainnet' ? 'wss://xahau.network' : 'wss://xahau-test.net'
}

/**
 * POST /api/organizations
 * Create a new organization (used during multi-step signup)
 * CRITICAL: escrowWalletAddress MUST match the NGO/employer user's wallet_address (1:1 mapping)
 */
router.post('/', async (req, res) => {
  try {
    const {
      organizationName,
      escrowWalletAddress,
      website,
      description
    } = req.body

    // Validate required fields
    if (!organizationName || !escrowWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'ORGANIZATION NAME AND WALLET ADDRESS REQUIRED' }
      })
    }

    // Validate XRPL address format
    const xrplAddressPattern = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/
    if (!xrplAddressPattern.test(escrowWalletAddress)) {
      return res.status(400).json({
        success: false,
        error: { message: 'INVALID XRPL WALLET ADDRESS FORMAT' }
      })
    }

    // Validate website if provided
    if (website) {
      try {
        new URL(website)
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: { message: 'INVALID WEBSITE URL FORMAT' }
        })
      }
    }

    // Validate description length
    if (description && description.length > 2000) {
      return res.status(400).json({
        success: false,
        error: { message: 'DESCRIPTION MUST BE 2000 CHARACTERS OR LESS' }
      })
    }

    // CRITICAL: Check if organization already exists for this wallet
    // This prevents duplicate organizations and ensures 1:1 mapping
    const existing = await query(
      'SELECT * FROM organizations WHERE escrow_wallet_address = $1',
      [escrowWalletAddress]
    )

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: { message: 'ORGANIZATION ALREADY EXISTS FOR THIS WALLET ADDRESS' }
      })
    }

    // CRITICAL: Validate that user exists for this wallet address
    // This ensures organizations are always linked to valid users
    const userResult = await query(
      'SELECT id FROM users WHERE wallet_address = $1',
      [escrowWalletAddress]
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'USER NOT FOUND FOR THIS WALLET ADDRESS. PLEASE SIGN IN FIRST.' }
      })
    }

    const userId = userResult.rows[0].id

    // Create organization with user_id populated
    const result = await query(
      `INSERT INTO organizations (
        organization_name, escrow_wallet_address,
        user_id, website, description, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *`,
      [
        organizationName,
        escrowWalletAddress,
        userId,
        website || null,
        description || null
      ]
    )

    console.log('[ORG_CREATE_SUCCESS]', {
      organizationId: result.rows[0].id,
      walletAddress: escrowWalletAddress,
      userId: userId,
      // Log for payment channel mapping verification
      mapping: 'escrow_wallet_address matches user wallet_address'
    })

    res.json({
      success: true,
      data: { organization: result.rows[0] }
    })
  } catch (error) {
    console.error('[ORG_CREATE_ERROR]', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO CREATE ORGANIZATION' }
    })
  }
})

/**
 * GET /api/organizations/stats/:walletAddress
 * Get organization statistics by wallet address
 */
router.get('/stats/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Wallet address is required'
        }
      })
    }

    // Get organization by escrow wallet address
    // CRITICAL: organizations.escrow_wallet_address = user's wallet_address (1:1 mapping)
    const orgResult = await query(
      `SELECT *
       FROM organizations
       WHERE escrow_wallet_address = $1`,
      [walletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found for this wallet address'
        }
      })
    }

    const organization = orgResult.rows[0]

    // Get total workers count
    const totalWorkersResult = await query(
      'SELECT COUNT(*) as total FROM employees e JOIN users u ON e.employee_wallet_address = u.wallet_address WHERE e.organization_id = $1 AND u.deleted_at IS NULL',
      [organization.id]
    )

    // Get active workers count (currently working)
    const activeWorkersResult = await query(
      `SELECT COUNT(DISTINCT e.id) as active
       FROM employees e
       JOIN work_sessions ws ON e.id = ws.employee_id
       WHERE e.organization_id = $1 
       AND ws.clock_out IS NULL
       AND ws.session_status = 'active'`,
      [organization.id]
    )

    // Get total paid amount
    const totalPaidResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid
       FROM payments
       WHERE organization_id = $1 AND payment_status = 'completed'`,
      [organization.id]
    )

    // Get hours this month
    const hoursThisMonthResult = await query(
      `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out, NOW()) - clock_in)) / 3600), 0) as hours
       FROM work_sessions
       WHERE organization_id = $1
       AND clock_in >= DATE_TRUNC('month', CURRENT_DATE)`,
      [organization.id]
    )

    // Get average hourly rate
    const avgRateResult = await query(
      `SELECT COALESCE(AVG(hourly_rate), 0) as avg_rate
       FROM employees
       WHERE organization_id = $1 AND employment_status = 'active'`,
      [organization.id]
    )

    // Get total escrow balance from all active and closing payment channels
    const escrowBalanceResult = await query(
      `SELECT COALESCE(SUM(escrow_funded_amount - off_chain_accumulated_balance), 0) as total_escrow
       FROM payment_channels
       WHERE organization_id = $1 AND status IN ('active', 'closing')`,
      [organization.id]
    )

    const stats = {
      totalWorkers: parseInt(totalWorkersResult.rows[0].total),
      activeWorkers: parseInt(activeWorkersResult.rows[0].active),
      escrowBalance: parseFloat(escrowBalanceResult.rows[0].total_escrow || 0),
      totalPaid: parseFloat(totalPaidResult.rows[0].total_paid || 0),
      avgHourlyRate: parseFloat(avgRateResult.rows[0].avg_rate || 0),
      hoursThisMonth: parseFloat(hoursThisMonthResult.rows[0].hours || 0)
    }

    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('Error fetching organization stats:', error)
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to fetch organization statistics'
      }
    })
  }
})

/**
 * GET /api/organizations/workers/:walletAddress
 * Get active workers for an organization
 */
router.get('/workers/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    // Get organization by escrow wallet address
    // CRITICAL: organizations.escrow_wallet_address = user's wallet_address (1:1 mapping)
    const orgResult = await query(
      `SELECT *
       FROM organizations
       WHERE escrow_wallet_address = $1`,
      [walletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Organization not found' }
      })
    }

    const organization = orgResult.rows[0]

    // Get active workers with their current work session info
    // Filter out workers whose user accounts have been soft-deleted
    const workersResult = await query(
      `SELECT
        e.id,
        e.full_name as name,
        e.employee_wallet_address,
        e.hourly_rate as rate,
        e.employment_status as status,
        COALESCE(
          EXTRACT(EPOCH FROM (NOW() - ws.clock_in)) / 3600,
          0
        ) as hours_today
       FROM employees e
       JOIN users u ON e.employee_wallet_address = u.wallet_address
       LEFT JOIN work_sessions ws ON e.id = ws.employee_id AND ws.clock_out IS NULL AND ws.session_status = 'active'
       WHERE e.organization_id = $1
       AND e.employment_status = 'active'
       AND u.deleted_at IS NULL
       ORDER BY ws.clock_in DESC NULLS LAST`,
      [organization.id]
    )

    // Transform to camelCase for frontend consistency
    const workers = workersResult.rows.map(w => ({
      id: w.id,
      name: w.name,
      employeeWalletAddress: String(w.employee_wallet_address || '').trim(),
      rate: w.rate ? parseFloat(w.rate) : 0,
      hoursToday: parseFloat(w.hours_today).toFixed(1),
      status: w.hours_today > 0 ? 'Working' : 'Idle'
    }))

    res.json({
      success: true,
      data: workers
    })
  } catch (error) {
    console.error('Error fetching workers:', error)
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to fetch workers' }
    })
  }
})

/**
 * GET /api/organizations/activity/:walletAddress
 * Get recent activity for an organization
 */
router.get('/activity/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    // Get organization by escrow wallet address
    // CRITICAL: organizations.escrow_wallet_address = user's wallet_address (1:1 mapping)
    const orgResult = await query(
      `SELECT *
       FROM organizations
       WHERE escrow_wallet_address = $1`,
      [walletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Organization not found' }
      })
    }

    const organization = orgResult.rows[0]

    // Get recent work sessions, payments, channel events, and escrow transactions
    // Phase 1: Added payment failures, channel closures, escrow refunds
    // Phase 2: Added payment types, channel names, tx hashes, failure reasons
    // Phase 3: Priority indicators for critical events
    const activityResult = await query(
      `(
        -- Clock In Events
        SELECT
          'clock_in' as type,
          e.full_name as worker,
          ws.clock_in as timestamp,
          NULL::numeric as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          NULL::varchar as tx_hash,
          NULL::varchar as job_name,
          NULL::varchar as failure_reason,
          'normal' as priority
        FROM work_sessions ws
        JOIN employees e ON ws.employee_id = e.id
        WHERE ws.organization_id = $1
        ORDER BY ws.clock_in DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Clock Out Events
        SELECT
          'clock_out' as type,
          e.full_name as worker,
          ws.clock_out as timestamp,
          NULL::numeric as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          NULL::varchar as tx_hash,
          NULL::varchar as job_name,
          NULL::varchar as failure_reason,
          'normal' as priority
        FROM work_sessions ws
        JOIN employees e ON ws.employee_id = e.id
        WHERE ws.organization_id = $1 AND ws.clock_out IS NOT NULL
        ORDER BY ws.clock_out DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Successful Payments
        SELECT
          'payment' as type,
          e.full_name as worker,
          p.created_at as timestamp,
          p.amount,
          p.payment_type,
          p.payment_status,
          p.tx_hash,
          NULL::varchar as job_name,
          NULL::varchar as failure_reason,
          'normal' as priority
        FROM payments p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.organization_id = $1 AND p.payment_status = 'completed'
        ORDER BY p.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Payment Failures (Phase 1 + Phase 3: Critical Alert)
        SELECT
          'payment_failed' as type,
          e.full_name as worker,
          p.created_at as timestamp,
          p.amount,
          p.payment_type,
          p.payment_status,
          p.tx_hash,
          NULL::varchar as job_name,
          CASE
            WHEN p.payment_status = 'failed' THEN 'PAYMENT PROCESSING FAILED'
            WHEN p.payment_status = 'cancelled' THEN 'PAYMENT CANCELLED'
            ELSE 'UNKNOWN ERROR'
          END as failure_reason,
          'critical' as priority
        FROM payments p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.organization_id = $1 AND p.payment_status IN ('failed', 'cancelled')
        ORDER BY p.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Channel Closures (Phase 1 + Phase 2: Channel name included)
        SELECT
          'channel_closed' as type,
          e.full_name as worker,
          pc.closed_at as timestamp,
          pc.off_chain_accumulated_balance as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          pc.closure_tx_hash as tx_hash,
          pc.job_name,
          NULL::varchar as failure_reason,
          'normal' as priority
        FROM payment_channels pc
        JOIN employees e ON pc.employee_id = e.id
        WHERE pc.organization_id = $1 AND pc.closed_at IS NOT NULL
        ORDER BY pc.closed_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Channel Created Events
        SELECT
          'channel_created' as type,
          e.full_name as worker,
          pc.created_at as timestamp,
          pc.escrow_funded_amount as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          NULL::varchar as tx_hash,
          pc.job_name,
          NULL::varchar as failure_reason,
          'normal' as priority
        FROM payment_channels pc
        JOIN employees e ON pc.employee_id = e.id
        WHERE pc.organization_id = $1
        ORDER BY pc.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Channel Expirations (Phase 3: Warning indicator)
        SELECT
          'channel_expiring' as type,
          e.full_name as worker,
          pc.expiration_time as timestamp,
          pc.off_chain_accumulated_balance as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          NULL::varchar as tx_hash,
          pc.job_name,
          NULL::varchar as failure_reason,
          'warning' as priority
        FROM payment_channels pc
        JOIN employees e ON pc.employee_id = e.id
        WHERE pc.organization_id = $1
          AND pc.status = 'closing'
          AND pc.expiration_time IS NOT NULL
          AND pc.expiration_time <= NOW() + INTERVAL '24 hours'
        ORDER BY pc.expiration_time DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Escrow Refunds (Phase 1)
        SELECT
          'escrow_refund' as type,
          'SYSTEM' as worker,
          et.created_at as timestamp,
          et.amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          et.tx_hash,
          NULL::varchar as job_name,
          et.description as failure_reason,
          'normal' as priority
        FROM escrow_transactions et
        WHERE et.organization_id = $1 AND et.transaction_type = 'refund'
        ORDER BY et.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Worker Deletions (Phase 3: Notification indicator)
        SELECT
          'worker_deleted' as type,
          n.worker_name as worker,
          n.created_at as timestamp,
          NULL::numeric as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          NULL::varchar as tx_hash,
          NULL::varchar as job_name,
          n.message as failure_reason,
          'notification' as priority
        FROM ngo_notifications n
        WHERE n.organization_id = $1 AND n.notification_type = 'worker_deleted'
        ORDER BY n.created_at DESC
        LIMIT 5
      )
      ORDER BY timestamp DESC
      LIMIT 20`,
      [organization.id]
    )

    const activity = activityResult.rows.map(a => {
      const now = new Date()
      const timestamp = new Date(a.timestamp)
      const diffMs = now.getTime() - timestamp.getTime()
      const diffMins = Math.floor(diffMs / 60000)

      let timeAgo
      if (diffMins < 1) timeAgo = 'JUST NOW'
      else if (diffMins < 60) timeAgo = `${diffMins} MINUTE${diffMins > 1 ? 'S' : ''} AGO`
      else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)} HOUR${Math.floor(diffMins / 60) > 1 ? 'S' : ''} AGO`
      else timeAgo = `${Math.floor(diffMins / 1440)} DAY${Math.floor(diffMins / 1440) > 1 ? 'S' : ''} AGO`

      // Phase 2: Build action text with enhanced context
      let action = ''
      let actionDetails = null

      switch (a.type) {
        case 'clock_in':
          action = 'CLOCKED IN'
          break
        case 'clock_out':
          action = 'CLOCKED OUT'
          break
        case 'payment':
          action = 'PAYMENT SENT'
          actionDetails = a.payment_type ? `TYPE: ${a.payment_type.toUpperCase()}` : null
          break
        case 'payment_failed':
          action = '⚠️ PAYMENT FAILED'
          actionDetails = a.failure_reason
          break
        case 'channel_closed':
          action = `CHANNEL CLOSED${a.job_name ? ': ' + a.job_name.toUpperCase() : ''}`
          actionDetails = a.tx_hash ? `TX: ${a.tx_hash.substring(0, 8)}...` : null
          break
        case 'channel_created':
          action = `CHANNEL CREATED${a.job_name ? ': ' + a.job_name.toUpperCase() : ''}`
          break
        case 'channel_expiring':
          action = `⏰ CHANNEL EXPIRING${a.job_name ? ': ' + a.job_name.toUpperCase() : ''}`
          break
        case 'escrow_refund':
          action = 'ESCROW REFUND'
          actionDetails = a.failure_reason
          break
        case 'worker_deleted':
          action = '🔔 WORKER PROFILE DELETED'
          actionDetails = a.failure_reason
          break
        default:
          action = a.type.toUpperCase()
      }

      return {
        worker: a.worker,
        action,
        actionDetails,
        amount: a.amount ? `${parseFloat(a.amount).toFixed(2)} XAH` : null,
        time: timeAgo,
        status: a.type === 'clock_in' ? 'active' : 'completed',
        priority: a.priority || 'normal',
        txHash: a.tx_hash || null,
        paymentType: a.payment_type || null,
        jobName: a.job_name || null
      }
    })

    res.json({
      success: true,
      data: activity
    })
  } catch (error) {
    console.error('Error fetching activity:', error)
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to fetch activity' }
    })
  }
})

/**
 * GET /api/organizations/payment-channels/:walletAddress
 * Get active payment channels for an organization
 */
router.get('/payment-channels/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    // Get organization by escrow wallet address
    // CRITICAL: organizations.escrow_wallet_address = user's wallet_address (1:1 mapping)
    const orgResult = await query(
      `SELECT *
       FROM organizations
       WHERE escrow_wallet_address = $1`,
      [walletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Organization not found' }
      })
    }

    const organization = orgResult.rows[0]

    // Get payment channels (active and closing - exclude only fully closed)
    const channelsResult = await query(
      `SELECT
        pc.id,
        e.full_name as worker,
        pc.channel_id,
        pc.job_name,
        pc.hourly_rate,
        pc.balance_update_frequency,
        pc.status,
        pc.updated_at,
        pc.off_chain_accumulated_balance,
        pc.hours_accumulated,
        pc.escrow_funded_amount,
        pc.last_ledger_sync,
        pc.expiration_time,
        pc.closure_tx_hash,
        pc.settle_delay
       FROM payment_channels pc
       JOIN employees e ON pc.employee_id = e.id
       WHERE pc.organization_id = $1 AND pc.status IN ('active', 'closing')
       ORDER BY pc.created_at DESC`,
      [organization.id]
    )

    const channels = channelsResult.rows.map(c => {
      const now = new Date()
      const updated = new Date(c.updated_at)
      const diffMs = now.getTime() - updated.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      
      let lastUpdate
      if (diffMins < 1) lastUpdate = 'Just now'
      else if (diffMins < 60) lastUpdate = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
      else lastUpdate = `${Math.floor(diffMins / 60)} hour${Math.floor(diffMins / 60) > 1 ? 's' : ''} ago`

      // Escrow balance is the funded amount minus what's been accumulated
      const fundedAmount = parseFloat(c.escrow_funded_amount || 0)
      const accumulatedAmount = parseFloat(c.off_chain_accumulated_balance || 0)
      const escrowBalance = fundedAmount - accumulatedAmount

      // Validate channel_id - must be 64-character hex string or null
      const channelId = c.channel_id
      if (channelId && (channelId.length !== 64 || !/^[0-9A-F]+$/i.test(channelId))) {
        console.warn(`[INVALID_CHANNEL_ID] Channel ${c.id} has invalid channel_id: ${channelId}`)
      }

      return {
        id: c.id,
        worker: c.worker,
        jobName: c.job_name || 'Unnamed Job',
        channelId: channelId || null, // Return null if missing/invalid instead of generating fake ID
        balance: parseFloat(c.off_chain_accumulated_balance),
        escrowBalance: escrowBalance,
        hourlyRate: parseFloat(c.hourly_rate),
        hoursAccumulated: parseFloat(c.hours_accumulated),
        status: c.status,
        lastUpdate,
        balanceUpdateFrequency: c.balance_update_frequency || 'Hourly',
        lastLedgerSync: c.last_ledger_sync,
        expirationTime: c.expiration_time,
        closureTxHash: c.closure_tx_hash,
        settleDelayHours: c.settle_delay ? (c.settle_delay / 3600) : 24, // Convert seconds to hours, default to 24 if not set
        hasInvalidChannelId: !channelId || (channelId.length !== 64 || !/^[0-9A-F]+$/i.test(channelId)) // Flag for frontend to display warning
      }
    })

    res.json({
      success: true,
      data: channels
    })
  } catch (error) {
    console.error('Error fetching payment channels:', error)
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to fetch payment channels' }
    })
  }
})

/**
 * GET /api/organizations/:organizationId/notifications
 * Get all notifications for an organization
 * Supports filtering by type and read status
 * Supports pagination
 */
router.get('/:organizationId/notifications', async (req, res) => {
  try {
    const { organizationId } = req.params
    const { type, isRead, limit = 20, offset = 0 } = req.query

    // Build WHERE clause based on filters
    let whereClause = 'WHERE organization_id = $1'
    const params = [organizationId]
    let paramIndex = 2

    if (type) {
      whereClause += ` AND notification_type = $${paramIndex}`
      params.push(type)
      paramIndex++
    }

    if (isRead !== undefined) {
      whereClause += ` AND is_read = $${paramIndex}`
      params.push(isRead === 'true')
      paramIndex++
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM ngo_notifications
       ${whereClause}`,
      params
    )

    const total = parseInt(countResult.rows[0]?.total || 0)

    // Get notifications with pagination
    const notificationsResult = await query(
      `SELECT *
       FROM ngo_notifications
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    const notifications = notificationsResult.rows.map(n => ({
      id: n.id,
      organizationId: n.organization_id,
      notificationType: n.notification_type,
      workerWalletAddress: n.worker_wallet_address,
      workerName: n.worker_name,
      message: n.message,
      metadata: n.metadata || {},
      isRead: n.is_read,
      createdAt: n.created_at
    }))

    const hasMore = (parseInt(offset) + parseInt(limit)) < total

    res.json({
      notifications,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore
      }
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    res.status(500).json({
      success: false,
      error: 'FAILED TO FETCH NOTIFICATIONS',
      details: error.message
    })
  }
})

/**
 * PATCH /api/organizations/:organizationId/notifications/:notificationId
 * Mark a notification as read/unread
 */
router.patch('/:organizationId/notifications/:notificationId', async (req, res) => {
  try {
    const { organizationId, notificationId } = req.params
    const { isRead } = req.body

    if (isRead === undefined) {
      return res.status(400).json({
        success: false,
        error: 'IS_READ FIELD REQUIRED'
      })
    }

    // Verify notification belongs to organization
    const checkResult = await query(
      `SELECT * FROM ngo_notifications
       WHERE id = $1 AND organization_id = $2`,
      [notificationId, organizationId]
    )

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOTIFICATION NOT FOUND'
      })
    }

    // Update read status
    const updateResult = await query(
      `UPDATE ngo_notifications
       SET is_read = $1
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [isRead, notificationId, organizationId]
    )

    const updatedNotification = updateResult.rows[0]

    res.json({
      success: true,
      message: 'NOTIFICATION STATUS UPDATED',
      data: {
        notification: {
          id: updatedNotification.id,
          organizationId: updatedNotification.organization_id,
          notificationType: updatedNotification.notification_type,
          workerWalletAddress: updatedNotification.worker_wallet_address,
          workerName: updatedNotification.worker_name,
          message: updatedNotification.message,
          metadata: updatedNotification.metadata || {},
          isRead: updatedNotification.is_read,
          createdAt: updatedNotification.created_at
        }
      }
    })
  } catch (error) {
    console.error('Error updating notification:', error)
    res.status(500).json({
      success: false,
      error: 'FAILED TO UPDATE NOTIFICATION',
      details: error.message
    })
  }
})

/**
 * POST /api/organizations/:organizationId/notifications/mark-all-read
 * Mark all notifications as read for an organization
 */
router.post('/:organizationId/notifications/mark-all-read', async (req, res) => {
  try {
    const { organizationId } = req.params

    const result = await query(
      `UPDATE ngo_notifications
       SET is_read = true
       WHERE organization_id = $1 AND is_read = false
       RETURNING id`,
      [organizationId]
    )

    const count = result.rows.length

    res.json({
      success: true,
      message: 'ALL NOTIFICATIONS MARKED AS READ',
      data: {
        count
      }
    })
  } catch (error) {
    console.error('Error marking notifications as read:', error)
    res.status(500).json({
      success: false,
      error: 'FAILED TO MARK NOTIFICATIONS AS READ',
      details: error.message
    })
  }
})

/**
 * DELETE /api/organizations/:organizationId/notifications/clear-read
 * Delete all READ notifications for an organization
 * Only deletes notifications where is_read = TRUE
 * Unread notifications are preserved
 */
router.delete('/:organizationId/notifications/clear-read', async (req, res) => {
  try {
    const { organizationId } = req.params

    console.log('[NGO_NOTIFICATIONS_CLEAR_READ]', { organizationId })

    // Delete only read notifications
    const result = await query(
      `DELETE FROM ngo_notifications
       WHERE organization_id = $1
       AND is_read = TRUE
       RETURNING id`,
      [organizationId]
    )

    const deletedCount = result.rows.length

    console.log('[NGO_NOTIFICATIONS_CLEAR_READ_SUCCESS]', {
      organizationId,
      deletedCount
    })

    res.json({
      success: true,
      data: {
        deletedCount,
        message: deletedCount === 0
          ? 'NO READ NOTIFICATIONS TO DELETE'
          : `${deletedCount} READ NOTIFICATION${deletedCount > 1 ? 'S' : ''} DELETED PERMANENTLY`
      }
    })
  } catch (error) {
    console.error('[NGO_NOTIFICATIONS_CLEAR_READ_ERROR]', error)
    res.status(500).json({
      success: false,
      error: 'FAILED TO CLEAR READ NOTIFICATIONS',
      details: error.message
    })
  }
})

/**
 * GET /api/organizations/export-data
 * Export organization data to PDF
 * Requires organization to be authenticated
 */
router.get('/export-data', async (req, res) => {
  try {
    const { walletAddress } = req.query

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'WALLET ADDRESS REQUIRED'
      })
    }

    // Generate and stream PDF directly to response
    // No cloud storage - on-the-fly generation
    console.log(`📄 [PDF_EXPORT] Generating organization PDF for: ${walletAddress}`)
    await generateNGODataPDF(walletAddress, res)
  } catch (error) {
    console.error('[EXPORT_DATA_ERROR]', error)

    // Only send JSON error if headers not yet sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'EXPORT_FAILED',
        message: 'FAILED TO EXPORT DATA. PLEASE TRY AGAIN.',
        details: error.message
      })
    }
  }
})

/**
 * GET /api/organizations/:walletAddress
 * Get organization by wallet address (MUST BE LAST - catch-all route)
 * Returns basic organization info (id, name, wallet, etc.)
 */
router.get('/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'WALLET ADDRESS REQUIRED'
        }
      })
    }

    // Get organization by escrow wallet address
    // CRITICAL: organizations.escrow_wallet_address = user's wallet_address (1:1 mapping)
    const result = await query(
      `SELECT *
       FROM organizations
       WHERE escrow_wallet_address = $1`,
      [walletAddress]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'ORGANIZATION NOT FOUND FOR THIS WALLET ADDRESS'
        }
      })
    }

    res.json({
      success: true,
      data: {
        organization: result.rows[0]
      }
    })
  } catch (error) {
    console.error('[ORG_GET_ERROR]', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'FAILED TO FETCH ORGANIZATION'
      }
    })
  }
})

/**
 * POST /api/organizations/:walletAddress/sync-all-channels
 * Sync all active payment channels from Xahau ledger into database
 * This is used when dashboard shows 0 channels but ledger has active channels
 */
router.post('/:walletAddress/sync-all-channels', async (req, res) => {
  try {
    const { walletAddress } = req.params

    console.log('[SYNC_ALL_CHANNELS] Starting full ledger sync for wallet:', walletAddress)

    // Validate XRPL address format
    const xrplAddressPattern = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/
    if (!xrplAddressPattern.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: { message: 'INVALID XRPL WALLET ADDRESS FORMAT' }
      })
    }

    // Get organization from database
    const orgResult = await query(
      'SELECT id, organization_name, escrow_wallet_address FROM organizations WHERE escrow_wallet_address = $1',
      [walletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'ORGANIZATION NOT FOUND FOR WALLET ADDRESS' }
      })
    }

    const organization = orgResult.rows[0]
    console.log('[SYNC_ALL_CHANNELS] Found organization:', organization.organization_name)

    // Get all employees for this organization
    const employeesResult = await query(
      'SELECT id, employee_wallet_address, full_name FROM employees WHERE organization_id = $1 AND employment_status = $2',
      [organization.id, 'active']
    )

    console.log('[SYNC_ALL_CHANNELS] Found', employeesResult.rows.length, 'active employees')

    // Create employee wallet address map for quick lookup
    const employeeMap = {}
    employeesResult.rows.forEach(emp => {
      employeeMap[emp.employee_wallet_address] = emp
    })

    // Connect to Xahau and query all payment channels
    const client = new Client(getNetworkUrl())
    let ledgerChannels = []

    try {
      await client.connect()
      console.log('[SYNC_ALL_CHANNELS] Connected to Xahau network:', getNetworkUrl())

      const channelsResponse = await client.request({
        command: 'account_channels',
        account: walletAddress,
        ledger_index: 'validated'
      })

      ledgerChannels = channelsResponse.result?.channels || []
      console.log('[SYNC_ALL_CHANNELS] Found', ledgerChannels.length, 'channels on ledger')

      await client.disconnect()
    } catch (ledgerError) {
      await client.disconnect().catch(() => {})
      console.error('[SYNC_ALL_CHANNELS_LEDGER_ERROR]', ledgerError)
      return res.status(500).json({
        success: false,
        error: {
          message: 'FAILED TO QUERY XAHAU',
          details: ledgerError.message
        }
      })
    }

    // Process each ledger channel
    const syncResults = {
      total: ledgerChannels.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: []
    }

    for (const ledgerChannel of ledgerChannels) {
      try {
        const channelId = ledgerChannel.channel_id
        const destinationAddress = ledgerChannel.destination_account
        const escrowAmountXah = parseFloat(ledgerChannel.amount || '0') / 1_000_000
        const balanceXah = parseFloat(ledgerChannel.balance || '0') / 1_000_000

        console.log('[SYNC_ALL_CHANNELS] Processing channel:', channelId, 'to', destinationAddress)

        // Check if employee exists for this destination address
        const employee = employeeMap[destinationAddress]
        if (!employee) {
          console.log('[SYNC_ALL_CHANNELS] Skipping channel - worker not in organization:', destinationAddress)
          syncResults.skipped++
          syncResults.errors.push({
            channelId,
            reason: 'WORKER_NOT_FOUND',
            destinationAddress
          })
          continue
        }

        // Check if channel already exists in database
        const existingChannelResult = await query(
          'SELECT id, status FROM payment_channels WHERE channel_id = $1',
          [channelId]
        )

        if (existingChannelResult.rows.length > 0) {
          const existingChannel = existingChannelResult.rows[0]

          // Update existing channel if it's active OR closing (channel still exists on ledger)
          // Only skip if status is 'closed' (channel already removed from ledger)
          if (existingChannel.status !== 'closed') {
            // Check if channel has expiration (closing state)
            if (ledgerChannel.expiration) {
              const expirationTimestamp = ledgerChannel.expiration + 946684800 // XRPL Ripple time to Unix
              await query(
                `UPDATE payment_channels
                 SET
                   status = 'closing',
                   expiration_time = to_timestamp($1),
                   escrow_funded_amount = $2,
                   on_chain_balance = $3,
                   settle_delay = $4,
                   last_ledger_sync = NOW(),
                   updated_at = NOW()
                 WHERE channel_id = $5`,
                [expirationTimestamp, escrowAmountXah, balanceXah, ledgerChannel.settle_delay || 0, channelId]
              )
              console.log('[SYNC_ALL_CHANNELS] Updated existing channel to CLOSING:', channelId, 'expires:', new Date(expirationTimestamp * 1000).toISOString())
            } else {
              await query(
                `UPDATE payment_channels
                 SET
                   status = 'active',
                   escrow_funded_amount = $1,
                   on_chain_balance = $2,
                   settle_delay = $3,
                   last_ledger_sync = NOW(),
                   updated_at = NOW()
                 WHERE channel_id = $4`,
                [escrowAmountXah, balanceXah, ledgerChannel.settle_delay || 0, channelId]
              )
              console.log('[SYNC_ALL_CHANNELS] Updated existing channel to ACTIVE:', channelId)
            }
            syncResults.updated++
          } else {
            console.log('[SYNC_ALL_CHANNELS] Skipping fully closed channel:', channelId)
            syncResults.skipped++
          }
        } else {
          // Import new channel from ledger
          // NOTE: Xahau ledger does not store job names, hourly rates, or other metadata.
          // These must be set manually after import or during normal channel creation via UI.

          // Check if channel has expiration (scheduled for closure)
          if (ledgerChannel.expiration) {
            const expirationTimestamp = ledgerChannel.expiration + 946684800 // XRPL Ripple time to Unix
            await query(
              `INSERT INTO payment_channels (
                channel_id,
                organization_id,
                employee_id,
                job_name,
                hourly_rate,
                max_daily_hours,
                escrow_funded_amount,
                on_chain_balance,
                off_chain_accumulated_balance,
                balance_update_frequency,
                status,
                expiration_time,
                settle_delay,
                last_ledger_sync,
                created_at,
                updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12), $13, NOW(), NOW(), NOW())`,
              [
                channelId,
                organization.id,
                employee.id,
                `[IMPORTED - EDIT JOB NAME]`, // Placeholder - NGO must edit
                0, // Default hourly rate - NGO must edit
                8, // Default max daily hours
                escrowAmountXah,
                balanceXah, // on_chain_balance from ledger
                0, // off_chain_accumulated_balance starts at 0 (no completed sessions yet)
                'Hourly', // Default frequency
                'closing', // Status is closing because expiration exists
                expirationTimestamp,
                ledgerChannel.settle_delay || 0
              ]
            )
            console.log('[SYNC_ALL_CHANNELS] Imported new CLOSING channel:', channelId, 'expires:', new Date(expirationTimestamp * 1000).toISOString())
          } else {
            await query(
              `INSERT INTO payment_channels (
                channel_id,
                organization_id,
                employee_id,
                job_name,
                hourly_rate,
                max_daily_hours,
                escrow_funded_amount,
                on_chain_balance,
                off_chain_accumulated_balance,
                balance_update_frequency,
                status,
                settle_delay,
                last_ledger_sync,
                created_at,
                updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW())`,
              [
                channelId,
                organization.id,
                employee.id,
                `[IMPORTED - EDIT JOB NAME]`, // Placeholder - NGO must edit
                0, // Default hourly rate - NGO must edit
                8, // Default max daily hours
                escrowAmountXah,
                balanceXah, // on_chain_balance from ledger
                0, // off_chain_accumulated_balance starts at 0 (no completed sessions yet)
                'Hourly', // Default frequency
                'active', // Status is active (no expiration)
                ledgerChannel.settle_delay || 0
              ]
            )
            console.log('[SYNC_ALL_CHANNELS] Imported new ACTIVE channel:', channelId)
          }
          syncResults.imported++
        }
      } catch (channelError) {
        console.error('[SYNC_ALL_CHANNELS_CHANNEL_ERROR]', channelError)
        syncResults.errors.push({
          channelId: ledgerChannel.channel_id,
          reason: 'PROCESSING_ERROR',
          error: channelError.message
        })
      }
    }

    console.log('[SYNC_ALL_CHANNELS] Sync complete:', syncResults)

    res.json({
      success: true,
      message: 'LEDGER SYNC COMPLETE',
      results: syncResults
    })
  } catch (error) {
    console.error('[SYNC_ALL_CHANNELS_ERROR]', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'FAILED TO SYNC CHANNELS FROM LEDGER',
        details: error.message
      }
    })
  }
})

module.exports = router
