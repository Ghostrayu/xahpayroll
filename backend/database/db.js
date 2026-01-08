const { Pool } = require('pg')
const { URL } = require('url')

// Parse DATABASE_URL and configure for Supabase Pooler (Session or Transaction mode)
const getDatabaseConfig = () => {
  if (process.env.DATABASE_URL) {
    // Parse the DATABASE_URL connection string
    // Format: postgresql://user:password@host:port/database
    const dbUrl = new URL(process.env.DATABASE_URL)

    return {
      host: dbUrl.hostname, // Extract hostname (forces IPv4 DNS resolution)
      port: dbUrl.port || 5432,
      database: dbUrl.pathname.slice(1), // Remove leading '/'
      user: dbUrl.username,
      password: dbUrl.password,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
      // CRITICAL: Force IPv4 to prevent ENETUNREACH on Render
      // Render's infrastructure doesn't support IPv6, causing connection failures
      family: 4, // Force IPv4 (AF_INET) - prevents IPv6 connection attempts

      // Query timeout for long-running queries
      statement_timeout: 60000, // 60 second query timeout

      max: 20,
      idleTimeoutMillis: 30000,
    }
  }

  // Fallback to individual environment variables (local development)
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'xahpayroll',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
}

// Create PostgreSQL connection pool
const pool = new Pool(getDatabaseConfig())

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database')
})

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err)
  process.exit(-1)
})

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    console.log('Executed query', { text, duration, rows: res.rowCount })
    return res
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

// Helper function to get a client from the pool (for transactions)
const getClient = async () => {
  const client = await pool.connect()
  const query = client.query.bind(client)
  const release = client.release.bind(client)
  
  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!')
  }, 5000)
  
  // Monkey patch the query method to keep track of the last query executed
  client.query = (...args) => {
    client.lastQuery = args
    return query(...args)
  }
  
  client.release = () => {
    // Clear timeout
    clearTimeout(timeout)
    // Set the methods back to their old un-monkey-patched version
    client.query = query
    client.release = release
    return release()
  }
  
  return client
}

// Initialize database (create tables if they don't exist)
const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database...')
    
    // Check if users table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `)
    
    if (!tableCheck.rows[0].exists) {
      console.log('📋 Creating database tables...')
      const fs = require('fs')
      const path = require('path')
      const schemaPath = path.join(__dirname, 'schema.sql')
      const schema = fs.readFileSync(schemaPath, 'utf8')
      await query(schema)
      console.log('✅ Database tables created successfully')
    } else {
      console.log('✅ Database tables already exist')
    }
  } catch (error) {
    console.error('❌ Error initializing database:', error)
    throw error
  }
}

module.exports = {
  query,
  getClient,
  pool,
  initializeDatabase
}
