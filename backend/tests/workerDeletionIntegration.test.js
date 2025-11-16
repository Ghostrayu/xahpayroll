/**
 * Worker Deletion Feature - Integration Tests
 *
 * End-to-end integration tests for complete deletion flows:
 * - Complete deletion workflow
 * - Multi-organization scenarios
 * - Orphaned records re-association
 * - Automatic inactivity deletion
 * - Channel closure integration
 *
 * @requires jest
 * @requires supertest
 * @requires pg
 */

const request = require('supertest');
const { Pool } = require('pg');
const app = require('../server'); // Assumes server.js exports app

describe('Worker Deletion Integration Tests', () => {
  let testPool;
  let testWorker;
  let testOrganization1;
  let testOrganization2;

  beforeAll(async () => {
    // Connect to test database
    testPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://test_user:test_pass@localhost:5432/xahpayroll_test'
    });

    // Create test fixtures
    await setupTestFixtures();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestFixtures();
    await testPool.end();
  });

  beforeEach(async () => {
    // Reset state before each test
    await resetTestState();
  });

  /**
   * Setup test fixtures in database
   */
  async function setupTestFixtures() {
    // Create test worker
    const workerResult = await testPool.query(`
      INSERT INTO users (wallet_address, user_type, display_name, email, phone_number)
      VALUES ($1, 'employee', $2, $3, $4)
      RETURNING *
    `, [
      global.testHelpers.generateTestWallet(),
      'TEST INTEGRATION WORKER',
      'integration@test.com',
      '+1234567890'
    ]);
    testWorker = workerResult.rows[0];

    // Create test organizations
    const org1Result = await testPool.query(`
      INSERT INTO organizations (wallet_address, organization_name, organization_type)
      VALUES ($1, $2, 'ngo')
      RETURNING *
    `, [global.testHelpers.generateTestWallet(), 'TEST ORG 1']);
    testOrganization1 = org1Result.rows[0];

    const org2Result = await testPool.query(`
      INSERT INTO organizations (wallet_address, organization_name, organization_type)
      VALUES ($1, $2, 'ngo')
      RETURNING *
    `, [global.testHelpers.generateTestWallet(), 'TEST ORG 2']);
    testOrganization2 = org2Result.rows[0];

    // Associate worker with organizations
    await testPool.query(`
      INSERT INTO employees (employee_wallet_address, organization_id, employment_status)
      VALUES ($1, $2, 'active'), ($1, $3, 'active')
    `, [testWorker.wallet_address, testOrganization1.id, testOrganization2.id]);
  }

  /**
   * Clean up test fixtures
   */
  async function cleanupTestFixtures() {
    await testPool.query('DELETE FROM users WHERE email = $1', ['integration@test.com']);
    await testPool.query('DELETE FROM organizations WHERE organization_name LIKE $1', ['TEST ORG%']);
  }

  /**
   * Reset test state between tests
   */
  async function resetTestState() {
    // Clear deletion-related data
    await testPool.query('UPDATE users SET deleted_at = NULL, deletion_reason = NULL WHERE wallet_address = $1', [testWorker.wallet_address]);
    await testPool.query('DELETE FROM deletion_logs WHERE wallet_address = $1', [testWorker.wallet_address]);
    await testPool.query('DELETE FROM ngo_notifications WHERE worker_wallet_address = $1', [testWorker.wallet_address]);
  }

  describe('Complete Deletion Flow', () => {
    test('SHOULD COMPLETE FULL DELETION WORKFLOW SUCCESSFULLY', async () => {
      // Step 1: Check eligibility (should be eligible - no channels)
      const eligibilityResponse = await request(app)
        .get('/api/workers/deletion-eligibility')
        .query({ walletAddress: testWorker.wallet_address });

      expect(eligibilityResponse.status).toBe(200);
      expect(eligibilityResponse.body.canDelete).toBe(true);

      // Step 2: Request deletion
      const deletionResponse = await request(app)
        .post('/api/workers/delete-profile')
        .send({
          walletAddress: testWorker.wallet_address,
          confirmationText: 'DELETE MY ACCOUNT',
          reason: 'INTEGRATION TEST'
        });

      expect(deletionResponse.status).toBe(200);
      expect(deletionResponse.body.success).toBe(true);

      // Step 3: Verify soft delete in database
      const userCheck = await testPool.query(
        'SELECT deleted_at, deletion_reason FROM users WHERE wallet_address = $1',
        [testWorker.wallet_address]
      );
      expect(userCheck.rows[0].deleted_at).not.toBeNull();
      expect(userCheck.rows[0].deletion_reason).toBe('INTEGRATION TEST');

      // Step 4: Verify deletion log created
      const logCheck = await testPool.query(
        'SELECT * FROM deletion_logs WHERE wallet_address = $1',
        [testWorker.wallet_address]
      );
      expect(logCheck.rows.length).toBe(1);
      expect(logCheck.rows[0].deleted_by).toBe('self');

      // Step 5: Verify organizations notified
      const notificationsCheck = await testPool.query(
        'SELECT * FROM ngo_notifications WHERE worker_wallet_address = $1',
        [testWorker.wallet_address]
      );
      expect(notificationsCheck.rows.length).toBe(2); // 2 organizations

      // Step 6: Verify notification content
      const notification = notificationsCheck.rows[0];
      expect(notification.notification_type).toBe('worker_deleted');
      expect(notification.is_read).toBe(false);
    });

    test('SHOULD BLOCK DELETION WITH ACTIVE PAYMENT CHANNEL', async () => {
      // Create active payment channel
      const employeeResult = await testPool.query(
        'SELECT id FROM employees WHERE employee_wallet_address = $1 AND organization_id = $2',
        [testWorker.wallet_address, testOrganization1.id]
      );

      await testPool.query(`
        INSERT INTO payment_channels (
          organization_id, employee_id, channel_id, status,
          escrow_funded_amount, accumulated_balance, hourly_rate, job_name
        ) VALUES ($1, $2, $3, 'active', 1000, 0, 15, 'TEST JOB')
      `, [testOrganization1.id, employeeResult.rows[0].id, 'CH-INT-TEST-001']);

      // Attempt deletion
      const deletionResponse = await request(app)
        .post('/api/workers/delete-profile')
        .send({
          walletAddress: testWorker.wallet_address,
          confirmationText: 'DELETE MY ACCOUNT',
          reason: 'INTEGRATION TEST'
        });

      expect(deletionResponse.status).toBe(403);
      expect(deletionResponse.body.error).toBe('DELETION_BLOCKED');
      expect(deletionResponse.body.blockingReasons.length).toBeGreaterThan(0);

      // Clean up channel
      await testPool.query('DELETE FROM payment_channels WHERE channel_id = $1', ['CH-INT-TEST-001']);
    });

    test('SHOULD ALLOW CANCELLATION WITHIN 48 HOURS', async () => {
      // Request deletion
      await request(app)
        .post('/api/workers/delete-profile')
        .send({
          walletAddress: testWorker.wallet_address,
          confirmationText: 'DELETE MY ACCOUNT',
          reason: 'TEST'
        });

      // Cancel deletion
      const cancelResponse = await request(app)
        .post('/api/workers/cancel-deletion')
        .send({ walletAddress: testWorker.wallet_address });

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.success).toBe(true);

      // Verify account restored
      const userCheck = await testPool.query(
        'SELECT deleted_at FROM users WHERE wallet_address = $1',
        [testWorker.wallet_address]
      );
      expect(userCheck.rows[0].deleted_at).toBeNull();
    });
  });

  describe('Multi-Organization Deletion', () => {
    test('SHOULD REMOVE WORKER FROM ALL ORGANIZATIONS SIMULTANEOUSLY', async () => {
      // Request deletion
      const deletionResponse = await request(app)
        .post('/api/workers/delete-profile')
        .send({
          walletAddress: testWorker.wallet_address,
          confirmationText: 'DELETE MY ACCOUNT',
          reason: 'MULTI-ORG TEST'
        });

      expect(deletionResponse.status).toBe(200);
      expect(deletionResponse.body.affectedOrganizations).toHaveLength(2);

      // Verify both organizations notified
      const notificationsCheck = await testPool.query(
        'SELECT organization_id FROM ngo_notifications WHERE worker_wallet_address = $1',
        [testWorker.wallet_address]
      );

      const notifiedOrgIds = notificationsCheck.rows.map(n => n.organization_id);
      expect(notifiedOrgIds).toContain(testOrganization1.id);
      expect(notifiedOrgIds).toContain(testOrganization2.id);
    });

    test('SHOULD BLOCK IF ANY ORGANIZATION HAS ACTIVE CHANNEL', async () => {
      // Create channel with only organization 2
      const employeeResult = await testPool.query(
        'SELECT id FROM employees WHERE employee_wallet_address = $1 AND organization_id = $2',
        [testWorker.wallet_address, testOrganization2.id]
      );

      await testPool.query(`
        INSERT INTO payment_channels (
          organization_id, employee_id, channel_id, status,
          escrow_funded_amount, accumulated_balance, hourly_rate, job_name
        ) VALUES ($1, $2, $3, 'active', 500, 50, 10, 'BLOCKING JOB')
      `, [testOrganization2.id, employeeResult.rows[0].id, 'CH-BLOCK-001']);

      // Attempt deletion
      const deletionResponse = await request(app)
        .post('/api/workers/delete-profile')
        .send({
          walletAddress: testWorker.wallet_address,
          confirmationText: 'DELETE MY ACCOUNT',
          reason: 'TEST'
        });

      expect(deletionResponse.status).toBe(403);
      expect(deletionResponse.body.error).toBe('DELETION_BLOCKED');

      // Clean up
      await testPool.query('DELETE FROM payment_channels WHERE channel_id = $1', ['CH-BLOCK-001']);
    });
  });

  describe('Orphaned Records Re-Association', () => {
    test('SHOULD DETECT ORPHANED RECORDS AFTER HARD DELETE', async () => {
      // Simulate hard delete (employee records remain, user deleted)
      await testPool.query('DELETE FROM users WHERE wallet_address = $1', [testWorker.wallet_address]);

      // Check for orphaned records
      const orphanedCheck = await testPool.query(`
        SELECT e.*, o.organization_name
        FROM employees e
        JOIN organizations o ON e.organization_id = o.id
        WHERE e.employee_wallet_address = $1
        AND NOT EXISTS (
          SELECT 1 FROM users u WHERE u.wallet_address = e.employee_wallet_address
        )
      `, [testWorker.wallet_address]);

      expect(orphanedCheck.rows.length).toBeGreaterThan(0);

      // Restore user for cleanup
      await testPool.query(`
        INSERT INTO users (wallet_address, user_type, display_name, email)
        VALUES ($1, 'employee', 'RESTORED TEST USER', 'restored@test.com')
      `, [testWorker.wallet_address]);
    });

    test('SHOULD RE-ASSOCIATE ORPHANED RECORDS ON SIGNUP', async () => {
      // Delete user (leaving orphaned employee records)
      await testPool.query('DELETE FROM users WHERE wallet_address = $1', [testWorker.wallet_address]);

      // Re-register with same wallet
      const signupResponse = await request(app)
        .post('/api/users/signup')
        .send({
          walletAddress: testWorker.wallet_address,
          displayName: 'RE-REGISTERED WORKER',
          email: 'reregistered@test.com',
          userType: 'employee'
        });

      expect(signupResponse.status).toBe(200);

      // Verify orphaned records re-associated
      const newUserId = signupResponse.body.user.id;
      const employeesCheck = await testPool.query(
        'SELECT user_id FROM employees WHERE employee_wallet_address = $1',
        [testWorker.wallet_address]
      );

      expect(employeesCheck.rows.every(e => e.user_id === newUserId)).toBe(true);
    });
  });

  describe('PDF Export Integration', () => {
    test('SHOULD GENERATE COMPREHENSIVE PDF EXPORT', async () => {
      const exportResponse = await request(app)
        .get('/api/workers/export-data')
        .query({ walletAddress: testWorker.wallet_address })
        .buffer()
        .parse((res, callback) => {
          res.setEncoding('binary');
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => callback(null, Buffer.from(data, 'binary')));
        });

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.headers['content-type']).toBe('application/pdf');
      expect(exportResponse.headers['content-disposition']).toMatch(/attachment/);

      // Verify PDF signature (starts with %PDF-)
      const pdfSignature = exportResponse.body.toString('utf8', 0, 5);
      expect(pdfSignature).toBe('%PDF-');
    });

    test('SHOULD INCLUDE ALL WORKER DATA IN PDF', async () => {
      // Create test data (work session, payment)
      const employeeResult = await testPool.query(
        'SELECT id FROM employees WHERE employee_wallet_address = $1 LIMIT 1',
        [testWorker.wallet_address]
      );

      await testPool.query(`
        INSERT INTO work_sessions (
          employee_id, organization_id, clock_in, clock_out,
          hours_worked, total_amount, hourly_rate
        ) VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW(), 2.0, 30.0, 15.0)
      `, [employeeResult.rows[0].id, testOrganization1.id]);

      const exportResponse = await request(app)
        .get('/api/workers/export-data')
        .query({ walletAddress: testWorker.wallet_address });

      expect(exportResponse.status).toBe(200);

      // PDF should contain worker name and organization
      const pdfContent = exportResponse.body.toString('utf8');
      expect(pdfContent).toMatch(/TEST INTEGRATION WORKER/i);
      expect(pdfContent).toMatch(/TEST ORG/i);

      // Clean up
      await testPool.query('DELETE FROM work_sessions WHERE employee_id = $1', [employeeResult.rows[0].id]);
    });
  });

  describe('Scheduled Jobs Integration', () => {
    test('SHOULD HARD DELETE AFTER 48-HOUR GRACE PERIOD', async () => {
      // Create soft-deleted user (48+ hours ago)
      const oldDeletion = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50 hours

      await testPool.query(`
        UPDATE users
        SET deleted_at = $1, deletion_reason = 'SCHEDULED JOB TEST'
        WHERE wallet_address = $2
      `, [oldDeletion, testWorker.wallet_address]);

      // Run hard delete job
      const hardDeleteJob = require('../jobs/hardDelete');
      await hardDeleteJob.processHardDeletes();

      // Verify user permanently deleted
      const userCheck = await testPool.query(
        'SELECT * FROM users WHERE wallet_address = $1',
        [testWorker.wallet_address]
      );
      expect(userCheck.rows.length).toBe(0);

      // Verify deletion log updated
      const logCheck = await testPool.query(
        'SELECT hard_deleted_at FROM deletion_logs WHERE wallet_address = $1',
        [testWorker.wallet_address]
      );
      expect(logCheck.rows[0].hard_deleted_at).not.toBeNull();

      // Restore user for other tests
      await testPool.query(`
        INSERT INTO users (wallet_address, user_type, display_name, email)
        VALUES ($1, 'employee', 'RESTORED AFTER HARD DELETE', 'restored@test.com')
      `, [testWorker.wallet_address]);
    });

    test('SHOULD AUTO-DELETE INACTIVE WORKERS AFTER 14 DAYS', async () => {
      // Set last login to 15 days ago
      const oldLogin = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

      await testPool.query(`
        UPDATE users
        SET last_login_at = $1
        WHERE wallet_address = $2
      `, [oldLogin, testWorker.wallet_address]);

      // Run inactivity job
      const inactivityJob = require('../jobs/inactivityDeletion');
      await inactivityJob.processInactiveWorkers();

      // Verify user soft-deleted
      const userCheck = await testPool.query(
        'SELECT deleted_at, deletion_reason FROM users WHERE wallet_address = $1',
        [testWorker.wallet_address]
      );

      expect(userCheck.rows[0].deleted_at).not.toBeNull();
      expect(userCheck.rows[0].deletion_reason).toMatch(/inactivity/i);

      // Verify organizations notified
      const notificationsCheck = await testPool.query(
        'SELECT * FROM ngo_notifications WHERE worker_wallet_address = $1',
        [testWorker.wallet_address]
      );
      expect(notificationsCheck.rows.length).toBeGreaterThan(0);
    });
  });
});
