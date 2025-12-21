/**
 * Active Sessions Context
 * Global state management for worker's active work sessions
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { workSessionsApi } from '../services/api'
import { useAuth } from './AuthContext'

/**
 * Work Session interface (matches API response)
 */
export interface ActiveWorkSession {
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
}

/**
 * Context type definition
 */
interface ActiveSessionsContextType {
  activeSessions: Map<number, ActiveWorkSession>  // Map<paymentChannelId, WorkSession>
  isLoading: boolean
  error: string | null
  addActiveSession: (paymentChannelId: number, session: ActiveWorkSession) => void
  removeActiveSession: (paymentChannelId: number) => void
  refreshActiveSessions: () => Promise<void>
  getSessionByChannelId: (paymentChannelId: number) => ActiveWorkSession | null
}

/**
 * Create context
 */
const ActiveSessionsContext = createContext<ActiveSessionsContextType | null>(null)

/**
 * Provider props
 */
interface ActiveSessionsProviderProps {
  children: ReactNode
}

/**
 * Active Sessions Provider
 * Manages worker's active work sessions globally
 */
export function ActiveSessionsProvider({ children }: ActiveSessionsProviderProps) {
  const { walletAddress, userType, isLoggedIn } = useAuth()
  const [activeSessions, setActiveSessions] = useState<Map<number, ActiveWorkSession>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch active sessions from backend
   */
  const refreshActiveSessions = useCallback(async () => {
    console.log('[ACTIVE_SESSIONS] Fetching sessions:', { isLoggedIn, userType, walletAddress })

    // Only fetch if user is logged in as employee
    if (!isLoggedIn || userType !== 'employee' || !walletAddress) {
      console.log('[ACTIVE_SESSIONS] Not fetching - conditions not met')
      setActiveSessions(new Map())
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      console.log('[ACTIVE_SESSIONS] Calling API for wallet:', walletAddress)
      const response = await workSessionsApi.getActiveSessions(walletAddress)
      console.log('[ACTIVE_SESSIONS] API response:', response)

      if (response.success && response.data) {
        // Convert array to Map for O(1) lookup by payment channel ID
        const sessionsMap = new Map<number, ActiveWorkSession>()
        response.data.activeSessions.forEach((session) => {
          console.log('[ACTIVE_SESSIONS] Adding session:', session)
          sessionsMap.set(session.paymentChannelId, session)
        })

        console.log('[ACTIVE_SESSIONS] Sessions loaded:', sessionsMap.size)
        setActiveSessions(sessionsMap)
      } else {
        throw new Error('FAILED TO FETCH ACTIVE SESSIONS')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'UNKNOWN ERROR'
      setError(errorMessage)
      console.error('[ACTIVE_SESSIONS] Error fetching active sessions:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isLoggedIn, userType, walletAddress])

  /**
   * Add active session to state (after clock-in)
   */
  const addActiveSession = useCallback((paymentChannelId: number, session: ActiveWorkSession) => {
    setActiveSessions((prev) => {
      const newMap = new Map(prev)
      newMap.set(paymentChannelId, session)
      return newMap
    })
  }, [])

  /**
   * Remove active session from state (after clock-out)
   */
  const removeActiveSession = useCallback((paymentChannelId: number) => {
    setActiveSessions((prev) => {
      const newMap = new Map(prev)
      newMap.delete(paymentChannelId)
      return newMap
    })
  }, [])

  /**
   * Get session by payment channel ID
   */
  const getSessionByChannelId = useCallback(
    (paymentChannelId: number): ActiveWorkSession | null => {
      return activeSessions.get(paymentChannelId) || null
    },
    [activeSessions]
  )

  /**
   * Load active sessions on mount and when user changes
   */
  useEffect(() => {
    refreshActiveSessions()
  }, [refreshActiveSessions])

  /**
   * Auto-refresh every 60 seconds (to catch network issues/drift)
   */
  useEffect(() => {
    // Only auto-refresh if there are active sessions
    if (activeSessions.size === 0) return

    const intervalId = setInterval(() => {
      refreshActiveSessions()
    }, 60000) // 60 seconds

    return () => clearInterval(intervalId)
  }, [activeSessions.size, refreshActiveSessions])

  const value: ActiveSessionsContextType = {
    activeSessions,
    isLoading,
    error,
    addActiveSession,
    removeActiveSession,
    refreshActiveSessions,
    getSessionByChannelId,
  }

  return (
    <ActiveSessionsContext.Provider value={value}>
      {children}
    </ActiveSessionsContext.Provider>
  )
}

/**
 * Hook to use active sessions context
 */
export function useActiveSessions() {
  const context = useContext(ActiveSessionsContext)
  if (!context) {
    throw new Error('useActiveSessions must be used within ActiveSessionsProvider')
  }
  return context
}
