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

module.exports = router
