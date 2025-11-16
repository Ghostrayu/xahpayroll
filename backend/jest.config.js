/**
 * Jest Configuration for XAH Payroll Backend Tests
 *
 * @type {import('@jest/types').Config.InitialOptions}
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'routes/**/*.js',
    'jobs/**/*.js',
    'utils/**/*.js',
    '!node_modules/**',
    '!tests/**',
    '!coverage/**'
  ],

  coverageDirectory: 'coverage',

  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov'
  ],

  // Coverage thresholds
  coverageThresholds: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Module paths
  moduleDirectories: ['node_modules', '<rootDir>'],

  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(xrpl|xumm-sdk)/)'
  ]
};
