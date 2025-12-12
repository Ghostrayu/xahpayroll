import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useWallet } from './WalletContext'
import { organizationApi, workerApi, ApiError } from '../services/api'
import type {
  OrgStats,
  Worker,
  PaymentChannel,
  Activity,
  WorkSession,
  WorkerEarnings,
} from '../types/api'

// Types
export interface DataContextType {
  // NGO/Organization Data
  orgStats: OrgStats | null
  workers: Worker[]
  paymentChannels: PaymentChannel[]
  recentActivity: Activity[]

  // Worker Data
  earnings: WorkerEarnings | null
  workSessions: WorkSession[]

  // State
  isLoading: boolean
  error: string | null

  // Methods
  fetchNgoData: () => Promise<void>
  fetchWorkerData: () => Promise<void>
  refreshData: () => Promise<void>
  clearData: () => void
  clockIn: () => Promise<WorkSession | null>
  clockOut: () => Promise<WorkSession | null>
}

interface DataProviderProps {
  children: ReactNode
}

// Create Context
const DataContext = createContext<DataContextType | undefined>(undefined)

// Custom hook to use DataContext
export const useData = () => {
  const context = useContext(DataContext)
  if (!context) {
    throw new Error('useData must be used within a DataProvider')
  }
  return context
}

// Provider Component
export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const { userType } = useAuth()
  const { walletAddress } = useWallet()

  // NGO/Organization State
  const [orgStats, setOrgStats] = useState<OrgStats | null>(null)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([])
  const [recentActivity, setRecentActivity] = useState<Activity[]>([])

  // Worker State
  const [earnings, setEarnings] = useState<WorkerEarnings | null>(null)
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([])

  // Loading and Error State
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track if data has been fetched to prevent duplicate calls (React Strict Mode double-mounting)
  const hasFetchedRef = useRef(false)

  /**
   * Fetch NGO/Organization data
   */
  const fetchNgoData = useCallback(async () => {
    if (!walletAddress) {
      console.log('No wallet address available for fetching NGO data')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('Fetching NGO data for wallet:', walletAddress)

      // Fetch all NGO data in parallel
      const [statsData, workersData, channelsData, activityData] = await Promise.allSettled([
        organizationApi.getStats(walletAddress),
        organizationApi.getWorkers(walletAddress),
        organizationApi.getPaymentChannels(walletAddress),
        organizationApi.getActivity(walletAddress),
      ])

      // Handle stats
      if (statsData.status === 'fulfilled') {
        setOrgStats(statsData.value)
      } else {
        console.error('Failed to fetch stats:', statsData.reason)
      }

      // Handle workers
      if (workersData.status === 'fulfilled') {
        setWorkers(workersData.value)
      } else {
        console.error('Failed to fetch workers:', workersData.reason)
        setWorkers([])
      }

      // Handle payment channels
      if (channelsData.status === 'fulfilled') {
        setPaymentChannels(channelsData.value)
      } else {
        console.error('Failed to fetch payment channels:', channelsData.reason)
        setPaymentChannels([])
      }

      // Handle activity
      if (activityData.status === 'fulfilled') {
        setRecentActivity(activityData.value)
      } else {
        console.error('Failed to fetch activity:', activityData.reason)
        setRecentActivity([])
      }

      console.log('NGO data fetched successfully')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to fetch NGO data'
      console.error('Error fetching NGO data:', message)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress])

  /**
   * Fetch Worker data
   */
  const fetchWorkerData = useCallback(async () => {
    if (!walletAddress) {
      console.log('No wallet address available for fetching worker data')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('Fetching worker data for wallet:', walletAddress)

      // Fetch all worker data in parallel
      const [earningsData, sessionsData] = await Promise.allSettled([
        workerApi.getEarnings(walletAddress),
        workerApi.getWorkSessions(walletAddress),
      ])

      // Handle earnings
      if (earningsData.status === 'fulfilled') {
        setEarnings(earningsData.value)
      } else {
        console.error('Failed to fetch earnings:', earningsData.reason)
      }

      // Handle work sessions
      if (sessionsData.status === 'fulfilled') {
        setWorkSessions(sessionsData.value)
      } else {
        console.error('Failed to fetch work sessions:', sessionsData.reason)
        setWorkSessions([])
      }

      console.log('Worker data fetched successfully')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to fetch worker data'
      console.error('Error fetching worker data:', message)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress])

  /**
   * Refresh data based on user type
   * Wrapped in useCallback to stabilize reference for useEffect dependencies
   */
  const refreshData = useCallback(async () => {
    if (!walletAddress) return

    if (userType === 'ngo' || userType === 'employer') {
      await fetchNgoData()
    } else if (userType === 'employee') {
      await fetchWorkerData()
    }
  }, [walletAddress, userType, fetchNgoData, fetchWorkerData])

  /**
   * Clear all data (used on logout)
   */
  const clearData = () => {
    setOrgStats(null)
    setWorkers([])
    setPaymentChannels([])
    setRecentActivity([])
    setEarnings(null)
    setWorkSessions([])
    setError(null)
  }

  /**
   * Clock in worker
   */
  const clockIn = async (): Promise<WorkSession | null> => {
    if (!walletAddress) {
      setError('No wallet address available')
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      const session = await workerApi.clockIn(walletAddress)
      // Refresh work sessions
      await fetchWorkerData()
      return session
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to clock in'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Clock out worker
   */
  const clockOut = async (): Promise<WorkSession | null> => {
    if (!walletAddress) {
      setError('No wallet address available')
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      const session = await workerApi.clockOut(walletAddress)
      // Refresh work sessions
      await fetchWorkerData()
      return session
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to clock out'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Auto-fetch data when wallet connects or user type changes
   *
   * FIX (2025-12-11): Added hasFetchedRef to prevent duplicate API calls
   * during React Strict Mode double-mounting in development.
   *
   * Without this fix, useEffect runs twice → 8 parallel API calls → instant
   * HTTP 429 rate limit breach (limit: 100 req/15min).
   */
  useEffect(() => {
    if (walletAddress && userType) {
      // Prevent duplicate fetch during React Strict Mode double-mounting
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true
        refreshData()
      }
    } else {
      // Reset ref when wallet disconnects
      hasFetchedRef.current = false
      clearData()
    }
  }, [walletAddress, userType, refreshData])

  /**
   * POLLING REMOVED (2025-12-06)
   *
   * Background polling eliminated to reduce API load (was 240-480 calls/hour).
   * Users now have explicit control via:
   * 1. Manual dashboard refresh button
   * 2. Individual "Sync with Ledger" buttons per channel
   * 3. Global "Sync All Channels" button
   *
   * Rationale:
   * - Payment channels are long-running (hours/days)
   * - External changes (closures) are rare events
   * - Manual refresh provides better UX and control
   * - Eliminates unnecessary background load
   *
   * Performance Impact:
   * - Idle users: 480 → 0 API calls/hour (100% reduction)
   * - Active users: 240 → 0 API calls/hour (100% reduction)
   */

  const value: DataContextType = {
    // NGO Data
    orgStats,
    workers,
    paymentChannels,
    recentActivity,

    // Worker Data
    earnings,
    workSessions,

    // State
    isLoading,
    error,

    // Methods
    fetchNgoData,
    fetchWorkerData,
    refreshData,
    clearData,
    clockIn,
    clockOut,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
