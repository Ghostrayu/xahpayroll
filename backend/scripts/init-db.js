#!/usr/bin/env node

/**
 * Database Initialization Script
 * Run this to manually initialize the database tables
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'xahpayroll',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
})

async function initializeDatabase() {
  const client = await pool.connect()
  
  try {
    console.log('🔄 Connecting to database...')
    console.log(`📍 Database: ${process.env.DB_NAME || 'xahpayroll'}`)
    console.log(`📍 Host: ${process.env.DB_HOST || 'localhost'}`)
    console.log(`📍 User: ${process.env.DB_USER || 'postgres'}`)
    console.log('')
    
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `)
    
    if (tableCheck.rows[0].exists) {
      console.log('⚠️  Users table already exists')
      console.log('')
      
      // Show table structure
      const tableInfo = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position;
      `)
      
      console.log('📋 Current table structure:')
      console.table(tableInfo.rows)
      
      const answer = await askQuestion('\nDo you want to DROP and RECREATE the table? (yes/no): ')
      
      if (answer.toLowerCase() !== 'yes') {
        console.log('✅ Keeping existing table')
        process.exit(0)
      }
      
      console.log('⚠️  Dropping existing tables...')
      await client.query('DROP TABLE IF EXISTS sessions CASCADE;')
      await client.query('DROP TABLE IF EXISTS users CASCADE;')
      console.log('✅ Tables dropped')
    }
    
    // Read and execute schema
    console.log('📋 Creating database tables...')
    const schemaPath = path.join(__dirname, '../database/schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    await client.query(schema)
    
    console.log('✅ Database tables created successfully')
    console.log('')
    
    // Verify table structure
    const verifyQuery = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `)
    
    console.log('📋 New table structure:')
    console.table(verifyQuery.rows)
    
    // Count existing users
    const countResult = await client.query('SELECT COUNT(*) FROM users;')
    console.log(`\n👥 Total users: ${countResult.rows[0].count}`)
    
  } catch (error) {
    console.error('❌ Error initializing database:', error.message)
    console.error('\n💡 Troubleshooting:')
    console.error('1. Make sure PostgreSQL is running')
    console.error('2. Check your .env file has correct database credentials')
    console.error('3. Ensure the database exists: CREATE DATABASE xahpayroll;')
    console.error('4. Ensure user has permissions: GRANT ALL PRIVILEGES ON DATABASE xahpayroll TO your_user;')
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

function askQuestion(question) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  return new Promise(resolve => {
    readline.question(question, answer => {
      readline.close()
      resolve(answer)
    })
  })
}

// Run initialization
initializeDatabase()
  .then(() => {
    console.log('\n✅ Database initialization complete!')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Failed to initialize database:', error)
    process.exit(1)
  })
