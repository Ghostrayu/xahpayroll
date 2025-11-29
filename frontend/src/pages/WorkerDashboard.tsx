import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import { useData } from '../contexts/DataContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import UnclaimedBalanceWarningModal from '../components/UnclaimedBalanceWarningModal'
import { paymentChannelApi, workerApi, workerNotificationsApi } from '../services/api'
import { closePaymentChannel } from '../utils/paymentChannels'

const WorkerDashboard: React.FC = () => {
  const { userName } = useAuth()
  const { balance, reserve, isConnected, walletAddress, network, provider } = useWallet()
  const { earnings, workSessions, clockIn, clockOut, isLoading, refreshData } = useData()

  // Payment channel state
  const [paymentChannels, setPaymentChannels] = useState<any[]>([])
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showUnclaimedWarning, setShowUnclaimedWarning] = useState(false)
  const [unclaimedBalanceData, setUnclaimedBalanceData] = useState<any>(null)
  const [selectedChannel, setSelectedChannel] = useState<any>(null)
  const [cancelingChannel, setCancelingChannel] = useState<string | null>(null)

  // Notification state
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [showNotifications, setShowNotifications] = useState(false)

  // Check if currently working based on active work session
  const activeSession = workSessions.find(session => !session.clockOut)
  const isWorking = !!activeSession

  // Fetch worker payment channels
  useEffect(() => {
    const fetchWorkerChannels = async () => {
      if (!walletAddress) return

      try {
        console.log('[WORKER_CHANNELS] Fetching channels for worker:', walletAddress)
        const channels = await workerApi.getPaymentChannels(walletAddress)
        console.log('[WORKER_CHANNELS] Fetched channels:', channels.length)
        setPaymentChannels(channels)
      } catch (error) {
        console.error('[WORKER_CHANNELS_ERROR] Failed to fetch worker payment channels:', error)
        // Don't show alert for this - just log the error
        // Payment channels section will simply not show if empty
      }
    }

    fetchWorkerChannels()
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

  // Recent payments from work sessions (completed)
  const recentPayments = workSessions
    .filter(session => session.clockOut && session.status === 'completed')
    .slice(0, 4)
    .map((session) => ({
      id: session.id,
      amount: session.hours ? (session.hours * workerData.hourlyRate) : 0,
      time: new Date(session.clockOut!).toLocaleString(),
      status: 'Completed',
      txHash: `0x${session.id.toString().padStart(6, '0')}`
    }))

  const handleClockInOut = async () => {
    try {
      if (isWorking) {
        await clockOut()
      } else {
        await clockIn()
      }
    } catch (error) {
      console.error('Error clocking in/out:', error)
      alert('FAILED TO CLOCK IN/OUT. PLEASE TRY AGAIN.')
    }
  }

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
        'worker',
        forceClose
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

      // Step 2: Execute XRPL transaction
      console.log('[WORKER_CLOSE_FLOW] Step 2: Executing XRPL PaymentChannelClaim')
      const txResult = await closePaymentChannel(
        {
          channelId: channel.channelId,
          balance: xrplTransaction.Balance,
          escrowReturn: xrplTransaction.Amount,
          account: walletAddress,
          publicKey: xrplTransaction.Public
        },
        provider,
        network
      )

      if (!txResult.success || !txResult.hash) {
        throw new Error(txResult.error || 'XRPL TRANSACTION FAILED')
      }

      console.log('[WORKER_CLOSE_FLOW] Step 2 complete. TX:', txResult.hash)

      // Step 3: Confirm closure in database
      console.log('[WORKER_CLOSE_FLOW] Step 3: Confirming closure')
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
      await refreshData()

      // Refresh payment channels
      const updatedChannels = await workerApi.getPaymentChannels(walletAddress)
      setPaymentChannels(updatedChannels)

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

          {/* Settings and Notifications Buttons */}
          <div className="mt-6 flex items-center gap-3">
            <Link
              to="/worker/settings"
              className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-sm"
            >
              ⚙️ ACCOUNT SETTINGS
            </Link>

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
          
          {/* Clock In/Out Section */}
          <div className="mb-12 bg-gradient-to-br from-xah-blue to-primary-700 rounded-2xl shadow-2xl p-8 text-white">
            <div className="text-center">
              <h2 className="text-2xl font-extrabold uppercase tracking-tight mb-4">
                {isWorking ? 'CURRENTLY WORKING' : 'READY TO START'}
              </h2>
              <div className="text-6xl font-extrabold mb-6">
                --
              </div>
              <button
                onClick={handleClockInOut}
                disabled={isLoading}
                className={`px-12 py-4 rounded-xl font-bold text-lg uppercase tracking-wide transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isWorking
                    ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_30px_rgba(239,68,68,0.6)]'
                    : 'bg-secondary-500 hover:bg-secondary-600 shadow-[0_0_30px_rgba(153,255,159,0.6)]'
                }`}
              >
                {isLoading ? '⏳ PROCESSING...' : isWorking ? '⏹ CLOCK OUT' : '▶️ CLOCK IN'}
              </button>
              {isWorking && (
                <p className="mt-4 text-sm uppercase tracking-wide">
                  Earning {workerData.hourlyRate} XAH per hour
                </p>
              )}
            </div>
          </div>

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

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Employment Info */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Employment Info</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600 uppercase tracking-wide font-semibold">Employer</span>
                  <span className="font-bold text-gray-900 uppercase text-sm">{workerData.employer}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600 uppercase tracking-wide font-semibold">Hourly Rate</span>
                  <span className="font-bold text-xah-blue text-lg">{workerData.hourlyRate} XAH</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600 uppercase tracking-wide font-semibold">Status</span>
                  <span className="px-3 py-1 bg-green-500 text-white rounded-full text-xs font-bold">ACTIVE</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600 uppercase tracking-wide font-semibold">Payment Frequency</span>
                  <span className="font-bold text-gray-900 uppercase text-sm">HOURLY</span>
                </div>
              </div>
            </div>

            {/* Recent Payments */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Recent Payments</h3>
              <div className="space-y-4">
                {recentPayments.length > 0 ? (
                  recentPayments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-lg">✓</span>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{payment.amount.toFixed(2)} XAH</p>
                          <p className="text-xs text-gray-600 uppercase tracking-wide">{payment.time}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-green-600 uppercase tracking-wide font-semibold">{payment.status}</p>
                        <a
                          href={`https://testnet.xrpl.org/transactions/${payment.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-xah-blue hover:underline"
                        >
                          {payment.txHash}
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">No payments yet</p>
                    <p className="text-xs text-gray-400 mt-2">Clock in to start earning!</p>
                  </div>
                )}
              </div>
              <button className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors">
                VIEW ALL PAYMENTS
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-12 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl shadow-lg p-8 border-2 border-gray-200">
            <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6 text-center">QUICK STATS</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-3xl font-extrabold text-xah-blue mb-2">{workerData.hourlyRate}</p>
                <p className="text-xs text-gray-600 uppercase tracking-wide">XAH/Hour</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-extrabold text-xah-blue mb-2">{recentPayments.length}</p>
                <p className="text-xs text-gray-600 uppercase tracking-wide">Payments Today</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-extrabold text-xah-blue mb-2">$0.001</p>
                <p className="text-xs text-gray-600 uppercase tracking-wide">Avg Fee</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-extrabold text-xah-blue mb-2">100%</p>
                <p className="text-xs text-gray-600 uppercase tracking-wide">On-Time</p>
              </div>
            </div>
          </div>

          {/* Payment Channels Section (when API is ready) */}
          {paymentChannels.length > 0 && (
            <div className="mt-12 bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">
                MY PAYMENT CHANNELS
              </h3>
              <div className="space-y-3">
                {paymentChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-4 border-2 border-green-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">
                          {channel.jobName}
                        </p>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          {channel.channelId}
                        </p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 bg-green-500 text-white rounded-full text-xs font-bold">
                        ● ACTIVE
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white/60 rounded-lg p-2 border border-green-200">
                        <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                          ACCUMULATED
                        </p>
                        <p className="text-base font-extrabold text-green-600">
                          {channel.balance?.toLocaleString() || '0'} XAH
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

                    <div className="flex justify-end">
                      <button
                        onClick={() => handleCloseClick(channel)}
                        disabled={cancelingChannel === channel.channelId || channel.status === 'closing'}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded text-xs uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cancelingChannel === channel.channelId || channel.status === 'closing' ? 'CLOSING...' : 'CLOSE CHANNEL'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-4 transition-colors ${
                        notif.isRead ? 'bg-white' : 'bg-blue-50'
                      } hover:bg-gray-50`}
                    >
                      {/* Notification Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">
                            {notif.type === 'closure_request' ? '⚠️' : '📢'}
                          </span>
                          <span className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded ${
                            notif.type === 'closure_request'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {notif.type === 'closure_request' ? 'CLOSURE REQUEST' : 'INFO'}
                          </span>
                          {!notif.isRead && (
                            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
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

                      {/* Channel Info */}
                      {notif.jobName && (
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                          JOB: {notif.jobName}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {notif.type === 'closure_request' && !notif.closureApproved && (
                          <button
                            onClick={async () => {
                              try {
                                console.log('[APPROVE_CLOSURE] Approving notification:', notif.id)
                                const response = await workerNotificationsApi.approveClosure(notif.id, walletAddress!)

                                // Find the channel
                                const channel = paymentChannels.find(ch => ch.channelId === response.data.channelId)
                                if (channel) {
                                  // Open the close confirmation modal
                                  setSelectedChannel(channel)
                                  setShowCancelConfirm(true)
                                  setShowNotifications(false)
                                } else {
                                  alert('✅ CLOSURE APPROVED. PLEASE CLOSE THE CHANNEL FROM THE PAYMENT CHANNELS SECTION.')
                                  // Refresh notifications
                                  const data = await workerNotificationsApi.getNotifications(walletAddress!)
                                  setNotifications(data.notifications)
                                  setUnreadCount(data.unreadCount)
                                }
                              } catch (error: any) {
                                console.error('[APPROVE_CLOSURE_ERROR]', error)
                                alert(`❌ FAILED TO APPROVE CLOSURE: ${error.message}`)
                              }
                            }}
                            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white font-bold rounded text-xs uppercase tracking-wide transition-colors"
                          >
                            APPROVE & CLOSE
                          </button>
                        )}

                        {notif.closureApproved && (
                          <span className="text-xs text-green-600 font-bold uppercase">
                            ✅ APPROVED
                          </span>
                        )}

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
                  ))}
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
    </div>
  )
}

export default WorkerDashboard
