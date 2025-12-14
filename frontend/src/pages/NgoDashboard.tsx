import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import { useData } from '../contexts/DataContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import CreatePaymentChannelModal from '../components/CreatePaymentChannelModal'
import AddWorkerModal from '../components/AddWorkerModal'
import NGONotifications from '../components/NGONotifications'
import UnclaimedBalanceWarningModal from '../components/UnclaimedBalanceWarningModal'
import { ActiveWorkersSection } from '../components/ActiveWorkersSection'
import { paymentChannelApi, organizationApi, notificationApi } from '../services/api'
import { closePaymentChannel } from '../utils/paymentChannels'

type DashboardTab = 'overview' | 'notifications'

const NgoDashboard: React.FC = () => {
  const { userName } = useAuth()
  const { balance, reserve, isConnected, walletAddress, network, provider } = useWallet()
  const { orgStats, workers, paymentChannels, recentActivity, refreshData } = useData()
  const [showEscrowModal, setShowEscrowModal] = useState(false)
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showUnclaimedWarning, setShowUnclaimedWarning] = useState(false)
  const [unclaimedBalanceData, setUnclaimedBalanceData] = useState<any>(null)
  const [selectedChannel, setSelectedChannel] = useState<any>(null)
  const [cancelingChannel, setCancelingChannel] = useState<string | null>(null)
  const [syncingChannels, setSyncingChannels] = useState<Set<string>>(new Set())
  const [syncingAllChannels, setSyncingAllChannels] = useState(false)
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [unreadCount, setUnreadCount] = useState<number>(0)

  // Use data from context with fallback defaults
  const stats = orgStats || {
    totalWorkers: 0,
    activeWorkers: 0,
    escrowBalance: 0,
    totalPaid: 0,
    avgHourlyRate: 0,
    hoursThisMonth: 0
  }

  // Fetch organization ID and unread notification count
  useEffect(() => {
    const fetchOrganizationData = async () => {
      if (!walletAddress) return

      try {
        // Get organization ID
        const org = await organizationApi.get(walletAddress)
        setOrganizationId(org.id)

        // Fetch unread count
        if (org.id) {
          const count = await notificationApi.getUnreadCount(org.id)
          setUnreadCount(count)
        }
      } catch (error) {
        console.error('Failed to fetch organization data:', error)
      }
    }

    fetchOrganizationData()

    // Poll for unread count every 30 seconds
    const interval = setInterval(() => {
      if (organizationId) {
        notificationApi.getUnreadCount(organizationId).then(setUnreadCount).catch(console.error)
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [walletAddress, organizationId])

  /**
   * Handle cancel channel button click - opens confirmation modal
   */
  const handleCancelClick = (channel: any) => {
    setSelectedChannel(channel)
    setShowCancelConfirm(true)
  }

  /**
   * Handle cancel confirmation - executes the 3-step cancellation flow
   * 1. Call API to get XRPL transaction details
   * 2. Execute XRPL PaymentChannelClaim transaction
   * 3. Confirm closure in database
   *
   * @param forceClose - If true, bypass unclaimed balance warning
   */
  const handleCancelConfirm = async (forceClose: boolean = false) => {
    if (!selectedChannel || !walletAddress) {
      alert('MISSING WALLET ADDRESS OR CHANNEL SELECTION')
      return
    }

    setCancelingChannel(selectedChannel.channelId)

    try {
      // Step 1: Get XRPL transaction details from backend
      console.log('[CANCEL_FLOW] Step 1: Getting transaction details from backend', { forceClose })
      const response = await paymentChannelApi.cancelPaymentChannel(
        selectedChannel.channelId,
        walletAddress,
        'ngo',
        forceClose
      )

      if (!response.success) {
        // Check if error is UNCLAIMED_BALANCE warning
        if (response.error?.code === 'UNCLAIMED_BALANCE' && !forceClose) {
          console.log('[CANCEL_FLOW] Unclaimed balance detected, showing warning modal')
          setUnclaimedBalanceData({
            unpaidBalance: response.error.unpaidBalance,
            callerType: response.error.callerType
          })
          setShowCancelConfirm(false)
          setShowUnclaimedWarning(true)
          setCancelingChannel(null)
          return
        }

        throw new Error(response.error?.message || 'Failed to prepare cancellation')
      }

      if (!response.data) {
        throw new Error('NO DATA RETURNED FROM BACKEND')
      }

      const { channel, xrplTransaction } = response.data

      console.log('[CANCEL_FLOW] Step 1 complete. Escrow return:', channel.escrowReturn, 'XAH')

      // Step 2: Execute XRPL transaction
      console.log('[CANCEL_FLOW] Step 2: Executing XRPL PaymentChannelClaim transaction')
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

      console.log('[CANCEL_FLOW] Step 2 complete. Transaction hash:', txResult.hash)

      // Step 3: Confirm closure in database
      console.log('[CANCEL_FLOW] Step 3: Confirming closure in database')
      const confirmResponse = await paymentChannelApi.confirmChannelClosure(
        selectedChannel.channelId,
        txResult.hash,
        walletAddress,
        'ngo'
      )

      console.log('[CANCEL_FLOW] Step 3 complete. Channel closed successfully')

      // Enhanced success messaging based on closure type
      const isScheduledClosure = confirmResponse.scheduledClosure || false
      const escrowReturn = parseFloat(channel.escrowReturn || '0')
      const workerPayment = parseFloat(channel.accumulatedBalance || '0')

      if (isScheduledClosure) {
        // Scheduled closure (XRP remaining in channel)
        const expirationTime = confirmResponse.expirationTime
        const expirationDate = expirationTime
          ? new Date((expirationTime + 946684800) * 1000).toLocaleString()
          : 'PENDING CONFIRMATION'

        alert(
          `⏳ PAYMENT CHANNEL CLOSURE SCHEDULED!\n\n` +
          `⚠️ CHANNEL WILL CLOSE AFTER SETTLE DELAY PERIOD\n\n` +
          `SCHEDULED CLOSURE: ${expirationDate}\n` +
          `ESCROW TO BE RETURNED: ${escrowReturn.toFixed(2)} XAH\n` +
          `WORKER PAYMENT: ${workerPayment.toFixed(2)} XAH\n\n` +
          `TRANSACTION: ${txResult.hash}\n\n` +
          `NOTE: AFTER THE SETTLE DELAY PERIOD EXPIRES, THE ESCROW WILL BE AUTOMATICALLY RETURNED TO YOUR WALLET.`
        )
      } else if (escrowReturn === 0 && workerPayment > 0) {
        // Immediate closure - worker earned all funds (zero XRP remaining)
        alert(
          `✅ PAYMENT CHANNEL CLOSED IMMEDIATELY!\n\n` +
          `💚 WORKER EARNED ALL FUNDED AMOUNT\n\n` +
          `ESCROW RETURNED: 0 XAH (ALL PAID TO WORKER)\n` +
          `WORKER EARNED: ${workerPayment.toFixed(2)} XAH\n\n` +
          `TRANSACTION: ${txResult.hash}\n\n` +
          `NOTE: CHANNEL CLOSED IMMEDIATELY BECAUSE NO XRP REMAINED IN ESCROW. THE WORKER EARNED THE FULL AMOUNT!`
        )
      } else {
        // Standard immediate closure
        alert(
          `✅ PAYMENT CHANNEL CLOSED SUCCESSFULLY!\n\n` +
          `ESCROW RETURNED: ${escrowReturn.toFixed(2)} XAH\n` +
          `WORKER PAYMENT: ${workerPayment.toFixed(2)} XAH\n\n` +
          `TRANSACTION: ${txResult.hash}`
        )
      }

      // Refresh data
      await refreshData()

      // Close all modals
      setShowCancelConfirm(false)
      setShowUnclaimedWarning(false)

    } catch (error: any) {
      console.error('[CANCEL_FLOW_ERROR]', error)
      alert(`❌ FAILED TO CANCEL CHANNEL:\n\n${error.message}`)
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
    await handleCancelConfirm(true)
  }

  /**
   * Handle request immediate closure from worker
   * NGO requests worker to close the channel immediately
   */
  const handleRequestWorkerClosure = async (channel: any) => {
    if (!walletAddress) {
      alert('WALLET ADDRESS NOT FOUND')
      return
    }

    try {
      console.log('[REQUEST_WORKER_CLOSURE] Requesting closure for channel:', channel.channelId)

      const response = await paymentChannelApi.requestWorkerClosure(
        channel.channelId,
        walletAddress
      )

      if (response.success) {
        alert(
          `✅ CLOSURE REQUEST SENT TO WORKER!\n\n` +
          `WORKER: ${channel.worker}\n` +
          `JOB: ${channel.jobName}\n\n` +
          `THE WORKER WILL BE NOTIFIED AND CAN APPROVE THE REQUEST FROM THEIR DASHBOARD.`
        )

        console.log('[REQUEST_WORKER_CLOSURE] Success:', response.data)
      } else {
        throw new Error(response.error?.message || 'FAILED TO SEND REQUEST')
      }
    } catch (error: any) {
      console.error('[REQUEST_WORKER_CLOSURE_ERROR]', error)
      alert(`❌ FAILED TO REQUEST WORKER CLOSURE:\n\n${error.message}`)
    }
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
        alertMessage += `ESCROW: ${data.data.escrowAmount.toLocaleString()} XAH\n`
        alertMessage += `BALANCE: ${data.data.balance.toLocaleString()} XAH\n`
        alertMessage += `SETTLE DELAY: ${data.data.settleDelay} seconds`
      } else if (data.status === 'active') {
        alertMessage += `STATUS: ACTIVE\n`
        alertMessage += `ESCROW: ${data.data.escrowAmount.toLocaleString()} XAH\n`
        alertMessage += `BALANCE: ${data.data.balance.toLocaleString()} XAH\n`
        alertMessage += `SETTLE DELAY: ${data.data.settleDelay} seconds`
      }

      alert(alertMessage)

      // Refresh dashboard data
      await refreshData()
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

  const handleSyncAllChannels = async () => {
    if (!walletAddress) {
      alert('WALLET ADDRESS NOT AVAILABLE')
      return
    }

    setSyncingAllChannels(true)

    try {
      console.log('[SYNC_ALL_CHANNELS] Starting full ledger sync for wallet:', walletAddress)

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      const response = await fetch(`${backendUrl}/api/organizations/${walletAddress}/sync-all-channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'FAILED TO SYNC CHANNELS FROM LEDGER')
      }

      console.log('[SYNC_ALL_CHANNELS] Success:', data)

      // Show results to user
      const { results } = data
      const message =
        `✅ LEDGER SYNC COMPLETE!\n\n` +
        `TOTAL CHANNELS ON LEDGER: ${results.total}\n` +
        `NEW CHANNELS IMPORTED: ${results.imported}\n` +
        `EXISTING CHANNELS UPDATED: ${results.updated}\n` +
        `CHANNELS SKIPPED: ${results.skipped}\n\n` +
        (results.imported > 0
          ? `ℹ️ IMPORTANT: IMPORTED CHANNELS HAVE PLACEHOLDER DATA\n` +
            `- Job names show "[IMPORTED - EDIT JOB NAME]"\n` +
            `- Hourly rates set to 0 (must be edited)\n` +
            `- Please update these fields manually\n\n`
          : '') +
        (results.errors.length > 0
          ? `⚠️ SOME CHANNELS COULD NOT BE SYNCED:\n${results.errors.map((e: any) => `- ${e.reason}: ${e.destinationAddress || e.channelId}`).join('\n')}\n\n`
          : '') +
        `DASHBOARD WILL NOW REFRESH...`

      alert(message)

      // Refresh dashboard data to show newly imported channels
      await refreshData()

    } catch (error: any) {
      console.error('[SYNC_ALL_CHANNELS_ERROR]', error)
      alert(`❌ FAILED TO SYNC CHANNELS FROM LEDGER:\n\n${error.message}`)
    } finally {
      setSyncingAllChannels(false)
    }
  }

  return (
    <div className="min-h-screen x-pattern-bg-light">
      <Navbar />
      
      {/* Dashboard Header */}
      <div className="pt-28 pb-8 bg-gradient-to-br from-xah-light via-white to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 uppercase tracking-tight">
                NGO DASHBOARD
              </h1>
              <p className="text-sm text-gray-600 uppercase tracking-wide mt-2">
                Welcome back, {userName}
              </p>
              {walletAddress && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Organization:</span>
                    <span className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                      Good Money Collective
                    </span>
                  </div>
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Workers:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                        {stats.totalWorkers}
                      </span>
                      <span className="text-xs font-semibold text-green-600">
                        ({stats.activeWorkers} CLOCKED IN)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Escrow Balance:</span>
                    <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {stats.escrowBalance.toLocaleString()} XAH
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Paid:</span>
                    <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {stats.totalPaid.toLocaleString()} XAH
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Hours This Month:</span>
                    <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {stats.hoursThisMonth}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <Link 
              to="/ngo" 
              className="inline-flex items-center gap-2 text-xah-blue hover:text-primary-700 font-bold text-sm uppercase tracking-wide transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              BACK TO INFO
            </Link>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button 
              onClick={() => setShowAddWorkerModal(true)}
              className="bg-xah-blue hover:bg-primary-700 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg"
            >
              ➕ ADD WORKER
            </button>
            <button 
              onClick={() => setShowEscrowModal(true)}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg"
            >
              ⚡ OPEN PAYMENT CHANNEL
            </button>
            <button className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg">
              ⚙️ SETTINGS
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <section className="bg-white border-b-2 border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-4 font-bold text-sm uppercase tracking-wide transition-all ${
                activeTab === 'overview'
                  ? 'text-xah-blue border-b-4 border-xah-blue'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              OVERVIEW
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`px-6 py-4 font-bold text-sm uppercase tracking-wide transition-all relative ${
                activeTab === 'notifications'
                  ? 'text-xah-blue border-b-4 border-xah-blue'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              NOTIFICATIONS
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-2 py-0.5 bg-red-500 text-white rounded-full text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Dashboard Content */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <>
              {/* Active Payment Channels Section */}
              <div className="mb-12">
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
                    AUTOMATIC BACKGROUND POLLING HAS BEEN DISABLED TO REDUCE SERVER LOAD. PLEASE USE THE REFRESH CONTROLS BELOW TO UPDATE YOUR DATA.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-blue-700">
                    <span className="font-semibold">• BROWSER REFRESH → FULL DASHBOARD UPDATE</span>
                    <span className="font-semibold">• SYNC WITH LEDGER → REAL-TIME BALANCE FROM XAHAU</span>
                    <span className="font-semibold">• SYNC ALL CHANNELS → BATCH UPDATE ALL BALANCES</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-4 border-2 border-green-500/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-extrabold text-gray-900 uppercase tracking-tight">Active Payment Channels</h3>
                <span className="px-3 py-1 bg-green-500 text-white rounded-full text-xs font-bold">
                  {paymentChannels.length} ACTIVE
                </span>
              </div>

              {paymentChannels.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">⚡</div>
                  <h4 className="text-lg font-bold text-gray-900 uppercase mb-2">No Active Payment Channels</h4>
                  <p className="text-sm text-gray-600 uppercase tracking-wide mb-6">
                    Create a payment channel to start paying workers OR sync from ledger if channels already exist
                  </p>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => setShowEscrowModal(true)}
                      className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-sm uppercase tracking-wide transition-colors"
                    >
                      ⚡ Open Payment Channel
                    </button>
                    <button
                      onClick={handleSyncAllChannels}
                      disabled={syncingAllChannels}
                      className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg text-sm uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {syncingAllChannels ? '🔄 SYNCING...' : '🔄 SYNC WITH LEDGER'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
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
                        <>
                          🔄 SYNC ALL CHANNELS WITH LEDGER
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-3">
                  {paymentChannels.map((channel) => (
                    <div 
                      key={channel.id} 
                      className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-3 border-2 border-green-200 hover:border-green-400 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-bold text-xs">
                              {channel.worker.split(' ').map((n: string) => n[0]).join('')}
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">
                              {channel.jobName || channel.worker}
                            </p>
                            <p className="text-[10px] text-gray-600 uppercase tracking-wide">
                              {channel.worker} • {channel.channelId}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 text-white rounded-full text-[10px] font-bold ${
                            channel.status === 'active' ? 'bg-green-500' :
                            channel.status === 'closing' ? 'bg-yellow-500' :
                            channel.status === 'closed' ? 'bg-gray-500' :
                            'bg-blue-500'
                          }`}>
                            ● {channel.status.toUpperCase()}
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
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                        <div className="bg-white/60 rounded-lg p-2 border border-orange-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Escrow Balance
                          </p>
                          <p className="text-base font-extrabold text-orange-600">
                            {channel.escrowBalance ? channel.escrowBalance.toLocaleString() : '0'} XAH
                          </p>
                        </div>
                        <div className="bg-white/60 rounded-lg p-2 border border-green-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Accumulated Balance
                          </p>
                          <p className="text-base font-extrabold text-green-600">
                            {channel.balance.toLocaleString()} XAH
                          </p>
                        </div>
                        <div className="bg-white/60 rounded-lg p-2 border border-blue-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Hourly Rate
                          </p>
                          <p className="text-base font-extrabold text-xah-blue">
                            {channel.hourlyRate.toFixed(2)} XAH
                          </p>
                        </div>
                        <div className="bg-white/60 rounded-lg p-2 border border-purple-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Hours Tracked
                          </p>
                          <p className="text-base font-extrabold text-purple-600">
                            {channel.hoursAccumulated.toFixed(1)}h
                          </p>
                        </div>
                        <div className="bg-white/60 rounded-lg p-2 border border-gray-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Update Frequency
                          </p>
                          <p className="text-sm font-bold text-gray-900 uppercase">
                            {channel.balanceUpdateFrequency}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-green-200">
                        <div className="flex items-center gap-1 text-[10px] text-gray-600 uppercase tracking-wide">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Last updated: {channel.lastUpdate}
                        </div>
                        <div className="flex gap-2">
                          <button className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors">
                            View Details
                          </button>
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
                          {channel.status === 'active' && (
                            <button
                              onClick={() => handleRequestWorkerClosure(channel)}
                              className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors"
                            >
                              Request Closure
                            </button>
                          )}
                          <button
                            onClick={() => handleCancelClick(channel)}
                            disabled={cancelingChannel === channel.channelId || channel.status === 'closing'}
                            className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {cancelingChannel === channel.channelId || channel.status === 'closing' ? 'Closing...' : 'Cancel Channel'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                </>
              )}

              <div className="mt-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <div className="text-2xl">ℹ️</div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-2">
                      How Payment Channels Work
                    </p>
                    <ul className="text-xs text-gray-700 space-y-1 uppercase tracking-wide">
                      <li>• <strong>Off-chain tracking:</strong> Hours tracked in database, balance updates in real-time</li>
                      <li>• <strong>Signed claims:</strong> Generated based on update frequency (hourly/30min/15min)</li>
                      <li>• <strong>Accumulating balance:</strong> Worker sees total accumulated amount grow over time</li>
                      <li>• <strong>Efficient:</strong> Only 2 on-chain transactions (open channel + close/claim at end)</li>
                      <li>• <strong>Worker claims:</strong> Workers can claim anytime, but claiming closes the channel</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Active Work Sessions Section */}
          {walletAddress && (
            <ActiveWorkersSection organizationWalletAddress={walletAddress} />
          )}

          {/* Recent Activity and Workers Grid */}
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Recent Activity</h3>
              <div className="space-y-4">
                {recentActivity.length > 0 ? (
                  recentActivity.slice(0, 5).map((activity, index) => (
                    <div key={index} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        activity.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      <div className="flex-1">
                        <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">{activity.worker}</p>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">{activity.action}</p>
                        {activity.amount && (
                          <p className="text-xs text-xah-blue font-bold uppercase tracking-wide mt-1">{activity.amount}</p>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{activity.time}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">No recent activity</p>
                  </div>
                )}
              </div>
              <button className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors">
                VIEW FULL HISTORY
              </button>
            </div>

            {/* Workers */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-green-500/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Workers</h3>
              <div className="space-y-4">
                {workers.length > 0 ? (
                  workers.map((worker, index) => (
                    <div key={index} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">
                            {worker.name.split(' ').map((n: string) => n[0]).join('')}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">{worker.name}</p>
                          <code className="text-xs font-mono text-gray-600 break-all">{worker.employeeWalletAddress}</code>
                          {(worker.rate ?? 0) > 0 && (
                            <p className="text-xs text-green-600 font-bold uppercase tracking-wide mt-1">{worker.rate} XAH/hr</p>
                          )}
                        </div>
                      </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">No workers added yet</p>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setShowAddWorkerModal(true)}
                className="w-full mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors"
              >
                + ADD WORKER
              </button>
            </div>
          </div>
            </>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && organizationId && (
            <NGONotifications organizationId={organizationId} />
          )}

          {/* Loading state for notifications tab when org ID not available */}
          {activeTab === 'notifications' && !organizationId && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-xah-blue"></div>
              <p className="text-sm text-gray-600 uppercase tracking-wide mt-4">
                LOADING ORGANIZATION DATA...
              </p>
            </div>
          )}
        </div>
      </section>

      <Footer />
      
      {/* Payment Channel Modal */}
      <CreatePaymentChannelModal
        isOpen={showEscrowModal}
        onClose={() => setShowEscrowModal(false)}
        onSuccess={refreshData}
      />

      {/* Add Worker Modal */}
      <AddWorkerModal
        isOpen={showAddWorkerModal}
        onClose={() => setShowAddWorkerModal(false)}
        onSuccess={() => {
          // Refresh dashboard data after worker is added
          refreshData()
        }}
      />

      {/* Cancel Payment Channel Confirmation Modal */}
      {showCancelConfirm && selectedChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl">
            <div className="mb-4">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-2">
                CANCEL PAYMENT CHANNEL
              </h3>
              <p className="text-sm text-gray-700 uppercase">
                ARE YOU SURE YOU WANT TO CANCEL THE PAYMENT CHANNEL FOR{' '}
                <strong className="text-gray-900">{selectedChannel.worker}</strong>?
              </p>
            </div>

            {/* Channel Details */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="space-y-2 text-sm uppercase">
                <div className="flex justify-between">
                  <span className="text-gray-600 uppercase tracking-wide font-semibold">Job:</span>
                  <span className="text-gray-900 font-bold">{selectedChannel.jobName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 uppercase tracking-wide font-semibold">Escrow Balance:</span>
                  <span className="text-orange-600 font-bold">{selectedChannel.escrowBalance?.toLocaleString() || '0'} XAH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 uppercase tracking-wide font-semibold">Accumulated:</span>
                  <span className="text-green-600 font-bold">{selectedChannel.balance?.toLocaleString() || '0'} XAH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 uppercase tracking-wide font-semibold">Hours Worked:</span>
                  <span className="text-purple-600 font-bold">{selectedChannel.hoursAccumulated?.toFixed(1) || '0'}h</span>
                </div>
              </div>
            </div>

            {/* Important Info */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex gap-2">
                <div className="text-yellow-600 text-xl flex-shrink-0">⚠️</div>
                <div className="space-y-2 text-xs text-yellow-800 uppercase">
                  <p className="font-bold uppercase tracking-wide">IMPORTANT:</p>
                  <p>• UNUSED ESCROW WILL BE RETURNED TO YOUR WALLET</p>
                  <p>• WORKER WILL RECEIVE ACCUMULATED BALANCE: <strong>{selectedChannel.balance?.toLocaleString() || '0'} XAH</strong></p>
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
                onClick={() => handleCancelConfirm(false)}
                disabled={cancelingChannel === selectedChannel.channelId}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelingChannel === selectedChannel.channelId ? 'CANCELING...' : 'CANCEL CHANNEL'}
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
            worker: selectedChannel.worker,
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

export default NgoDashboard
