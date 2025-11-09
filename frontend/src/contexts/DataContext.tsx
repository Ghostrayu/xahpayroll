import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useWallet } from './WalletContext'
import {
  organizationApi,
  workerApi,
  OrgStats,
  Worker,
  PaymentChannel,
  Activity,
  WorkSession,
  WorkerEarnings,
  ApiError,
} from '../services/api'

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

  /**
   * Fetch NGO/Organization data
   */
  const fetchNgoData = async () => {
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
  }

  /**
   * Fetch Worker data
   */
  const fetchWorkerData = async () => {
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
  }

  /**
   * Refresh data based on user type
   */
  const refreshData = async () => {
    if (!walletAddress) return

    if (userType === 'ngo' || userType === 'employer') {
      await fetchNgoData()
    } else if (userType === 'employee') {
      await fetchWorkerData()
    }
  }

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
   */
  useEffect(() => {
    if (walletAddress && userType) {
      refreshData()
    } else {
      clearData()
    }
  }, [walletAddress, userType])

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
