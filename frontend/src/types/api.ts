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
    code?: string
    unpaidBalance?: number
    callerType?: string
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
  channelId: string | null         // XRPL payment channel ID (64-char hex) or null if invalid/missing
  balance: number                  // Accumulated balance (XAH) - maps to off_chain_accumulated_balance from backend
  escrowBalance: number            // Remaining escrow (funded - accumulated)
  hourlyRate: number               // Payment rate in XAH per hour
  hoursAccumulated: number         // Total hours tracked for this channel
  maxDailyHours?: number           // Maximum hours worker can work per day for this channel (default: 8.00)
  status: string                   // Channel status: 'active' | 'closing' | 'closed'
  lastUpdate: string               // Human-readable time since last update
  balanceUpdateFrequency: string   // How often claims are generated: 'Hourly' | 'Every 30 Minutes' | etc.
  lastLedgerSync?: string | null   // Timestamp when channel was last synced from XAH Ledger (ISO format) or null if never synced
  hasInvalidChannelId?: boolean    // Flag indicating channel_id is missing or invalid format
  expirationTime?: string          // Scheduled expiration time (ISO format) for channels in 'closing' status
  offChainAccumulatedBalance?: number // Optional: Off-chain balance field (worker earnings) for transparency
  onChainBalance?: number          // Optional: On-chain balance field (XRPL ledger Balance) for transparency
  closureType?: 'scheduled' | 'immediate' // NEW: Type of closure (scheduled = NGO with balance, immediate = NGO with no balance or worker)
  settleDelayHours?: number        // NEW: Worker protection period for scheduled closures (typically 24 hours, 0 for immediate)
}

/**
 * Activity Log Entry
 * Recent activity feed for NGO Dashboard
 *
 * Backend endpoint: GET /api/organizations/activity/:walletAddress
 * Component usage: NgoDashboard.tsx
 *
 * Enhanced with Phase 1-3 improvements:
 * - Phase 1: Payment failures, channel closures, escrow refunds
 * - Phase 2: Payment types, channel names, tx hashes, failure reasons
 * - Phase 3: Priority indicators (critical, warning, notification, normal)
 */
export interface Activity {
  worker: string                   // Worker's full name (or 'SYSTEM' for system events)
  action: string                   // Activity description with enhanced context (includes emoji for critical events)
  actionDetails?: string | null    // Additional details (payment type, tx hash preview, failure reason)
  amount?: string | null           // Payment amount with unit (e.g., '15.50 XAH') - null for clock events
  time: string                     // Human-readable time ago (e.g., '5 MINUTES AGO')
  status: string                   // Activity status: 'active' | 'completed'
  priority: 'critical' | 'warning' | 'notification' | 'normal'  // Phase 3: Priority for UI styling
  txHash?: string | null           // XRPL transaction hash (64-char hex) for verification
  paymentType?: string | null      // Payment type: 'hourly' | 'bonus' | 'adjustment' | 'refund'
  jobName?: string | null          // Payment channel job name for channel events
}

/**
 * Worker Activity Entry
 * Recent activity feed for Worker Dashboard
 *
 * Backend endpoint: GET /api/workers/activity/:walletAddress
 * Component usage: WorkerDashboard.tsx
 *
 * Enhanced with Phase 1-3 improvements (similar to NGO Activity):
 * - Phase 1: Payment events (received/failed), channel assignments, closures
 * - Phase 2: Payment types, channel names, tx hashes, detailed messages
 * - Phase 3: Priority indicators (critical, warning, notification, normal)
 */
export interface WorkerActivity {
  organization: string             // Organization name (or 'SYSTEM' for system events)
  action: string                   // Activity description with enhanced context (includes emoji for critical events)
  actionDetails?: string | null    // Additional details (payment type, tx hash preview, worked hours, messages)
  amount?: string | null           // Payment/escrow amount with unit (e.g., '15.50 XAH') - null for clock events
  time: string                     // Human-readable time ago (e.g., '5 MINUTES AGO')
  status: string                   // Activity status: 'active' | 'completed'
  priority: 'critical' | 'warning' | 'notification' | 'normal'  // Phase 3: Priority for UI styling
  txHash?: string | null           // XRPL transaction hash (64-char hex) for verification
  paymentType?: string | null      // Payment type: 'hourly' | 'bonus' | 'adjustment' | 'refund'
  jobName?: string | null          // Payment channel job name for channel events
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
    settleDelayHours?: number      // Worker protection period in hours (for scheduled closures)
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

/**
 * Organization Data (Simplified Schema)
 * Full organization record from database
 *
 * Backend endpoint: GET /api/organizations/:walletAddress, POST /api/organizations
 * Component usage: OrganizationSetupStep.tsx, MultiStepSignupModal.tsx
 *
 * CRITICAL: escrowWalletAddress MUST match users.wallet_address (1:1 mapping)
 * This mapping is essential for payment channel creation
 */
export interface OrganizationData {
  id: number                       // Database organizations ID
  organizationName: string         // Organization display name (required)
  escrowWalletAddress: string      // MUST match user's wallet_address (required)
  createdAt: string                // ISO 8601 timestamp of creation
  updatedAt?: string               // ISO 8601 timestamp of last update
}

/**
 * Organization Creation Request
 * Used during signup (step 2 for NGO/Employer)
 *
 * Backend endpoint: POST /api/organizations
 * Component usage: OrganizationSetupStep.tsx
 */
export interface OrganizationCreateRequest {
  organizationName: string         // Organization name (required)
  escrowWalletAddress: string      // MUST match logged-in user's wallet address (required)
}

/**
 * Organization Update Request
 * Used for profile editing (Phase 6 - future feature)
 *
 * Backend endpoint: PUT /api/organizations/:walletAddress
 * Component usage: Future organization profile editing page
 */
export interface OrganizationUpdateRequest {
  organizationName?: string        // Update organization name
}

/**
 * Worker Deletion - Blocking Reason
 * Explains why a worker cannot delete their profile
 *
 * Backend endpoint: GET /api/workers/deletion-eligibility
 * Component usage: DeleteProfileModal.tsx
 */
export interface BlockingReason {
  type: 'active_channel' | 'unclosed_channel'  // Type of blocking reason
  organization: string                         // Organization name
  channelId: string                           // Payment channel ID
  unpaidBalance: number                       // Unpaid balance amount (XAH)
  status: string                              // Channel status
}

/**
 * Worker Deletion - Eligibility Statistics
 * Summary statistics for deletion eligibility check
 *
 * Backend endpoint: GET /api/workers/deletion-eligibility
 * Component usage: DeleteProfileModal.tsx
 */
export interface DeletionStats {
  totalOrganizations: number      // Total organizations worker is associated with
  activeChannels: number          // Count of active payment channels
  totalUnpaidBalance: number      // Sum of all unpaid balances (XAH)
  closedChannels: number          // Count of closed payment channels
}

/**
 * Worker Deletion - Eligibility Response
 * Checks if worker can delete their profile
 *
 * Backend endpoint: GET /api/workers/deletion-eligibility
 * Component usage: DeleteProfileModal.tsx
 */
export interface DeletionEligibilityResponse {
  canDelete: boolean              // Whether worker is eligible for deletion
  blockingReasons: BlockingReason[]  // Array of reasons preventing deletion
  stats: DeletionStats           // Summary statistics
}

/**
 * Worker Deletion - Request
 * Request body for profile deletion
 *
 * Backend endpoint: POST /api/workers/delete-profile
 * Component usage: DeleteProfileModal.tsx
 */
export interface DeleteProfileRequest {
  walletAddress: string           // Worker's wallet address
  confirmationText: string        // Must be "DELETE MY ACCOUNT"
  reason?: string                 // Optional reason for deletion
}

/**
 * Worker Deletion - Success Response
 * Response after successful profile deletion scheduling
 *
 * Backend endpoint: POST /api/workers/delete-profile
 * Component usage: DeleteProfileModal.tsx
 */
export interface DeleteProfileResponse {
  success: boolean                // Always true on success
  message: string                 // Success message (ALL CAPS)
  deletionScheduledAt: string     // ISO 8601 timestamp of soft delete
  hardDeleteAt: string            // ISO 8601 timestamp of scheduled hard delete
  dataExportUrl: string | null    // PDF export URL (null for direct download)
  affectedOrganizations: string[] // List of organization names
  notificationsSent: number       // Count of NGO notifications sent
}

/**
 * Orphaned Records - Statistics
 * Summary of orphaned records found for a wallet address
 *
 * Backend endpoint: GET /api/workers/check-orphaned-records
 * Component usage: OrphanedRecordsModal.tsx
 */
export interface OrphanedRecordsStats {
  hasOrphanedRecords: boolean     // Whether orphaned records exist
  workSessionsCount: number       // Number of previous work sessions
  organizationsCount: number      // Number of previous organizations
  totalEarnings: number           // Historical earnings (XAH)
  lastActivityDate: string | null // ISO 8601 timestamp of last activity
}

/**
 * Orphaned Records - Re-association Request
 * Request body for re-associating orphaned records
 *
 * Backend endpoint: POST /api/workers/reassociate-records
 * Component usage: OrphanedRecordsModal.tsx
 */
export interface ReassociateRecordsRequest {
  walletAddress: string           // Worker's wallet address
  newUserId: number               // New user ID to associate records with
}

/**
 * Orphaned Records - Re-association Response
 * Response after successful record re-association
 *
 * Backend endpoint: POST /api/workers/reassociate-records
 * Component usage: OrphanedRecordsModal.tsx
 */
export interface ReassociateRecordsResponse {
  success: boolean                // Always true on success
  message: string                 // Success message (ALL CAPS)
  recordsReassociated: number     // Count of records re-associated
}

/**
 * NGO Notification Type
 * Different types of notifications that can be sent to NGOs
 *
 * Backend: ngo_notifications.notification_type column
 * Component usage: NGONotifications.tsx, notification components
 */
export type NotificationType =
  | 'worker_deleted'      // Worker self-deleted their profile
  | 'worker_removed'      // Worker removed by NGO admin
  | 'deletion_error'      // Deletion attempt failed
  | 'channel_closure_failed'  // Payment channel closure validation failed

/**
 * NGO Notification
 * Individual notification record for organizations
 *
 * Backend endpoint: GET /api/organizations/:orgId/notifications
 * Component usage: NGONotifications.tsx
 */
export interface NGONotification {
  id: number                      // Database ngo_notifications ID
  organizationId: number          // Organization receiving the notification
  notificationType: NotificationType  // Type of notification
  workerWalletAddress: string     // Worker's XRPL wallet address
  workerName: string              // Worker's full name
  message: string                 // Notification message (ALL CAPS)
  metadata: {                     // Additional context data (JSONB)
    // Worker deletion metadata
    reason?: string               // Deletion reason
    deletionDate?: string         // ISO 8601 timestamp
    deletionType?: string         // 'manual' | 'automatic'
    inactivityDays?: number       // Days of inactivity before auto-deletion
    blockingChannelId?: string    // Channel ID blocking deletion
    removedBy?: string            // Email/ID of admin who removed worker

    // Channel closure failure metadata
    channelId?: string            // Payment channel ID
    txHash?: string               // Transaction hash
    jobName?: string              // Job/channel name
    validated?: boolean           // Transaction validation status
    channelRemoved?: boolean      // Channel removal status on ledger
    error?: string                // Error message/type
  }
  isRead: boolean                 // Whether notification has been read
  createdAt: string               // ISO 8601 timestamp of notification creation
}

/**
 * NGO Notifications List Response
 * Paginated list of notifications for an organization
 *
 * Backend endpoint: GET /api/organizations/:orgId/notifications
 * Component usage: NGONotifications.tsx
 */
export interface NGONotificationsResponse {
  notifications: NGONotification[]  // Array of notifications
  pagination: {
    total: number                  // Total count of notifications
    limit: number                  // Page size limit
    offset: number                 // Current offset
    hasMore: boolean              // Whether more notifications exist
  }
}

/**
 * NGO Notifications Query Parameters
 * Filter and pagination options for notifications list
 *
 * Backend endpoint: GET /api/organizations/:orgId/notifications?type=...&isRead=...
 * Component usage: NGONotifications.tsx
 */
export interface NotificationsQueryParams {
  type?: NotificationType         // Filter by notification type
  isRead?: boolean                // Filter by read status
  limit?: number                  // Page size (default: 20)
  offset?: number                 // Pagination offset (default: 0)
}

/**
 * Mark Notification Read Request
 * Request to mark notification(s) as read
 *
 * Backend endpoint: PATCH /api/organizations/:orgId/notifications/:notificationId
 * Component usage: NGONotifications.tsx, notification components
 */
export interface MarkNotificationReadRequest {
  isRead: boolean                 // New read status
}
