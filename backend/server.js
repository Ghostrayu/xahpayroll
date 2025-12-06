require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { initializeDatabase } = require('./database/db')

// Import routes
const xamanRoutes = require('./routes/xaman')
const usersRoutes = require('./routes/users')
const organizationsRoutes = require('./routes/organizations')
const paymentChannelsRoutes = require('./routes/paymentChannels')
const workersRoutes = require('./routes/workers')
const workerNotificationsRoutes = require('./routes/workerNotifications')
const workSessionsRoutes = require('./routes/workSessions')

// Import scheduled jobs
const { startHardDeleteJob } = require('./jobs/hardDelete')
const { startInactivityDeletionJob } = require('./jobs/inactivityDeletion')

const app = express()
const PORT = process.env.PORT || 3001

// Security middleware
app.use(helmet())

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Return JSON error response instead of plain text
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: 'TOO MANY REQUESTS. PLEASE TRY AGAIN LATER.',
        retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      }
    })
  }
})
app.use(limiter)

// Body parser middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Routes
app.use('/api/xaman', xamanRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/organizations', organizationsRoutes)
app.use('/api/payment-channels', paymentChannelsRoutes)
app.use('/api/workers', workersRoutes)
app.use('/api/worker-notifications', workerNotificationsRoutes)
app.use('/api/work-sessions', workSessionsRoutes)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500
    }
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404
    }
  })
})

// Start server with database initialization
const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase()

    // Start scheduled jobs
    const hardDeleteJobId = startHardDeleteJob()
    const inactivityDeleteJobId = startInactivityDeletionJob()
    console.log('⏰ Scheduled jobs initialized:')
    console.log('   - Hard delete job (runs every hour)')
    console.log('   - Inactivity deletion job (runs daily at 2:00 AM)')

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 XAH Payroll Backend running on port ${PORT}`)
      console.log(`📡 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`)
      console.log(`🔐 Xaman API configured: ${process.env.XAMAN_API_KEY ? 'Yes' : 'No'}`)
      console.log(`💾 Database: ${process.env.DB_NAME || 'xahpayroll'} on ${process.env.DB_HOST || 'localhost'}`)
    })

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('📴 SIGTERM signal received: closing HTTP server')
      process.exit(0)
    })

    process.on('SIGINT', () => {
      console.log('📴 SIGINT signal received: closing HTTP server')
      process.exit(0)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

startServer()

module.exports = app
