/**
 * Database Connection Test
 * Run with: node test-db.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testConnection() {
  try {
    console.log('🔌 Testing database connection...\n');
    
    // Test basic connection
    const client = await pool.connect();
    console.log('✅ Database connected successfully!');
    
    // Test query
    const timeResult = await client.query('SELECT NOW()');
    console.log('📅 Current time from DB:', timeResult.rows[0].now);
    
    // Test tables exist
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n📊 Tables found:', tablesResult.rows.length);
    tablesResult.rows.forEach(row => {
      console.log('   -', row.table_name);
    });
    
    // Test sample data
    const usersResult = await client.query('SELECT COUNT(*) as count FROM users');
    const orgsResult = await client.query('SELECT COUNT(*) as count FROM organizations');
    const employeesResult = await client.query('SELECT COUNT(*) as count FROM employees');
    
    console.log('\n📈 Sample data:');
    console.log('   - Users:', usersResult.rows[0].count);
    console.log('   - Organizations:', orgsResult.rows[0].count);
    console.log('   - Employees:', employeesResult.rows[0].count);
    
    // Test a join query
    const joinResult = await client.query(`
      SELECT 
        o.organization_name,
        o.escrow_balance,
        COUNT(e.id) as employee_count
      FROM organizations o
      LEFT JOIN employees e ON o.id = e.organization_id
      GROUP BY o.id
    `);
    
    console.log('\n🏢 Organizations:');
    joinResult.rows.forEach(row => {
      console.log(`   - ${row.organization_name}: ${row.employee_count} employees, $${row.escrow_balance} escrow`);
    });
    
    client.release();
    
    console.log('\n✅ All database tests passed!');
    console.log('🎉 Your database is ready for the backend API!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database connection failed!');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check that PostgreSQL is running: brew services list');
    console.error('2. Verify .env file exists with correct credentials');
    console.error('3. Test manual connection: psql -U xahpayroll_user -d xahpayroll_dev -h localhost');
    console.error('4. Check DATABASE_URL in .env matches your setup\n');
    
    process.exit(1);
  }
}

// Run the test
testConnection();
