/**
 * Fix Placeholder Job Names Script
 *
 * This script updates payment channels with placeholder job names ("PAYMENT CHANNEL")
 * to more meaningful defaults or allows interactive updates.
 *
 * Usage:
 *   node scripts/fix-placeholder-job-names.js [--auto|--interactive]
 *
 * Options:
 *   --auto: Automatically set to "General Work" (default)
 *   --interactive: Prompt for each channel individually
 */

const { query } = require('../database/db')

async function fixPlaceholderJobNames(mode = 'auto') {
  try {
    console.log('🔍 FINDING CHANNELS WITH PLACEHOLDER JOB NAMES...\n')

    // Find all channels with placeholder job name
    const result = await query(
      `SELECT
        pc.id,
        pc.channel_id,
        pc.job_name,
        pc.hourly_rate,
        pc.status,
        o.organization_name,
        o.escrow_wallet_address,
        e.full_name as worker_name,
        e.employee_wallet_address
      FROM payment_channels pc
      JOIN organizations o ON pc.organization_id = o.id
      JOIN employees e ON pc.employee_id = e.id
      WHERE pc.job_name = 'PAYMENT CHANNEL'
      ORDER BY pc.created_at DESC`
    )

    if (result.rows.length === 0) {
      console.log('✅ NO CHANNELS FOUND WITH PLACEHOLDER JOB NAMES\n')
      return { updated: 0, skipped: 0 }
    }

    console.log(`📋 FOUND ${result.rows.length} CHANNEL(S) WITH PLACEHOLDER JOB NAMES:\n`)

    let updated = 0
    let skipped = 0

    for (const channel of result.rows) {
      console.log(`\n-------------------------------------------`)
      console.log(`CHANNEL ID: ${channel.channel_id}`)
      console.log(`ORGANIZATION: ${channel.organization_name}`)
      console.log(`WORKER: ${channel.worker_name}`)
      console.log(`CURRENT JOB NAME: ${channel.job_name}`)
      console.log(`HOURLY RATE: ${channel.hourly_rate} XAH`)
      console.log(`STATUS: ${channel.status}`)
      console.log(`-------------------------------------------`)

      let newJobName

      if (mode === 'interactive') {
        // Interactive mode: prompt for each channel (requires readline)
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        })

        newJobName = await new Promise((resolve) => {
          readline.question('ENTER NEW JOB NAME (or press Enter to skip): ', (answer) => {
            readline.close()
            resolve(answer.trim() || null)
          })
        })

        if (!newJobName) {
          console.log('⏭️  SKIPPED')
          skipped++
          continue
        }
      } else {
        // Auto mode: use default
        newJobName = 'GENERAL WORK'
      }

      // Update the job name
      await query(
        `UPDATE payment_channels
         SET job_name = $1, updated_at = NOW()
         WHERE id = $2`,
        [newJobName, channel.id]
      )

      console.log(`✅ UPDATED JOB NAME TO: ${newJobName}`)
      updated++
    }

    console.log(`\n\n📊 SUMMARY:`)
    console.log(`   ✅ UPDATED: ${updated}`)
    console.log(`   ⏭️  SKIPPED: ${skipped}`)
    console.log(`   📋 TOTAL: ${result.rows.length}\n`)

    return { updated, skipped }
  } catch (error) {
    console.error('\n❌ ERROR FIXING PLACEHOLDER JOB NAMES:', error.message)
    throw error
  }
}

async function fixPlaceholderNotificationMessages() {
  try {
    console.log('\n🔍 FIXING WORKER NOTIFICATION MESSAGES...\n')

    // Find notifications that need message updates
    const result = await query(
      `SELECT
        wn.id,
        wn.message,
        wn.job_name as notification_job_name,
        pc.job_name as channel_job_name,
        pc.accumulated_balance,
        o.organization_name
      FROM worker_notifications wn
      JOIN payment_channels pc ON wn.channel_id = pc.channel_id
      JOIN organizations o ON pc.organization_id = o.id
      WHERE wn.type = 'closure_request'
      AND wn.message LIKE '%PAYMENT CHANNEL FOR PAYMENT CHANNEL%'`
    )

    if (result.rows.length === 0) {
      console.log('✅ NO NOTIFICATIONS NEED MESSAGE UPDATES\n')
      return { updated: 0 }
    }

    console.log(`📋 FOUND ${result.rows.length} NOTIFICATION(S) TO UPDATE\n`)

    let updated = 0

    for (const notif of result.rows) {
      // Regenerate proper message
      const newMessage =
        `${notif.organization_name} HAS REQUESTED IMMEDIATE CLOSURE OF PAYMENT CHANNEL FOR ${notif.channel_job_name}. ` +
        `PLEASE REVIEW AND APPROVE TO CLOSE THE CHANNEL AND RECEIVE YOUR ACCUMULATED BALANCE OF ${parseFloat(notif.accumulated_balance).toFixed(2)} XAH.`

      await query(
        `UPDATE worker_notifications
         SET message = $1, job_name = $2
         WHERE id = $3`,
        [newMessage, notif.channel_job_name, notif.id]
      )

      console.log(`✅ UPDATED NOTIFICATION ${notif.id}`)
      updated++
    }

    console.log(`\n📊 NOTIFICATION UPDATES: ${updated}\n`)
    return { updated }
  } catch (error) {
    console.error('\n❌ ERROR FIXING NOTIFICATION MESSAGES:', error.message)
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--interactive') ? 'interactive' : 'auto'

  console.log('\n===========================================')
  console.log('  FIX PLACEHOLDER JOB NAMES SCRIPT')
  console.log('===========================================\n')
  console.log(`MODE: ${mode.toUpperCase()}\n`)

  try {
    // Step 1: Fix payment channel job names
    await fixPlaceholderJobNames(mode)

    // Step 2: Fix worker notification messages
    await fixPlaceholderNotificationMessages()

    console.log('✅ SCRIPT COMPLETED SUCCESSFULLY\n')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ SCRIPT FAILED:', error.message)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main()
}

module.exports = { fixPlaceholderJobNames, fixPlaceholderNotificationMessages }
