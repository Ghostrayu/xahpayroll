/**
 * API Service Client
 * Centralized API calls for XAH Payroll backend
 */

import type {
  ApiResponse,
  OrgStats,
  Worker,
  PaymentChannel,
  Activity,
  WorkSession,
  WorkerEarnings,
  WorkerForChannel,
  CancelChannelData,
  ConfirmChannelData,
  OrganizationData,
  OrganizationCreateRequest,
  OrganizationUpdateRequest,
  DeletionEligibilityResponse,
  DeleteProfileResponse,
  OrphanedRecordsStats,
  ReassociateRecordsResponse,
  NGONotification,
  NGONotificationsResponse,
  NotificationsQueryParams,
  MarkNotificationReadRequest,
} from '../types/api'

// Re-export types for backward compatibility
export type {
  ApiResponse,
  OrgStats,
  Worker,
  PaymentChannel,
  Activity,
  WorkSession,
  WorkerEarnings,
  WorkerForChannel,
  CancelChannelData,
  ConfirmChannelData,
  OrganizationData,
  OrganizationCreateRequest,
  OrganizationUpdateRequest,
  DeletionEligibilityResponse,
  DeleteProfileResponse,
  OrphanedRecordsStats,
  ReassociateRecordsResponse,
  NGONotification,
  NGONotificationsResponse,
  NotificationsQueryParams,
  MarkNotificationReadRequest,
}

const getBackendUrl = () => {
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
}

/**
 * API Error class
 */
class ApiError extends Error {
  status: number

  constructor(message: string, status: number = 500) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getBackendUrl()}${endpoint}`

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new ApiError(
        data.error?.message || `HTTP error ${response.status}`,
        response.status
      )
    }

    return data as T
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    // Network or parsing errors
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error occurred',
      0
    )
  }
}

/**
 * Organization/NGO API calls
 */
export const organizationApi = {
  /**
   * Get organization statistics
   */
  async getStats(walletAddress: string): Promise<OrgStats> {
    const response = await apiFetch<ApiResponse<OrgStats>>(
      `/api/organizations/stats/${walletAddress}`
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to fetch organization stats')
    }

    return response.data
  },

  /**
   * Get organization workers
   */
  async getWorkers(walletAddress: string): Promise<Worker[]> {
    const response = await apiFetch<ApiResponse<Worker[]>>(
      `/api/organizations/workers/${walletAddress}`
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to fetch workers')
    }

    return response.data
  },

  /**
   * Get recent activity
   */
  async getActivity(walletAddress: string): Promise<Activity[]> {
    const response = await apiFetch<ApiResponse<Activity[]>>(
      `/api/organizations/activity/${walletAddress}`
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to fetch activity')
    }

    return response.data
  },

  /**
   * Get payment channels
   */
  async getPaymentChannels(walletAddress: string): Promise<PaymentChannel[]> {
    const response = await apiFetch<ApiResponse<PaymentChannel[]>>(
      `/api/organizations/payment-channels/${walletAddress}`
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to fetch payment channels')
    }

    return response.data
  },

  /**
   * Create a new organization (multi-step signup)
   * CRITICAL: escrowWalletAddress MUST match user's wallet_address
   */
  async create(data: OrganizationCreateRequest): Promise<OrganizationData> {
    const response = await apiFetch<ApiResponse<{ organization: OrganizationData }>>(
      '/api/organizations',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError('FAILED TO CREATE ORGANIZATION')
    }

    return response.data.organization
  },

  /**
   * Get organization by wallet address
   */
  async get(walletAddress: string): Promise<OrganizationData> {
    const response = await apiFetch<ApiResponse<{ organization: OrganizationData }>>(
      `/api/organizations/${walletAddress}`
    )

    if (!response.success || !response.data) {
      throw new ApiError('FAILED TO FETCH ORGANIZATION')
    }

    return response.data.organization
  },

  /**
   * Update organization (Phase 6 - future feature)
   */
  async update(
    walletAddress: string,
    data: OrganizationUpdateRequest
  ): Promise<OrganizationData> {
    const response = await apiFetch<ApiResponse<{ organization: OrganizationData }>>(
      `/api/organizations/${walletAddress}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError('FAILED TO UPDATE ORGANIZATION')
    }

    return response.data.organization
  },
}

/**
 * Worker/Employee API calls
 */
export const workerApi = {
  /**
   * Get worker earnings
   */
  async getEarnings(walletAddress: string): Promise<WorkerEarnings> {
    const response = await apiFetch<ApiResponse<WorkerEarnings>>(
      `/api/workers/earnings/${walletAddress}`
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to fetch earnings')
    }

    return response.data
  },

  /**
   * Get work sessions
   */
  async getWorkSessions(walletAddress: string): Promise<WorkSession[]> {
    const response = await apiFetch<ApiResponse<WorkSession[]>>(
      `/api/workers/sessions/${walletAddress}`
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to fetch work sessions')
    }

    return response.data
  },

  /**
   * Clock in
   */
  async clockIn(walletAddress: string): Promise<WorkSession> {
    const response = await apiFetch<ApiResponse<WorkSession>>(
      `/api/workers/clock-in`,
      {
        method: 'POST',
        body: JSON.stringify({ walletAddress }),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to clock in')
    }

    return response.data
  },

  /**
   * Clock out
   */
  async clockOut(walletAddress: string): Promise<WorkSession> {
    const response = await apiFetch<ApiResponse<WorkSession>>(
      `/api/workers/clock-out`,
      {
        method: 'POST',
        body: JSON.stringify({ walletAddress }),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to clock out')
    }

    return response.data
  },

  /**
   * Get worker payment channels
   * Returns all active payment channels for a worker across all organizations
   */
  async getPaymentChannels(walletAddress: string): Promise<PaymentChannel[]> {
    const response = await apiFetch<ApiResponse<PaymentChannel[]>>(
      `/api/workers/${walletAddress}/payment-channels`
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to fetch payment channels')
    }

    return response.data
  },
}

/**
 * User API calls
 */
export const userApi = {
  /**
   * Get user profile
   */
  async getProfile(walletAddress: string): Promise<any> {
    const response = await apiFetch<ApiResponse<any>>(
      `/api/users/profile/${walletAddress}`
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to fetch user profile')
    }

    return response.data
  },

  /**
   * Create or update user profile
   */
  async saveProfile(profileData: any): Promise<any> {
    const response = await apiFetch<ApiResponse<any>>(
      `/api/users/profile`,
      {
        method: 'POST',
        body: JSON.stringify(profileData),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError('Failed to save user profile')
    }

    return response.data
  },
}

/**
 * Payment Channel API calls
 */
export const paymentChannelApi = {
  /**
   * Initiate payment channel cancellation
   * Returns XRPL transaction details needed for closure
   * Can be called by either NGO/employer or worker
   */
  async cancelPaymentChannel(
    channelId: string,
    walletAddress: string,
    userType: 'ngo' | 'worker',
    forceClose?: boolean
  ): Promise<ApiResponse<{
    channel: any
    xrplTransaction: any
  }>> {
    const body: any = { forceClose }

    if (userType === 'ngo') {
      body.organizationWalletAddress = walletAddress
    } else {
      body.workerWalletAddress = walletAddress
    }

    try {
      const response = await apiFetch<ApiResponse<{
        channel: any
        xrplTransaction: any
      }>>(
        `/api/payment-channels/${channelId}/close`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      )

      // Return response as-is for successful calls
      return response
    } catch (error) {
      // Handle 400 Bad Request with UNCLAIMED_BALANCE gracefully
      // This is a warning, not an error - let frontend handle it
      if (error instanceof ApiError && error.status === 400) {
        // Fetch the actual response body to get the UNCLAIMED_BALANCE details
        const url = `${getBackendUrl()}/api/payment-channels/${channelId}/close`
        const rawResponse = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await rawResponse.json()

        // Return as ApiResponse format so frontend can handle the warning
        return {
          success: false,
          error: data.error || { message: error.message }
        } as ApiResponse<any>
      }

      // For other errors, re-throw
      throw error
    }
  },

  /**
   * Confirm payment channel closure after XRPL transaction succeeds
   * Can be called by either NGO/employer or worker
   */
  async confirmChannelClosure(
    channelId: string,
    txHash: string,
    walletAddress: string,
    userType: 'ngo' | 'worker'
  ): Promise<ApiResponse<{ channel: any }>> {
    const body: any = { txHash }

    if (userType === 'ngo') {
      body.organizationWalletAddress = walletAddress
    } else {
      body.workerWalletAddress = walletAddress
    }

    const response = await apiFetch<ApiResponse<{ channel: any }>>(
      `/api/payment-channels/${channelId}/close/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError(
        response.error?.message || 'FAILED TO CONFIRM CHANNEL CLOSURE'
      )
    }

    return response
  },

  /**
   * Sync expired closing channels
   * Checks ledger for channels past expiration that are already closed
   */
  async syncExpiredClosing(): Promise<ApiResponse<{
    expiredChannels: number
    closed: number
  }>> {
    const response = await apiFetch<ApiResponse<{
      expiredChannels: number
      closed: number
    }>>(
      '/api/payment-channels/sync-expired-closing',
      {
        method: 'POST',
      }
    )

    if (!response.success) {
      throw new ApiError(
        response.error?.message || 'FAILED TO SYNC EXPIRED CHANNELS'
      )
    }

    return response
  },

}

/**
 * Worker Deletion API calls
 */
export const workerDeletionApi = {
  /**
   * Check if worker is eligible for profile deletion
   * Verifies no active channels or unpaid balances exist
   */
  async checkDeletionEligibility(
    walletAddress: string
  ): Promise<DeletionEligibilityResponse> {
    const response = await apiFetch<DeletionEligibilityResponse>(
      `/api/workers/deletion-eligibility?walletAddress=${walletAddress}`
    )

    return response
  },

  /**
   * Request worker profile deletion
   * Requires confirmation text and eligibility
   */
  async deleteProfile(
    walletAddress: string,
    confirmationText: string,
    reason?: string
  ): Promise<DeleteProfileResponse> {
    const response = await apiFetch<DeleteProfileResponse>(
      `/api/workers/delete-profile`,
      {
        method: 'POST',
        body: JSON.stringify({
          walletAddress,
          confirmationText,
          reason,
        }),
      }
    )

    return response
  },

  /**
   * Export worker data to PDF
   * Opens PDF in new window for direct download
   */
  exportWorkerData(walletAddress: string): void {
    const backendUrl = getBackendUrl()
    const exportUrl = `${backendUrl}/api/workers/export-data?walletAddress=${walletAddress}`
    window.open(exportUrl, '_blank')
  },

  /**
   * Cancel profile deletion within 48-hour grace period
   * Restores soft-deleted account
   */
  async cancelDeletion(walletAddress: string): Promise<ApiResponse<{
    message: string
    restoredAt: string
  }>> {
    const response = await apiFetch<ApiResponse<{
      message: string
      restoredAt: string
    }>>(
      `/api/workers/cancel-deletion`,
      {
        method: 'POST',
        body: JSON.stringify({ walletAddress }),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError(
        response.error?.message || 'Failed to cancel deletion'
      )
    }

    return response
  },

  /**
   * Check for orphaned records for a wallet address
   * Returns statistics about previous work history
   */
  async checkOrphanedRecords(walletAddress: string): Promise<OrphanedRecordsStats> {
    const response = await apiFetch<OrphanedRecordsStats>(
      `/api/workers/check-orphaned-records?walletAddress=${walletAddress}`
    )

    return response
  },

  /**
   * Re-associate orphaned records with new user account
   * Restores complete work history
   */
  async reassociateRecords(
    walletAddress: string,
    newUserId: number
  ): Promise<ReassociateRecordsResponse> {
    const response = await apiFetch<ReassociateRecordsResponse>(
      `/api/workers/reassociate-records`,
      {
        method: 'POST',
        body: JSON.stringify({
          walletAddress,
          newUserId,
        }),
      }
    )

    return response
  },
}

/**
 * NGO Notifications API calls
 */
export const notificationApi = {
  /**
   * Get notifications for an organization
   * Supports filtering by type, read status, and pagination
   */
  async getNotifications(
    organizationId: number,
    params?: NotificationsQueryParams
  ): Promise<NGONotificationsResponse> {
    // Build query string from parameters
    const queryParams = new URLSearchParams()
    if (params?.type) queryParams.append('type', params.type)
    if (params?.isRead !== undefined) queryParams.append('isRead', String(params.isRead))
    if (params?.limit) queryParams.append('limit', String(params.limit))
    if (params?.offset) queryParams.append('offset', String(params.offset))

    const queryString = queryParams.toString()
    const endpoint = `/api/organizations/${organizationId}/notifications${queryString ? `?${queryString}` : ''}`

    const response = await apiFetch<NGONotificationsResponse>(endpoint)

    return response
  },

  /**
   * Mark a specific notification as read
   */
  async markAsRead(
    organizationId: number,
    notificationId: number
  ): Promise<ApiResponse<{ notification: NGONotification }>> {
    const response = await apiFetch<ApiResponse<{ notification: NGONotification }>>(
      `/api/organizations/${organizationId}/notifications/${notificationId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isRead: true } as MarkNotificationReadRequest),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError('FAILED TO MARK NOTIFICATION AS READ')
    }

    return response
  },

  /**
   * Mark all notifications as read for an organization
   */
  async markAllAsRead(organizationId: number): Promise<ApiResponse<{ count: number }>> {
    const response = await apiFetch<ApiResponse<{ count: number }>>(
      `/api/organizations/${organizationId}/notifications/mark-all-read`,
      {
        method: 'POST',
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError('FAILED TO MARK ALL NOTIFICATIONS AS READ')
    }

    return response
  },

  /**
   * Get unread notification count for an organization
   */
  async getUnreadCount(organizationId: number): Promise<number> {
    const response = await this.getNotifications(organizationId, {
      isRead: false,
      limit: 1, // Just need the count, not all notifications
      offset: 0,
    })

    return response.pagination.total
  },
}

/**
 * Worker Notifications API calls
 * Handles worker notifications including closure requests from NGOs
 */
export const workerNotificationsApi = {
  /**
   * Get all notifications for a worker
   */
  async getNotifications(walletAddress: string, unreadOnly?: boolean): Promise<{
    notifications: any[]
    unreadCount: number
  }> {
    const url = `/api/worker-notifications/${walletAddress}${unreadOnly ? '?unreadOnly=true' : ''}`
    const response = await apiFetch<ApiResponse<{
      notifications: any[]
      unreadCount: number
    }>>(url)

    if (!response.success || !response.data) {
      throw new ApiError('FAILED TO FETCH WORKER NOTIFICATIONS')
    }

    return response.data
  },

  /**
   * Get unread notification count for badge display
   */
  async getUnreadCount(walletAddress: string): Promise<number> {
    const response = await apiFetch<ApiResponse<{ unreadCount: number }>>(
      `/api/worker-notifications/unread-count/${walletAddress}`
    )

    if (!response.success || !response.data) {
      throw new ApiError('FAILED TO GET UNREAD COUNT')
    }

    return response.data.unreadCount
  },

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: number, walletAddress: string): Promise<ApiResponse<{ notification: any }>> {
    const response = await apiFetch<ApiResponse<{ notification: any }>>(
      `/api/worker-notifications/${notificationId}/read`,
      {
        method: 'PUT',
        body: JSON.stringify({ walletAddress }),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError('FAILED TO MARK NOTIFICATION AS READ')
    }

    return response
  },

  /**
   * Worker approves closure request and gets channel details for closure
   */
  async approveClosure(notificationId: number, walletAddress: string): Promise<ApiResponse<{
    channelId: string
    balance: number
    escrowBalance: number
    jobName: string
    organizationName: string
    message: string
  }>> {
    const response = await apiFetch<ApiResponse<{
      channelId: string
      balance: number
      escrowBalance: number
      jobName: string
      organizationName: string
      message: string
    }>>(
      `/api/worker-notifications/${notificationId}/approve-closure`,
      {
        method: 'POST',
        body: JSON.stringify({ walletAddress }),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError(
        response.error?.message || 'FAILED TO APPROVE CLOSURE REQUEST'
      )
    }

    return response
  },
}

/**
 * Work Sessions API
 * Endpoints for clock-in/out and work session management
 */
export const workSessionsApi = {
  /**
   * Clock in to a payment channel (start work session)
   */
  async clockIn(
    workerWalletAddress: string,
    paymentChannelId: number,
    notes?: string
  ): Promise<ApiResponse<{
    workSession: {
      id: number
      paymentChannelId: number
      employeeId: number
      organizationId: number
      clockIn: string
      clockOut: string | null
      hoursWorked: number | null
      hourlyRate: number
      totalAmount: number | null
      sessionStatus: 'active' | 'completed'
      maxDailyHours: number
      hoursWorkedToday: number
      createdAt: string
    }
    message: string
  }>> {
    return apiFetch('/api/work-sessions/clock-in', {
      method: 'POST',
      body: JSON.stringify({
        workerWalletAddress,
        paymentChannelId,
        notes,
      }),
    })
  },

  /**
   * Clock out of a work session (end work session)
   */
  async clockOut(
    workerWalletAddress: string,
    workSessionId: number,
    notes?: string
  ): Promise<ApiResponse<{
    workSession: {
      id: number
      paymentChannelId: number
      clockIn: string
      clockOut: string
      hoursWorked: number
      hourlyRate: number
      totalAmount: number
      sessionStatus: 'completed'
      createdAt: string
      updatedAt: string
    }
    paymentChannelUpdate: {
      id: number
      accumulatedBalance: number
      hoursAccumulated: number
    }
    message: string
  }>> {
    return apiFetch('/api/work-sessions/clock-out', {
      method: 'POST',
      body: JSON.stringify({
        workerWalletAddress,
        workSessionId,
        notes,
      }),
    })
  },

  /**
   * Get all active work sessions for a worker (for timer restoration)
   */
  async getActiveSessions(
    workerWalletAddress: string
  ): Promise<ApiResponse<{
    activeSessions: Array<{
      id: number
      paymentChannelId: number
      paymentChannel: {
        id: number
        jobName: string
        organizationName: string
        hourlyRate: number
        maxDailyHours: number
        escrowFundedAmount: number
        accumulatedBalance: number
      }
      clockIn: string
      hourlyRate: number
      sessionStatus: 'active'
      elapsedSeconds: number
      currentEarnings: number
    }>
  }>> {
    return apiFetch(
      `/api/work-sessions/active?workerWalletAddress=${encodeURIComponent(
        workerWalletAddress
      )}`
    )
  },

  /**
   * Get all active work sessions for an NGO (for NGO dashboard)
   */
  async getNGOActiveSessions(
    organizationWalletAddress: string
  ): Promise<ApiResponse<{
    activeSessions: Array<{
      id: number
      worker: {
        walletAddress: string
        fullName: string
      }
      paymentChannel: {
        id: number
        jobName: string
        hourlyRate: number
      }
      clockIn: string
      elapsedSeconds: number
      elapsedFormatted: string
      currentEarnings: number
      sessionStatus: 'active'
    }>
    summary: {
      totalActiveWorkers: number
      totalActiveHours: number
      totalCurrentEarnings: number
    }
  }>> {
    return apiFetch(
      `/api/work-sessions/ngo-active?organizationWalletAddress=${encodeURIComponent(
        organizationWalletAddress
      )}`
    )
  },
}

/**
 * Export ApiError for error handling in components
 */
export { ApiError }
