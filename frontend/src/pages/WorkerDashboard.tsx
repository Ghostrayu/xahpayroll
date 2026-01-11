import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import { useData } from '../contexts/DataContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import UnclaimedBalanceWarningModal from '../components/UnclaimedBalanceWarningModal'
import { WorkSessionTimer } from '../components/WorkSessionTimer'
import { paymentChannelApi, workerApi, workerNotificationsApi } from '../services/api'
import { closePaymentChannel, verifyChannelClosure } from '../utils/paymentChannels'
import { getTransactionExplorerUrl, getAccountExplorerUrl } from '../utils/networkUtils'

const WorkerDashboard: React.FC = () => {
  const { userName } = useAuth()
  const { balance, reserve, isConnected, walletAddress, network, provider } = useWallet()
  const { earnings, workSessions, refreshData } = useData()

  // Payment channel state
  const [paymentChannels, setPaymentChannels] = useState<any[]>([])
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showUnclaimedWarning, setShowUnclaimedWarning] = useState(false)
  const [unclaimedBalanceData, setUnclaimedBalanceData] = useState<any>(null)
  const [selectedChannel, setSelectedChannel] = useState<any>(null)
  const [cancelingChannel, setCancelingChannel] = useState<string | null>(null)
  const [syncingChannels, setSyncingChannels] = useState<Set<string>>(new Set())
  const [syncingAllChannels, setSyncingAllChannels] = useState(false)

  // Notification state
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [showNotifications, setShowNotifications] = useState(false)

  // Activity feed state (Phase 1-3 Enhancement)
  const [workerActivity, setWorkerActivity] = useState<any[]>([])

  // "How This Works" modal state
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false)

  // Download data state
  const [downloadingData, setDownloadingData] = useState(false)

  /**
   * Fetch worker payment channels
   *
   * POLLING REMOVED (2025-12-06)
   *
   * Background polling eliminated to reduce API load (was 240 calls/hour).
   * Workers now have explicit control via:
   * 1. Manual browser refresh for full dashboard update
   * 2. Individual "Sync with Ledger" buttons per channel
   * 3. Global "Sync All Channels" button for batch updates
   *
   * Rationale:
   * - Payment channels are long-running (hours/days)
   * - External NGO-initiated changes (closures) are rare events
   * - Manual refresh provides better UX and control
   * - Eliminates unnecessary background load
   *
   * Performance Impact:
   * - Idle workers: 240 → 0 API calls/hour (100% reduction)
   * - Active workers: 120 → 0 API calls/hour (100% reduction)
   */
  const fetchPaymentChannels = async () => {
    if (!walletAddress) return

    try {
      console.log('[WORKER_CHANNELS] Fetching channels for worker:', walletAddress)
      const channels = await workerApi.getPaymentChannels(walletAddress)
      console.log('[WORKER_CHANNELS] Fetched channels:', channels.length)

      // Filter out fully closed channels (but keep 'closing' channels visible)
      // Workers should see channels scheduled for closure so they can track final payments
      const activeChannels = channels.filter(ch => ch.status !== 'closed')
      setPaymentChannels(activeChannels)
    } catch (error) {
      console.error('[WORKER_CHANNELS_ERROR] Failed to fetch worker payment channels:', error)
      // Don't show alert for this - just log the error
      // Payment channels section will simply not show if empty
    }
  }

  useEffect(() => {
    // Initial fetch only (no polling)
    fetchPaymentChannels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress])

  // Fetch worker notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!walletAddress) return

      try {
        console.log('[WORKER_NOTIFICATIONS] Fetching notifications for:', walletAddress)
        const data = await workerNotificationsApi.getNotifications(walletAddress)
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
        console.log('[WORKER_NOTIFICATIONS] Fetched:', data.notifications.length, 'notifications, unread:', data.unreadCount)
      } catch (error) {
        console.error('[WORKER_NOTIFICATIONS_ERROR] Failed to fetch notifications:', error)
        // Don't show alert - just log error
      }
    }

    fetchNotifications()

    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [walletAddress])

  /**
   * Fetch worker activity feed (Phase 1-3 Enhancement)
   * Shows recent activity from worker perspective across all organizations
   */
  const fetchWorkerActivity = async () => {
    if (!walletAddress) return

    try {
      console.log('[WORKER_ACTIVITY] Fetching activity for worker:', walletAddress)
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      const response = await fetch(`${backendUrl}/api/workers/activity/${walletAddress}`)
      const data = await response.json()

      if (data.success && data.data) {
        setWorkerActivity(data.data)
        console.log('[WORKER_ACTIVITY] Fetched', data.data.length, 'activity events')
      } else {
        console.error('[WORKER_ACTIVITY_ERROR]', data.error?.message || 'FAILED TO FETCH ACTIVITY')
      }
    } catch (error: any) {
      console.error('[WORKER_ACTIVITY_ERROR]', error)
      // Don't show alert - just log error
    }
  }

  // Fetch worker activity on mount and periodically
  useEffect(() => {
    fetchWorkerActivity()

    // Poll for new activity every 60 seconds
    const interval = setInterval(fetchWorkerActivity, 60000)
    return () => clearInterval(interval)
  }, [walletAddress])

  /**
   * Helper: Check if closing channel has passed expiration time
   * Worker protection: Alerts workers when channels expire so they can finalize
   */
  const isChannelExpired = (channel: any): boolean => {
    if (channel.status !== 'closing' || !channel.expirationTime) {
      return false
    }
    return new Date(channel.expirationTime) < new Date()
  }

  /**
   * Helper: Calculate human-readable time remaining until expiration
   * Shows workers how much time left in SettleDelay period
   */
  const getTimeRemaining = (expirationTime: string): string => {
    const now = new Date().getTime()
    const exp = new Date(expirationTime).getTime()
    const diff = exp - now

    if (diff <= 0) return 'EXPIRED'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days} day${days !== 1 ? 's' : ''} remaining`
    } else if (hours > 0) {
      return `${hours}h ${minutes}m remaining`
    } else {
      return `${minutes}m remaining`
    }
  }


  // Use data from context with fallback defaults
  const workerData = {
    hourlyRate: 15.00, // TODO: Get from payment channel or employee record
    todayHours: earnings?.today ? (earnings.today / 15.00) : 0,
    todayEarnings: earnings?.today || 0,
    weekHours: earnings?.week ? (earnings.week / 15.00) : 0,
    weekEarnings: earnings?.week || 0,
    monthHours: earnings?.month ? (earnings.month / 15.00) : 0,
    monthEarnings: earnings?.month || 0,
    employer: 'Good Money Collective'
  }

  // Recent work sessions (completed) - shows hours worked and earnings accumulated
  const recentWorkSessions = workSessions
    .filter(session => session.clockOut && session.status === 'completed')
    .slice(0, 4)
    .map((session) => ({
      id: session.id,
      amount: session.hours ? (session.hours * workerData.hourlyRate) : 0,
      time: new Date(session.clockOut!).toLocaleString(),
      status: 'Completed',
      sessionId: `SESSION #${session.id}`
    }))

  /**
   * Handle close channel button click - opens confirmation modal
   */
  const handleCloseClick = (channel: any) => {
    setSelectedChannel(channel)
    setShowCancelConfirm(true)
  }

  /**
   * Handle close confirmation - executes the 3-step closure flow
   * Same as NGO flow but with worker authorization
   *
   * @param forceClose - If true, bypass unclaimed balance warning
   */
  const handleCloseConfirm = async (forceClose: boolean = false) => {
    if (!selectedChannel || !walletAddress) {
      alert('MISSING WALLET ADDRESS OR CHANNEL SELECTION')
      return
    }

    setCancelingChannel(selectedChannel.channelId)

    try {
      // Step 1: Get XRPL transaction details from backend
      console.log('[WORKER_CLOSE_FLOW] Step 1: Getting transaction details', { forceClose })
      const response = await paymentChannelApi.cancelPaymentChannel(
        selectedChannel.channelId,
        walletAddress,
        'worker'
      )

      if (!response.success) {
        // Check if error is UNCLAIMED_BALANCE warning
        if (response.error?.code === 'UNCLAIMED_BALANCE' && !forceClose) {
          console.log('[WORKER_CLOSE_FLOW] Unclaimed balance detected, showing warning')
          setUnclaimedBalanceData({
            unpaidBalance: response.error.unpaidBalance,
            callerType: response.error.callerType
          })
          setShowCancelConfirm(false)
          setShowUnclaimedWarning(true)
          setCancelingChannel(null)
          return
        }

        throw new Error(response.error?.message || 'FAILED TO PREPARE CLOSURE')
      }

      if (!response.data) {
        throw new Error('NO DATA RETURNED FROM BACKEND')
      }

      const { channel, xrplTransaction } = response.data

      console.log('[WORKER_CLOSE_FLOW] Step 1 complete. Worker payment:', channel.accumulatedBalance, 'XAH')
      console.log('[WORKER_CLOSE_FLOW] Backend returned xrplTransaction:', {
        hasPublicKey: !!xrplTransaction.PublicKey,
        publicKeyPreview: xrplTransaction.PublicKey ? `${xrplTransaction.PublicKey.substring(0, 20)}...` : 'MISSING',
        balance: xrplTransaction.Balance,
        transactionType: xrplTransaction.TransactionType,
        flags: xrplTransaction.Flags
      })

      // Step 2: Execute XRPL transaction
      console.log('[WORKER_CLOSE_FLOW] Step 2: Executing XRPL PaymentChannelClaim')
      const txResult = await closePaymentChannel(
        {
          channelId: channel.channelId,
          balance: xrplTransaction.Balance,
          escrowReturn: xrplTransaction.Amount,
          account: walletAddress,
          publicKey: xrplTransaction.PublicKey,
          isSourceClosure: false, // Worker is the destination (receiver) of the payment channel
          sourceAddress: channel.ngoWalletAddress || channel.organizationWalletAddress,
          destinationAddress: walletAddress
        },
        provider,
        network
      )

      if (!txResult.success || !txResult.hash) {
        throw new Error(txResult.error || 'XRPL TRANSACTION FAILED')
      }

      console.log('[WORKER_CLOSE_FLOW] Step 2 complete. TX:', txResult.hash)

      // Step 2.5: CRITICAL - Verify transaction on ledger before database update
      console.log('[WORKER_CLOSE_FLOW] Step 2.5: Verifying transaction on ledger...')
      const validation = await verifyChannelClosure(
        channel.channelId,
        txResult.hash,
        network,
        false // isSourceClosure = false for worker (destination) closures
      )

      if (!validation.success || !validation.validated) {
        console.error('[WORKER_CLOSE_FLOW] VALIDATION FAILED', validation)
        throw new Error(
          `TRANSACTION FAILED ON LEDGER: ${validation.error || 'NOT_VALIDATED'}\n` +
          `Result Code: ${validation.details?.transactionResult || 'UNKNOWN'}\n\n` +
          `The transaction was submitted but rejected by the network. ` +
          `Your wallet balance has not changed and the channel remains active.`
        )
      }

      console.log('[WORKER_CLOSE_FLOW] Transaction validated successfully ✅', {
        transactionResult: validation.details?.transactionResult,
        channelRemoved: validation.channelRemoved
      })

      // Step 3: Confirm closure in database (ONLY after validation succeeds)
      console.log('[WORKER_CLOSE_FLOW] Step 3: Confirming closure in database')
      await paymentChannelApi.confirmChannelClosure(
        selectedChannel.channelId,
        txResult.hash,
        walletAddress,
        'worker'
      )

      console.log('[WORKER_CLOSE_FLOW] Complete! Channel closed.')

      // Success feedback
      alert(
        `✅ PAYMENT CHANNEL CLOSED SUCCESSFULLY!\n\n` +
        `YOU RECEIVED: ${channel.accumulatedBalance} XAH\n` +
        `ESCROW RETURNED TO EMPLOYER: ${channel.escrowReturn} XAH\n` +
        `TRANSACTION: ${txResult.hash}`
      )

      // Refresh data (work sessions and earnings)
      console.log('[WORKER_CLOSE_FLOW] Refreshing work sessions and earnings...')
      await refreshData()

      // Refresh payment channels
      console.log('[WORKER_CLOSE_FLOW] Refreshing payment channels list...')
      const updatedChannels = await workerApi.getPaymentChannels(walletAddress)
      setPaymentChannels(updatedChannels)
      console.log('[WORKER_CLOSE_FLOW] Payment channels updated. New count:', updatedChannels.length)

      // Refresh notifications to update closure status
      const notifData = await workerNotificationsApi.getNotifications(walletAddress)
      setNotifications(notifData.notifications)
      setUnreadCount(notifData.unreadCount)

      // Close modals
      setShowCancelConfirm(false)
      setShowUnclaimedWarning(false)

    } catch (error: any) {
      console.error('[WORKER_CLOSE_ERROR]', error)
      alert(`❌ FAILED TO CLOSE CHANNEL:\n\n${error.message}`)
    } finally {
      setCancelingChannel(null)
      setSelectedChannel(null)
      setUnclaimedBalanceData(null)
    }
  }

  /**
   * Handle force close after unclaimed balance warning
   */
  const handleForceClose = async () => {
    await handleCloseConfirm(true)
  }

  /**
   * Helper: Check if channel was recently synced (within last 60 seconds)
   */
  const wasRecentlySynced = (lastLedgerSync: string | null): boolean => {
    if (!lastLedgerSync) return false

    const lastSync = new Date(lastLedgerSync).getTime()
    const now = Date.now()
    const secondsSinceSync = (now - lastSync) / 1000

    return secondsSinceSync < 60
  }

  /**
   * Handle sync channel balance with ledger
   * Calls backend endpoint to query Xahau ledger and update database
   */
  const handleSyncChannel = async (channel: any) => {
    if (!channel.channelId) {
      alert('CANNOT SYNC: INVALID CHANNEL ID')
      return
    }

    // Check if already recently synced (rate limiting)
    if (wasRecentlySynced(channel.lastLedgerSync)) {
      const lastSync = new Date(channel.lastLedgerSync).toLocaleString()
      alert(`CHANNEL WAS RECENTLY SYNCED\n\nLAST SYNC: ${lastSync}\n\nPLEASE WAIT AT LEAST 1 MINUTE BETWEEN SYNCS.`)
      return
    }

    // Add to syncing set
    setSyncingChannels(prev => new Set(prev).add(channel.channelId))

    try {
      console.log('[SYNC_CHANNEL] Syncing channel status from ledger:', channel.channelId)

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      const response = await fetch(`${backendUrl}/api/payment-channels/${channel.channelId}/sync`, {
        method: 'GET'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'FAILED TO SYNC CHANNEL')
      }

      console.log('[SYNC_CHANNEL] Success:', data)

      // Show appropriate message based on channel status
      let alertMessage = `✅ CHANNEL SYNCED WITH LEDGER!\n\n`

      if (data.status === 'closed') {
        alertMessage += `STATUS: CLOSED\n`
        alertMessage += `CLOSED AT: ${new Date(data.data.closedAt).toLocaleString()}\n\n`
        alertMessage += `THE CHANNEL HAS BEEN SUCCESSFULLY CLOSED ON THE LEDGER.`
      } else if (data.status === 'closing') {
        alertMessage += `STATUS: SCHEDULED FOR CLOSURE\n`
        alertMessage += `EXPIRATION: ${new Date(data.data.expirationTime).toLocaleString()}\n`
        alertMessage += `LEDGER ESCROW: ${data.data.escrowAmount.toLocaleString()} XAH\n`
        alertMessage += `LEDGER CLAIMS: ${data.data.balance.toLocaleString()} XAH\n`
        alertMessage += `SETTLE DELAY: ${data.data.settleDelay} seconds\n\n`
        alertMessage += `NOTE: YOUR WORK SESSION EARNINGS ARE TRACKED SEPARATELY IN DATABASE`
      } else if (data.status === 'active') {
        alertMessage += `STATUS: ACTIVE\n`
        alertMessage += `LEDGER ESCROW: ${data.data.escrowAmount.toLocaleString()} XAH\n`
        alertMessage += `LEDGER CLAIMS: ${data.data.balance.toLocaleString()} XAH\n`
        alertMessage += `SETTLE DELAY: ${data.data.settleDelay} seconds\n\n`
        alertMessage += `NOTE: YOUR WORK SESSION EARNINGS ARE TRACKED SEPARATELY IN DATABASE`
      }

      alert(alertMessage)

      // Refresh payment channels
      const updatedChannels = await workerApi.getPaymentChannels(walletAddress!)
      setPaymentChannels(updatedChannels)
    } catch (error: any) {
      console.error('[SYNC_CHANNEL_ERROR]', error)
      alert(`❌ FAILED TO SYNC CHANNEL:\n\n${error.message}`)
    } finally {
      // Remove from syncing set
      setSyncingChannels(prev => {
        const newSet = new Set(prev)
        newSet.delete(channel.channelId)
        return newSet
      })
    }
  }

  /**
   * Handle sync all channels with ledger
   * Batch syncs all payment channels to reduce API calls
   */
  const handleSyncAllChannels = async () => {
    if (paymentChannels.length === 0) {
      alert('NO PAYMENT CHANNELS TO SYNC')
      return
    }

    setSyncingAllChannels(true)

    try {
      console.log('[SYNC_ALL] Syncing all channels:', paymentChannels.length)

      // Sync all channels in parallel
      const syncPromises = paymentChannels.map(async (channel) => {
        try {
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
          const response = await fetch(`${backendUrl}/api/payment-channels/${channel.channelId}/sync`, {
            method: 'GET'
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            console.error(`[SYNC_ALL] Failed to sync ${channel.channelId}:`, data.error?.message)
            return { channelId: channel.channelId, success: false, error: data.error?.message }
          }

          console.log(`[SYNC_ALL] Synced ${channel.channelId} - Status: ${data.status}`)
          return { channelId: channel.channelId, success: true, status: data.status }
        } catch (error: any) {
          console.error(`[SYNC_ALL] Error syncing ${channel.channelId}:`, error)
          return { channelId: channel.channelId, success: false, error: error.message }
        }
      })

      const results = await Promise.all(syncPromises)

      const successCount = results.filter(r => r.success).length
      const failureCount = results.filter(r => !r.success).length

      console.log('[SYNC_ALL] Complete:', { successCount, failureCount })

      if (failureCount > 0) {
        alert(
          `⚠️ SYNC PARTIALLY COMPLETE\n\n` +
          `SYNCED: ${successCount} CHANNELS\n` +
          `FAILED: ${failureCount} CHANNELS\n\n` +
          `SOME CHANNELS MAY HAVE BEEN CLOSED OR EXPIRED.`
        )
      } else {
        alert(
          `✅ ALL CHANNELS SYNCED!\n\n` +
          `SYNCED ${successCount} CHANNEL${successCount !== 1 ? 'S' : ''} SUCCESSFULLY`
        )
      }

      // Refresh payment channels to show updated balances
      const updatedChannels = await workerApi.getPaymentChannels(walletAddress!)
      setPaymentChannels(updatedChannels)
    } catch (error: any) {
      console.error('[SYNC_ALL_ERROR]', error)
      alert(`❌ FAILED TO SYNC CHANNELS:\n\n${error.message}`)
    } finally {
      setSyncingAllChannels(false)
    }
  }

  /**
   * Handle download data button click
   * Generates and downloads worker profile data as PDF
   */
  const handleDownloadData = async () => {
    if (!walletAddress) {
      alert('WALLET ADDRESS NOT AVAILABLE')
      return
    }

    setDownloadingData(true)

    try {
      console.log('[DOWNLOAD_DATA] Generating PDF export...')

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      const response = await fetch(`${backendUrl}/api/workers/export-data?walletAddress=${encodeURIComponent(walletAddress)}`)

      if (!response.ok) {
        throw new Error('FAILED TO GENERATE PDF EXPORT')
      }

      // Create blob from response
      const blob = await response.blob()

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `xah_payroll_worker_${walletAddress.substring(0, 10)}_${Date.now()}.pdf`
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      console.log('[DOWNLOAD_DATA] PDF downloaded successfully')
    } catch (error: any) {
      console.error('[DOWNLOAD_DATA_ERROR]', error)
      alert(`❌ FAILED TO DOWNLOAD DATA:\n\n${error.message}`)
    } finally {
      setDownloadingData(false)
    }
  }

  return (
    <div className="min-h-screen x-pattern-bg-light">
      <Navbar />
      
      {/* Dashboard Header */}
      <div className="pt-28 pb-8 bg-gradient-to-br from-xah-light via-white to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 uppercase tracking-tight">
                WORKER DASHBOARD
              </h1>
              <p className="text-sm text-gray-600 uppercase tracking-wide mt-2">
                Welcome back, {userName}
              </p>
              {walletAddress && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Wallet:</span>
                    <code className="text-xs font-mono text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {walletAddress}
                    </code>
                    <span className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border ${
                      network === 'mainnet' 
                        ? 'text-green-700 bg-green-50 border-green-300' 
                        : 'bg-orange-100 text-orange-700 border-orange-300'
                    }`}>
                      {network === 'mainnet' ? 'MAINNET XAHAU' : 'TESTNET XAHAU'}
                    </span>
                  </div>
                  {isConnected && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Balance:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                          {parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} XAH
                        </span>
                        <span className="text-xs text-gray-400 uppercase">
                          ({parseFloat(reserve).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAH RESERVED)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <Link
              to="/worker"
              className="inline-flex items-center gap-2 text-xah-blue hover:text-primary-700 font-bold text-sm uppercase tracking-wide transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              BACK TO INFO
            </Link>
          </div>

          {/* Settings, Download Data, and Notifications Buttons */}
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <Link
              to="/worker/settings"
              className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-sm"
            >
              ⚙️ ACCOUNT SETTINGS
            </Link>

            {/* Download Data Button */}
            <button
              onClick={handleDownloadData}
              disabled={downloadingData}
              className="inline-flex items-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-700 font-bold py-3 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloadingData ? '📄 DOWNLOADING...' : '📄 DOWNLOAD DATA'}
            </button>

            {/* Notifications Button with Badge */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative inline-flex items-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-3 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-sm"
            >
              🔔 NOTIFICATIONS
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-lg">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Today */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl shadow-lg p-6 border-2 border-blue-200">
              <div className="text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">Today</p>
                <p className="text-3xl font-extrabold text-gray-900 mb-1">{workerData.todayHours}h</p>
                <p className="text-xl font-bold text-xah-blue">{workerData.todayEarnings} XAH</p>
              </div>
            </div>

            {/* This Week */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl shadow-lg p-6 border-2 border-green-200">
              <div className="text-center">
                <div className="text-4xl mb-3">📊</div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">This Week</p>
                <p className="text-3xl font-extrabold text-gray-900 mb-1">{workerData.weekHours}h</p>
                <p className="text-xl font-bold text-xah-blue">{workerData.weekEarnings} XAH</p>
              </div>
            </div>

            {/* This Month */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl shadow-lg p-6 border-2 border-purple-200">
              <div className="text-center">
                <div className="text-4xl mb-3">💰</div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">This Month</p>
                <p className="text-3xl font-extrabold text-gray-900 mb-1">{workerData.monthHours}h</p>
                <p className="text-xl font-bold text-xah-blue">{workerData.monthEarnings} XAH</p>
              </div>
            </div>
          </div>

          {/* Payment Channels Section - Positioned first for primary visibility */}
          {paymentChannels.length > 0 && (
            <div className="mb-12 bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              {/* Manual Refresh Reminder */}
              <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-blue-900 uppercase tracking-wide mb-1">
                      ℹ️ MANUAL REFRESH REQUIRED
                    </p>
                    <p className="text-xs text-blue-800 mb-2">
                      PLEASE REFRESH BROWSER TO UPDATE YOUR DATA.
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-blue-700">
                      <span className="font-semibold">• BROWSER REFRESH → FULL DASHBOARD UPDATE</span>
                      <span className="font-semibold">• SYNC WITH LEDGER → REAL-TIME BALANCE FROM XAHAU</span>
                      <span className="font-semibold">• SYNC ALL CHANNELS → BATCH UPDATE ALL BALANCES</span>
                    </div>
                  </div>
                </div>
              </div>

              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">
                MY PAYMENT CHANNELS
              </h3>

              {/* Sync All Channels Button */}
              <div className="mb-4 flex justify-end">
                <button
                  onClick={handleSyncAllChannels}
                  disabled={syncingAllChannels}
                  className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg text-xs uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {syncingAllChannels ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      SYNCING ALL CHANNELS...
                    </>
                  ) : (
                    <>🔄 SYNC ALL CHANNELS WITH LEDGER</>
                  )}
                </button>
              </div>

              <div className="space-y-3">
                {paymentChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-4 border-2 border-green-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 mr-2">
                        <div className="mb-1">
                          <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">EMPLOYER: </span>
                          <span className="font-bold text-xah-blue text-sm uppercase tracking-wide">
                            {channel.employer}
                          </span>
                        </div>
                        <div className="mb-1">
                          <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">JOB NAME: </span>
                          <span className="font-bold text-gray-900 text-xs uppercase tracking-wide">
                            {channel.jobName}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">CHANNEL ID: </span>
                          <span className="text-xs text-gray-500 uppercase tracking-wide truncate">
                            {channel.channelId}
                          </span>
                        </div>
                      </div>
                      {/* Context-aware status badge with expiration alerts */}
                      {channel.status === 'closing' && isChannelExpired(channel) ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center px-2 py-0.5 text-white rounded-full text-[10px] font-bold bg-red-600 animate-pulse">
                            ● EXPIRED - CLAIM NOW!
                          </span>
                          <span className="text-[9px] text-gray-500 uppercase">
                            PROTECT YOUR {channel.balance?.toLocaleString() || '0'} XAH
                          </span>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 text-white rounded-full text-xs font-bold whitespace-nowrap ${
                          channel.status === 'active' ? 'bg-green-500' :
                          channel.status === 'closing' ? 'bg-yellow-500' :
                          channel.status === 'closed' ? 'bg-gray-500' :
                          'bg-blue-500'
                        }`}>
                          ● {channel.status?.toUpperCase() || 'ACTIVE'}
                          {channel.status === 'closing' && channel.expirationTime && (
                            <span className="ml-1">- {getTimeRemaining(channel.expirationTime)}</span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Worker Protection Alert - Closing Channels */}
                    {channel.status === 'closing' && (
                      <div className={`mb-3 rounded-lg p-3 border-2 ${
                        isChannelExpired(channel)
                          ? 'bg-red-50 border-red-500'
                          : 'bg-green-50 border-green-500'
                      }`}>
                        <div className="flex items-start gap-2">
                          <div className={`text-2xl flex-shrink-0 ${
                            isChannelExpired(channel) ? 'animate-pulse' : ''
                          }`}>
                            {isChannelExpired(channel) ? '🚨' : '✅'}
                          </div>
                          <div className="flex-1">
                            <p className={`text-xs font-extrabold uppercase tracking-wide mb-1 ${
                              isChannelExpired(channel) ? 'text-red-900' : 'text-green-700'
                            }`}>
                              {isChannelExpired(channel)
                                ? '⏰ CHANNEL EXPIRED - CLAIM YOUR WAGES NOW!'
                                : '✅ PAYMENT RECEIVED - CHANNEL FINALIZING'}
                            </p>
                            <div className={`text-[10px] space-y-1 ${
                              isChannelExpired(channel) ? 'text-red-800' : 'text-green-800'
                            }`}>
                              {isChannelExpired(channel) ? (
                                <>
                                  <p className="font-bold">
                                    • EMPLOYER CAN CLAIM WITH ZERO BALANCE - YOU LOSE {channel.balance?.toLocaleString() || '0'} XAH!
                                  </p>
                                  <p className="font-bold">• CLICK "CLAIM NOW" BELOW TO PROTECT YOUR EARNINGS</p>
                                  <p>• FIRST CLAIM TO VALIDATE ON LEDGER WINS</p>
                                </>
                              ) : (
                                <>
                                  <p className="font-bold text-green-700">
                                    ✅ YOUR ACCUMULATED BALANCE HAS BEEN SENT: {channel.balance?.toLocaleString() || '0'} XAH
                                  </p>
                                  <p>• EMPLOYER INITIATED SCHEDULED CLOSURE - SETTLELAY PROTECTION ACTIVE</p>
                                  <p>• CHANNEL WILL AUTO-FINALIZE IN {getTimeRemaining(channel.expirationTime)}</p>
                                  <p className="font-bold">
                                    • NO ACTION REQUIRED - XAH ALREADY IN YOUR WALLET
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}


                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white/60 rounded-lg p-2 border border-green-200">
                        <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                          COMPLETED SESSIONS
                        </p>
                        <p className="text-base font-extrabold text-green-600">
                          {channel.balance?.toLocaleString() || '0'} XAH
                        </p>
                        <p className="text-[9px] text-gray-500 mt-0.5">
                          SAVED TO DATABASE
                        </p>
                      </div>
                      <div className="bg-white/60 rounded-lg p-2 border border-blue-200">
                        <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                          HOURLY RATE
                        </p>
                        <p className="text-base font-extrabold text-xah-blue">
                          {channel.hourlyRate?.toFixed(2) || '0'} XAH
                        </p>
                      </div>
                    </div>

                    {/* Work Session Timer - Clock In/Out */}
                    <WorkSessionTimer
                      paymentChannelId={channel.id}
                      hourlyRate={channel.hourlyRate || 0}
                      maxDailyHours={channel.maxDailyHours || 8}
                      escrowBalance={channel.escrowBalance || 0}
                      channelStatus={channel.status}
                      onClockOut={async () => {
                        console.log('[WORKER_DASHBOARD] Refreshing after clock out...')
                        try {
                          await refreshData()
                          console.log('[WORKER_DASHBOARD] refreshData complete')
                          await fetchPaymentChannels()
                          console.log('[WORKER_DASHBOARD] fetchPaymentChannels complete')
                        } catch (error) {
                          console.error('[WORKER_DASHBOARD] Refresh error (will reload anyway):', error)
                        } finally {
                          // CRITICAL: Always reload page, even if data fetch fails
                          // This ensures stale session data is cleared from memory
                          console.log('[WORKER_DASHBOARD] Forcing page reload to display updated balance')
                          window.location.reload()
                        }
                      }}
                    />

                    <div className="flex justify-end gap-2 mt-4">
                      <button
                        onClick={() => handleSyncChannel(channel)}
                        disabled={syncingChannels.has(channel.channelId) || wasRecentlySynced(channel.lastLedgerSync) || !channel.channelId}
                        className={`px-3 py-1 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors disabled:cursor-not-allowed ${
                          wasRecentlySynced(channel.lastLedgerSync)
                            ? 'bg-green-600'
                            : 'bg-purple-500 hover:bg-purple-600 disabled:opacity-50'
                        }`}
                      >
                        {syncingChannels.has(channel.channelId) ? (
                          'SYNCING...'
                        ) : wasRecentlySynced(channel.lastLedgerSync) ? (
                          'SYNCED ✓'
                        ) : (
                          'SYNC WITH LEDGER'
                        )}
                      </button>

                      {/* Context-aware claim/close button */}
                      {channel.status === 'closing' ? (
                        isChannelExpired(channel) ? (
                          <button
                            onClick={() => handleCloseClick(channel)}
                            disabled={cancelingChannel === channel.channelId}
                            className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded text-xs uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed animate-pulse"
                          >
                            {cancelingChannel === channel.channelId
                              ? 'CLAIMING...'
                              : '🛡️ CLAIM NOW'}
                          </button>
                        ) : (
                          <div className="px-3 py-1 bg-green-100 border border-green-500 text-green-700 font-bold rounded text-xs uppercase tracking-wide">
                            ✅ BALANCE RECEIVED
                          </div>
                        )
                      ) : (
                        <button
                          onClick={() => handleCloseClick(channel)}
                          disabled={cancelingChannel === channel.channelId}
                          className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded text-xs uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cancelingChannel === channel.channelId
                            ? 'CLOSING...'
                            : 'CLOSE CHANNEL'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Employment Info - NGO Specific (Compact) */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">
                Employment Info ({paymentChannels.length})
              </h3>
              {paymentChannels.length > 0 ? (
                <div className="space-y-2">
                  {paymentChannels.map((channel) => (
                    <div
                      key={channel.id}
                      className="p-3 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-gray-900 uppercase text-sm truncate flex-1 mr-2">
                          {channel.employer}
                        </span>
                        <span className={`px-2 py-0.5 text-white rounded-full text-xs font-bold whitespace-nowrap ${
                          channel.status === 'active' ? 'bg-green-500' :
                          channel.status === 'closing' ? 'bg-yellow-500' :
                          channel.status === 'closed' ? 'bg-gray-500' :
                          'bg-blue-500'
                        }`}>
                          {channel.status?.toUpperCase() || 'ACTIVE'}
                          {channel.status === 'closing' && channel.expirationTime && (() => {
                            const expDate = new Date(channel.expirationTime)
                            const month = String(expDate.getMonth() + 1).padStart(2, '0')
                            const day = String(expDate.getDate()).padStart(2, '0')
                            const year = expDate.getFullYear()
                            const hours = String(expDate.getHours()).padStart(2, '0')
                            const minutes = String(expDate.getMinutes()).padStart(2, '0')
                            return ` ${month}.${day}.${year} AT ${hours}:${minutes}`
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <span className="text-gray-600 uppercase font-semibold">Hourly Rate:</span>
                          <span className="ml-1 font-bold text-xah-blue">{channel.hourlyRate?.toFixed(2) || '0'} XAH</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm uppercase tracking-wide">NO ACTIVE EMPLOYMENT</p>
                  <p className="text-xs mt-2">NO PAYMENT CHANNELS AVAILABLE</p>
                </div>
              )}
            </div>

            {/* Recent Work Sessions */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight">RECENT WORK SESSIONS</h3>
                <button
                  onClick={() => setShowHowItWorksModal(true)}
                  className="text-xs font-semibold text-xah-blue hover:text-primary-700 uppercase tracking-wide flex items-center gap-1 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  HOW THIS WORKS
                </button>
              </div>
              <div className="space-y-4">
                {recentWorkSessions.length > 0 ? (
                  recentWorkSessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-lg">✓</span>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{session.amount.toFixed(2)} XAH EARNED</p>
                          <p className="text-xs text-gray-600 uppercase tracking-wide">{session.time}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-green-600 uppercase tracking-wide font-semibold">{session.status}</p>
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-mono">
                          {session.sessionId}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">NO WORK SESSIONS YET</p>
                    <p className="text-xs text-gray-400 mt-2">CLOCK IN TO START TRACKING YOUR HOURS!</p>
                  </div>
                )}
              </div>
              <button className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors">
                VIEW ALL WORK SESSIONS
              </button>
            </div>
          </div>

          {/* Recent Activity - Enhanced with Phase 1-3 */}
          <div className="mt-8 bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
            <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Recent Activity</h3>
            <div className="space-y-3">
              {workerActivity.length > 0 ? (
                workerActivity.slice(0, 8).map((activity, index) => {
                  // Phase 3: Priority-based styling
                  const priorityStyles = {
                    critical: {
                      bg: 'bg-red-50 border-red-200',
                      border: 'border-l-4 border-l-red-500',
                      indicator: 'bg-red-500 animate-pulse',
                      text: 'text-red-900'
                    },
                    warning: {
                      bg: 'bg-yellow-50 border-yellow-200',
                      border: 'border-l-4 border-l-yellow-500',
                      indicator: 'bg-yellow-500',
                      text: 'text-yellow-900'
                    },
                    notification: {
                      bg: 'bg-blue-50 border-blue-200',
                      border: 'border-l-4 border-l-blue-500',
                      indicator: 'bg-blue-500',
                      text: 'text-blue-900'
                    },
                    normal: {
                      bg: 'bg-gray-50 border-gray-200',
                      border: '',
                      indicator: activity.status === 'active' ? 'bg-green-500' : 'bg-gray-400',
                      text: 'text-gray-900'
                    }
                  }

                  const style = priorityStyles[activity.priority as keyof typeof priorityStyles] || priorityStyles.normal

                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-md ${style.bg} ${style.border}`}
                    >
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${style.indicator}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm uppercase tracking-wide ${style.text}`}>
                          {activity.organization}
                        </p>
                        <p className="text-xs text-gray-700 uppercase tracking-wide mt-0.5">
                          {activity.action}
                        </p>

                        {/* Phase 2: Enhanced details */}
                        {activity.actionDetails && (
                          <p className="text-xs text-gray-600 mt-1 font-mono">
                            {activity.actionDetails}
                          </p>
                        )}

                        {activity.amount && (
                          <p className="text-xs text-xah-blue font-bold uppercase tracking-wide mt-1">
                            {activity.amount}
                          </p>
                        )}

                        {/* Phase 2: Transaction hash link */}
                        {activity.txHash && (
                          <a
                            href={getTransactionExplorerUrl(activity.txHash, network)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 inline-block"
                          >
                            VIEW TX ↗
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide flex-shrink-0">
                        {activity.time}
                      </p>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 uppercase tracking-wide">NO RECENT ACTIVITY</p>
                </div>
              )}
            </div>
            <button className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors">
              VIEW FULL HISTORY
            </button>
          </div>
        </div>
      </section>

      {/* Notifications Dropdown */}
      {showNotifications && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-start justify-center z-50 p-4 pt-24">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 flex items-center justify-between">
              <h3 className="text-xl font-extrabold uppercase tracking-tight">
                🔔 NOTIFICATIONS
              </h3>
              <button
                onClick={() => setShowNotifications(false)}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto max-h-[calc(80vh-80px)]">
              {notifications.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-6xl mb-4">📭</div>
                  <p className="text-gray-500 uppercase tracking-wide font-semibold">NO NOTIFICATIONS</p>
                  <p className="text-sm text-gray-400 mt-2">YOU'RE ALL CAUGHT UP!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {notifications.map((notif) => {
                    // Map notification type to priority (from activity feed priority system)
                    const getPriorityFromType = (type: string) => {
                      if (type === 'error') return 'critical'
                      if (type === 'warning') return 'warning'
                      if (type === 'closure_request') return 'notification'
                      return 'normal'
                    }

                    const priority = getPriorityFromType(notif.type || 'info')

                    // Phase 3: Priority-based notification styling
                    const priorityBadgeStyles = {
                      critical: 'bg-red-100 text-red-700 border border-red-300',
                      warning: 'bg-yellow-100 text-yellow-700 border border-yellow-300',
                      notification: 'bg-blue-100 text-blue-700 border border-blue-300',
                      normal: 'bg-gray-100 text-gray-700 border border-gray-300'
                    }

                    const priorityBgStyles = {
                      critical: notif.isRead ? 'bg-white' : 'bg-red-50',
                      warning: notif.isRead ? 'bg-white' : 'bg-yellow-50',
                      notification: notif.isRead ? 'bg-white' : 'bg-blue-50',
                      normal: notif.isRead ? 'bg-white' : 'bg-gray-50'
                    }

                    const priorityIcons = {
                      critical: '🚨',
                      warning: '⚠️',
                      notification: '🔔',
                      normal: '📢'
                    }

                    const priorityLabels = {
                      critical: 'ERROR',
                      warning: 'WARNING',
                      notification: 'NOTIFICATION',
                      normal: 'INFO'
                    }

                    return (
                      <div
                        key={notif.id}
                        className={`p-4 transition-colors ${priorityBgStyles[priority as keyof typeof priorityBgStyles]} hover:bg-gray-50`}
                      >
                        {/* Notification Header */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{priorityIcons[priority as keyof typeof priorityIcons]}</span>
                            <span className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded ${priorityBadgeStyles[priority as keyof typeof priorityBadgeStyles]}`}>
                              {priorityLabels[priority as keyof typeof priorityLabels]}
                            </span>
                            {!notif.isRead && (
                              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 uppercase tracking-wide">
                            {new Date(notif.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Message */}
                        <p className="text-sm text-gray-700 mb-3 uppercase tracking-wide">
                          {notif.message}
                        </p>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {!notif.isRead && (
                            <button
                              onClick={async () => {
                                try {
                                  await workerNotificationsApi.markAsRead(notif.id, walletAddress!)
                                  // Refresh notifications
                                  const data = await workerNotificationsApi.getNotifications(walletAddress!)
                                  setNotifications(data.notifications)
                                  setUnreadCount(data.unreadCount)
                                } catch (error) {
                                  console.error('[MARK_READ_ERROR]', error)
                                }
                              }}
                              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded text-xs uppercase tracking-wide transition-colors"
                            >
                              MARK AS READ
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Clear Read Notifications Button */}
              {notifications.some(n => n.isRead) && (
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <button
                    onClick={async () => {
                      if (window.confirm('⚠️ PERMANENTLY DELETE ALL READ NOTIFICATIONS?\n\nTHIS ACTION CANNOT BE UNDONE.')) {
                        try {
                          const response = await fetch(
                            `${import.meta.env.VITE_BACKEND_URL}/api/worker-notifications/clear-read/${walletAddress}`,
                            { method: 'DELETE' }
                          )
                          const data = await response.json()

                          if (data.success) {
                            alert(`✅ ${data.data.message}`)
                            // Refresh notifications
                            const freshNotifications = await workerNotificationsApi.getNotifications(walletAddress!)
                            setNotifications(freshNotifications.notifications)
                            setUnreadCount(freshNotifications.unreadCount)
                          } else {
                            alert('❌ FAILED TO CLEAR NOTIFICATIONS')
                          }
                        } catch (error: any) {
                          console.error('[CLEAR_NOTIFICATIONS_ERROR]', error)
                          alert(`❌ ERROR: ${error.message}`)
                        }
                      }
                    }}
                    className="w-full px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg text-sm uppercase tracking-wide transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    CLEAR READ NOTIFICATIONS
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />

      {/* Close Channel Confirmation Modal */}
      {showCancelConfirm && selectedChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl">
            <div className="mb-4">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-2">
                CLOSE PAYMENT CHANNEL
              </h3>
              <p className="text-sm text-gray-700 uppercase">
                ARE YOU SURE YOU WANT TO CLOSE THIS CHANNEL?
              </p>
            </div>

            {/* Channel Details */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="space-y-2 text-sm uppercase">
                <div className="flex justify-between">
                  <span className="text-gray-600 uppercase tracking-wide font-semibold">JOB:</span>
                  <span className="text-gray-900 font-bold">{selectedChannel.jobName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 uppercase tracking-wide font-semibold">YOUR BALANCE:</span>
                  <span className="text-green-600 font-bold">{selectedChannel.balance?.toLocaleString() || '0'} XAH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 uppercase tracking-wide font-semibold">HOURS WORKED:</span>
                  <span className="text-purple-600 font-bold">{selectedChannel.hoursAccumulated?.toFixed(1) || '0'}h</span>
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex gap-2">
                <div className="text-yellow-600 text-xl flex-shrink-0">⚠️</div>
                <div className="space-y-2 text-xs text-yellow-800 uppercase">
                  <p className="font-bold uppercase tracking-wide">IMPORTANT:</p>
                  <p>• YOU WILL RECEIVE YOUR ACCUMULATED BALANCE</p>
                  <p>• UNUSED ESCROW RETURNS TO EMPLOYER</p>
                  <p>• THIS ACTION CANNOT BE UNDONE</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCancelConfirm(false)
                  setSelectedChannel(null)
                }}
                disabled={cancelingChannel === selectedChannel.channelId}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                KEEP CHANNEL
              </button>
              <button
                onClick={() => handleCloseConfirm(false)}
                disabled={cancelingChannel === selectedChannel.channelId}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelingChannel === selectedChannel.channelId ? 'CLOSING...' : 'CLOSE CHANNEL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unclaimed Balance Warning Modal */}
      {showUnclaimedWarning && selectedChannel && unclaimedBalanceData && (
        <UnclaimedBalanceWarningModal
          isOpen={showUnclaimedWarning}
          onClose={() => {
            setShowUnclaimedWarning(false)
            setUnclaimedBalanceData(null)
            setSelectedChannel(null)
          }}
          onForceClose={handleForceClose}
          unpaidBalance={unclaimedBalanceData.unpaidBalance}
          channelDetails={{
            jobName: selectedChannel.jobName,
            worker: selectedChannel.employer || 'Employer',
            escrowBalance: selectedChannel.escrowBalance,
            hoursAccumulated: selectedChannel.hoursAccumulated
          }}
          callerType={unclaimedBalanceData.callerType}
          isClosing={cancelingChannel === selectedChannel.channelId}
        />
      )}

      {/* How This Works Modal */}
      {showHowItWorksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 border-4 border-xah-blue/40">
            {/* Header */}
            <div className="bg-gradient-to-r from-xah-blue to-primary-700 text-white p-6 rounded-t-xl">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-extrabold uppercase tracking-tight">
                  HOW RECENT PAYMENTS WORK
                </h2>
                <button
                  onClick={() => setShowHowItWorksModal(false)}
                  className="text-white hover:text-secondary-500 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-xah-blue rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white font-bold text-sm">1</span>
                  </div>
                  <p className="text-gray-700 text-sm">
                    <strong className="text-gray-900">WORK TRACKING:</strong> YOUR HOURS ARE TRACKED AUTOMATICALLY. EARNINGS ACCUMULATE WITH EACH WORK SESSION AND ARE PAID WHEN THE PAYMENT CHANNEL CLOSES.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-xah-blue rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white font-bold text-sm">2</span>
                  </div>
                  <p className="text-gray-700 text-sm">
                    <strong className="text-gray-900">WHAT YOU SEE HERE:</strong> THIS SECTION SHOWS YOUR COMPLETED WORK SESSIONS, NOT INDIVIDUAL LEDGER TRANSACTIONS. PAYMENT HAPPENS ONCE WHEN THE CHANNEL CLOSES.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-xah-blue rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white font-bold text-sm">3</span>
                  </div>
                  <p className="text-gray-700 text-sm">
                    <strong className="text-gray-900">PAYMENT CHANNELS:</strong> YOUR EMPLOYER FUNDS AN ESCROW CHANNEL ON THE XAH LEDGER. ALL ACCUMULATED EARNINGS ARE SENT TO YOUR WALLET ({walletAddress ? `${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 6)}` : 'YOUR WALLET'}) IN ONE SECURE LEDGER TRANSACTION AT CHANNEL CLOSURE.
                  </p>
                </div>
              </div>

              {/* Explorer Link */}
              <div className="bg-gradient-to-br from-primary-50 to-secondary-50 rounded-xl p-4 border-2 border-xah-blue/20">
                <p className="text-sm text-gray-700 mb-3 font-semibold uppercase tracking-wide">
                  📊 VIEW YOUR TRANSACTION HISTORY
                </p>
                <a
                  href={getAccountExplorerUrl(walletAddress, network)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-xah-blue hover:bg-primary-700 text-white font-bold rounded-lg transition-colors uppercase text-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  OPEN XAHAU EXPLORER
                </a>
                <p className="text-xs text-gray-500 mt-2 uppercase tracking-wide">
                  VIEW ALL YOUR XAH TRANSACTIONS AND PAYMENT CHANNEL ACTIVITY ON THE LEDGER
                </p>
              </div>

              {/* Close Button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowHowItWorksModal(false)}
                  className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors uppercase text-sm border-2 border-gray-300"
                >
                  GOT IT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WorkerDashboard
