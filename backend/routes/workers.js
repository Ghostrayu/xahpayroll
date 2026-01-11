const express = require('express')
const router = express.Router()
const { query } = require('../database/db')
const { generateWorkerDataPDF } = require('../utils/pdfGenerator')

/**
 * POST /api/workers/add
 * Add a worker to an organization
 * Allows same worker wallet to be associated with multiple organizations
 */
router.post('/add', async (req, res) => {
  try {
    const { name, walletAddress, ngoWalletAddress } = req.body

    // DEBUG: Log incoming request
    console.log('[ADD_WORKER_REQUEST]', {
      name,
      walletAddress,
      ngoWalletAddress,
      ngoWalletAddressLength: ngoWalletAddress?.length,
      ngoWalletAddressTrimmed: ngoWalletAddress?.trim()
    })

    // Validate required fields
    if (!name || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'Worker name and wallet address are required' }
      })
    }

    // Validate XRPL address format
    if (!walletAddress.match(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid XRPL wallet address format' }
      })
    }

    // Get organization by NGO wallet address
    let organizationId

    if (ngoWalletAddress) {
      // Trim wallet address to remove any whitespace
      const trimmedNgoWallet = ngoWalletAddress.trim()

      const orgResult = await query(
        `SELECT o.id
         FROM organizations o
         JOIN users u ON o.user_id = u.id
         WHERE u.wallet_address = $1`,
        [trimmedNgoWallet]
      )

      console.log('[ORG_LOOKUP_RESULT]', {
        searchedWallet: trimmedNgoWallet,
        foundRows: orgResult.rows.length,
        foundOrgId: orgResult.rows[0]?.id
      })

      if (orgResult.rows.length === 0) {
        // Enhanced error message with debugging info
        return res.status(404).json({
          success: false,
          error: {
            message: 'Organization not found. Please ensure you are signed in as an NGO/Employer.',
            debug: {
              searchedWallet: trimmedNgoWallet,
              walletLength: trimmedNgoWallet.length
            }
          }
        })
      }

      organizationId = orgResult.rows[0].id
    } else {
      return res.status(400).json({
        success: false,
        error: { message: 'NGO wallet address is required' }
      })
    }

    // Check if worker already exists for this organization
    const existingWorker = await query(
      'SELECT * FROM employees WHERE organization_id = $1 AND employee_wallet_address = $2',
      [organizationId, walletAddress]
    )

    if (existingWorker.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: { message: 'This worker is already added to your organization' }
      })
    }

    // Check if wallet address is registered as an NGO/employer
    const userCheck = await query(
      "SELECT user_type FROM users WHERE wallet_address = $1 AND user_type IN ('ngo', 'employer')",
      [walletAddress]
    )

    if (userCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'This wallet address is registered as an NGO/Employer and cannot be added as a worker. Workers must use a separate wallet address.'
        }
      })
    }

    // Create or get user record FIRST (before employee record)
    // This ensures we have a user_id to link to the employee
    let userId
    const existingUser = await query(
      'SELECT id FROM users WHERE wallet_address = $1',
      [walletAddress]
    )

    if (existingUser.rows.length === 0) {
      // Create new user record
      const newUser = await query(
        `INSERT INTO users (
          wallet_address,
          display_name,
          user_type
        ) VALUES ($1, $2, 'employee')
        RETURNING id`,
        [walletAddress, name]
      )
      userId = newUser.rows[0].id
      console.log('[ADD_WORKER] Created new user with ID:', userId)
    } else {
      userId = existingUser.rows[0].id
      console.log('[ADD_WORKER] Using existing user ID:', userId)
    }

    // Add worker to organization with user_id populated
    // CRITICAL: user_id must be set to prevent orphaned employee records
    const result = await query(
      `INSERT INTO employees (
        organization_id,
        full_name,
        employee_wallet_address,
        hourly_rate,
        employment_status,
        user_id
      ) VALUES ($1, $2, $3, $4, 'active', $5)
      RETURNING *`,
      [organizationId, name, walletAddress, 0, userId]  // Default hourly_rate to 0, will be set when creating payment channel
    )

    const worker = result.rows[0]
    console.log('[ADD_WORKER] Created employee with user_id:', worker.user_id)

    res.json({
      success: true,
      data: {
        id: worker.id,
        name: worker.full_name,
        walletAddress: worker.employee_wallet_address,
        hourlyRate: parseFloat(worker.hourly_rate),
        status: worker.employment_status,
        createdAt: worker.created_at
      }
    })
  } catch (error) {
    console.error('Error adding worker:', error)

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: { message: 'This worker is already added to your organization' }
      })
    }

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to add worker',
        details: error.message
      }
    })
  }
})

/**
 * DELETE /api/workers/remove
 * Remove a worker from an organization
 * Validates that worker has no active payment channels before deletion
 */
router.delete('/remove', async (req, res) => {
  try {
    const { walletAddress, ngoWalletAddress } = req.body

    // Validate required fields
    if (!walletAddress || !ngoWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'Worker wallet address and NGO wallet address are required' }
      })
    }

    // Get organization by NGO wallet address
    const orgResult = await query(
      `SELECT o.id
       FROM organizations o
       JOIN users u ON o.user_id = u.id
       WHERE u.wallet_address = $1`,
      [ngoWalletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Organization not found' }
      })
    }

    const organizationId = orgResult.rows[0].id

    // Check if worker exists in this organization
    const workerCheck = await query(
      'SELECT id FROM employees WHERE organization_id = $1 AND employee_wallet_address = $2',
      [organizationId, walletAddress]
    )

    if (workerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Worker not found in your organization' }
      })
    }

    const employeeId = workerCheck.rows[0].id

    // Check for active payment channels
    const activeChannels = await query(
      `SELECT channel_id, job_name, status, off_chain_accumulated_balance
       FROM payment_channels
       WHERE employee_id = $1 AND organization_id = $2 AND status IN ('active', 'closing')`,
      [employeeId, organizationId]
    )

    if (activeChannels.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'Cannot remove worker with active payment channels',
          activeChannels: activeChannels.rows.map(c => ({
            jobName: c.job_name,
            status: c.status,
            balance: parseFloat(c.off_chain_accumulated_balance || 0)
          }))
        }
      })
    }

    // Check for unpaid balances
    const unpaidBalance = await query(
      `SELECT SUM(off_chain_accumulated_balance) as total
       FROM payment_channels
       WHERE employee_id = $1 AND organization_id = $2 AND status = 'active'`,
      [employeeId, organizationId]
    )

    const totalUnpaid = parseFloat(unpaidBalance.rows[0]?.total || 0)

    if (totalUnpaid > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: `Cannot remove worker with unpaid balance of ${totalUnpaid} XAH`,
          unpaidBalance: totalUnpaid
        }
      })
    }

    // Delete worker from organization
    await query(
      'DELETE FROM employees WHERE id = $1 AND organization_id = $2',
      [employeeId, organizationId]
    )

    res.json({
      success: true,
      message: 'Worker removed from organization successfully'
    })
  } catch (error) {
    console.error('Error removing worker:', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to remove worker',
        details: error.message
      }
    })
  }
})

/**
 * GET /api/workers/list/:ngoWalletAddress
 * Get all workers for an organization
 */
router.get('/list/:ngoWalletAddress', async (req, res) => {
  try {
    const { ngoWalletAddress } = req.params

    // Get organization by escrow wallet address (matches /api/organizations/workers strategy)
    // CRITICAL: organizations.escrow_wallet_address = user's wallet_address (1:1 mapping)
    const orgResult = await query(
      `SELECT id
       FROM organizations
       WHERE escrow_wallet_address = $1`,
      [ngoWalletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Organization not found' }
      })
    }

    const organizationId = orgResult.rows[0].id

    // Get all active workers for this organization
    const workersResult = await query(
      `SELECT
        e.id,
        e.full_name,
        e.employee_wallet_address,
        e.hourly_rate,
        e.employment_status,
        e.created_at
       FROM employees e
       WHERE e.organization_id = $1
       AND e.employment_status = 'active'
       ORDER BY e.full_name ASC`,
      [organizationId]
    )

    const workers = workersResult.rows.map(w => ({
      id: w.id,
      name: w.full_name,
      walletAddress: w.employee_wallet_address,
      hourlyRate: w.hourly_rate ? parseFloat(w.hourly_rate) : 0,
      status: w.employment_status,
      createdAt: w.created_at
    }))

    res.json({
      success: true,
      data: workers
    })
  } catch (error) {
    console.error('Error fetching workers:', error)
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch workers' }
    })
  }
})

/**
 * GET /api/workers/deletion-eligibility
 * Check if worker can delete their profile
 * Requires worker to be authenticated
 */
router.get('/deletion-eligibility', async (req, res) => {
  try {
    // TODO: Add authentication middleware to get walletAddress from session
    const { walletAddress } = req.query

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'WALLET ADDRESS REQUIRED'
      })
    }

    // Check for active channels
    // FIXED (2025-12-06): Only block deletion for truly active/timeout channels
    // Channels with status='closed' should NOT block deletion, even if closure_tx_hash IS NULL
    // (e.g., channels auto-closed via ledger_not_found have no tx hash but are legitimately closed)
    const activeChannels = await query(`
      SELECT
        pc.*,
        o.organization_name
      FROM payment_channels pc
      JOIN organizations o ON pc.organization_id = o.id
      JOIN employees e ON pc.employee_id = e.id
      WHERE e.employee_wallet_address = $1
      AND pc.status IN ('active', 'timeout', 'closing')
    `, [walletAddress])

    // Check for unpaid balances
    const unpaidBalances = await query(`
      SELECT SUM(pc.off_chain_accumulated_balance) as total
      FROM payment_channels pc
      JOIN employees e ON pc.employee_id = e.id
      WHERE e.employee_wallet_address = $1
      AND pc.status = 'active'
    `, [walletAddress])

    const totalUnpaid = unpaidBalances.rows[0]?.total || 0

    // Build blocking reasons
    const blockingReasons = []

    for (const channel of activeChannels.rows) {
      blockingReasons.push({
        type: channel.off_chain_accumulated_balance > 0 ? 'active_channel' : 'unclosed_channel',
        organization: channel.organization_name,
        channelId: channel.id,
        unpaidBalance: parseFloat(channel.off_chain_accumulated_balance || 0),
        status: channel.status
      })
    }

    // Get statistics
    const stats = await query(`
      SELECT
        COUNT(DISTINCT o.id) as total_organizations,
        COUNT(CASE WHEN pc.status = 'active' THEN 1 END) as active_channels,
        COUNT(CASE WHEN pc.closure_tx_hash IS NOT NULL THEN 1 END) as closed_channels
      FROM employees e
      LEFT JOIN organizations o ON e.organization_id = o.id
      LEFT JOIN payment_channels pc ON pc.employee_id = e.id
        AND pc.organization_id = o.id
      WHERE e.employee_wallet_address = $1
    `, [walletAddress])

    const canDelete = blockingReasons.length === 0 && parseFloat(totalUnpaid) === 0

    res.json({
      canDelete,
      blockingReasons,
      stats: {
        totalOrganizations: parseInt(stats.rows[0]?.total_organizations || 0),
        activeChannels: parseInt(stats.rows[0]?.active_channels || 0),
        totalUnpaidBalance: parseFloat(totalUnpaid),
        closedChannels: parseInt(stats.rows[0]?.closed_channels || 0)
      }
    })
  } catch (error) {
    console.error('Error checking deletion eligibility:', error)
    res.status(500).json({
      success: false,
      error: 'FAILED TO CHECK DELETION ELIGIBILITY',
      details: error.message
    })
  }
})

/**
 * POST /api/workers/delete-profile
 * Request profile deletion (soft delete with 48-hour grace period)
 * Requires worker to be authenticated
 */
router.post('/delete-profile', async (req, res) => {
  try {
    const { walletAddress, confirmationText, reason } = req.body

    // Validate required fields
    if (!walletAddress || !confirmationText) {
      return res.status(400).json({
        success: false,
        error: 'WALLET ADDRESS AND CONFIRMATION TEXT REQUIRED'
      })
    }

    // Validate confirmation text (case-insensitive)
    if (confirmationText.toUpperCase() !== 'DELETE MY ACCOUNT') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONFIRMATION',
        message: 'CONFIRMATION TEXT MUST BE "DELETE MY ACCOUNT"'
      })
    }

    // Check deletion eligibility
    // FIXED (2025-12-06): Only block deletion for truly active channels with unpaid balances
    // Closed channels should NOT block deletion, even if closure_tx_hash IS NULL
    const eligibility = await query(`
      SELECT
        COUNT(*) as blocking_count
      FROM payment_channels pc
      JOIN employees e ON pc.employee_id = e.id
      WHERE e.employee_wallet_address = $1
      AND (
        pc.status IN ('active', 'timeout', 'closing')
        OR pc.off_chain_accumulated_balance > 0
      )
    `, [walletAddress])

    if (parseInt(eligibility.rows[0]?.blocking_count || 0) > 0) {
      return res.status(403).json({
        success: false,
        error: 'DELETION_BLOCKED',
        message: 'CANNOT DELETE PROFILE WITH ACTIVE CHANNELS OR UNPAID BALANCES'
      })
    }

    // Get affected organizations
    const organizations = await query(`
      SELECT DISTINCT o.id, o.organization_name
      FROM organizations o
      JOIN employees e ON e.organization_id = o.id
      WHERE e.employee_wallet_address = $1
    `, [walletAddress])

    // Get user name from employees table (workers are stored there)
    const userInfo = await query(`
      SELECT full_name
      FROM employees
      WHERE employee_wallet_address = $1
      LIMIT 1
    `, [walletAddress])

    const userName = userInfo.rows[0]?.full_name || walletAddress

    // Start transaction
    await query('BEGIN')

    try {
      // Soft delete user account
      await query(`
        UPDATE users
        SET deleted_at = CURRENT_TIMESTAMP,
            deletion_reason = $2
        WHERE wallet_address = $1
      `, [walletAddress, reason || 'User requested deletion'])

      // Create deletion log
      await query(`
        INSERT INTO deletion_logs (
          wallet_address,
          user_type,
          deleted_by,
          deletion_reason,
          organizations_affected,
          data_export_url
        ) VALUES ($1, 'employee', 'self', $2, $3, $4)
      `, [
        walletAddress,
        reason || 'User requested deletion',
        organizations.rows.map(o => o.organization_name),
        null // TODO: Generate PDF export URL
      ])

      // Notify all affected organizations
      for (const org of organizations.rows) {
        await query(`
          INSERT INTO ngo_notifications (
            organization_id,
            notification_type,
            worker_wallet_address,
            worker_name,
            message,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          org.id,
          'worker_deleted',
          walletAddress,
          userName,
          `WORKER ${userName} HAS DELETED THEIR PROFILE`,
          JSON.stringify({
            reason: reason || 'User requested deletion',
            deletionDate: new Date().toISOString()
          })
        ])
      }

      // Commit transaction
      await query('COMMIT')

      const deletionScheduledAt = new Date()
      const hardDeleteAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

      res.json({
        success: true,
        message: 'PROFILE DELETION SCHEDULED. DATA WILL BE PERMANENTLY REMOVED IN 48 HOURS.',
        deletionScheduledAt,
        hardDeleteAt,
        dataExportUrl: null, // TODO: Generate PDF export
        affectedOrganizations: organizations.rows.map(o => o.organization_name),
        notificationsSent: organizations.rows.length
      })
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  } catch (error) {
    console.error('Error deleting profile:', error)
    res.status(500).json({
      success: false,
      error: 'DELETION_FAILED',
      message: 'PROFILE DELETION FAILED. PLEASE TRY AGAIN.',
      details: error.message
    })
  }
})

/**
 * POST /api/workers/cancel-deletion
 * Cancel profile deletion within 48-hour grace period
 * Requires worker to be authenticated
 */
router.post('/cancel-deletion', async (req, res) => {
  try {
    const { walletAddress } = req.body

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'WALLET ADDRESS REQUIRED'
      })
    }

    // Check if user is soft-deleted
    const userCheck = await query(`
      SELECT deleted_at
      FROM users
      WHERE wallet_address = $1
      AND deleted_at IS NOT NULL
    `, [walletAddress])

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NO_DELETION_FOUND',
        message: 'NO PENDING DELETION FOUND FOR THIS ACCOUNT'
      })
    }

    const deletedAt = new Date(userCheck.rows[0].deleted_at)
    const now = new Date()
    const hoursSinceDeletion = (now - deletedAt) / (1000 * 60 * 60)

    // Check if within 48-hour window
    if (hoursSinceDeletion > 48) {
      return res.status(400).json({
        success: false,
        error: 'DELETION_WINDOW_EXPIRED',
        message: 'DELETION CANNOT BE CANCELLED AFTER 48 HOURS'
      })
    }

    // Restore account
    await query(`
      UPDATE users
      SET deleted_at = NULL,
          deletion_reason = NULL
      WHERE wallet_address = $1
    `, [walletAddress])

    res.json({
      success: true,
      message: 'DELETION CANCELLED. YOUR ACCOUNT HAS BEEN RESTORED.',
      restoredAt: new Date()
    })
  } catch (error) {
    console.error('Error cancelling deletion:', error)
    res.status(500).json({
      success: false,
      error: 'CANCELLATION_FAILED',
      message: 'FAILED TO CANCEL DELETION. PLEASE TRY AGAIN.',
      details: error.message
    })
  }
})

/**
 * GET /api/workers/export-data
 * Export worker profile data to PDF
 * Requires worker to be authenticated
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
    console.log(`📄 [PDF_EXPORT] Generating PDF for: ${walletAddress}`)
    await generateWorkerDataPDF(walletAddress, res)
  } catch (error) {
    console.error('❌ [PDF_EXPORT_ERROR]', error)

    // Only send error response if headers haven't been sent yet
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
 * GET /api/workers/check-orphaned-records
 * Check if wallet address has orphaned employee records from previous deletion
 * Orphaned records = employee records exist but user account was deleted
 * Returns statistics about previous work history
 */
router.get('/check-orphaned-records', async (req, res) => {
  try {
    const { walletAddress } = req.query

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'WALLET ADDRESS REQUIRED'
      })
    }

    // Check if user currently exists and is NOT deleted
    const userCheck = await query(`
      SELECT id, deleted_at
      FROM users
      WHERE wallet_address = $1
    `, [walletAddress])

    const userExists = userCheck.rows.length > 0
    const userDeleted = userExists && userCheck.rows[0].deleted_at !== null

    // Only show orphaned records if:
    // 1. User doesn't exist, OR
    // 2. User exists but is marked as deleted
    // This prevents showing orphaned records to active users
    if (userExists && !userDeleted) {
      return res.json({
        hasOrphanedRecords: false,
        workSessionsCount: 0,
        organizationsCount: 0,
        totalEarnings: 0,
        lastActivityDate: null
      })
    }

    // Count orphaned work sessions
    const workSessions = await query(`
      SELECT COUNT(*) as count
      FROM work_sessions ws
      WHERE ws.employee_wallet_address = $1
    `, [walletAddress])

    // Count organizations worker was associated with
    const organizations = await query(`
      SELECT COUNT(DISTINCT e.organization_id) as count
      FROM employees e
      WHERE e.employee_wallet_address = $1
    `, [walletAddress])

    // Calculate total historical earnings (all payments + unpaid balances)
    const earnings = await query(`
      SELECT
        COALESCE(SUM(p.amount), 0) as paid_earnings,
        COALESCE(SUM(pc.off_chain_accumulated_balance), 0) as unpaid_earnings
      FROM employees e
      LEFT JOIN payment_channels pc ON pc.employee_id = e.id
      LEFT JOIN payments p ON p.payment_channel_id = pc.id
      WHERE e.employee_wallet_address = $1
    `, [walletAddress])

    const totalEarnings = parseFloat(earnings.rows[0]?.paid_earnings || 0) +
                         parseFloat(earnings.rows[0]?.unpaid_earnings || 0)

    // Get last activity date
    const lastActivity = await query(`
      SELECT MAX(clock_out) as last_activity
      FROM work_sessions
      WHERE employee_wallet_address = $1
    `, [walletAddress])

    const workSessionsCount = parseInt(workSessions.rows[0]?.count || 0)
    const organizationsCount = parseInt(organizations.rows[0]?.count || 0)
    const hasOrphanedRecords = workSessionsCount > 0 || organizationsCount > 0

    res.json({
      hasOrphanedRecords,
      workSessionsCount,
      organizationsCount,
      totalEarnings: parseFloat(totalEarnings.toFixed(6)),
      lastActivityDate: lastActivity.rows[0]?.last_activity || null
    })
  } catch (error) {
    console.error('Error checking orphaned records:', error)
    res.status(500).json({
      success: false,
      error: 'FAILED TO CHECK ORPHANED RECORDS',
      details: error.message
    })
  }
})

/**
 * GET /api/workers/earnings/:walletAddress
 * Get worker earnings summary (today, week, month, total)
 */
router.get('/earnings/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'WALLET ADDRESS REQUIRED'
      })
    }

    // Get all payment history for this worker
    const earningsResult = await query(`
      SELECT
        COALESCE(SUM(CASE
          WHEN DATE(p.paid_at) = CURRENT_DATE THEN p.amount
          ELSE 0
        END), 0) as today,
        COALESCE(SUM(CASE
          WHEN p.paid_at >= DATE_TRUNC('week', CURRENT_DATE) THEN p.amount
          ELSE 0
        END), 0) as week,
        COALESCE(SUM(CASE
          WHEN p.paid_at >= DATE_TRUNC('month', CURRENT_DATE) THEN p.amount
          ELSE 0
        END), 0) as month,
        COALESCE(SUM(p.amount), 0) as total
      FROM payments p
      JOIN employees e ON p.employee_id = e.id
      WHERE e.employee_wallet_address = $1
      AND p.payment_status = 'completed'
    `, [walletAddress])

    const earnings = earningsResult.rows[0] || { today: 0, week: 0, month: 0, total: 0 }

    res.json({
      success: true,
      data: {
        today: parseFloat(earnings.today),
        week: parseFloat(earnings.week),
        month: parseFloat(earnings.month),
        total: parseFloat(earnings.total)
      }
    })
  } catch (error) {
    console.error('Error fetching worker earnings:', error)
    res.status(500).json({
      success: false,
      error: 'FAILED TO FETCH EARNINGS',
      details: error.message
    })
  }
})

/**
 * GET /api/workers/sessions/:walletAddress
 * Get work sessions for a worker
 */
router.get('/sessions/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'WALLET ADDRESS REQUIRED'
      })
    }

    // Get all work sessions for this worker
    const sessionsResult = await query(`
      SELECT
        ws.id,
        ws.clock_in,
        ws.clock_out,
        ws.hours_worked,
        ws.session_status as status
      FROM work_sessions ws
      JOIN employees e ON ws.employee_id = e.id
      WHERE e.employee_wallet_address = $1
      ORDER BY ws.clock_in DESC
      LIMIT 50
    `, [walletAddress])

    const sessions = sessionsResult.rows.map(s => ({
      id: s.id,
      clockIn: s.clock_in,
      clockOut: s.clock_out,
      hours: s.hours_worked ? parseFloat(s.hours_worked) : undefined,
      status: s.status
    }))

    res.json({
      success: true,
      data: sessions
    })
  } catch (error) {
    console.error('Error fetching work sessions:', error)
    res.status(500).json({
      success: false,
      error: 'FAILED TO FETCH WORK SESSIONS',
      details: error.message
    })
  }
})

/**
 * GET /api/workers/:walletAddress/payment-channels
 * Get all payment channels for a worker across all organizations
 * Returns channels with employer name and channel details
 */
router.get('/:walletAddress/payment-channels', async (req, res) => {
  try {
    const { walletAddress } = req.params

    // Validate wallet address
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'WALLET ADDRESS REQUIRED'
      })
    }

    // Validate XRPL address format
    if (!walletAddress.match(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID XRPL WALLET ADDRESS FORMAT'
      })
    }

    // Get payment channels for this worker (including 'closing' channels so workers can see scheduled closures)
    const channelsResult = await query(
      `SELECT
        pc.id,
        pc.channel_id,
        pc.job_name,
        pc.hourly_rate,
        pc.balance_update_frequency,
        pc.status,
        pc.updated_at,
        pc.off_chain_accumulated_balance,
        pc.hours_accumulated,
        pc.escrow_funded_amount,
        pc.max_daily_hours,
        pc.last_ledger_sync,
        pc.expiration_time,
        pc.closure_tx_hash,
        o.organization_name as employer,
        o.escrow_wallet_address as ngo_wallet
       FROM payment_channels pc
       JOIN organizations o ON pc.organization_id = o.id
       JOIN employees e ON pc.employee_id = e.id
       WHERE e.employee_wallet_address = $1
       AND pc.status IN ('active', 'closing')
       ORDER BY pc.created_at DESC`,
      [walletAddress]
    )

    // Transform to camelCase and calculate derived values
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

      return {
        id: c.id,
        employer: c.employer,
        ngoWalletAddress: c.ngo_wallet,
        jobName: c.job_name || 'Unnamed Job',
        channelId: c.channel_id || `CH-${new Date().getFullYear()}-${String(c.id).padStart(3, '0')}`,
        balance: parseFloat(c.off_chain_accumulated_balance || 0),
        escrowBalance: escrowBalance,
        hourlyRate: parseFloat(c.hourly_rate || 0),
        hoursAccumulated: parseFloat(c.hours_accumulated || 0),
        maxDailyHours: parseFloat(c.max_daily_hours || 8.00),
        status: c.status,
        lastUpdate,
        balanceUpdateFrequency: c.balance_update_frequency || 'Hourly',
        lastLedgerSync: c.last_ledger_sync,
        expirationTime: c.expiration_time,
        closureTxHash: c.closure_tx_hash
      }
    })

    res.json({
      success: true,
      data: channels
    })
  } catch (error) {
    console.error('Error fetching worker payment channels:', error)
    res.status(500).json({
      success: false,
      error: 'FAILED TO FETCH PAYMENT CHANNELS',
      details: error.message
    })
  }
})

/**
 * GET /api/workers/activity/:walletAddress
 * Get recent activity for a worker (similar to NGO activity feed)
 * Enhanced with Phase 1-3: payment events, channel events, notifications
 */
router.get('/activity/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    console.log('[WORKER_ACTIVITY_FETCH]', { walletAddress })

    // Get employee ID from wallet address
    const employeeResult = await query(
      `SELECT id FROM employees WHERE employee_wallet_address = $1`,
      [walletAddress]
    )

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'WORKER NOT FOUND' }
      })
    }

    const employeeId = employeeResult.rows[0].id

    // Get recent activity: work sessions, payments, channel events, notifications
    // Phase 1: Payment events (completed and failed), channel closures, escrow deposits
    // Phase 2: Payment types, channel names, tx hashes, failure reasons
    // Phase 3: Priority indicators (critical, warning, notification, normal)
    const activityResult = await query(
      `(
        -- Clock In Events
        SELECT
          'clock_in' as type,
          o.organization_name as organization,
          ws.clock_in as timestamp,
          NULL::numeric as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          NULL::varchar as tx_hash,
          NULL::varchar as job_name,
          NULL::varchar as details,
          'normal' as priority
        FROM work_sessions ws
        JOIN organizations o ON ws.organization_id = o.id
        WHERE ws.employee_id = $1
        ORDER BY ws.clock_in DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Clock Out Events
        SELECT
          'clock_out' as type,
          o.organization_name as organization,
          ws.clock_out as timestamp,
          ws.hours_worked as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          NULL::varchar as tx_hash,
          NULL::varchar as job_name,
          NULL::varchar as details,
          'normal' as priority
        FROM work_sessions ws
        JOIN organizations o ON ws.organization_id = o.id
        WHERE ws.employee_id = $1 AND ws.clock_out IS NOT NULL
        ORDER BY ws.clock_out DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Payment Received (Successful)
        SELECT
          'payment_received' as type,
          o.organization_name as organization,
          p.created_at as timestamp,
          p.amount,
          p.payment_type,
          p.payment_status,
          p.tx_hash,
          NULL::varchar as job_name,
          NULL::varchar as details,
          'normal' as priority
        FROM payments p
        JOIN organizations o ON p.organization_id = o.id
        WHERE p.employee_id = $1 AND p.payment_status = 'completed'
        ORDER BY p.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Payment Failed (Phase 1 + Phase 3: Critical Alert)
        SELECT
          'payment_failed' as type,
          o.organization_name as organization,
          p.created_at as timestamp,
          p.amount,
          p.payment_type,
          p.payment_status,
          p.tx_hash,
          NULL::varchar as job_name,
          CASE
            WHEN p.payment_status = 'failed' THEN 'PAYMENT PROCESSING FAILED'
            WHEN p.payment_status = 'cancelled' THEN 'PAYMENT CANCELLED BY ORGANIZATION'
            ELSE 'UNKNOWN ERROR'
          END as details,
          'critical' as priority
        FROM payments p
        JOIN organizations o ON p.organization_id = o.id
        WHERE p.employee_id = $1 AND p.payment_status IN ('failed', 'cancelled')
        ORDER BY p.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Channel Assignments (Channel Created for Worker)
        SELECT
          'channel_assigned' as type,
          o.organization_name as organization,
          pc.created_at as timestamp,
          pc.escrow_funded_amount as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          NULL::varchar as tx_hash,
          pc.job_name,
          NULL::varchar as details,
          'notification' as priority
        FROM payment_channels pc
        JOIN organizations o ON pc.organization_id = o.id
        WHERE pc.employee_id = $1
        ORDER BY pc.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Channel Closed Events (Phase 1 + Phase 2)
        SELECT
          'channel_closed' as type,
          o.organization_name as organization,
          pc.closed_at as timestamp,
          pc.off_chain_accumulated_balance as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          pc.closure_tx_hash as tx_hash,
          pc.job_name,
          NULL::varchar as details,
          'normal' as priority
        FROM payment_channels pc
        JOIN organizations o ON pc.organization_id = o.id
        WHERE pc.employee_id = $1 AND pc.closed_at IS NOT NULL
        ORDER BY pc.closed_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Channel Expiring Soon (Phase 3: Warning)
        SELECT
          'channel_expiring' as type,
          o.organization_name as organization,
          pc.expiration_time as timestamp,
          pc.off_chain_accumulated_balance as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          NULL::varchar as tx_hash,
          pc.job_name,
          'YOU CAN FINALIZE CLOSURE TO RECEIVE YOUR BALANCE' as details,
          'warning' as priority
        FROM payment_channels pc
        JOIN organizations o ON pc.organization_id = o.id
        WHERE pc.employee_id = $1
          AND pc.status = 'closing'
          AND pc.expiration_time IS NOT NULL
          AND pc.expiration_time <= NOW() + INTERVAL '24 hours'
        ORDER BY pc.expiration_time DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Worker Notifications (closure requests, system alerts)
        SELECT
          CONCAT('notification_', wn.type) as type,
          COALESCE(o.organization_name, 'SYSTEM') as organization,
          wn.created_at as timestamp,
          NULL::numeric as amount,
          NULL::varchar as payment_type,
          NULL::varchar as payment_status,
          wn.closure_tx_hash as tx_hash,
          wn.job_name,
          wn.message as details,
          CASE
            WHEN wn.type = 'closure_request' THEN 'notification'
            WHEN wn.type = 'error' THEN 'critical'
            WHEN wn.type = 'warning' THEN 'warning'
            ELSE 'notification'
          END as priority
        FROM worker_notifications wn
        LEFT JOIN organizations o ON wn.ngo_wallet_address = o.escrow_wallet_address
        WHERE wn.worker_wallet_address = $2
        ORDER BY wn.created_at DESC
        LIMIT 5
      )
      ORDER BY timestamp DESC
      LIMIT 20`,
      [employeeId, walletAddress]
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
      let actionDetails = a.details

      switch (a.type) {
        case 'clock_in':
          action = 'CLOCKED IN'
          break
        case 'clock_out':
          action = 'CLOCKED OUT'
          actionDetails = a.amount ? `WORKED ${parseFloat(a.amount).toFixed(2)} HOURS` : null
          break
        case 'payment_received':
          action = 'PAYMENT RECEIVED'
          actionDetails = a.payment_type ? `TYPE: ${a.payment_type.toUpperCase()}` : null
          break
        case 'payment_failed':
          action = '⚠️ PAYMENT FAILED'
          break
        case 'channel_assigned':
          action = `📋 CHANNEL ASSIGNED${a.job_name ? ': ' + a.job_name.toUpperCase() : ''}`
          actionDetails = 'NEW JOB AVAILABLE'
          break
        case 'channel_closed':
          action = `CHANNEL CLOSED${a.job_name ? ': ' + a.job_name.toUpperCase() : ''}`
          actionDetails = a.tx_hash ? `TX: ${a.tx_hash.substring(0, 8)}...` : 'FINAL PAYOUT RECEIVED'
          break
        case 'channel_expiring':
          action = `⏰ CHANNEL READY TO CLOSE${a.job_name ? ': ' + a.job_name.toUpperCase() : ''}`
          break
        case 'notification_closure_request':
          action = '🔔 CLOSURE REQUEST FROM ORGANIZATION'
          break
        case 'notification_error':
          action = '🚨 SYSTEM ERROR'
          break
        case 'notification_warning':
          action = '⚠️ SYSTEM WARNING'
          break
        default:
          action = a.type.toUpperCase().replace(/_/g, ' ')
      }

      return {
        organization: a.organization,
        action,
        actionDetails,
        amount: a.amount && !a.type.includes('clock') ? `${parseFloat(a.amount).toFixed(2)} XAH` : null,
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
    console.error('[WORKER_ACTIVITY_ERROR]', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO FETCH WORKER ACTIVITY' }
    })
  }
})

/**
 * POST /api/workers/reassociate-records
 * Re-associate orphaned employee records with new user account
 * This restores complete work history when worker re-signs up with same wallet
 */
router.post('/reassociate-records', async (req, res) => {
  try {
    const { walletAddress, newUserId } = req.body

    // Validate required fields
    if (!walletAddress || !newUserId) {
      return res.status(400).json({
        success: false,
        error: 'WALLET ADDRESS AND USER ID REQUIRED'
      })
    }

    // Verify user exists and is not deleted
    const userCheck = await query(`
      SELECT id, user_type, deleted_at
      FROM users
      WHERE id = $1
    `, [newUserId])

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'USER ACCOUNT NOT FOUND'
      })
    }

    if (userCheck.rows[0].deleted_at !== null) {
      return res.status(400).json({
        success: false,
        error: 'USER_DELETED',
        message: 'CANNOT RE-ASSOCIATE TO DELETED ACCOUNT'
      })
    }

    // Verify user is an employee (not NGO/employer)
    if (userCheck.rows[0].user_type !== 'employee') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_USER_TYPE',
        message: 'CAN ONLY RE-ASSOCIATE TO EMPLOYEE ACCOUNTS'
      })
    }

    // Verify wallet address matches user
    const walletCheck = await query(`
      SELECT id
      FROM users
      WHERE id = $1 AND wallet_address = $2
    `, [newUserId, walletAddress])

    if (walletCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'WALLET_MISMATCH',
        message: 'WALLET ADDRESS DOES NOT MATCH USER ACCOUNT'
      })
    }

    // Check if there are any orphaned records to re-associate
    const orphanedCheck = await query(`
      SELECT COUNT(*) as count
      FROM employees
      WHERE employee_wallet_address = $1
    `, [walletAddress])

    const orphanedCount = parseInt(orphanedCheck.rows[0]?.count || 0)

    if (orphanedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'NO_ORPHANED_RECORDS',
        message: 'NO ORPHANED RECORDS FOUND FOR THIS WALLET ADDRESS'
      })
    }

    // Start transaction
    await query('BEGIN')

    try {
      // Re-associate employee records
      // Note: employee_wallet_address should already match, but we update user_id
      // if that column exists in future schema updates
      let recordsUpdated = 0

      // Update work_sessions if they have user_id reference
      const workSessionUpdate = await query(`
        UPDATE work_sessions
        SET user_id = $1
        WHERE employee_wallet_address = $2
        AND (user_id IS NULL OR user_id != $1)
        RETURNING id
      `, [newUserId, walletAddress])

      recordsUpdated += workSessionUpdate.rowCount || 0

      // Update employees table if needed
      // Note: employees table uses employee_wallet_address as primary link,
      // so no update needed unless we add user_id column in future

      // Log re-association event
      await query(`
        INSERT INTO deletion_logs (
          wallet_address,
          user_type,
          deleted_by,
          deletion_reason,
          restored_at
        ) VALUES ($1, 'employee', 'system', 'Records re-associated on re-signup', CURRENT_TIMESTAMP)
      `, [walletAddress])

      // Commit transaction
      await query('COMMIT')

      res.json({
        success: true,
        message: 'RECORDS RE-ASSOCIATED SUCCESSFULLY',
        recordsReassociated: orphanedCount
      })
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  } catch (error) {
    console.error('Error re-associating records:', error)
    res.status(500).json({
      success: false,
      error: 'REASSOCIATION_FAILED',
      message: 'FAILED TO RE-ASSOCIATE RECORDS. PLEASE TRY AGAIN.',
      details: error.message
    })
  }
})

module.exports = router
