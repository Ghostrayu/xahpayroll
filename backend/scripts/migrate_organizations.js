/**
 * Migration Script: Create Organization Records for Existing NGO/Employer Users
 *
 * Purpose: Ensures all existing NGO/Employer users have organization records
 * with the critical 1:1 mapping: users.wallet_address ↔ organizations.escrow_wallet_address
 *
 * Usage:
 *   node scripts/migrate_organizations.js              # Dry run (preview only)
 *   node scripts/migrate_organizations.js --execute    # Execute migration
 *
 * Safety:
 *   - Dry run by default (no changes made)
 *   - Handles duplicates gracefully
 *   - Verifies results after execution
 *   - Detailed logging for audit trail
 */

// Load environment variables from .env file
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const { query } = require('../database/db')

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}\n`),
}

async function migrateExistingOrganizations(dryRun = true) {
  log.title('='.repeat(80))
  log.title('ORGANIZATION MIGRATION SCRIPT')
  log.title('='.repeat(80))

  if (dryRun) {
    log.warning('DRY RUN MODE: No changes will be made to the database')
    log.info('Run with --execute flag to perform actual migration')
  } else {
    log.warning('EXECUTE MODE: Database will be modified')
  }

  console.log()

  try {
    // ============================================
    // STEP 1: FIND USERS WITHOUT ORGANIZATIONS
    // ============================================
    log.title('STEP 1: Finding NGO/Employer users without organizations')

    // CRITICAL: Find NGO/Employer users without organization records
    // Uses escrow_wallet_address to establish 1:1 mapping
    const usersWithoutOrgs = await query(`
      SELECT u.* FROM users u
      LEFT JOIN organizations o ON u.wallet_address = o.escrow_wallet_address
      WHERE (u.user_type = 'ngo' OR u.user_type = 'employer')
      AND o.id IS NULL
    `)

    log.info(`Found ${usersWithoutOrgs.rows.length} users without organizations`)

    if (usersWithoutOrgs.rows.length === 0) {
      log.success('No migration needed - all NGO/Employer users have organizations')
      return
    }

    // Display users to be migrated
    console.log()
    log.info('Users to be migrated:')
    usersWithoutOrgs.rows.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.display_name || 'Unnamed'} (${user.wallet_address})`)
      console.log(`     Type: ${user.user_type} | Org Name: ${user.organization_name || 'N/A'}`)
    })
    console.log()

    if (dryRun) {
      log.warning('DRY RUN: Would create organization records for these users')
      log.info('Run with --execute to perform migration')
      return
    }

    // ============================================
    // STEP 2: CREATE ORGANIZATION RECORDS
    // ============================================
    log.title('STEP 2: Creating organization records')

    let successCount = 0
    let skipCount = 0
    let failCount = 0

    for (const user of usersWithoutOrgs.rows) {
      try {
        // CRITICAL: escrow_wallet_address = user.wallet_address (1:1 mapping)
        const orgName = user.organization_name || user.display_name

        await query(`
          INSERT INTO organizations (
            organization_name,
            escrow_wallet_address,
            created_at
          ) VALUES ($1, $2, NOW())
        `, [
          orgName,
          user.wallet_address  // CRITICAL: Establishes 1:1 mapping
        ])

        log.success(`✓ Created organization for ${user.wallet_address}`)
        successCount++
      } catch (error) {
        // Handle duplicate gracefully (23505 = unique violation)
        if (error.code === '23505') {
          log.warning(`⊘ Organization already exists for ${user.wallet_address}`)
          skipCount++
        } else {
          log.error(`✗ Failed to create organization for ${user.wallet_address}`)
          log.error(`  Error: ${error.message}`)
          failCount++
        }
      }
    }

    // ============================================
    // STEP 3: SUMMARY
    // ============================================
    console.log()
    log.title('MIGRATION SUMMARY')
    console.log(`Total users processed: ${usersWithoutOrgs.rows.length}`)
    console.log(`${colors.green}  ✓ Successfully created: ${successCount}${colors.reset}`)
    console.log(`${colors.yellow}  ⊘ Skipped (already exist): ${skipCount}${colors.reset}`)
    console.log(`${colors.red}  ✗ Failed: ${failCount}${colors.reset}`)
    console.log()

    // ============================================
    // STEP 4: VERIFICATION
    // ============================================
    log.title('STEP 4: Verifying migration results')

    const verification = await query(`
      SELECT COUNT(*) as missing_orgs FROM users u
      LEFT JOIN organizations o ON u.wallet_address = o.escrow_wallet_address
      WHERE (u.user_type = 'ngo' OR u.user_type = 'employer')
      AND o.id IS NULL
    `)

    const missingCount = parseInt(verification.rows[0].missing_orgs)

    if (missingCount > 0) {
      log.warning(`⚠ ${missingCount} users still missing organizations`)
      log.warning('Run the script again to retry failed migrations')
    } else {
      log.success('✓ All NGO/Employer users now have organizations')
      log.success('✓ 1:1 wallet address mapping verified')
    }

    // ============================================
    // STEP 5: VALIDATE CRITICAL MAPPING
    // ============================================
    log.title('STEP 5: Validating 1:1 wallet address mapping')

    const mappingCheck = await query(`
      SELECT
        COUNT(*) as total_orgs,
        COUNT(DISTINCT escrow_wallet_address) as unique_wallets
      FROM organizations
    `)

    const { total_orgs, unique_wallets } = mappingCheck.rows[0]

    if (parseInt(total_orgs) === parseInt(unique_wallets)) {
      log.success('✓ 1:1 mapping verified: Each organization has unique wallet address')
    } else {
      log.error('✗ Mapping violation detected: Multiple organizations share wallet addresses')
      log.error(`  Total organizations: ${total_orgs}`)
      log.error(`  Unique wallet addresses: ${unique_wallets}`)
    }

    console.log()
    log.title('='.repeat(80))
    log.success('MIGRATION COMPLETED')
    log.title('='.repeat(80))

  } catch (error) {
    console.log()
    log.error('MIGRATION FAILED')
    log.error(`Error: ${error.message}`)
    log.error(`Stack: ${error.stack}`)
    console.log()
    process.exit(1)
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

// Check for --execute flag
const args = process.argv.slice(2)
const executeMode = args.includes('--execute')

migrateExistingOrganizations(!executeMode)
  .then(() => {
    console.log()
    process.exit(0)
  })
  .catch((error) => {
    console.log()
    log.error('Unhandled error in migration script')
    log.error(error)
    process.exit(1)
  })
