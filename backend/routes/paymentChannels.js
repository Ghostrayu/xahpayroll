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
        error: { message: 'Missing required fields' }
      })
    }

    // Get organization
    const orgResult = await query(
      'SELECT * FROM organizations WHERE escrow_wallet_address = $1',
      [organizationWalletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Organization not found' }
      })
    }

    const organization = orgResult.rows[0]

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
        error: { message: 'Active payment channel already exists for this worker' }
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
      error: { message: 'Failed to create payment channel', details: error.message }
    })
  }
})

/**
 * POST /api/payment-channels/:channelId/close
 * Close a payment channel
 */
router.post('/:channelId/close', async (req, res) => {
  try {
    const { channelId } = req.params
    const { organizationWalletAddress } = req.body

    // Get organization
    const orgResult = await query(
      'SELECT * FROM organizations WHERE escrow_wallet_address = $1',
      [organizationWalletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Organization not found' }
      })
    }

    const organization = orgResult.rows[0]

    // Update channel status
    const updateResult = await query(
      `UPDATE payment_channels 
       SET status = 'closed', updated_at = NOW()
       WHERE channel_id = $1 AND organization_id = $2
       RETURNING *`,
      [channelId, organization.id]
    )

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Payment channel not found' }
      })
    }

    res.json({
      success: true,
      data: { channel: updateResult.rows[0] }
    })
  } catch (error) {
    console.error('Error closing payment channel:', error)
    res.status(500).json({
      success: false,
      error: { message: 'Failed to close payment channel', details: error.message }
    })
  }
})

module.exports = router
