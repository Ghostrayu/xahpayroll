/**
 * API Types for XAH Payroll
 * Centralized interface definitions for API responses and requests
 *
 * NAMING CONVENTION:
 * - All properties use camelCase (TypeScript/JavaScript convention)
 * - Backend API responses are transformed to camelCase before reaching components
 * - Database columns (snake_case) are mapped in backend routes to camelCase
 *
 * USAGE:
 * - Import from this file for type safety across the application
 * - Backend routes in /backend/routes/* transform database results to match these types
 * - Frontend components in /frontend/src/** consume these standardized types
 */

/**
 * Standard API Response Wrapper
 * All backend API endpoints return this structure
 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    message: string
  }
}

/**
 * Organization Statistics
 * Used in NGO Dashboard for organization-level metrics
 *
 * Backend endpoint: GET /api/organizations/stats/:walletAddress
 * Component usage: NgoDashboard.tsx
 */
export interface OrgStats {
  totalWorkers: number         // Total number of workers in organization
  activeWorkers: number         // Workers currently clocked in
  escrowBalance: number         // Total XAH held in all active payment channels
  totalPaid: number             // Total XAH paid out (completed payments)
  avgHourlyRate: number         // Average hourly rate across all workers
  hoursThisMonth: number        // Total hours worked this calendar month
}

/**
 * Worker/Employee (Dashboard View)
 * Used in NGO Dashboard workers list
 *
 * Backend endpoint: GET /api/organizations/workers/:walletAddress
 * Component usage: NgoDashboard.tsx
 */
export interface Worker {
  id: number                    // Database employee ID
  name: string                  // Worker's full name
  employeeWalletAddress: string // Worker's XRPL wallet address (r-address)
  rate?: number                 // Hourly rate in XAH (optional)
  hoursToday?: string          // Hours worked today (formatted string)
  status: string                // Current status: 'Working' | 'Idle'
}

/**
 * Payment Channel
 * Active payment channel information displayed in NGO Dashboard
 *
 * Backend endpoint: GET /api/organizations/payment-channels/:walletAddress
 * Component usage: NgoDashboard.tsx
 */
export interface PaymentChannel {
  id: number                       // Database payment_channels ID
  worker: string                   // Worker's full name
  jobName: string                  // Job/channel description
  channelId: string                // XRPL payment channel ID
  balance: number                  // Accumulated balance (XAH) - what worker has earned
  escrowBalance: number            // Remaining escrow (funded - accumulated)
  hourlyRate: number               // Payment rate in XAH per hour
  hoursAccumulated: number         // Total hours tracked for this channel
  status: string                   // Channel status: 'active' | 'closed'
  lastUpdate: string               // Human-readable time since last update
  balanceUpdateFrequency: string   // How often claims are generated: 'Hourly' | 'Every 30 Minutes' | etc.
}

/**
 * Activity Log Entry
 * Recent activity feed for NGO Dashboard
 *
 * Backend endpoint: GET /api/organizations/activity/:walletAddress
 * Component usage: NgoDashboard.tsx
 */
export interface Activity {
  worker: string                   // Worker's full name
  action: string                   // Activity description: 'Clocked In' | 'Clocked Out' | 'Payment Sent'
  amount?: string | null           // Payment amount with unit (e.g., '15.50 XAH') - null for clock events
  time: string                     // Human-readable time ago (e.g., '5 minutes ago')
  status: string                   // Activity status: 'active' | 'completed'
}

/**
 * Work Session
 * Individual work session tracking for employees
 *
 * Backend endpoint: GET /api/workers/sessions/:walletAddress
 * Component usage: EmployeeDashboard.tsx (worker view)
 */
export interface WorkSession {
  id: number                       // Database work_sessions ID
  clockIn: string                  // ISO 8601 timestamp of clock in
  clockOut?: string                // ISO 8601 timestamp of clock out (null if active)
  hours?: number                   // Total hours worked in session
  status: string                   // Session status: 'active' | 'completed' | 'timeout'
}

/**
 * Worker Earnings
 * Aggregated earnings data for employee dashboard
 *
 * Backend endpoint: GET /api/workers/earnings/:walletAddress
 * Component usage: EmployeeDashboard.tsx (worker view)
 */
export interface WorkerEarnings {
  today: number                    // XAH earned today
  week: number                     // XAH earned this week
  month: number                    // XAH earned this month
  total: number                    // Total lifetime XAH earnings
}

/**
 * Worker for CreatePaymentChannelModal dropdown
 * Full worker details for payment channel creation
 *
 * Backend endpoint: GET /api/workers/list/:ngoWalletAddress
 * Component usage: CreatePaymentChannelModal.tsx
 *
 * NOTE: This differs from Worker interface - includes full XRPL address for channel creation
 */
export interface WorkerForChannel {
  id: number                       // Database employee ID
  name: string                     // Worker's full name
  walletAddress: string            // Worker's XRPL wallet address (r-address)
  hourlyRate: number               // Default/suggested hourly rate in XAH
  status: string                   // Employment status: 'active' | 'inactive'
  createdAt: string                // ISO 8601 timestamp of when worker was added
}

/**
 * Payment Channel Cancel Response
 * Data returned when initiating payment channel cancellation
 *
 * Backend endpoint: POST /api/payment-channels/:channelId/close
 * Component usage: NgoDashboard.tsx (handleCancelConfirm)
 */
export interface CancelChannelData {
  channel: {
    channelId: string              // XRPL payment channel ID
    escrowReturn: number           // XAH to be returned to NGO wallet
    accumulatedBalance: number     // XAH to be paid to worker
  }
  xrplTransaction: {
    Balance: string                // Worker's accumulated balance in drops
    Amount: string                 // Escrow return amount in drops
    Public: string                 // NGO's public key for transaction signing
  }
}

/**
 * Payment Channel Confirm Response
 * Data returned after confirming payment channel closure
 *
 * Backend endpoint: POST /api/payment-channels/:channelId/close/confirm
 * Component usage: NgoDashboard.tsx (handleCancelConfirm - step 3)
 */
export interface ConfirmChannelData {
  channel: PaymentChannel          // Updated payment channel with status='closed'
}
