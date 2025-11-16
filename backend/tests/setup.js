/**
 * Jest Test Setup
 *
 * Global configuration and utilities for all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.XRPL_NETWORK = 'testnet';
process.env.DATABASE_URL = 'postgresql://test_user:test_pass@localhost:5432/xahpayroll_test';

// Suppress console output during tests (optional)
// Uncomment if you want cleaner test output
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test utilities
global.testHelpers = {
  /**
   * Generate a valid XRPL wallet address for testing
   * @returns {string} Test wallet address
   */
  generateTestWallet: () => {
    const chars = 'rABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let wallet = 'r';
    for (let i = 0; i < 32; i++) {
      wallet += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return wallet;
  },

  /**
   * Generate a test organization
   * @returns {Object} Test organization data
   */
  generateTestOrganization: () => ({
    id: Math.floor(Math.random() * 1000),
    organization_name: `TEST ORG ${Date.now()}`,
    wallet_address: global.testHelpers.generateTestWallet(),
    organization_type: 'ngo',
    created_at: new Date()
  }),

  /**
   * Generate a test worker
   * @returns {Object} Test worker data
   */
  generateTestWorker: () => ({
    wallet_address: global.testHelpers.generateTestWallet(),
    display_name: `TEST WORKER ${Date.now()}`,
    user_type: 'employee',
    email: `worker${Date.now()}@test.com`,
    phone_number: '+1234567890',
    created_at: new Date()
  }),

  /**
   * Generate a test payment channel
   * @returns {Object} Test payment channel data
   */
  generateTestPaymentChannel: () => ({
    id: Math.floor(Math.random() * 1000),
    channel_id: `CH-TEST-${Date.now()}`,
    status: 'active',
    escrow_funded_amount: 1000,
    accumulated_balance: 0,
    hourly_rate: 15,
    job_name: 'TEST JOB',
    created_at: new Date()
  }),

  /**
   * Sleep for a specified duration
   * @param {number} ms Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// Global test constants
global.TEST_CONSTANTS = {
  VALID_WALLET_REGEX: /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/,
  DELETION_GRACE_PERIOD_HOURS: 48,
  INACTIVITY_PERIOD_DAYS: 14,
  ALL_CAPS_CONFIRMATION: 'DELETE MY ACCOUNT'
};

// Setup mock Date if needed for time-based tests
global.mockDate = (isoDate) => {
  const mockNow = new Date(isoDate);
  jest.spyOn(global, 'Date').mockImplementation(() => mockNow);
};

// Restore Date after time-based tests
global.restoreDate = () => {
  global.Date.mockRestore();
};
