/**
 * Worker Deletion Feature - Unit Tests
 *
 * Tests for worker profile deletion system including:
 * - Deletion eligibility checks
 * - Profile deletion requests
 * - Cancellation within grace period
 * - NGO notifications
 * - Scheduled jobs (hard delete, inactivity)
 *
 * @requires jest
 * @requires supertest
 */

const request = require('supertest');
const express = require('express');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('pg');
jest.mock('../utils/pdfGenerator');

// Import routes
const workersRouter = require('../routes/workers');
const organizationsRouter = require('../routes/organizations');

// Test app setup
const app = express();
app.use(express.json());
app.use('/api/workers', workersRouter);
app.use('/api/organizations', organizationsRouter);

// Mock authentication middleware
const mockAuthMiddleware = (userType, walletAddress) => (req, res, next) => {
  req.user = {
    wallet_address: walletAddress,
    user_type: userType,
    name: 'TEST USER',
    display_name: 'TEST USER'
  };
  next();
};

describe('Worker Deletion API - Eligibility Checks', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    };
    Pool.mockImplementation(() => mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/workers/deletion-eligibility', () => {
    const testWallet = 'rABC123TEST456WALLET789';

    test('SHOULD RETURN CAN_DELETE TRUE WHEN NO ACTIVE CHANNELS', async () => {
      // Mock no active channels
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // Active channels query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // Unpaid balance query
        .mockResolvedValueOnce({ rows: [] }); // Organizations query

      const response = await request(app)
        .get('/api/workers/deletion-eligibility')
        .query({ walletAddress: testWallet });

      expect(response.status).toBe(200);
      expect(response.body.canDelete).toBe(true);
      expect(response.body.blockingReasons).toEqual([]);
    });

    test('SHOULD RETURN CAN_DELETE FALSE WHEN ACTIVE CHANNELS EXIST', async () => {
      // Mock active channel
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            channel_id: 'CH-TEST-001',
            status: 'active',
            accumulated_balance: 50.25,
            organization_name: 'RED CROSS NGO',
            job_name: 'FIELD WORK'
          }]
        })
        .mockResolvedValueOnce({ rows: [{ total: 50.25 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'RED CROSS NGO' }] });

      const response = await request(app)
        .get('/api/workers/deletion-eligibility')
        .query({ walletAddress: testWallet });

      expect(response.status).toBe(200);
      expect(response.body.canDelete).toBe(false);
      expect(response.body.blockingReasons.length).toBeGreaterThan(0);
      expect(response.body.blockingReasons[0].type).toBe('active_channel');
    });

    test('SHOULD RETURN CAN_DELETE FALSE WHEN UNPAID BALANCE EXISTS', async () => {
      // Mock channel with unpaid balance but closed
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // No active channels
        .mockResolvedValueOnce({ rows: [{ total: 25.50 }] }); // But has unpaid balance

      const response = await request(app)
        .get('/api/workers/deletion-eligibility')
        .query({ walletAddress: testWallet });

      expect(response.status).toBe(200);
      expect(response.body.canDelete).toBe(false);
      expect(response.body.stats.totalUnpaidBalance).toBe(25.50);
    });

    test('SHOULD RETURN CAN_DELETE FALSE WHEN UNCLOSED CHANNELS EXIST', async () => {
      // Mock unclosed channel (no closure_tx_hash)
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 2,
            channel_id: 'CH-TEST-002',
            status: 'timeout',
            accumulated_balance: 0,
            organization_name: 'UNICEF',
            job_name: 'COMMUNITY OUTREACH'
          }]
        });

      const response = await request(app)
        .get('/api/workers/deletion-eligibility')
        .query({ walletAddress: testWallet });

      expect(response.status).toBe(200);
      expect(response.body.canDelete).toBe(false);
      expect(response.body.blockingReasons[0].type).toBe('unclosed_channel');
    });

    test('SHOULD REJECT INVALID WALLET ADDRESS FORMAT', async () => {
      const response = await request(app)
        .get('/api/workers/deletion-eligibility')
        .query({ walletAddress: 'INVALID_WALLET' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/INVALID.*WALLET.*ADDRESS/i);
    });

    test('SHOULD REQUIRE WALLET ADDRESS PARAMETER', async () => {
      const response = await request(app)
        .get('/api/workers/deletion-eligibility');

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/WALLET.*ADDRESS.*REQUIRED/i);
    });
  });
});

describe('Worker Deletion API - Profile Deletion', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    };
    Pool.mockImplementation(() => mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/workers/delete-profile', () => {
    const testWallet = 'rDEF456TEST789WALLET012';

    test('SHOULD SOFT DELETE USER WHEN ELIGIBLE', async () => {
      // Mock eligibility check (no active channels)
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // Active channels
        .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // Unpaid balance
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'RED CROSS NGO' },
            { id: 2, name: 'UNICEF' }
          ]
        }) // Organizations
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE users SET deleted_at
        .mockResolvedValueOnce({ rowCount: 1 }); // INSERT deletion_logs

      const response = await request(app)
        .post('/api/workers/delete-profile')
        .send({
          confirmationText: 'DELETE MY ACCOUNT',
          reason: 'NO LONGER WORKING WITH ANY ORGANIZATIONS'
        })
        .set('Authorization', 'Bearer fake-jwt-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toMatch(/DELETION SCHEDULED/i);
      expect(response.body.affectedOrganizations).toEqual(['RED CROSS NGO', 'UNICEF']);
      expect(response.body.notificationsSent).toBe(2);
    });

    test('SHOULD REJECT DELETION WITH INVALID CONFIRMATION TEXT', async () => {
      const response = await request(app)
        .post('/api/workers/delete-profile')
        .send({
          confirmationText: 'YES DELETE',
          reason: 'TEST'
        })
        .set('Authorization', 'Bearer fake-jwt-token');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVALID_CONFIRMATION');
      expect(response.body.message).toMatch(/DELETE MY ACCOUNT/i);
    });

    test('SHOULD REJECT DELETION WHEN ACTIVE CHANNELS EXIST', async () => {
      // Mock active channel blocking deletion
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            channel_id: 'CH-ACTIVE-001',
            status: 'active',
            accumulated_balance: 100,
            organization_name: 'TEST ORG'
          }]
        });

      const response = await request(app)
        .post('/api/workers/delete-profile')
        .send({
          confirmationText: 'DELETE MY ACCOUNT',
          reason: 'TEST'
        })
        .set('Authorization', 'Bearer fake-jwt-token');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('DELETION_BLOCKED');
      expect(response.body.blockingReasons.length).toBeGreaterThan(0);
    });

    test('SHOULD NOTIFY ALL AFFECTED ORGANIZATIONS', async () => {
      const organizations = [
        { id: 1, name: 'ORG A' },
        { id: 2, name: 'ORG B' },
        { id: 3, name: 'ORG C' }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: organizations })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValue({ rowCount: 1 }); // Notification inserts

      const response = await request(app)
        .post('/api/workers/delete-profile')
        .send({
          confirmationText: 'DELETE MY ACCOUNT',
          reason: 'MOVING TO ANOTHER PLATFORM'
        });

      expect(response.status).toBe(200);
      expect(response.body.notificationsSent).toBe(3);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ngo_notifications'),
        expect.any(Array)
      );
    });

    test('SHOULD CREATE DELETION LOG ENTRY', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'TEST ORG' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await request(app)
        .post('/api/workers/delete-profile')
        .send({
          confirmationText: 'DELETE MY ACCOUNT',
          reason: 'TEST REASON'
        });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO deletion_logs'),
        expect.arrayContaining([
          expect.any(String), // wallet_address
          'employee',
          'self',
          'TEST REASON',
          expect.any(Array), // organizations_affected
          null // data_export_url
        ])
      );
    });
  });

  describe('POST /api/workers/cancel-deletion', () => {
    const testWallet = 'rGHI789TEST012WALLET345';

    test('SHOULD RESTORE SOFT-DELETED ACCOUNT WITHIN 48 HOURS', async () => {
      const recentDeletion = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            wallet_address: testWallet,
            deleted_at: recentDeletion,
            deletion_reason: 'TEST'
          }]
        })
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE users SET deleted_at = NULL

      const response = await request(app)
        .post('/api/workers/cancel-deletion')
        .send({ walletAddress: testWallet });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toMatch(/DELETION CANCELLED/i);
    });

    test('SHOULD REJECT CANCELLATION AFTER 48 HOURS', async () => {
      const oldDeletion = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50 hours ago

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          wallet_address: testWallet,
          deleted_at: oldDeletion
        }]
      });

      const response = await request(app)
        .post('/api/workers/cancel-deletion')
        .send({ walletAddress: testWallet });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('CANCELLATION_EXPIRED');
    });

    test('SHOULD REJECT CANCELLATION FOR NON-DELETED ACCOUNT', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/workers/cancel-deletion')
        .send({ walletAddress: testWallet });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('DELETION_NOT_FOUND');
    });
  });
});

describe('NGO Notifications API', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    };
    Pool.mockImplementation(() => mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/organizations/:orgId/notifications', () => {
    test('SHOULD RETURN ALL NOTIFICATIONS FOR ORGANIZATION', async () => {
      const notifications = [
        {
          id: 1,
          organization_id: 1,
          notification_type: 'worker_deleted',
          worker_wallet_address: 'rABC123',
          worker_name: 'JOHN DOE',
          message: 'WORKER JOHN DOE HAS DELETED THEIR PROFILE',
          metadata: { reason: 'NO LONGER WORKING' },
          is_read: false,
          created_at: new Date()
        },
        {
          id: 2,
          organization_id: 1,
          notification_type: 'deletion_error',
          worker_wallet_address: 'rXYZ789',
          worker_name: 'JANE SMITH',
          message: 'DELETION FAILED: ACTIVE CHANNEL DETECTED',
          metadata: { error: 'DELETION_BLOCKED' },
          is_read: false,
          created_at: new Date()
        }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: notifications })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const response = await request(app)
        .get('/api/organizations/1/notifications');

      expect(response.status).toBe(200);
      expect(response.body.notifications).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });

    test('SHOULD FILTER BY NOTIFICATION TYPE', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              notification_type: 'worker_deleted',
              is_read: false
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const response = await request(app)
        .get('/api/organizations/1/notifications')
        .query({ type: 'worker_deleted' });

      expect(response.status).toBe(200);
      expect(response.body.notifications[0].notificationType).toBe('worker_deleted');
    });

    test('SHOULD FILTER BY READ STATUS', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              notification_type: 'worker_deleted',
              is_read: false
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const response = await request(app)
        .get('/api/organizations/1/notifications')
        .query({ isRead: 'false' });

      expect(response.status).toBe(200);
      expect(response.body.notifications[0].isRead).toBe(false);
    });

    test('SHOULD REJECT UNAUTHORIZED ACCESS', async () => {
      const response = await request(app)
        .get('/api/organizations/999/notifications')
        .set('Authorization', 'Bearer fake-token-for-org-1');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('UNAUTHORIZED');
    });
  });

  describe('PATCH /api/organizations/:orgId/notifications/:notificationId', () => {
    test('SHOULD MARK NOTIFICATION AS READ', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          organization_id: 1,
          is_read: true
        }]
      });

      const response = await request(app)
        .patch('/api/organizations/1/notifications/1')
        .send({ isRead: true });

      expect(response.status).toBe(200);
      expect(response.body.notification.isRead).toBe(true);
    });

    test('SHOULD REJECT NOTIFICATION NOT FOUND', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .patch('/api/organizations/1/notifications/999')
        .send({ isRead: true });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOTIFICATION_NOT_FOUND');
    });
  });
});

describe('Scheduled Jobs', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    };
    Pool.mockImplementation(() => mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Hard Delete Job', () => {
    test('SHOULD PERMANENTLY DELETE ACCOUNTS AFTER 48 HOURS', async () => {
      const oldDeletion = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50 hours ago

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            wallet_address: 'rOLD123',
            user_type: 'employee',
            deleted_at: oldDeletion
          }]
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE employees
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE users
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE deletion_logs
        .mockResolvedValueOnce({ rowCount: 1 }); // COMMIT

      // Run hard delete job logic
      const hardDeleteJob = require('../jobs/hardDelete');
      await hardDeleteJob.processHardDeletes();

      expect(mockPool.query).toHaveBeenCalledWith('BEGIN');
      expect(mockPool.query).toHaveBeenCalledWith('COMMIT');
    });

    test('SHOULD NOT DELETE ACCOUNTS BEFORE 48 HOURS', async () => {
      const recentDeletion = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No eligible deletions

      const hardDeleteJob = require('../jobs/hardDelete');
      await hardDeleteJob.processHardDeletes();

      expect(mockPool.query).not.toHaveBeenCalledWith('BEGIN');
    });

    test('SHOULD UPDATE DELETION LOGS WITH HARD_DELETED_AT', async () => {
      const oldDeletion = new Date(Date.now() - 50 * 60 * 60 * 1000);

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            wallet_address: 'rTEST123',
            user_type: 'employee',
            deleted_at: oldDeletion
          }]
        })
        .mockResolvedValue({ rowCount: 1 });

      const hardDeleteJob = require('../jobs/hardDelete');
      await hardDeleteJob.processHardDeletes();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE deletion_logs'),
        expect.arrayContaining(['rTEST123'])
      );
    });
  });

  describe('Inactivity Deletion Job', () => {
    test('SHOULD AUTO-DELETE WORKERS AFTER 2 WEEKS OF INACTIVITY', async () => {
      const oldLogin = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            wallet_address: 'rINACTIVE123',
            name: 'INACTIVE WORKER',
            last_login_at: oldLogin
          }]
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE users (soft delete)
        .mockResolvedValueOnce({ rowCount: 1 }) // INSERT deletion_logs
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: 'TEST ORG' }]
        }); // Get organizations

      const inactivityJob = require('../jobs/inactivityDeletion');
      await inactivityJob.processInactiveWorkers();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        expect.arrayContaining(['rINACTIVE123'])
      );
    });

    test('SHOULD NOT DELETE WORKERS WITH ACTIVE CHANNELS', async () => {
      const oldLogin = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No eligible workers

      const inactivityJob = require('../jobs/inactivityDeletion');
      await inactivityJob.processInactiveWorkers();

      expect(mockPool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        expect.any(Array)
      );
    });

    test('SHOULD NOT DELETE WORKERS WITH UNPAID BALANCES', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const inactivityJob = require('../jobs/inactivityDeletion');
      await inactivityJob.processInactiveWorkers();

      expect(mockPool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('SET deleted_at'),
        expect.any(Array)
      );
    });

    test('SHOULD NOTIFY ORGANIZATIONS OF AUTO-DELETION', async () => {
      const oldLogin = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            wallet_address: 'rAUTO123',
            name: 'AUTO DELETE WORKER'
          }]
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'ORG A' },
            { id: 2, name: 'ORG B' }
          ]
        })
        .mockResolvedValue({ rowCount: 1 });

      const inactivityJob = require('../jobs/inactivityDeletion');
      await inactivityJob.processInactiveWorkers();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ngo_notifications'),
        expect.any(Array)
      );
    });
  });
});
