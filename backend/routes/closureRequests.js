const express = require('express')
const router = express.Router()
const { pool } = require('../database/db')

/**
 * POST /api/closure-requests/create
 * Worker creates a channel closure request
 *
 * ARCHITECTURAL CHANGE (2026-01-16):
 * Workers can NO LONGER directly close payment channels.
 * Instead, they submit closure requests that NGOs must approve.
 *
 * This solves the temBAD_SIGNATURE error that occurred when workers
 * tried to close channels with accumulated balances (requires NGO signature).
 */
router.post('/create', async (req, res) => {
  const {
    channelId,
    workerWalletAddress,
    workerName,
    requestMessage
  } = req.body

  try {
    console.log('[CLOSURE_REQUEST_CREATE] Worker requesting closure', {
      channelId,
      workerWalletAddress
    })

    // Step 1: Validate channel exists and belongs to worker
    const channelQuery = await pool.query(
      `SELECT
        pc.id,
        pc.channel_id,
        pc.employee_wallet_address,
        pc.ngo_wallet_address,
        pc.organization_id,
        pc.off_chain_accumulated_balance,
        pc.escrow_funded_amount,
        pc.job_title,
        pc.status
       FROM payment_channels pc
       WHERE pc.channel_id = $1`,
      [channelId]
    )

    if (channelQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CHANNEL_NOT_FOUND',
          message: 'PAYMENT CHANNEL NOT FOUND'
        }
      })
    }

    const channel = channelQuery.rows[0]

    // Step 2: Verify worker owns this channel
    if (channel.employee_wallet_address !== workerWalletAddress) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'YOU ARE NOT THE WORKER FOR THIS CHANNEL'
        }
      })
    }

    // Step 3: Verify channel is active (not already closed or closing)
    if (channel.status === 'closed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CHANNEL_ALREADY_CLOSED',
          message: 'THIS CHANNEL IS ALREADY CLOSED'
        }
      })
    }

    // Step 4: Check if there's already a pending request for this channel
    const existingRequestQuery = await pool.query(
      `SELECT id FROM channel_closure_requests
       WHERE channel_id = $1 AND status = 'pending'`,
      [channelId]
    )

    if (existingRequestQuery.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'REQUEST_ALREADY_EXISTS',
          message: 'A CLOSURE REQUEST IS ALREADY PENDING FOR THIS CHANNEL'
        }
      })
    }

    // Step 5: Create closure request
    const insertQuery = await pool.query(
      `INSERT INTO channel_closure_requests (
        channel_id,
        requester_wallet_address,
        requester_name,
        ngo_wallet_address,
        organization_id,
        accumulated_balance,
        escrow_amount,
        job_title,
        request_message,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING id, created_at`,
      [
        channelId,
        workerWalletAddress,
        workerName,
        channel.ngo_wallet_address,
        channel.organization_id,
        channel.off_chain_accumulated_balance,
        channel.escrow_funded_amount,
        channel.job_title,
        requestMessage
      ]
    )

    const request = insertQuery.rows[0]

    console.log('[CLOSURE_REQUEST_CREATED] Request ID:', request.id)

    // Note: NGO notification is automatically created via database trigger
    // See migrations/005_channel_closure_requests.sql notify_ngo_on_closure_request()

    res.json({
      success: true,
      data: {
        requestId: request.id,
        channelId,
        status: 'pending',
        createdAt: request.created_at,
        message: 'CLOSURE REQUEST SUBMITTED SUCCESSFULLY. NGO HAS BEEN NOTIFIED.'
      }
    })
  } catch (error) {
    console.error('[CLOSURE_REQUEST_CREATE_ERROR]', error)
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'FAILED TO CREATE CLOSURE REQUEST',
        details: error.message
      }
    })
  }
})

/**
 * GET /api/closure-requests/ngo/:ngoWalletAddress
 * Get all pending closure requests for an NGO
 */
router.get('/ngo/:ngoWalletAddress', async (req, res) => {
  const { ngoWalletAddress } = req.params

  try {
    console.log('[CLOSURE_REQUESTS_NGO_FETCH] Fetching requests for NGO:', ngoWalletAddress)

    const query = await pool.query(
      `SELECT
        ccr.id as request_id,
        ccr.channel_id,
        ccr.requester_wallet_address as worker_wallet,
        ccr.requester_name as worker_name,
        ccr.accumulated_balance,
        ccr.escrow_amount,
        ccr.job_title,
        ccr.request_message,
        ccr.status,
        ccr.created_at,
        ccr.updated_at,
        pc.status as channel_status
       FROM channel_closure_requests ccr
       JOIN payment_channels pc ON pc.channel_id = ccr.channel_id
       WHERE ccr.ngo_wallet_address = $1
         AND ccr.status = 'pending'
       ORDER BY ccr.created_at DESC`,
      [ngoWalletAddress]
    )

    console.log('[CLOSURE_REQUESTS_NGO_FETCH] Found', query.rows.length, 'pending requests')

    res.json({
      success: true,
      data: {
        requests: query.rows,
        count: query.rows.length
      }
    })
  } catch (error) {
    console.error('[CLOSURE_REQUESTS_NGO_FETCH_ERROR]', error)
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'FAILED TO FETCH CLOSURE REQUESTS',
        details: error.message
      }
    })
  }
})

/**
 * GET /api/closure-requests/worker/:workerWalletAddress
 * Get closure request history for a worker
 */
router.get('/worker/:workerWalletAddress', async (req, res) => {
  const { workerWalletAddress } = req.params

  try {
    console.log('[CLOSURE_REQUESTS_WORKER_FETCH] Fetching requests for worker:', workerWalletAddress)

    const query = await pool.query(
      `SELECT
        ccr.id as request_id,
        ccr.channel_id,
        ccr.ngo_wallet_address,
        ccr.accumulated_balance,
        ccr.escrow_amount,
        ccr.job_title,
        ccr.request_message,
        ccr.status,
        ccr.created_at,
        ccr.approved_at,
        ccr.completed_at,
        ccr.rejection_reason,
        ccr.closure_tx_hash,
        pc.status as channel_status,
        o.organization_name as ngo_name
       FROM channel_closure_requests ccr
       JOIN payment_channels pc ON pc.channel_id = ccr.channel_id
       LEFT JOIN organizations o ON o.escrow_wallet_address = ccr.ngo_wallet_address
       WHERE ccr.requester_wallet_address = $1
       ORDER BY ccr.created_at DESC`,
      [workerWalletAddress]
    )

    console.log('[CLOSURE_REQUESTS_WORKER_FETCH] Found', query.rows.length, 'requests')

    res.json({
      success: true,
      data: {
        requests: query.rows,
        count: query.rows.length
      }
    })
  } catch (error) {
    console.error('[CLOSURE_REQUESTS_WORKER_FETCH_ERROR]', error)
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'FAILED TO FETCH WORKER REQUESTS',
        details: error.message
      }
    })
  }
})

/**
 * POST /api/closure-requests/:requestId/approve
 * NGO approves a closure request and executes the channel closure
 *
 * WORKFLOW:
 * 1. Validate request exists and is pending
 * 2. Mark request as approved
 * 3. Return XRPL transaction for NGO to sign
 * 4. NGO executes transaction via frontend
 * 5. Frontend calls /confirm endpoint to finalize
 */
router.post('/:requestId/approve', async (req, res) => {
  const { requestId } = req.params
  const { ngoWalletAddress } = req.body

  try {
    console.log('[CLOSURE_REQUEST_APPROVE] Approving request:', requestId)

    // Step 1: Get request details
    const requestQuery = await pool.query(
      `SELECT
        ccr.*,
        pc.channel_id,
        pc.ngo_wallet_address,
        pc.employee_wallet_address,
        pc.off_chain_accumulated_balance,
        pc.escrow_funded_amount,
        pc.status as channel_status,
        pc.public_key
       FROM channel_closure_requests ccr
       JOIN payment_channels pc ON pc.channel_id = ccr.channel_id
       WHERE ccr.id = $1`,
      [requestId]
    )

    if (requestQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REQUEST_NOT_FOUND',
          message: 'CLOSURE REQUEST NOT FOUND'
        }
      })
    }

    const request = requestQuery.rows[0]

    // Step 2: Verify NGO owns this channel
    if (request.ngo_wallet_address !== ngoWalletAddress) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'YOU ARE NOT THE NGO FOR THIS CHANNEL'
        }
      })
    }

    // Step 3: Verify request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REQUEST_NOT_PENDING',
          message: `REQUEST IS ALREADY ${request.status.toUpperCase()}`
        }
      })
    }

    // Step 4: Verify channel is still active
    if (request.channel_status === 'closed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CHANNEL_ALREADY_CLOSED',
          message: 'CHANNEL HAS ALREADY BEEN CLOSED'
        }
      })
    }

    // Step 5: Mark request as approved
    await pool.query(
      `UPDATE channel_closure_requests
       SET status = 'approved',
           approved_by = $1,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [ngoWalletAddress, requestId]
    )

    // Step 6: Build XRPL transaction for NGO to sign
    // NGO-initiated closure = simple, no PublicKey/Signature required
    const balanceInDrops = (parseFloat(request.off_chain_accumulated_balance) * 1_000_000).toFixed(0)

    const xrplTransaction = {
      TransactionType: 'PaymentChannelClaim',
      Account: ngoWalletAddress,     // NGO closes (owner of channel)
      Channel: request.channel_id,
      Balance: balanceInDrops,        // Worker's accumulated earnings
      Flags: 0x00020000               // tfClose flag
      // NO PublicKey or Signature needed - NGO is the channel owner
    }

    console.log('[CLOSURE_REQUEST_APPROVE] Request approved. Transaction ready for NGO signature.', {
      requestId,
      channelId: request.channel_id,
      workerPayment: request.off_chain_accumulated_balance
    })

    res.json({
      success: true,
      data: {
        requestId,
        channelId: request.channel_id,
        workerWallet: request.employee_wallet_address,
        workerName: request.requester_name,
        workerPayment: request.off_chain_accumulated_balance,
        xrplTransaction,
        message: 'REQUEST APPROVED. PLEASE SIGN THE TRANSACTION TO CLOSE THE CHANNEL.'
      }
    })
  } catch (error) {
    console.error('[CLOSURE_REQUEST_APPROVE_ERROR]', error)
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'FAILED TO APPROVE CLOSURE REQUEST',
        details: error.message
      }
    })
  }
})

/**
 * POST /api/closure-requests/:requestId/reject
 * NGO rejects a closure request
 */
router.post('/:requestId/reject', async (req, res) => {
  const { requestId } = req.params
  const { ngoWalletAddress, rejectionReason } = req.body

  try {
    console.log('[CLOSURE_REQUEST_REJECT] Rejecting request:', requestId)

    // Step 1: Verify request exists and NGO owns it
    const requestQuery = await pool.query(
      `SELECT ccr.*, pc.ngo_wallet_address
       FROM channel_closure_requests ccr
       JOIN payment_channels pc ON pc.channel_id = ccr.channel_id
       WHERE ccr.id = $1`,
      [requestId]
    )

    if (requestQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REQUEST_NOT_FOUND',
          message: 'CLOSURE REQUEST NOT FOUND'
        }
      })
    }

    const request = requestQuery.rows[0]

    if (request.ngo_wallet_address !== ngoWalletAddress) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'YOU ARE NOT THE NGO FOR THIS CHANNEL'
        }
      })
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REQUEST_NOT_PENDING',
          message: `REQUEST IS ALREADY ${request.status.toUpperCase()}`
        }
      })
    }

    // Step 2: Mark request as rejected
    await pool.query(
      `UPDATE channel_closure_requests
       SET status = 'rejected',
           rejection_reason = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [rejectionReason || 'NO REASON PROVIDED', requestId]
    )

    console.log('[CLOSURE_REQUEST_REJECT] Request rejected:', requestId)

    res.json({
      success: true,
      data: {
        requestId,
        status: 'rejected',
        message: 'CLOSURE REQUEST REJECTED'
      }
    })
  } catch (error) {
    console.error('[CLOSURE_REQUEST_REJECT_ERROR]', error)
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'FAILED TO REJECT CLOSURE REQUEST',
        details: error.message
      }
    })
  }
})

/**
 * POST /api/closure-requests/:requestId/confirm
 * Confirm channel closure after NGO signs transaction
 * Called by frontend after successful ledger transaction
 */
router.post('/:requestId/confirm', async (req, res) => {
  const { requestId } = req.params
  const { txHash } = req.body

  try {
    console.log('[CLOSURE_REQUEST_CONFIRM] Confirming closure:', requestId, 'TX:', txHash)

    // Step 1: Mark request as completed
    await pool.query(
      `UPDATE channel_closure_requests
       SET status = 'completed',
           closure_tx_hash = $1,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [txHash, requestId]
    )

    // Step 2: Mark channel as closed (if not already)
    // This is also done by existing paymentChannels.confirmChannelClosure endpoint
    // but we ensure consistency here

    console.log('[CLOSURE_REQUEST_CONFIRM] Closure confirmed:', requestId)

    res.json({
      success: true,
      data: {
        requestId,
        txHash,
        status: 'completed',
        message: 'CHANNEL CLOSURE CONFIRMED'
      }
    })
  } catch (error) {
    console.error('[CLOSURE_REQUEST_CONFIRM_ERROR]', error)
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'FAILED TO CONFIRM CLOSURE',
        details: error.message
      }
    })
  }
})

/**
 * DELETE /api/closure-requests/:requestId
 * Worker cancels their own pending closure request
 */
router.delete('/:requestId', async (req, res) => {
  const { requestId } = req.params
  const { workerWalletAddress } = req.query

  try {
    console.log('[CLOSURE_REQUEST_CANCEL] Worker canceling request:', requestId)

    // Step 1: Verify request exists and worker owns it
    const requestQuery = await pool.query(
      `SELECT * FROM channel_closure_requests WHERE id = $1`,
      [requestId]
    )

    if (requestQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REQUEST_NOT_FOUND',
          message: 'CLOSURE REQUEST NOT FOUND'
        }
      })
    }

    const request = requestQuery.rows[0]

    if (request.requester_wallet_address !== workerWalletAddress) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'YOU ARE NOT THE REQUESTER OF THIS CLOSURE REQUEST'
        }
      })
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REQUEST_NOT_PENDING',
          message: `CANNOT CANCEL REQUEST WITH STATUS: ${request.status.toUpperCase()}`
        }
      })
    }

    // Step 2: Mark request as cancelled
    await pool.query(
      `UPDATE channel_closure_requests
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1`,
      [requestId]
    )

    console.log('[CLOSURE_REQUEST_CANCEL] Request cancelled:', requestId)

    res.json({
      success: true,
      data: {
        requestId,
        status: 'cancelled',
        message: 'CLOSURE REQUEST CANCELLED'
      }
    })
  } catch (error) {
    console.error('[CLOSURE_REQUEST_CANCEL_ERROR]', error)
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'FAILED TO CANCEL CLOSURE REQUEST',
        details: error.message
      }
    })
  }
})

module.exports = router
