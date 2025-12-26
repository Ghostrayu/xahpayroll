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

// NOTE: Scheduled jobs now run via system cron (see backend/jobs/runHardDelete.js)
// This ensures jobs run independently of server uptime for production reliability

const app = express()
const PORT = process.env.PORT || 3001

// Security middleware
app.use(helmet())

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))

// Rate limiting - Tiered approach for different endpoint types
// Global rate limiter for general API protection
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // INCREASED: limit each IP to 500 requests per windowMs (was 100)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for critical endpoints (sync, wallet connections, auth)
  skip: (req) => {
    return req.path.includes('/sync') ||
           req.path.includes('/sync-balance') ||
           req.path.includes('/api/xaman') || // Xaman wallet endpoints
           req.path.includes('/api/users') ||  // User authentication
           req.path.includes('/auth')          // General auth endpoints
  },
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

// Sync endpoint rate limiter - Higher limits for legitimate batch operations
const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes (shorter window)
  max: 500, // Allow 500 sync requests per 5 minutes (100 per minute)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: 'SYNC RATE LIMIT EXCEEDED. PLEASE WAIT BEFORE SYNCING AGAIN.',
        retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      }
    })
  }
})

app.use(globalLimiter)

// Body parser middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check endpoint with network configuration
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    network: process.env.XRPL_NETWORK || 'testnet',
    environment: process.env.NODE_ENV || 'development'
  })
})

// API Routes
app.use('/api/xaman', xamanRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/organizations', organizationsRoutes)

// Payment channels routes with custom sync rate limiter
// Apply sync-specific rate limiter to sync endpoints
app.use('/api/payment-channels/:channelId/sync', syncLimiter)
app.use('/api/payment-channels/:channelId/sync-balance', syncLimiter)
app.use('/api/organizations/:walletAddress/sync-all-channels', syncLimiter)
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

    // NOTE: Scheduled jobs run via system cron (independent of server)
    // See: backend/jobs/runHardDelete.js and backend/CRON_SETUP.md for configuration

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
