/**
 * Insert Orphaned Payment Channel into Production Database
 *
 * This script inserts the payment channel that was successfully created on the
 * Xahau ledger but failed to sync to the database due to missing on_chain_balance field.
 *
 * Real Channel ID: 871391761F1D26F503BEEFE8CDE884D5F296AA65840F254D71BD3C374F5E01AF
 */

const { Pool } = require('pg')

// Production Supabase connection
const pool = new Pool({
  connectionString: 'postgresql://postgres.qrqzyjvrhkosvhzrctnz:XAHPAYROLL777,@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
})

async function insertOrphanedChannel() {
  const client = await pool.connect()

  try {
    console.log('🔌 Connected to production database')

    const organizationWallet = 'ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW'
    const workerWallet = 'rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS'
    const realChannelId = '871391761F1D26F503BEEFE8CDE884D5F296AA65840F254D71BD3C374F5E01AF'

    console.log('\n📋 Channel Details:')
    console.log(`   Channel ID: ${realChannelId}`)
    console.log(`   Organization: ${organizationWallet}`)
    console.log(`   Worker: ${workerWallet}`)
    console.log(`   Funding: 240.00 XAH`)

    // Get organization ID
    console.log('\n🔍 Looking up organization...')
    const orgResult = await client.query(
      'SELECT id, organization_name FROM organizations WHERE escrow_wallet_address = $1',
      [organizationWallet]
    )

    if (orgResult.rows.length === 0) {
      throw new Error(`Organization not found for wallet: ${organizationWallet}`)
    }

    const organization = orgResult.rows[0]
    console.log(`   ✅ Found organization: ${organization.organization_name} (ID: ${organization.id})`)

    // Get or create employee
    console.log('\n🔍 Looking up employee...')
    let employeeResult = await client.query(
      'SELECT id, full_name FROM employees WHERE employee_wallet_address = $1 AND organization_id = $2',
      [workerWallet, organization.id]
    )

    let employee
    if (employeeResult.rows.length === 0) {
      console.log('   ⚠️  Employee not found, creating...')
      const newEmployeeResult = await client.query(
        `INSERT INTO employees (
          organization_id, full_name, employee_wallet_address,
          hourly_rate, employment_status
        ) VALUES ($1, $2, $3, $4, 'active')
        RETURNING id, full_name`,
        [organization.id, 'TESTING', workerWallet, 15.00]
      )
      employee = newEmployeeResult.rows[0]
      console.log(`   ✅ Created employee: ${employee.full_name} (ID: ${employee.id})`)
    } else {
      employee = employeeResult.rows[0]
      console.log(`   ✅ Found employee: ${employee.full_name} (ID: ${employee.id})`)
    }

    // Check if channel already exists
    console.log('\n🔍 Checking for existing channel...')
    const existingChannel = await client.query(
      'SELECT id, channel_id FROM payment_channels WHERE channel_id = $1',
      [realChannelId]
    )

    if (existingChannel.rows.length > 0) {
      console.log('   ⚠️  Channel already exists in database!')
      console.log(`   Channel ID: ${existingChannel.rows[0].channel_id}`)
      console.log(`   Database ID: ${existingChannel.rows[0].id}`)
      return { alreadyExists: true, channelId: existingChannel.rows[0].id }
    }

    // Insert payment channel
    console.log('\n💾 Inserting payment channel...')
    const insertResult = await client.query(
      `INSERT INTO payment_channels (
        organization_id,
        employee_id,
        channel_id,
        job_name,
        hourly_rate,
        balance_update_frequency,
        escrow_funded_amount,
        on_chain_balance,
        off_chain_accumulated_balance,
        hours_accumulated,
        max_daily_hours,
        settle_delay,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, channel_id, status`,
      [
        organization.id,
        employee.id,
        realChannelId,
        'TESTING',
        15.00,
        'hourly',
        240.00,
        0, // on_chain_balance (will be synced later)
        0, // off_chain_accumulated_balance
        0, // hours_accumulated
        8.00,
        3600, // settle_delay (1 hour, as seen on ledger)
        'active',
        '2026-01-11T00:56:44.755Z',
        new Date()
      ]
    )

    const newChannel = insertResult.rows[0]
    console.log('   ✅ Payment channel inserted successfully!')
    console.log(`   Database ID: ${newChannel.id}`)
    console.log(`   Channel ID: ${newChannel.channel_id}`)
    console.log(`   Status: ${newChannel.status}`)

    return {
      success: true,
      channelId: newChannel.id,
      ledgerChannelId: newChannel.channel_id
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    throw error
  } finally {
    client.release()
    await pool.end()
    console.log('\n🔌 Disconnected from database')
  }
}

// Run the script
insertOrphanedChannel()
  .then(result => {
    if (result.alreadyExists) {
      console.log('\n✅ Channel already exists in database (no action needed)')
      console.log('   The NGO dashboard should already display this channel')
      process.exit(0)
    } else if (result.success) {
      console.log('\n✅ SUCCESS - Orphaned channel recovered!')
      console.log(`   Database ID: ${result.channelId}`)
      console.log(`   Ledger Channel ID: ${result.ledgerChannelId}`)
      console.log('\n🎯 Next Steps:')
      console.log('   1. Refresh NGO dashboard to verify channel appears')
      console.log('   2. Channel should show: 240 XAH escrow, 0 XAH balance')
      console.log('   3. Worker can now start logging hours')
      process.exit(0)
    }
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error.message)
    process.exit(1)
  })
