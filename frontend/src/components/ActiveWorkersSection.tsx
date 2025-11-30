/**
 * Active Workers Section Component
 * Displays real-time active work sessions for NGO Dashboard
 * Features manual refresh button instead of auto-polling for better battery life and user control
 */

import { useState, useEffect, useRef } from 'react'
import { workSessionsApi } from '../services/api'

/**
 * Active worker session interface
 */
interface ActiveWorkerSession {
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
}

/**
 * Summary statistics interface
 */
interface SessionSummary {
  totalActiveWorkers: number
  totalActiveHours: number
  totalCurrentEarnings: number
}

/**
 * Component props
 */
interface ActiveWorkersSectionProps {
  organizationWalletAddress: string
}

/**
 * ActiveWorkersSection Component
 * Real-time display of active work sessions with manual refresh control
 */
export function ActiveWorkersSection({ organizationWalletAddress }: ActiveWorkersSectionProps) {
  const [activeSessions, setActiveSessions] = useState<ActiveWorkerSession[]>([])
  const [summary, setSummary] = useState<SessionSummary>({
    totalActiveWorkers: 0,
    totalActiveHours: 0,
    totalCurrentEarnings: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const timerIntervalRef = useRef<number | null>(null)

  /**
   * Fetch active sessions from backend
   */
  const fetchActiveSessions = async (isManualRefresh = false) => {
    try {
      setError(null)
      if (isManualRefresh) {
        setIsRefreshing(true)
      }

      const response = await workSessionsApi.getNGOActiveSessions(organizationWalletAddress)

      if (response.success && response.data) {
        setActiveSessions(response.data.activeSessions)
        setSummary(response.data.summary)
        setLastRefresh(new Date())
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'FAILED TO FETCH ACTIVE SESSIONS'
      setError(errorMessage)
      console.error('Error fetching NGO active sessions:', err)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  /**
   * Handle manual refresh button click
   */
  const handleRefresh = () => {
    fetchActiveSessions(true)
  }

  /**
   * Initial fetch on component mount
   */
  useEffect(() => {
    fetchActiveSessions()
  }, [organizationWalletAddress])

  /**
   * Local timer updates (every second for real-time display)
   * Updates elapsed time and earnings between manual refreshes
   */
  useEffect(() => {
    // Clean up previous interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
    }

    // No sessions = no timer needed
    if (activeSessions.length === 0) return

    // Update timers every second
    timerIntervalRef.current = window.setInterval(() => {
      setActiveSessions((prev) =>
        prev.map((session) => {
          const clockInTime = new Date(session.clockIn).getTime()
          const now = new Date().getTime()
          const elapsedSeconds = Math.floor((now - clockInTime) / 1000)
          const currentEarnings = (elapsedSeconds / 3600) * session.paymentChannel.hourlyRate

          // Format elapsed time
          const hours = Math.floor(elapsedSeconds / 3600)
          const minutes = Math.floor((elapsedSeconds % 3600) / 60)
          const elapsedFormatted = `${hours}h ${minutes}m`

          return {
            ...session,
            elapsedSeconds,
            elapsedFormatted,
            currentEarnings,
          }
        })
      )

      // Update summary with real-time values
      setSummary((prev) => ({
        ...prev,
        totalActiveHours: activeSessions.reduce((sum, s) => {
          const clockInTime = new Date(s.clockIn).getTime()
          const now = new Date().getTime()
          const hours = (now - clockInTime) / 3600000
          return sum + hours
        }, 0),
        totalCurrentEarnings: activeSessions.reduce((sum, s) => {
          const clockInTime = new Date(s.clockIn).getTime()
          const now = new Date().getTime()
          const elapsedSeconds = Math.floor((now - clockInTime) / 1000)
          const earnings = (elapsedSeconds / 3600) * s.paymentChannel.hourlyRate
          return sum + earnings
        }, 0),
      }))
    }, 1000)

    // Cleanup on unmount or when sessions change
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [activeSessions.length])

  /**
   * Render loading state
   */
  if (isLoading) {
    return (
      <div className="mt-8 bg-white rounded-2xl shadow-xl p-6 border-2 border-blue-500/30">
        <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-4">
          ⏱️ ACTIVE WORK SESSIONS
        </h3>
        <div className="text-center py-8 text-gray-500">
          LOADING ACTIVE SESSIONS...
        </div>
      </div>
    )
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <div className="mt-8 bg-white rounded-2xl shadow-xl p-6 border-2 border-red-500/30">
        <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-4">
          ⏱️ ACTIVE WORK SESSIONS
        </h3>
        <div className="p-4 bg-red-100 border border-red-400 rounded text-red-800">
          {error}
        </div>
      </div>
    )
  }

  /**
   * Render empty state
   */
  if (activeSessions.length === 0) {
    return (
      <div className="mt-8 bg-white rounded-2xl shadow-xl p-6 border-2 border-gray-300/30">
        <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-4">
          ⏱️ ACTIVE WORK SESSIONS
        </h3>
        <div className="text-center py-8 text-gray-500">
          NO WORKERS CURRENTLY CLOCKED IN
        </div>
      </div>
    )
  }

  /**
   * Render active sessions
   */
  return (
    <div className="mt-8 bg-white rounded-2xl shadow-xl p-6 border-2 border-green-500/30">
      {/* Header with Refresh Button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1">
          <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight">
            ⏱️ ACTIVE WORK SESSIONS
          </h3>
          {lastRefresh && (
            <p className="text-xs text-gray-500 uppercase mt-1">
              LAST UPDATED: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold rounded-lg text-sm uppercase tracking-wide transition-colors flex items-center gap-2"
        >
          <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
          {isRefreshing ? 'REFRESHING...' : 'REFRESH'}
        </button>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-1">
            ACTIVE WORKERS
          </p>
          <p className="text-2xl font-extrabold text-blue-600">
            {summary.totalActiveWorkers}
          </p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-1">
            TOTAL HOURS
          </p>
          <p className="text-2xl font-extrabold text-green-600">
            {summary.totalActiveHours.toFixed(2)}
          </p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
          <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-1">
            CURRENT EARNINGS
          </p>
          <p className="text-2xl font-extrabold text-purple-600">
            {summary.totalCurrentEarnings.toFixed(2)} XAH
          </p>
        </div>
      </div>

      {/* Active Sessions List */}
      <div className="space-y-3">
        {activeSessions.map((session) => (
          <div
            key={session.id}
            className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-4 border-2 border-green-200"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">
                  {session.worker.fullName}
                </p>
                <p className="text-xs text-gray-600 font-mono">
                  {session.worker.walletAddress}
                </p>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 bg-green-500 text-white rounded-full text-xs font-bold">
                ● CLOCKED IN
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-white/60 rounded-lg p-2 border border-blue-200">
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                  JOB
                </p>
                <p className="text-sm font-bold text-gray-900">
                  {session.paymentChannel.jobName}
                </p>
              </div>
              <div className="bg-white/60 rounded-lg p-2 border border-green-200">
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                  RATE
                </p>
                <p className="text-sm font-bold text-green-600">
                  {session.paymentChannel.hourlyRate} XAH/HR
                </p>
              </div>
            </div>

            {/* Live Timer */}
            <div className="bg-gradient-to-br from-blue-100 to-green-100 rounded-lg p-3 border border-green-300">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                    TIME WORKED
                  </p>
                  <p className="text-2xl font-extrabold text-green-700">
                    {session.elapsedFormatted}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                    CURRENT EARNINGS
                  </p>
                  <p className="text-xl font-extrabold text-blue-700">
                    {session.currentEarnings.toFixed(4)} XAH
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
