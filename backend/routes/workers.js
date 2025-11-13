const express = require('express')
const router = express.Router()
const { query } = require('../database/db')

/**
 * POST /api/workers/add
 * Add a worker to an organization
 * Allows same worker wallet to be associated with multiple organizations
 */
router.post('/add', async (req, res) => {
  try {
    const { name, walletAddress, ngoWalletAddress } = req.body

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
          error: { message: 'Organization not found. Please ensure you are signed in as an NGO/Employer.' }
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

    // Add worker to organization (hourly_rate is required in schema, set default to 0)
    const result = await query(
      `INSERT INTO employees (
        organization_id,
        full_name,
        employee_wallet_address,
        hourly_rate,
        employment_status
      ) VALUES ($1, $2, $3, $4, 'active')
      RETURNING *`,
      [organizationId, name, walletAddress, 0]  // Default hourly_rate to 0, will be set when creating payment channel
    )

    const worker = result.rows[0]

    // Also create a user record if it doesn't exist
    const existingUser = await query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress]
    )

    if (existingUser.rows.length === 0) {
      await query(
        `INSERT INTO users (
          wallet_address,
          display_name,
          user_type
        ) VALUES ($1, $2, 'employee')
        ON CONFLICT (wallet_address) DO NOTHING`,
        [walletAddress, name]
      )
    }

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
 * GET /api/workers/list/:ngoWalletAddress
 * Get all workers for an organization
 */
router.get('/list/:ngoWalletAddress', async (req, res) => {
  try {
    const { ngoWalletAddress } = req.params

    // Get organization
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
    const activeChannels = await query(`
      SELECT
        pc.*,
        o.organization_name
      FROM payment_channels pc
      JOIN organizations o ON pc.organization_id = o.id
      WHERE pc.employee_wallet_address = $1
      AND (
        pc.status = 'active'
        OR pc.status = 'timeout'
        OR pc.closure_tx_hash IS NULL
      )
    `, [walletAddress])

    // Check for unpaid balances
    const unpaidBalances = await query(`
      SELECT SUM(unpaid_balance) as total
      FROM payment_channels
      WHERE employee_wallet_address = $1
    `, [walletAddress])

    const totalUnpaid = unpaidBalances.rows[0]?.total || 0

    // Build blocking reasons
    const blockingReasons = []

    for (const channel of activeChannels.rows) {
      blockingReasons.push({
        type: channel.unpaid_balance > 0 ? 'active_channel' : 'unclosed_channel',
        organization: channel.organization_name,
        channelId: channel.id,
        unpaidBalance: parseFloat(channel.unpaid_balance || 0),
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
      LEFT JOIN payment_channels pc ON pc.employee_wallet_address = e.employee_wallet_address
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

    // Validate confirmation text
    if (confirmationText !== 'DELETE MY ACCOUNT') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONFIRMATION',
        message: 'CONFIRMATION TEXT MUST BE "DELETE MY ACCOUNT"'
      })
    }

    // Check deletion eligibility
    const eligibility = await query(`
      SELECT
        COUNT(*) as blocking_count
      FROM payment_channels pc
      WHERE pc.employee_wallet_address = $1
      AND (
        pc.status = 'active'
        OR pc.unpaid_balance > 0
        OR pc.closure_tx_hash IS NULL
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

    // Get user info
    const userInfo = await query(`
      SELECT name, display_name
      FROM users
      WHERE wallet_address = $1
    `, [walletAddress])

    const userName = userInfo.rows[0]?.name || userInfo.rows[0]?.display_name || walletAddress

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

    // TODO: Implement PDF generation
    // For now, return placeholder
    res.status(501).json({
      success: false,
      error: 'NOT_IMPLEMENTED',
      message: 'PDF EXPORT FEATURE COMING SOON'
    })
  } catch (error) {
    console.error('Error exporting data:', error)
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: 'FAILED TO EXPORT DATA. PLEASE TRY AGAIN.',
      details: error.message
    })
  }
})

module.exports = router
