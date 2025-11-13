/**
 * Hard Delete Job
 *
 * Permanently removes soft-deleted worker accounts with intelligent deletion timing.
 *
 * Schedule: Runs every hour
 * Purpose: Complete data removal with safety grace period
 *
 * Deletion Criteria (OR logic):
 * 1. INSTANT DELETION: Deleted accounts with no active channels/unpaid balances
 *    - Allows immediate removal when worker is fully disengaged
 *    - No waiting period needed if no outstanding obligations
 *
 * 2. GRACE PERIOD DELETION: Deleted accounts older than 48 hours
 *    - Safety net for accounts with active channels at deletion time
 *    - Provides time for channel closure and balance settlement
 *
 * Safety: Transaction-based atomic operations with comprehensive error handling
 */

const pool = require('../database/db');

/**
 * Process hard deletes for accounts past 48-hour retention period
 * @returns {Promise<Object>} Results summary
 */
async function processHardDeletes() {
    const startTime = Date.now();
    const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

    console.log(`[HARD_DELETE] Starting hard delete job at ${new Date().toISOString()}`);
    console.log(`[HARD_DELETE] Cutoff time: ${cutoffTime.toISOString()}`);

    const results = {
        success: 0,
        failed: 0,
        errors: []
    };

    try {
        // Find users scheduled for hard delete
        // Two deletion criteria:
        // 1. Deleted 48+ hours ago (safety grace period expired)
        // 2. Deleted ANY time ago BUT has no active channels/unpaid balances (instant deletion)
        const usersToDelete = await pool.query(`
            SELECT DISTINCT u.wallet_address, u.user_type, u.deleted_at, u.deletion_reason
            FROM users u
            WHERE u.deleted_at IS NOT NULL
            AND (
                -- Criterion 1: 48-hour grace period expired
                u.deleted_at < $1
                OR
                -- Criterion 2: No active channels or unpaid balances (instant deletion)
                NOT EXISTS (
                    SELECT 1 FROM payment_channels pc
                    WHERE pc.employee_wallet_address = u.wallet_address
                    AND (
                        pc.status = 'active'
                        OR pc.unpaid_balance > 0
                        OR pc.closure_tx_hash IS NULL
                    )
                )
            )
        `, [cutoffTime]);

        console.log(`[HARD_DELETE] Found ${usersToDelete.rows.length} accounts to delete`);

        if (usersToDelete.rows.length === 0) {
            console.log('[HARD_DELETE] No accounts to delete');
            return results;
        }

        // Process each user deletion
        for (const user of usersToDelete.rows) {
            try {
                const hoursSinceDeletion = (Date.now() - new Date(user.deleted_at).getTime()) / (1000 * 60 * 60);
                const deletionType = hoursSinceDeletion < 48 ? 'INSTANT (no active channels)' : 'GRACE PERIOD EXPIRED';

                console.log(`[HARD_DELETE] Processing: ${user.wallet_address} (deleted ${user.deleted_at})`);
                console.log(`[HARD_DELETE] Deletion type: ${deletionType}`);

                // Start transaction for atomic deletion
                await pool.query('BEGIN');

                // Delete employee records (this cascades to work_sessions and payments)
                await pool.query(`
                    DELETE FROM employees
                    WHERE employee_wallet_address = $1
                `, [user.wallet_address]);

                // Delete user record
                await pool.query(`
                    DELETE FROM users
                    WHERE wallet_address = $1
                `, [user.wallet_address]);

                // Update deletion log
                await pool.query(`
                    UPDATE deletion_logs
                    SET hard_deleted_at = CURRENT_TIMESTAMP
                    WHERE wallet_address = $1
                    AND hard_deleted_at IS NULL
                `, [user.wallet_address]);

                // Commit transaction
                await pool.query('COMMIT');

                console.log(`[HARD_DELETE] ✅ Successfully deleted user: ${user.wallet_address}`);
                results.success++;

            } catch (error) {
                // Rollback transaction on error
                await pool.query('ROLLBACK');

                console.error(`[HARD_DELETE_ERROR] ❌ Failed to delete user: ${user.wallet_address}`, error.message);
                results.failed++;
                results.errors.push({
                    wallet_address: user.wallet_address,
                    error: error.message
                });
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[HARD_DELETE] Job completed in ${duration}ms`);
        console.log(`[HARD_DELETE] Summary: ${results.success} successful, ${results.failed} failed`);

    } catch (error) {
        console.error('[HARD_DELETE_ERROR] Job failed:', error);
        throw error;
    }

    return results;
}

/**
 * Start the hard delete job with hourly schedule
 * @returns {NodeJS.Timeout} Interval ID
 */
function startHardDeleteJob() {
    console.log('[HARD_DELETE] Scheduled job initialized (runs every hour)');

    // Run immediately on startup (optional, for testing)
    // processHardDeletes().catch(console.error);

    // Run every hour (60 minutes * 60 seconds * 1000 milliseconds)
    const intervalId = setInterval(() => {
        processHardDeletes().catch(error => {
            console.error('[HARD_DELETE_ERROR] Scheduled job error:', error);
        });
    }, 60 * 60 * 1000);

    return intervalId;
}

/**
 * Stop the hard delete job
 * @param {NodeJS.Timeout} intervalId - The interval to clear
 */
function stopHardDeleteJob(intervalId) {
    if (intervalId) {
        clearInterval(intervalId);
        console.log('[HARD_DELETE] Scheduled job stopped');
    }
}

module.exports = {
    processHardDeletes,
    startHardDeleteJob,
    stopHardDeleteJob
};
