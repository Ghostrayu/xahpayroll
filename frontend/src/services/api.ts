/**
 * API Service Client
 * Centralized API calls for XAH Payroll backend
 */

const getBackendUrl = () => {
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    message: string
  }
}

// Type definitions for API responses
export interface OrgStats {
  totalWorkers: number
  activeWorkers: number
  escrowBalance: number
  totalPaid: number
  avgHourlyRate: number
  hoursThisMonth: number
}

export interface Worker {
  id: number
  wallet_address: string
  display_name: string
  email?: string
  hourly_rate?: number
  employment_status?: string
  created_at: string
}

export interface PaymentChannel {
  id: number
  job_name: string
  worker_wallet_address: string
  channel_id?: string
  amount: string
  destination: string
  settle_delay: number
  public_key?: string
  hourly_rate: number
  status: string
  created_at: string
}

export interface Activity {
  id: number
  type: string
  description: string
  timestamp: string
  amount?: number
}

export interface WorkSession {
  id: number
  clock_in: string
  clock_out?: string
  hours?: number
  status: string
}

export interface WorkerEarnings {
  today: number
  week: number
  month: number
  total: number
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
 * Export ApiError for error handling in components
 */
export { ApiError }
