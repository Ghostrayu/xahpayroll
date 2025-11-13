const express = require('express')
const router = express.Router()
const { query } = require('../database/db')

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

    // Create organization with simplified schema
    const result = await query(
      `INSERT INTO organizations (
        organization_name, escrow_wallet_address,
        website, description, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING *`,
      [
        organizationName,
        escrowWalletAddress,
        website || null,
        description || null
      ]
    )

    console.log('[ORG_CREATE_SUCCESS]', {
      organizationId: result.rows[0].id,
      walletAddress: escrowWalletAddress,
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

    // Get organization by user wallet address
    const orgResult = await query(
      `SELECT o.* 
       FROM organizations o
       JOIN users u ON o.user_id = u.id
       WHERE u.wallet_address = $1`,
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
      'SELECT COUNT(*) as total FROM employees WHERE organization_id = $1',
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

    // Get total escrow balance from all active payment channels
    const escrowBalanceResult = await query(
      `SELECT COALESCE(SUM(escrow_funded_amount - accumulated_balance), 0) as total_escrow
       FROM payment_channels
       WHERE organization_id = $1 AND status = 'active'`,
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

    // Get organization by user wallet address
    const orgResult = await query(
      `SELECT o.* 
       FROM organizations o
       JOIN users u ON o.user_id = u.id
       WHERE u.wallet_address = $1`,
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
       LEFT JOIN work_sessions ws ON e.id = ws.employee_id AND ws.clock_out IS NULL AND ws.session_status = 'active'
       WHERE e.organization_id = $1
       AND e.employment_status = 'active'
       ORDER BY ws.clock_in DESC NULLS LAST
       LIMIT 10`,
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

    // Get organization
    const orgResult = await query(
      `SELECT o.* 
       FROM organizations o
       JOIN users u ON o.user_id = u.id
       WHERE u.wallet_address = $1`,
      [walletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Organization not found' }
      })
    }

    const organization = orgResult.rows[0]

    // Get recent work sessions and payments
    const activityResult = await query(
      `(
        SELECT
          'clock_in' as type,
          e.full_name as worker,
          ws.clock_in as timestamp,
          NULL::numeric as amount
        FROM work_sessions ws
        JOIN employees e ON ws.employee_id = e.id
        WHERE ws.organization_id = $1
        ORDER BY ws.clock_in DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT
          'clock_out' as type,
          e.full_name as worker,
          ws.clock_out as timestamp,
          NULL::numeric as amount
        FROM work_sessions ws
        JOIN employees e ON ws.employee_id = e.id
        WHERE ws.organization_id = $1 AND ws.clock_out IS NOT NULL
        ORDER BY ws.clock_out DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT
          'payment' as type,
          e.full_name as worker,
          p.created_at as timestamp,
          p.amount
        FROM payments p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.organization_id = $1
        ORDER BY p.created_at DESC
        LIMIT 5
      )
      ORDER BY timestamp DESC
      LIMIT 10`,
      [organization.id]
    )

    const activity = activityResult.rows.map(a => {
      const now = new Date()
      const timestamp = new Date(a.timestamp)
      const diffMs = now.getTime() - timestamp.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      
      let timeAgo
      if (diffMins < 1) timeAgo = 'Just now'
      else if (diffMins < 60) timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
      else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)} hour${Math.floor(diffMins / 60) > 1 ? 's' : ''} ago`
      else timeAgo = `${Math.floor(diffMins / 1440)} day${Math.floor(diffMins / 1440) > 1 ? 's' : ''} ago`

      return {
        worker: a.worker,
        action: a.type === 'clock_in' ? 'Clocked In' : a.type === 'clock_out' ? 'Clocked Out' : 'Payment Sent',
        amount: a.amount ? `${parseFloat(a.amount).toFixed(2)} XAH` : null,
        time: timeAgo,
        status: a.type === 'clock_in' ? 'active' : 'completed'
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

    // Get organization
    const orgResult = await query(
      `SELECT o.* 
       FROM organizations o
       JOIN users u ON o.user_id = u.id
       WHERE u.wallet_address = $1`,
      [walletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Organization not found' }
      })
    }

    const organization = orgResult.rows[0]

    // Get payment channels
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
        pc.accumulated_balance,
        pc.hours_accumulated,
        pc.escrow_funded_amount
       FROM payment_channels pc
       JOIN employees e ON pc.employee_id = e.id
       WHERE pc.organization_id = $1 AND pc.status = 'active'
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
      const accumulatedAmount = parseFloat(c.accumulated_balance || 0)
      const escrowBalance = fundedAmount - accumulatedAmount

      return {
        id: c.id,
        worker: c.worker,
        jobName: c.job_name || 'Unnamed Job',
        channelId: c.channel_id || `CH-${new Date().getFullYear()}-${String(c.id).padStart(3, '0')}`,
        balance: parseFloat(c.accumulated_balance),
        escrowBalance: escrowBalance,
        hourlyRate: parseFloat(c.hourly_rate),
        hoursAccumulated: parseFloat(c.hours_accumulated),
        status: c.status,
        lastUpdate,
        balanceUpdateFrequency: c.balance_update_frequency || 'Hourly'
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
      type: n.notification_type,
      workerWalletAddress: n.worker_wallet_address,
      workerName: n.worker_name,
      message: n.message,
      metadata: n.metadata || {},
      isRead: n.is_read,
      createdAt: n.created_at
    }))

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
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
    await query(
      `UPDATE ngo_notifications
       SET is_read = $1
       WHERE id = $2 AND organization_id = $3`,
      [isRead, notificationId, organizationId]
    )

    res.json({
      success: true,
      message: 'NOTIFICATION STATUS UPDATED'
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

    await query(
      `UPDATE ngo_notifications
       SET is_read = true
       WHERE organization_id = $1 AND is_read = false`,
      [organizationId]
    )

    res.json({
      success: true,
      message: 'ALL NOTIFICATIONS MARKED AS READ'
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

module.exports = router
