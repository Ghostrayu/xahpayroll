/**
 * WorkSessionTimer Component
 * Inline timer display within payment channel card
 */

import { useEffect, useState } from 'react'
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
  onClockOut?: () => void | Promise<void>
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
  onClockOut,
}: WorkSessionTimerProps) {
  const { walletAddress } = useAuth()
  const { getSessionByChannelId, addActiveSession, removeActiveSession } = useActiveSessions()
  const [isClockingIn, setIsClockingIn] = useState(false)
  const [isClockingOut, setIsClockingOut] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get active session for this payment channel
  const activeSession = getSessionByChannelId(paymentChannelId)

  // Debug logging
  useEffect(() => {
    console.log('[TIMER] Active session state:', { paymentChannelId, hasSession: !!activeSession, session: activeSession })
  }, [activeSession, paymentChannelId])

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
    if (!walletAddress) return

    try {
      console.log('[CLOCK_IN] Starting clock-in', { paymentChannelId, walletAddress })
      setIsClockingIn(true)
      setError(null)

      const response = await workSessionsApi.clockIn(
        walletAddress,
        paymentChannelId
      )

      console.log('[CLOCK_IN] API response:', response)

      // Handle response format (backend returns workSession directly, not in data wrapper)
      const workSession = (response as any).data?.workSession || (response as any).workSession

      if (response.success && workSession) {
        // Add to active sessions context
        const newSession = {
          id: workSession.id,
          paymentChannelId: workSession.paymentChannelId,
          paymentChannel: {
            id: paymentChannelId,
            jobName: '', // Will be filled by context refresh
            organizationName: '',
            hourlyRate: workSession.hourlyRate,
            maxDailyHours: workSession.maxDailyHours,
            escrowFundedAmount: escrowBalance,
            accumulatedBalance: 0,
          },
          clockIn: workSession.clockIn,
          hourlyRate: workSession.hourlyRate,
          sessionStatus: 'active' as const,
          elapsedSeconds: 0,
          currentEarnings: 0,
        }

        console.log('[CLOCK_IN] Adding to active sessions:', newSession)
        addActiveSession(paymentChannelId, newSession)
        console.log('[CLOCK_IN] Session added successfully')
        alert((response as any).message || (response as any).data?.message || 'CLOCKED IN SUCCESSFULLY')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'FAILED TO CLOCK IN'
      setError(errorMessage)
      alert(errorMessage)
      console.error('[CLOCK_IN] Error:', err)
    } finally {
      setIsClockingIn(false)
    }
  }

  /**
   * Handle clock-out
   */
  const handleClockOut = async () => {
    if (!walletAddress || !activeSession) return

    try {
      setIsClockingOut(true)
      setError(null)
      setShowConfirmModal(false)

      const response = await workSessionsApi.clockOut(
        walletAddress,
        activeSession.id
      )

      if (response.success && response.data) {
        // Remove from active sessions context
        removeActiveSession(paymentChannelId)

        // Show earnings summary
        const earnings = response.data.workSession.totalAmount.toFixed(2)
        const hours = response.data.workSession.hoursWorked.toFixed(2)
        console.log(`SESSION COMPLETE: ${hours} hours, ${earnings} XAH earned`)

        // Trigger dashboard refresh callback BEFORE showing alert
        // This ensures data updates even if user quickly dismisses alert
        if (onClockOut) {
          console.log('[CLOCK_OUT] Triggering dashboard refresh...')
          try {
            await onClockOut()
            console.log('[CLOCK_OUT] Dashboard refresh complete')
          } catch (refreshError) {
            console.error('[CLOCK_OUT] Dashboard refresh failed:', refreshError)
          }
        }

        // Show success message after refresh completes
        const successMessage = `${response.data.message || 'CLOCKED OUT SUCCESSFULLY'}\n\n` +
          `SESSION EARNINGS: ${earnings} XAH\n` +
          `HOURS WORKED: ${hours}h\n\n` +
          `YOUR COMPLETED SESSIONS BALANCE HAS BEEN UPDATED`
        alert(successMessage)
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
            <div className="text-2xl font-bold !text-black">
              {timer.elapsedFormatted}
            </div>
            <div className="text-sm font-bold !text-black">
              CURRENT SESSION: {timer.currentEarnings.toFixed(4)} XAH
            </div>
            <div className="text-[9px] font-semibold !text-black">
              NOT YET SAVED - CLOCK OUT TO SAVE
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold !text-black">
              RATE: {hourlyRate} XAH/HR
            </div>
            <div className="text-xs font-bold !text-black">
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
              <h3 className="text-xl font-bold mb-4 !text-gray-900 dark:!text-white">⚠️ CONFIRM CLOCK OUT</h3>

              <div className="space-y-2 mb-6 text-sm">
                <div className="flex justify-between">
                  <span className="!text-gray-700 dark:!text-gray-300 font-semibold">DURATION:</span>
                  <span className="font-bold !text-gray-900 dark:!text-white">{timer.elapsedFormatted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="!text-gray-700 dark:!text-gray-300 font-semibold">RATE:</span>
                  <span className="font-bold !text-gray-900 dark:!text-white">{hourlyRate} XAH/HR</span>
                </div>
                <div className="flex justify-between">
                  <span className="!text-gray-700 dark:!text-gray-300 font-semibold">EARNINGS:</span>
                  <span className="font-bold !text-green-700 dark:!text-green-400">{timer.currentEarnings.toFixed(4)} XAH</span>
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
