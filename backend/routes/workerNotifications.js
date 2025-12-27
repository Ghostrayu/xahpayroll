/**
 * Worker Notifications API Routes
 * Handles worker notification management and closure request approvals
 */

const express = require('express')
const router = express.Router()
const { query } = require('../database/db')

/**
 * GET /api/worker-notifications/:walletAddress
 * Fetch all notifications for a worker
 */
router.get('/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params
    const { unreadOnly } = req.query

    console.log('[WORKER_NOTIFICATIONS_FETCH]', {
      walletAddress,
      unreadOnly: unreadOnly === 'true'
    })

    let sql = `
      SELECT
        id,
        worker_wallet_address as "workerWalletAddress",
        type,
        channel_id as "channelId",
        message,
        is_read as "isRead",
        created_at as "createdAt",
        read_at as "readAt",
        closure_approved as "closureApproved",
        closure_approved_at as "closureApprovedAt",
        closure_tx_hash as "closureTxHash",
        ngo_wallet_address as "ngoWalletAddress",
        job_name as "jobName"
      FROM worker_notifications
      WHERE worker_wallet_address = $1
    `

    const params = [walletAddress]

    if (unreadOnly === 'true') {
      sql += ' AND is_read = FALSE'
    }

    sql += ' ORDER BY created_at DESC LIMIT 50'

    const result = await query(sql, params)

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        unreadCount: result.rows.filter(n => !n.isRead).length
      }
    })
  } catch (error) {
    console.error('[WORKER_NOTIFICATIONS_FETCH_ERROR]', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO FETCH WORKER NOTIFICATIONS' }
    })
  }
})

/**
 * PUT /api/worker-notifications/:id/read
 * Mark a notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params
    const { walletAddress } = req.body

    console.log('[WORKER_NOTIFICATION_MARK_READ]', { id, walletAddress })

    // Verify notification belongs to this worker
    const verifyResult = await query(
      'SELECT worker_wallet_address FROM worker_notifications WHERE id = $1',
      [id]
    )

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'NOTIFICATION NOT FOUND' }
      })
    }

    if (verifyResult.rows[0].worker_wallet_address !== walletAddress) {
      return res.status(403).json({
        success: false,
        error: { message: 'UNAUTHORIZED: NOTIFICATION BELONGS TO DIFFERENT WORKER' }
      })
    }

    // Mark as read
    const result = await query(
      `UPDATE worker_notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    )

    res.json({
      success: true,
      data: { notification: result.rows[0] }
    })
  } catch (error) {
    console.error('[WORKER_NOTIFICATION_MARK_READ_ERROR]', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO MARK NOTIFICATION AS READ' }
    })
  }
})

/**
 * POST /api/worker-notifications/:id/approve-closure
 * Worker approves closure request and initiates channel closure
 */
router.post('/:id/approve-closure', async (req, res) => {
  try {
    const { id } = req.params
    const { walletAddress } = req.body

    console.log('[WORKER_APPROVE_CLOSURE]', { notificationId: id, walletAddress })

    // Fetch notification details
    const notificationResult = await query(
      `SELECT * FROM worker_notifications WHERE id = $1`,
      [id]
    )

    if (notificationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'NOTIFICATION NOT FOUND' }
      })
    }

    const notification = notificationResult.rows[0]

    // Verify worker authorization
    if (notification.worker_wallet_address !== walletAddress) {
      return res.status(403).json({
        success: false,
        error: { message: 'UNAUTHORIZED: NOTIFICATION BELONGS TO DIFFERENT WORKER' }
      })
    }

    // Verify notification type
    if (notification.type !== 'closure_request') {
      return res.status(400).json({
        success: false,
        error: { message: 'INVALID NOTIFICATION TYPE: MUST BE closure_request' }
      })
    }

    // Check if already approved
    if (notification.closure_approved) {
      return res.status(400).json({
        success: false,
        error: { message: 'CLOSURE REQUEST ALREADY APPROVED' }
      })
    }

    // Fetch channel details for closure transaction
    const channelResult = await query(
      `SELECT
        pc.*,
        e.employee_wallet_address,
        o.escrow_wallet_address,
        o.organization_name
       FROM payment_channels pc
       JOIN employees e ON pc.employee_id = e.id
       JOIN organizations o ON pc.organization_id = o.id
       WHERE pc.channel_id = $1`,
      [notification.channel_id]
    )

    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'PAYMENT CHANNEL NOT FOUND' }
      })
    }

    const channel = channelResult.rows[0]

    // Verify channel is still active
    if (channel.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: { message: `CHANNEL STATUS IS ${channel.status.toUpperCase()}, MUST BE ACTIVE` }
      })
    }

    // Mark notification as approved (worker will close via their dashboard)
    await query(
      `UPDATE worker_notifications
       SET
         closure_approved = TRUE,
         closure_approved_at = NOW(),
         is_read = TRUE,
         read_at = NOW()
       WHERE id = $1`,
      [id]
    )

    // Return channel details for frontend to initiate closure transaction
    res.json({
      success: true,
      data: {
        channelId: channel.channel_id,
        balance: channel.off_chain_accumulated_balance,
        escrowBalance: parseFloat(channel.funded_amount) - parseFloat(channel.off_chain_accumulated_balance),
        jobName: channel.job_name,
        organizationName: channel.organization_name,
        message: 'CLOSURE REQUEST APPROVED. PLEASE PROCEED TO CLOSE THE CHANNEL.'
      }
    })
  } catch (error) {
    console.error('[WORKER_APPROVE_CLOSURE_ERROR]', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO APPROVE CLOSURE REQUEST' }
    })
  }
})

/**
 * GET /api/worker-notifications/unread-count/:walletAddress
 * Get count of unread notifications for badge display
 */
router.get('/unread-count/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    const result = await query(
      `SELECT COUNT(*) as count
       FROM worker_notifications
       WHERE worker_wallet_address = $1 AND is_read = FALSE`,
      [walletAddress]
    )

    res.json({
      success: true,
      data: {
        unreadCount: parseInt(result.rows[0].count)
      }
    })
  } catch (error) {
    console.error('[WORKER_NOTIFICATION_UNREAD_COUNT_ERROR]', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO GET UNREAD COUNT' }
    })
  }
})

/**
 * DELETE /api/worker-notifications/clear-read/:walletAddress
 * Delete all READ notifications for a worker
 * Only deletes notifications where is_read = TRUE
 * Unread notifications are preserved
 */
router.delete('/clear-read/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    console.log('[WORKER_NOTIFICATIONS_CLEAR_READ]', { walletAddress })

    // Delete only read notifications
    const result = await query(
      `DELETE FROM worker_notifications
       WHERE worker_wallet_address = $1
       AND is_read = TRUE
       RETURNING id`,
      [walletAddress]
    )

    const deletedCount = result.rows.length

    console.log('[WORKER_NOTIFICATIONS_CLEAR_READ_SUCCESS]', {
      walletAddress,
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
    console.error('[WORKER_NOTIFICATIONS_CLEAR_READ_ERROR]', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO CLEAR READ NOTIFICATIONS' }
    })
  }
})

module.exports = router
