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
  max: 100 // limit each IP to 100 requests per windowMs
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
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 XAH Payroll Backend running on port ${PORT}`)
      console.log(`📡 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`)
      console.log(`🔐 Xaman API configured: ${process.env.XAMAN_API_KEY ? 'Yes' : 'No'}`)
      console.log(`💾 Database: ${process.env.DB_NAME || 'xahpayroll'} on ${process.env.DB_HOST || 'localhost'}`)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

startServer()

module.exports = app
