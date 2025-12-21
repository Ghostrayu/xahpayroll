/**
 * useWorkSessionTimer Hook
 * Reusable timer logic for work sessions
 */

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Hook return type
 */
export interface UseWorkSessionTimerResult {
  elapsedSeconds: number
  elapsedFormatted: string  // "2h 35m 42s"
  currentEarnings: number
  isNearingLimit: boolean  // True if > 90% of max_daily_hours
  hasReachedLimit: boolean  // True if >= max_daily_hours
  startTimer: (clockInTime: Date) => void
  stopTimer: () => void
}

/**
 * Custom hook for work session timer logic
 *
 * @param hourlyRate - Hourly rate in XAH
 * @param maxDailyHours - Maximum daily hours allowed
 * @param hoursWorkedToday - Hours already worked today (for limit calculation)
 * @returns Timer state and controls
 */
export function useWorkSessionTimer(
  hourlyRate: number,
  maxDailyHours: number,
  hoursWorkedToday: number = 0
): UseWorkSessionTimerResult {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [, setClockInTime] = useState<Date | null>(null) // Used for tracking clock-in state
  const intervalRef = useRef<number | null>(null)

  /**
   * Start the timer from a specific clock-in time
   */
  const startTimer = useCallback((clockIn: Date) => {
    setClockInTime(clockIn)

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Calculate initial elapsed time (in case of page refresh)
    const now = new Date()
    const initialElapsed = Math.floor((now.getTime() - clockIn.getTime()) / 1000)
    setElapsedSeconds(initialElapsed)

    // Update timer every second
    intervalRef.current = window.setInterval(() => {
      const currentTime = new Date()
      const elapsed = Math.floor((currentTime.getTime() - clockIn.getTime()) / 1000)
      setElapsedSeconds(elapsed)

      // Auto-stop if max hours reached (including hours worked today)
      const totalHoursToday = hoursWorkedToday + (elapsed / 3600)
      if (totalHoursToday >= maxDailyHours) {
        stopTimer()
      }
    }, 1000)
  }, [maxDailyHours, hoursWorkedToday])

  /**
   * Stop the timer
   */
  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setElapsedSeconds(0)
    setClockInTime(null)
  }, [])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  /**
   * Calculate derived values
   */
  const currentEarnings = (elapsedSeconds / 3600) * hourlyRate
  const sessionHours = elapsedSeconds / 3600
  const totalHoursToday = hoursWorkedToday + sessionHours
  const isNearingLimit = totalHoursToday >= maxDailyHours * 0.9
  const hasReachedLimit = totalHoursToday >= maxDailyHours

  /**
   * Format elapsed time as "Xh Ym Zs"
   */
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60
  const elapsedFormatted = `${hours}h ${minutes}m ${seconds}s`

  return {
    elapsedSeconds,
    elapsedFormatted,
    currentEarnings,
    isNearingLimit,
    hasReachedLimit,
    startTimer,
    stopTimer,
  }
}
