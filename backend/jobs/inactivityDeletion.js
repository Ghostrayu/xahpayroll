/**
 * Inactivity Deletion Job
 *
 * Automatically deletes worker accounts after 2 weeks of inactivity.
 *
 * Schedule: Runs daily at 2:00 AM
 * Purpose: Clean up abandoned accounts with no active channels
 * Safety: Only deletes if no active channels and no unpaid balances
 */

const pool = require('../database/db');
const { createNGONotification } = require('../routes/organizations');

/**
 * Get all organizations a worker is associated with
 * @param {string} walletAddress - Worker's wallet address
 * @returns {Promise<Array>} Array of organization objects
 */
async function getWorkerOrganizations(walletAddress) {
    const result = await pool.query(`
        SELECT DISTINCT o.id, o.organization_name, o.ngo_wallet_address
        FROM organizations o
        JOIN employees e ON e.organization_id = o.id
        WHERE e.employee_wallet_address = $1
    `, [walletAddress]);

    return result.rows;
}

/**
 * Process automatic deletion for inactive workers
 * @returns {Promise<Object>} Results summary
 */
async function processInactiveWorkers() {
    const startTime = Date.now();
    const cutoffTime = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 2 weeks ago

    console.log(`[AUTO_DELETE] Starting inactivity deletion job at ${new Date().toISOString()}`);
    console.log(`[AUTO_DELETE] Inactivity cutoff: ${cutoffTime.toISOString()}`);

    const results = {
        success: 0,
        failed: 0,
        errors: []
    };

    try {
        // Find inactive workers eligible for auto-deletion
        const inactiveWorkers = await pool.query(`
            SELECT u.wallet_address, u.name, u.last_login_at
            FROM users u
            WHERE u.user_type = 'employee'
            AND u.last_login_at < $1
            AND u.deleted_at IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM payment_channels pc
                WHERE pc.employee_wallet_address = u.wallet_address
                AND (
                    pc.status = 'active'
                    OR pc.unpaid_balance > 0
                    OR pc.closure_tx_hash IS NULL
                )
            )
        `, [cutoffTime]);

        console.log(`[AUTO_DELETE] Found ${inactiveWorkers.rows.length} inactive workers`);

        if (inactiveWorkers.rows.length === 0) {
            console.log('[AUTO_DELETE] No inactive workers to delete');
            return results;
        }

        // Process each inactive worker
        for (const worker of inactiveWorkers.rows) {
            try {
                console.log(`[AUTO_DELETE] Processing: ${worker.wallet_address} (last login: ${worker.last_login_at})`);

                // Get organizations to notify
                const organizations = await getWorkerOrganizations(worker.wallet_address);

                // Start transaction
                await pool.query('BEGIN');

                // Soft delete user
                await pool.query(`
                    UPDATE users
                    SET deleted_at = CURRENT_TIMESTAMP,
                        deletion_reason = 'Automatic deletion due to 2 weeks of inactivity'
                    WHERE wallet_address = $1
                `, [worker.wallet_address]);

                // Create deletion log
                await pool.query(`
                    INSERT INTO deletion_logs (
                        wallet_address,
                        user_type,
                        deleted_by,
                        deletion_reason,
                        organizations_affected
                    ) VALUES ($1, 'employee', 'system', 'Automatic deletion due to 2 weeks of inactivity', $2)
                `, [worker.wallet_address, organizations.map(o => o.organization_name)]);

                // Notify all affected organizations
                for (const org of organizations) {
                    await pool.query(`
                        INSERT INTO ngo_notifications (
                            organization_id,
                            notification_type,
                            worker_wallet_address,
                            worker_name,
                            message,
                            metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                    `, [
                        org.id,
                        'worker_deleted',
                        worker.wallet_address,
                        worker.name,
                        `WORKER ${worker.name || worker.wallet_address} WAS AUTOMATICALLY DELETED DUE TO 2 WEEKS OF INACTIVITY`,
                        JSON.stringify({
                            deletionType: 'automatic',
                            inactivityDays: 14,
                            lastLogin: worker.last_login_at
                        })
                    ]);
                }

                // Commit transaction
                await pool.query('COMMIT');

                console.log(`[AUTO_DELETE] ✅ Successfully deleted inactive worker: ${worker.wallet_address}`);
                console.log(`[AUTO_DELETE] Notified ${organizations.length} organizations`);
                results.success++;

            } catch (error) {
                // Rollback transaction on error
                await pool.query('ROLLBACK');

                console.error(`[AUTO_DELETE_ERROR] ❌ Failed to delete inactive worker: ${worker.wallet_address}`, error.message);
                results.failed++;
                results.errors.push({
                    wallet_address: worker.wallet_address,
                    error: error.message
                });
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[AUTO_DELETE] Job completed in ${duration}ms`);
        console.log(`[AUTO_DELETE] Summary: ${results.success} successful, ${results.failed} failed`);

    } catch (error) {
        console.error('[AUTO_DELETE_ERROR] Job failed:', error);
        throw error;
    }

    return results;
}

/**
 * Start the inactivity deletion job with daily schedule (2 AM)
 * Uses simple setInterval for daily checks (checks every hour, runs at 2 AM)
 * @returns {NodeJS.Timeout} Interval ID
 */
function startInactivityDeletionJob() {
    console.log('[AUTO_DELETE] Scheduled job initialized (runs daily at 2:00 AM)');

    // Check every hour if it's 2 AM
    const intervalId = setInterval(() => {
        const now = new Date();
        const hour = now.getHours();

        // Run at 2 AM
        if (hour === 2) {
            console.log('[AUTO_DELETE] Daily execution triggered at 2:00 AM');
            processInactiveWorkers().catch(error => {
                console.error('[AUTO_DELETE_ERROR] Scheduled job error:', error);
            });
        }
    }, 60 * 60 * 1000); // Check every hour

    return intervalId;
}

/**
 * Stop the inactivity deletion job
 * @param {NodeJS.Timeout} intervalId - The interval to clear
 */
function stopInactivityDeletionJob(intervalId) {
    if (intervalId) {
        clearInterval(intervalId);
        console.log('[AUTO_DELETE] Scheduled job stopped');
    }
}

module.exports = {
    processInactiveWorkers,
    startInactivityDeletionJob,
    stopInactivityDeletionJob
};
