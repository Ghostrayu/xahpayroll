const express = require('express')
const router = express.Router()
const { query } = require('../database/db')

/**
 * POST /api/work-sessions/clock-in
 * Start a new work session for a specific payment channel
 *
 * Request body:
 * - workerWalletAddress: Worker's XRPL wallet address
 * - paymentChannelId: ID of the payment channel to clock into
 * - notes: Optional notes for the session
 *
 * Returns: Created work session with timer details
 */
router.post('/clock-in', async (req, res) => {
  try {
    const { workerWalletAddress, paymentChannelId, notes } = req.body

    // Validate required fields
    if (!workerWalletAddress || !paymentChannelId) {
      return res.status(400).json({
        success: false,
        error: { message: 'WORKER WALLET ADDRESS AND PAYMENT CHANNEL ID REQUIRED' }
      })
    }

    // Get payment channel details with max_daily_hours
    const channelResult = await query(
      `SELECT pc.*, e.id as employee_id, e.employee_wallet_address, o.organization_name
       FROM payment_channels pc
       JOIN employees e ON pc.employee_id = e.id
       JOIN organizations o ON pc.organization_id = o.id
       WHERE pc.id = $1 AND pc.status = 'active'`,
      [paymentChannelId]
    )

    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'PAYMENT CHANNEL NOT FOUND OR INACTIVE' }
      })
    }

    const channel = channelResult.rows[0]

    // Verify worker wallet matches payment channel employee
    if (channel.employee_wallet_address !== workerWalletAddress) {
      return res.status(403).json({
        success: false,
        error: { message: 'WORKER WALLET ADDRESS DOES NOT MATCH PAYMENT CHANNEL EMPLOYEE' }
      })
    }

    // Check for existing active session for this payment channel
    const existingSessionResult = await query(
      `SELECT * FROM work_sessions
       WHERE employee_id = $1
         AND payment_channel_id = $2
         AND session_status = 'active'`,
      [channel.employee_id, paymentChannelId]
    )

    if (existingSessionResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'ALREADY CLOCKED IN TO THIS PAYMENT CHANNEL' }
      })
    }

    // Check if worker has reached max daily hours for today
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const hoursWorkedTodayResult = await query(
      `SELECT COALESCE(SUM(hours_worked), 0) as total_hours
       FROM work_sessions
       WHERE employee_id = $1
         AND payment_channel_id = $2
         AND clock_in >= $3
         AND session_status IN ('completed', 'active')`,
      [channel.employee_id, paymentChannelId, today]
    )

    const hoursWorkedToday = parseFloat(hoursWorkedTodayResult.rows[0].total_hours) || 0
    const maxDailyHours = parseFloat(channel.max_daily_hours) || 8.00

    if (hoursWorkedToday >= maxDailyHours) {
      return res.status(400).json({
        success: false,
        error: {
          message: `MAXIMUM DAILY HOURS EXCEEDED. YOU HAVE ALREADY WORKED ${hoursWorkedToday.toFixed(2)} OF ${maxDailyHours.toFixed(2)} HOURS TODAY.`
        }
      })
    }

    // Verify payment channel has sufficient escrow balance (minimum 1 hour)
    const minimumBalance = parseFloat(channel.hourly_rate)
    const availableBalance = parseFloat(channel.escrow_funded_amount) - parseFloat(channel.accumulated_balance)

    if (availableBalance < minimumBalance) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'INSUFFICIENT ESCROW BALANCE IN PAYMENT CHANNEL. CONTACT EMPLOYER.',
          details: `Minimum required: ${minimumBalance.toFixed(2)} XAH, Available: ${availableBalance.toFixed(2)} XAH`
        }
      })
    }

    // Create work session
    const workSessionResult = await query(
      `INSERT INTO work_sessions (
        employee_id,
        organization_id,
        payment_channel_id,
        clock_in,
        hourly_rate,
        session_status,
        notes
      ) VALUES ($1, $2, $3, NOW(), $4, 'active', $5)
      RETURNING *`,
      [
        channel.employee_id,
        channel.organization_id,
        paymentChannelId,
        channel.hourly_rate,
        notes || null
      ]
    )

    const workSession = workSessionResult.rows[0]

    res.status(201).json({
      success: true,
      workSession: {
        id: workSession.id,
        paymentChannelId: workSession.payment_channel_id,
        employeeId: workSession.employee_id,
        organizationId: workSession.organization_id,
        clockIn: workSession.clock_in,
        clockOut: workSession.clock_out,
        hoursWorked: workSession.hours_worked,
        hourlyRate: parseFloat(workSession.hourly_rate),
        totalAmount: workSession.total_amount,
        sessionStatus: workSession.session_status,
        maxDailyHours: maxDailyHours,
        hoursWorkedToday: hoursWorkedToday,
        createdAt: workSession.created_at
      },
      message: 'CLOCKED IN SUCCESSFULLY'
    })
  } catch (error) {
    console.error('Error clocking in:', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO CLOCK IN', details: error.message }
    })
  }
})

/**
 * POST /api/work-sessions/clock-out
 * End an active work session and calculate earnings
 *
 * Request body:
 * - workerWalletAddress: Worker's XRPL wallet address
 * - workSessionId: ID of the work session to clock out
 * - notes: Optional notes for the session
 *
 * Returns: Completed work session with earnings
 */
router.post('/clock-out', async (req, res) => {
  try {
    const { workerWalletAddress, workSessionId, notes } = req.body

    // Validate required fields
    if (!workerWalletAddress || !workSessionId) {
      return res.status(400).json({
        success: false,
        error: { message: 'WORKER WALLET ADDRESS AND WORK SESSION ID REQUIRED' }
      })
    }

    // Get work session details
    const sessionResult = await query(
      `SELECT ws.*, e.employee_wallet_address, pc.hourly_rate, pc.id as payment_channel_id
       FROM work_sessions ws
       JOIN employees e ON ws.employee_id = e.id
       JOIN payment_channels pc ON ws.payment_channel_id = pc.id
       WHERE ws.id = $1`,
      [workSessionId]
    )

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'WORK SESSION NOT FOUND' }
      })
    }

    const session = sessionResult.rows[0]

    // Verify worker wallet matches session employee
    if (session.employee_wallet_address !== workerWalletAddress) {
      return res.status(403).json({
        success: false,
        error: { message: 'WORKER WALLET ADDRESS DOES NOT MATCH SESSION EMPLOYEE' }
      })
    }

    // Verify session is active
    if (session.session_status !== 'active') {
      return res.status(400).json({
        success: false,
        error: { message: `WORK SESSION ALREADY ${session.session_status.toUpperCase()}` }
      })
    }

    // Calculate hours worked and earnings
    const clockInTime = new Date(session.clock_in)
    const clockOutTime = new Date()
    const elapsedSeconds = Math.floor((clockOutTime - clockInTime) / 1000)
    const hoursWorked = elapsedSeconds / 3600
    const totalAmount = hoursWorked * parseFloat(session.hourly_rate)

    // Begin transaction: Update work session AND payment channel
    await query('BEGIN')

    try {
      // Update work session
      const updateSessionResult = await query(
        `UPDATE work_sessions
         SET clock_out = $1,
             hours_worked = $2,
             total_amount = $3,
             session_status = 'completed',
             notes = COALESCE($4, notes),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [clockOutTime, hoursWorked, totalAmount, notes, workSessionId]
      )

      const updatedSession = updateSessionResult.rows[0]

      // Update payment channel accumulated balance and hours
      const updateChannelResult = await query(
        `UPDATE payment_channels
         SET accumulated_balance = accumulated_balance + $1,
             hours_accumulated = hours_accumulated + $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [totalAmount, hoursWorked, session.payment_channel_id]
      )

      const updatedChannel = updateChannelResult.rows[0]

      await query('COMMIT')

      res.json({
        success: true,
        workSession: {
          id: updatedSession.id,
          paymentChannelId: updatedSession.payment_channel_id,
          clockIn: updatedSession.clock_in,
          clockOut: updatedSession.clock_out,
          hoursWorked: parseFloat(updatedSession.hours_worked),
          hourlyRate: parseFloat(updatedSession.hourly_rate),
          totalAmount: parseFloat(updatedSession.total_amount),
          sessionStatus: updatedSession.session_status,
          createdAt: updatedSession.created_at,
          updatedAt: updatedSession.updated_at
        },
        paymentChannelUpdate: {
          id: updatedChannel.id,
          accumulatedBalance: parseFloat(updatedChannel.accumulated_balance),
          hoursAccumulated: parseFloat(updatedChannel.hours_accumulated)
        },
        message: `CLOCKED OUT SUCCESSFULLY. SESSION EARNINGS: ${totalAmount.toFixed(2)} XAH`
      })
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  } catch (error) {
    console.error('Error clocking out:', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO CLOCK OUT', details: error.message }
    })
  }
})

/**
 * GET /api/work-sessions/active?workerWalletAddress=rN7n7...
 * Get all active work sessions for a worker (for timer restoration on page load)
 *
 * Query params:
 * - workerWalletAddress: Worker's XRPL wallet address
 *
 * Returns: Array of active sessions with pre-calculated elapsed time and earnings
 */
router.get('/active', async (req, res) => {
  try {
    const { workerWalletAddress } = req.query

    if (!workerWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'WORKER WALLET ADDRESS REQUIRED' }
      })
    }

    // Get all active work sessions for the worker with payment channel details
    const sessionsResult = await query(
      `SELECT
        ws.*,
        pc.id as payment_channel_id,
        pc.job_name,
        pc.hourly_rate as channel_hourly_rate,
        pc.max_daily_hours,
        pc.escrow_funded_amount,
        pc.accumulated_balance,
        o.organization_name,
        EXTRACT(EPOCH FROM (NOW() - ws.clock_in)) as elapsed_seconds
       FROM work_sessions ws
       JOIN employees e ON ws.employee_id = e.id
       JOIN payment_channels pc ON ws.payment_channel_id = pc.id
       JOIN organizations o ON ws.organization_id = o.id
       WHERE e.employee_wallet_address = $1
         AND ws.session_status = 'active'
       ORDER BY ws.clock_in DESC`,
      [workerWalletAddress]
    )

    const activeSessions = sessionsResult.rows.map(session => {
      const elapsedSeconds = Math.floor(parseFloat(session.elapsed_seconds) || 0)
      const elapsedHours = elapsedSeconds / 3600
      const currentEarnings = elapsedHours * parseFloat(session.hourly_rate)

      return {
        id: session.id,
        paymentChannelId: session.payment_channel_id,
        paymentChannel: {
          id: session.payment_channel_id,
          jobName: session.job_name,
          organizationName: session.organization_name,
          hourlyRate: parseFloat(session.channel_hourly_rate),
          maxDailyHours: parseFloat(session.max_daily_hours),
          escrowFundedAmount: parseFloat(session.escrow_funded_amount),
          accumulatedBalance: parseFloat(session.accumulated_balance)
        },
        clockIn: session.clock_in,
        hourlyRate: parseFloat(session.hourly_rate),
        sessionStatus: session.session_status,
        elapsedSeconds,
        currentEarnings: parseFloat(currentEarnings.toFixed(8))
      }
    })

    res.json({
      success: true,
      activeSessions
    })
  } catch (error) {
    console.error('Error fetching active sessions:', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO FETCH ACTIVE SESSIONS', details: error.message }
    })
  }
})

/**
 * GET /api/work-sessions/ngo-active?organizationWalletAddress=rN7n7...
 * Get all active work sessions for an NGO's payment channels (for NGO dashboard)
 *
 * Query params:
 * - organizationWalletAddress: NGO/employer's XRPL wallet address
 *
 * Returns: Array of active sessions with worker details and summary statistics
 */
router.get('/ngo-active', async (req, res) => {
  try {
    const { organizationWalletAddress } = req.query

    if (!organizationWalletAddress) {
      return res.status(400).json({
        success: false,
        error: { message: 'ORGANIZATION WALLET ADDRESS REQUIRED' }
      })
    }

    // Get organization ID from wallet address
    const orgResult = await query(
      `SELECT id FROM organizations WHERE escrow_wallet_address = $1`,
      [organizationWalletAddress]
    )

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'ORGANIZATION NOT FOUND' }
      })
    }

    const organizationId = orgResult.rows[0].id

    // Get all active work sessions for the organization with worker details
    const sessionsResult = await query(
      `SELECT
        ws.*,
        e.full_name as worker_name,
        e.employee_wallet_address as worker_wallet,
        pc.id as payment_channel_id,
        pc.job_name,
        pc.hourly_rate as channel_hourly_rate,
        EXTRACT(EPOCH FROM (NOW() - ws.clock_in)) as elapsed_seconds
       FROM work_sessions ws
       JOIN employees e ON ws.employee_id = e.id
       JOIN payment_channels pc ON ws.payment_channel_id = pc.id
       WHERE ws.organization_id = $1
         AND ws.session_status = 'active'
       ORDER BY ws.clock_in ASC`,
      [organizationId]
    )

    const activeSessions = sessionsResult.rows.map(session => {
      const elapsedSeconds = Math.floor(parseFloat(session.elapsed_seconds) || 0)
      const elapsedHours = elapsedSeconds / 3600
      const currentEarnings = elapsedHours * parseFloat(session.hourly_rate)

      // Format elapsed time as "2h 35m"
      const hours = Math.floor(elapsedSeconds / 3600)
      const minutes = Math.floor((elapsedSeconds % 3600) / 60)
      const elapsedFormatted = `${hours}h ${minutes}m`

      return {
        id: session.id,
        worker: {
          walletAddress: session.worker_wallet,
          fullName: session.worker_name
        },
        paymentChannel: {
          id: session.payment_channel_id,
          jobName: session.job_name,
          hourlyRate: parseFloat(session.channel_hourly_rate)
        },
        clockIn: session.clock_in,
        elapsedSeconds,
        elapsedFormatted,
        currentEarnings: parseFloat(currentEarnings.toFixed(8)),
        sessionStatus: session.session_status
      }
    })

    // Calculate summary statistics
    const summary = {
      totalActiveWorkers: activeSessions.length,
      totalActiveHours: activeSessions.reduce((sum, s) => sum + (s.elapsedSeconds / 3600), 0),
      totalCurrentEarnings: activeSessions.reduce((sum, s) => sum + s.currentEarnings, 0)
    }

    res.json({
      success: true,
      activeSessions,
      summary: {
        totalActiveWorkers: summary.totalActiveWorkers,
        totalActiveHours: parseFloat(summary.totalActiveHours.toFixed(2)),
        totalCurrentEarnings: parseFloat(summary.totalCurrentEarnings.toFixed(8))
      }
    })
  } catch (error) {
    console.error('Error fetching NGO active sessions:', error)
    res.status(500).json({
      success: false,
      error: { message: 'FAILED TO FETCH NGO ACTIVE SESSIONS', details: error.message }
    })
  }
})

module.exports = router
