/**
 * WorkSessionTimer Component
 * Inline timer display within payment channel card
 */

import React, { useEffect, useState } from 'react'
import { useActiveSessions } from '../contexts/ActiveSessionsContext'
import { useWorkSessionTimer } from '../hooks/useWorkSessionTimer'
import { workSessionsApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

/**
 * Component props
 */
interface WorkSessionTimerProps {
  paymentChannelId: number
  hourlyRate: number
  maxDailyHours: number
  escrowBalance: number
  channelStatus: 'active' | 'closed' | 'closing'
}

/**
 * WorkSessionTimer Component
 * Manages clock-in/out and timer display for a single payment channel
 */
export function WorkSessionTimer({
  paymentChannelId,
  hourlyRate,
  maxDailyHours,
  escrowBalance,
  channelStatus,
}: WorkSessionTimerProps) {
  const { user } = useAuth()
  const { getSessionByChannelId, addActiveSession, removeActiveSession } = useActiveSessions()
  const [isClockingIn, setIsClockingIn] = useState(false)
  const [isClockingOut, setIsClockingOut] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get active session for this payment channel
  const activeSession = getSessionByChannelId(paymentChannelId)

  // Timer hook (only active when session exists)
  const timer = useWorkSessionTimer(
    hourlyRate,
    maxDailyHours,
    activeSession?.elapsedSeconds ? activeSession.elapsedSeconds / 3600 : 0
  )

  /**
   * Start timer when session becomes active
   */
  useEffect(() => {
    if (activeSession && activeSession.clockIn) {
      const clockInDate = new Date(activeSession.clockIn)
      timer.startTimer(clockInDate)
    } else {
      timer.stopTimer()
    }

    return () => {
      timer.stopTimer()
    }
  }, [activeSession])

  /**
   * Handle clock-in
   */
  const handleClockIn = async () => {
    if (!user) return

    try {
      setIsClockingIn(true)
      setError(null)

      const response = await workSessionsApi.clockIn(
        user.walletAddress,
        paymentChannelId
      )

      if (response.success && response.data) {
        // Add to active sessions context
        const newSession = {
          id: response.data.workSession.id,
          paymentChannelId: response.data.workSession.paymentChannelId,
          paymentChannel: {
            id: paymentChannelId,
            jobName: '', // Will be filled by context refresh
            organizationName: '',
            hourlyRate: response.data.workSession.hourlyRate,
            maxDailyHours: response.data.workSession.maxDailyHours,
            escrowFundedAmount: escrowBalance,
            accumulatedBalance: 0,
          },
          clockIn: response.data.workSession.clockIn,
          hourlyRate: response.data.workSession.hourlyRate,
          sessionStatus: 'active' as const,
          elapsedSeconds: 0,
          currentEarnings: 0,
        }

        addActiveSession(paymentChannelId, newSession)
        alert(response.data.message || 'CLOCKED IN SUCCESSFULLY')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'FAILED TO CLOCK IN'
      setError(errorMessage)
      alert(errorMessage)
      console.error('Clock-in error:', err)
    } finally {
      setIsClockingIn(false)
    }
  }

  /**
   * Handle clock-out
   */
  const handleClockOut = async () => {
    if (!user || !activeSession) return

    try {
      setIsClockingOut(true)
      setError(null)
      setShowConfirmModal(false)

      const response = await workSessionsApi.clockOut(
        user.walletAddress,
        activeSession.id
      )

      if (response.success && response.data) {
        // Remove from active sessions context
        removeActiveSession(paymentChannelId)
        alert(response.data.message || 'CLOCKED OUT SUCCESSFULLY')

        // Optional: Show earnings summary
        const earnings = response.data.workSession.totalAmount.toFixed(2)
        const hours = response.data.workSession.hoursWorked.toFixed(2)
        console.log(`SESSION COMPLETE: ${hours} hours, ${earnings} XAH earned`)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'FAILED TO CLOCK OUT'
      setError(errorMessage)
      alert(errorMessage)
      console.error('Clock-out error:', err)
    } finally {
      setIsClockingOut(false)
    }
  }

  /**
   * Check if clock-in should be disabled
   */
  const minimumEscrowRequired = hourlyRate
  const isClockInDisabled =
    channelStatus !== 'active' ||
    escrowBalance < minimumEscrowRequired ||
    isClockingIn ||
    timer.hasReachedLimit

  /**
   * Render timer display
   */
  if (activeSession) {
    return (
      <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-lg">
        {/* Timer Display */}
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">
              {timer.elapsedFormatted}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              EARNINGS: {timer.currentEarnings.toFixed(4)} XAH
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              RATE: {hourlyRate} XAH/HR
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              MAX: {maxDailyHours}H/DAY
            </div>
          </div>
        </div>

        {/* Warning if nearing limit */}
        {timer.isNearingLimit && !timer.hasReachedLimit && (
          <div className="mb-3 p-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 rounded text-sm text-yellow-800 dark:text-yellow-300">
            ⚠️ APPROACHING DAILY LIMIT ({(timer.currentEarnings / hourlyRate + (activeSession.elapsedSeconds / 3600)).toFixed(1)}H / {maxDailyHours}H)
          </div>
        )}

        {/* Max hours reached */}
        {timer.hasReachedLimit && (
          <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/30 border border-red-400 rounded text-sm text-red-800 dark:text-red-300">
            🛑 MAXIMUM DAILY HOURS REACHED - AUTO-CLOCK-OUT
          </div>
        )}

        {/* Clock Out Button */}
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={isClockingOut}
          className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isClockingOut ? '⏳ CLOCKING OUT...' : '⏸️ CLOCK OUT'}
        </button>

        {/* Error Display */}
        {error && (
          <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-400 rounded text-sm text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold mb-4">⚠️ CONFIRM CLOCK OUT</h3>

              <div className="space-y-2 mb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">DURATION:</span>
                  <span className="font-semibold">{timer.elapsedFormatted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">RATE:</span>
                  <span className="font-semibold">{hourlyRate} XAH/HR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">EARNINGS:</span>
                  <span className="font-semibold text-green-600">{timer.currentEarnings.toFixed(4)} XAH</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-2 px-4 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-semibold rounded-lg transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleClockOut}
                  disabled={isClockingOut}
                  className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isClockingOut ? 'CLOCKING OUT...' : 'CONFIRM CLOCK OUT'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  /**
   * Render clock-in button (no active session)
   */
  return (
    <div className="mt-4">
      <button
        onClick={handleClockIn}
        disabled={isClockInDisabled}
        className={`w-full py-2 px-4 font-semibold rounded-lg transition-colors ${
          isClockInDisabled
            ? 'bg-gray-400 cursor-not-allowed text-gray-200'
            : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
        title={
          escrowBalance < minimumEscrowRequired
            ? 'INSUFFICIENT ESCROW BALANCE'
            : channelStatus !== 'active'
            ? 'CHANNEL NOT ACTIVE'
            : timer.hasReachedLimit
            ? 'MAXIMUM DAILY HOURS REACHED'
            : 'CLOCK IN TO START WORK SESSION'
        }
      >
        {isClockingIn ? '⏳ CLOCKING IN...' : '▶️ CLOCK IN'}
      </button>

      {/* Error Display */}
      {error && (
        <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-400 rounded text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Helper text for disabled state */}
      {escrowBalance < minimumEscrowRequired && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          ⚠️ MINIMUM ESCROW REQUIRED: {minimumEscrowRequired} XAH
        </div>
      )}
    </div>
  )
}
