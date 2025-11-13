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
   */
  async cancelPaymentChannel(
    channelId: string,
    organizationWalletAddress: string
  ): Promise<ApiResponse<{
    channel: any
    xrplTransaction: any
  }>> {
    const response = await apiFetch<ApiResponse<{
      channel: any
      xrplTransaction: any
    }>>(
      `/api/payment-channels/${channelId}/close`,
      {
        method: 'POST',
        body: JSON.stringify({ organizationWalletAddress }),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError(
        response.error?.message || 'Failed to cancel payment channel'
      )
    }

    return response
  },

  /**
   * Confirm payment channel closure after XRPL transaction succeeds
   */
  async confirmChannelClosure(
    channelId: string,
    txHash: string,
    organizationWalletAddress: string
  ): Promise<ApiResponse<{ channel: any }>> {
    const response = await apiFetch<ApiResponse<{ channel: any }>>(
      `/api/payment-channels/${channelId}/close/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ txHash, organizationWalletAddress }),
      }
    )

    if (!response.success || !response.data) {
      throw new ApiError(
        response.error?.message || 'Failed to confirm channel closure'
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
 * Export ApiError for error handling in components
 */
export { ApiError }
