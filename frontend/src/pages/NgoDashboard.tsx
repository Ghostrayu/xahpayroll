import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import { useData } from '../contexts/DataContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import CreatePaymentChannelModal from '../components/CreatePaymentChannelModal'
import AddWorkerModal from '../components/AddWorkerModal'
import DeleteWorkerModal from '../components/DeleteWorkerModal'
import NGONotifications from '../components/NGONotifications'
import { ActiveWorkersSection } from '../components/ActiveWorkersSection'
import { paymentChannelApi, organizationApi, notificationApi, closureRequestsApi } from '../services/api'
import { closePaymentChannel } from '../utils/paymentChannels'
import { getTransactionExplorerUrl } from '../utils/networkUtils'

type DashboardTab = 'overview' | 'notifications' | 'closure-requests'

const NgoDashboard: React.FC = () => {
  const { userName } = useAuth()
  const { balance, reserve, isConnected, walletAddress, network, provider } = useWallet()
  const { orgStats, workers, paymentChannels, recentActivity, refreshData } = useData()
  const [showEscrowModal, setShowEscrowModal] = useState(false)
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false)
  const [showDeleteWorkerModal, setShowDeleteWorkerModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<any>(null)
  const [cancelingChannel, setCancelingChannel] = useState<string | null>(null)
  const [isFinalization, setIsFinalization] = useState(false)
  const [syncingChannels, setSyncingChannels] = useState<Set<string>>(new Set())
  const [syncingAllChannels, setSyncingAllChannels] = useState(false)
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [downloadingData, setDownloadingData] = useState(false)
  const [closureRequests, setClosureRequests] = useState<any[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null)

  // Use data from context with fallback defaults
  const stats = orgStats || {
    totalWorkers: 0,
    activeWorkers: 0,
    escrowBalance: 0,
    totalPaid: 0,
    avgHourlyRate: 0,
    hoursThisMonth: 0
  }

  // Function to refresh unread count (called by child components)
  const refreshUnreadCount = async () => {
    if (organizationId) {
      try {
        const count = await notificationApi.getUnreadCount(organizationId)
        setUnreadCount(count)
      } catch (error) {
        console.error('Failed to refresh unread count:', error)
      }
    }
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

  // Auto-sync expired channels on dashboard load
  useEffect(() => {
    const syncExpiredChannels = async () => {
      if (!walletAddress) return

      try {
        console.log('[AUTO_SYNC] Checking for expired closing channels...')
        const response = await paymentChannelApi.syncExpiredClosing()

        if (response.success && response.data) {
          const { expiredChannels, closed } = response.data

          if (expiredChannels > 0) {
            console.log(`[AUTO_SYNC] Found ${expiredChannels} expired channel(s), ${closed} already closed on ledger`)

            // Refresh payment channel data if any were updated
            if (closed > 0) {
              await refreshData()
            }
          } else {
            console.log('[AUTO_SYNC] No expired channels found')
          }
        }
      } catch (error) {
        console.error('[AUTO_SYNC_ERROR]', error)
        // Silent fail - don't interrupt dashboard loading
      }
    }

    syncExpiredChannels()
  }, [walletAddress, refreshData])

  // Poll for closure requests in background (for notification badge)
  useEffect(() => {
    const fetchClosureRequestsBackground = async () => {
      if (!walletAddress) return

      try {
        const response = await closureRequestsApi.getNGORequests(walletAddress)
        if (response.success && response.data) {
          setClosureRequests(response.data.requests)
        }
      } catch (error) {
        console.error('[FETCH_CLOSURE_REQUESTS_BACKGROUND_ERROR]', error)
      }
    }

    // Fetch immediately on mount
    fetchClosureRequestsBackground()

    // Poll every 30 seconds for updates
    const interval = setInterval(() => {
      fetchClosureRequestsBackground()
    }, 30000)

    return () => clearInterval(interval)
  }, [walletAddress])

  // Show loading state when viewing closure requests tab
  useEffect(() => {
    const fetchClosureRequestsWithLoading = async () => {
      if (!walletAddress || activeTab !== 'closure-requests') return

      setLoadingRequests(true)
      try {
        const response = await closureRequestsApi.getNGORequests(walletAddress)
        if (response.success && response.data) {
          setClosureRequests(response.data.requests)
        }
      } catch (error) {
        console.error('[FETCH_CLOSURE_REQUESTS_ERROR]', error)
      } finally {
        setLoadingRequests(false)
      }
    }

    fetchClosureRequestsWithLoading()
  }, [walletAddress, activeTab])

  /**
   * Check if a closing channel has passed its expiration time
   */
  const isChannelExpired = (channel: any): boolean => {
    if (channel.status !== 'closing' || !channel.expirationTime) {
      return false
    }
    return new Date(channel.expirationTime) < new Date()
  }

  /**
   * Get time remaining until expiration for closing channels
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

  /**
   * Handle cancel channel button click - opens confirmation modal
   */
  const handleCancelClick = (channel: any) => {
    setSelectedChannel(channel)

    // Determine if this will be scheduled or immediate closure
    const hasBalance = (channel.balance || 0) > 0
    const isExpired = channel.status === 'closing' && isChannelExpired(channel)

    // Store whether this is a finalization for use in success message
    setIsFinalization(isExpired)

    if (isExpired) {
      // Finalizing an expired scheduled closure
    } else if (hasBalance) {
      // Scheduled closure (NGO with balance > 0)
    } else {
      // Immediate closure (NGO with balance = 0)
    }

    setShowCancelConfirm(true)
  }

  /**
   * Handle cancel confirmation - executes the 3-step cancellation flow
   * 1. Call API to get XRPL transaction details
   * 2. Execute XRPL PaymentChannelClaim transaction
   * 3. Confirm closure in database
   */
  const handleCancelConfirm = async () => {
    if (!selectedChannel || !walletAddress) {
      alert('MISSING WALLET ADDRESS OR CHANNEL SELECTION')
      return
    }

    setCancelingChannel(selectedChannel.channelId)

    try {
      // Step 1: Get XRPL transaction details from backend
      console.log('[CANCEL_FLOW] Step 1: Getting transaction details from backend')
      const response = await paymentChannelApi.cancelPaymentChannel(
        selectedChannel.channelId,
        walletAddress,
        'ngo'
      )

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to prepare cancellation')
      }

      const { channel, xrplTransaction } = response.data
      const isScheduledClosure = channel.closureType === 'scheduled'

      console.log('[CANCEL_FLOW] Step 1 complete. Closure type:', isScheduledClosure ? 'SCHEDULED' : 'IMMEDIATE')

      // Step 2: Execute XRPL transaction
      console.log('[CANCEL_FLOW] Step 2: Executing XRPL PaymentChannelClaim transaction')
      const txResult = await closePaymentChannel(
        {
          channelId: channel.channelId,
          balance: xrplTransaction.Balance,
          escrowReturn: xrplTransaction.Amount,
          account: walletAddress,
          publicKey: xrplTransaction.PublicKey,
          isSourceClosure: true, // NGO is the source (sender) of the payment channel
          sourceAddress: walletAddress,
          destinationAddress: channel.workerAddress
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

      console.log('[CANCEL_FLOW] Step 3 complete. Channel closure confirmed')

      // Enhanced success messaging based on closure type from backend
      // Use actual payment amounts from confirm response (most accurate)
      const escrowReturn = confirmResponse.data?.payment?.escrowReturn || parseFloat(channel.escrowReturn || '0')
      const workerPayment = confirmResponse.data?.payment?.workerPayment || channel.balance || 0

      if (isScheduledClosure) {
        const settleDelayHours = channel.settleDelayHours || 24 // Fallback to 24 if not provided

        if (isFinalization) {
          // Finalizing an expired channel - payments completed NOW
          alert(
            `✅ CHANNEL FINALIZED - ALL PARTIES PAID!\n\n` +
            `CHANNEL STATUS: CLOSED\n\n` +
            `💰 PAYMENTS COMPLETED IN THIS TRANSACTION:\n` +
            `• Worker payment: ${workerPayment.toFixed(2)} XAH\n` +
            `• Escrow returned: ${escrowReturn.toFixed(2)} XAH\n\n` +
            `TRANSACTION: ${txResult.hash}`
          )
        } else {
          // Initial scheduled closure - SettleDelay just starting
          alert(
            `⏳ CLOSURE REQUESTED SUCCESSFULLY!\n\n` +
            `CHANNEL STATUS: CLOSING\n\n` +
            `⚠️ WORKER PROTECTION ACTIVE:\n` +
            `• Worker has ${settleDelayHours} hours to claim wages\n` +
            `• Accumulated balance: ${workerPayment.toFixed(2)} XAH\n\n` +
            `AFTER ${settleDelayHours} HOURS:\n` +
            `• You can click "FINALIZE CLOSURE"\n` +
            `• Unused escrow returns: ${escrowReturn.toFixed(2)} XAH\n\n` +
            `TRANSACTION: ${txResult.hash}`
          )
        }
      } else if (escrowReturn === 0 && workerPayment > 0) {
        // Immediate closure - worker earned all funds
        alert(
          `✅ CHANNEL CLOSED IMMEDIATELY!\n\n` +
          `💚 WORKER EARNED ALL FUNDED AMOUNT\n\n` +
          `WORKER PAYMENT: ${workerPayment.toFixed(2)} XAH\n` +
          `ESCROW RETURNED: 0 XAH (Worker earned full escrow)\n\n` +
          `TRANSACTION: ${txResult.hash}`
        )
      } else {
        // Standard immediate closure (no balance, escrow returns)
        alert(
          `✅ CHANNEL CLOSED IMMEDIATELY!\n\n` +
          `ESCROW RETURNED: ${escrowReturn.toFixed(2)} XAH\n` +
          `WORKER PAYMENT: ${workerPayment.toFixed(2)} XAH\n\n` +
          `TRANSACTION: ${txResult.hash}`
        )
      }

      // Refresh data
      await refreshData()

      // Close modal
      setShowCancelConfirm(false)

    } catch (error: any) {
      console.error('[CANCEL_FLOW_ERROR]', error)
      alert(`❌ FAILED TO CANCEL CHANNEL:\n\n${error.message}`)
    } finally {
      setCancelingChannel(null)
      setSelectedChannel(null)
    }
  }

  /**
   * Handle request immediate closure from worker
   * NGO requests worker to close the channel immediately
   */
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

  /**
   * Handle download organization data as PDF
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
      const response = await fetch(`${backendUrl}/api/organizations/export-data?walletAddress=${encodeURIComponent(walletAddress)}`)

      if (!response.ok) {
        throw new Error('FAILED TO GENERATE PDF EXPORT')
      }

      // Create blob from response
      const blob = await response.blob()

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `xah_payroll_organization_${walletAddress.substring(0, 10)}_${Date.now()}.pdf`
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

  /**
   * Handle approval of worker closure request
   * NGO approves request and executes channel closure
   */
  const handleApproveRequest = async (request: any) => {
    if (!walletAddress) {
      alert('WALLET ADDRESS NOT AVAILABLE')
      return
    }

    const confirmed = confirm(
      `APPROVE CLOSURE REQUEST?\n\n` +
      `WORKER: ${request.worker_name}\n` +
      `JOB: ${request.job_title}\n` +
      `BALANCE TO PAY: ${request.accumulated_balance} XAH\n\n` +
      `YOU WILL EXECUTE THE CHANNEL CLOSURE TRANSACTION.`
    )

    if (!confirmed) return

    setProcessingRequestId(request.request_id)

    try {
      console.log('[APPROVE_CLOSURE_REQUEST] Approving request', { requestId: request.request_id })

      // Step 1: Approve request and get XRPL transaction
      const approveResponse = await closureRequestsApi.approveRequest(request.request_id, walletAddress)

      if (!approveResponse.success || !approveResponse.data) {
        throw new Error(approveResponse.error?.message || 'FAILED TO APPROVE REQUEST')
      }

      const { xrplTransaction } = approveResponse.data

      console.log('[APPROVE_CLOSURE_REQUEST] Executing XRPL transaction', {
        channel: request.channel_id,
        balance: xrplTransaction.Balance
      })

      // Step 2: Execute XRPL PaymentChannelClaim transaction
      const txResult = await closePaymentChannel(
        {
          channelId: request.channel_id,
          balance: xrplTransaction.Balance,
          account: walletAddress,
          isSourceClosure: true, // NGO is the source (owner) of the channel
          sourceAddress: walletAddress,
          destinationAddress: request.worker_wallet
        },
        provider,
        network
      )

      if (!txResult.success || !txResult.hash) {
        throw new Error(txResult.error || 'XRPL TRANSACTION FAILED')
      }

      console.log('[APPROVE_CLOSURE_REQUEST] Transaction successful', { hash: txResult.hash })

      // Step 3: Confirm closure in database
      await closureRequestsApi.confirmClosure(request.request_id, txResult.hash)

      // Wait briefly to ensure backend has fully processed the closure
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Refresh all data (stats, channels, activity)
      await refreshData()

      // Refresh closure requests
      const requestsResponse = await closureRequestsApi.getNGORequests(walletAddress)
      if (requestsResponse.success && requestsResponse.data) {
        setClosureRequests(requestsResponse.data.requests)
      }

      // Switch to overview tab to show updated payment channels
      setActiveTab('overview')

      // Wait for React to render updates before showing alert
      await new Promise(resolve => setTimeout(resolve, 100))

      alert(
        `✅ CLOSURE REQUEST APPROVED AND EXECUTED!\n\n` +
        `WORKER ${request.worker_name} RECEIVED: ${request.accumulated_balance} XAH\n` +
        `TRANSACTION: ${txResult.hash}\n\n` +
        `DASHBOARD HAS BEEN UPDATED WITH LATEST DATA.`
      )

    } catch (error: any) {
      console.error('[APPROVE_CLOSURE_REQUEST_ERROR]', error)
      alert(`❌ FAILED TO APPROVE CLOSURE REQUEST:\n\n${error.message}`)
    } finally {
      setProcessingRequestId(null)
    }
  }

  /**
   * Handle rejection of worker closure request
   */
  const handleRejectRequest = async (request: any) => {
    const reason = prompt(
      `REJECT CLOSURE REQUEST FROM ${request.worker_name}?\n\n` +
      `PLEASE PROVIDE A REASON FOR REJECTION:`
    )

    if (!reason) return

    setProcessingRequestId(request.request_id)

    try {
      console.log('[REJECT_CLOSURE_REQUEST] Rejecting request', { requestId: request.request_id })

      const response = await closureRequestsApi.rejectRequest(request.request_id, walletAddress!, reason)

      if (!response.success) {
        throw new Error(response.error?.message || 'FAILED TO REJECT REQUEST')
      }

      // Refresh closure requests
      const requestsResponse = await closureRequestsApi.getNGORequests(walletAddress!)
      if (requestsResponse.success && requestsResponse.data) {
        setClosureRequests(requestsResponse.data.requests)
      }

      // Refresh dashboard data to show updated stats
      await refreshData()

      // Wait for React to render updates before showing alert
      await new Promise(resolve => setTimeout(resolve, 100))

      alert(`✅ CLOSURE REQUEST REJECTED\n\nREASON: ${reason}`)

    } catch (error: any) {
      console.error('[REJECT_CLOSURE_REQUEST_ERROR]', error)
      alert(`❌ FAILED TO REJECT REQUEST:\n\n${error.message}`)
    } finally {
      setProcessingRequestId(null)
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
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Wallet:</span>
                    <code className="text-xs font-mono text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200 break-all">
                      {walletAddress}
                    </code>
                    <span className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border whitespace-nowrap self-start ${
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
              className="inline-flex items-center gap-2 text-xah-blue hover:text-primary-700 font-bold text-xs sm:text-sm uppercase tracking-wide transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">BACK TO INFO</span>
              <span className="sm:hidden">BACK</span>
            </Link>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <button
              onClick={() => setShowAddWorkerModal(true)}
              className="bg-xah-blue hover:bg-primary-700 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-xl text-xs sm:text-sm uppercase tracking-wide transition-colors shadow-lg"
            >
              <span className="hidden sm:inline">➕ ADD WORKER</span>
              <span className="sm:hidden">➕ ADD</span>
            </button>
            <button
              onClick={() => setShowDeleteWorkerModal(true)}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-xl text-xs sm:text-sm uppercase tracking-wide transition-colors shadow-lg"
            >
              <span className="hidden sm:inline">🗑️ DELETE WORKER</span>
              <span className="sm:hidden">🗑️ DELETE</span>
            </button>
            <button
              onClick={() => setShowEscrowModal(true)}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-xl text-xs sm:text-sm uppercase tracking-wide transition-colors shadow-lg col-span-2 sm:col-span-1"
            >
              <span className="hidden sm:inline">⚡ OPEN PAYMENT CHANNEL</span>
              <span className="sm:hidden">⚡ CHANNEL</span>
            </button>
            <button
              onClick={handleDownloadData}
              disabled={downloadingData}
              className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-xl text-xs sm:text-sm uppercase tracking-wide transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloadingData ? (
                <>
                  <span className="hidden sm:inline">📄 DOWNLOADING...</span>
                  <span className="sm:hidden">📄 LOADING...</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">📄 DOWNLOAD DATA</span>
                  <span className="sm:hidden">📄 DOWNLOAD</span>
                </>
              )}
            </button>
            <Link
              to="/ngo/settings"
              className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-xl text-xs sm:text-sm uppercase tracking-wide transition-colors shadow-lg text-center block"
            >
              <span className="hidden sm:inline">⚙️ SETTINGS</span>
              <span className="sm:hidden">⚙️ SETTINGS</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <section className="bg-white border-b-2 border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2 sm:gap-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 sm:flex-initial px-3 sm:px-6 py-3 sm:py-4 font-bold text-xs sm:text-sm uppercase tracking-wide transition-all whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'text-xah-blue border-b-4 border-xah-blue'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              OVERVIEW
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 sm:flex-initial px-3 sm:px-6 py-3 sm:py-4 font-bold text-xs sm:text-sm uppercase tracking-wide transition-all relative whitespace-nowrap ${
                activeTab === 'notifications'
                  ? 'text-xah-blue border-b-4 border-xah-blue'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="hidden sm:inline">NOTIFICATIONS</span>
              <span className="sm:hidden">NOTIF</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-2 py-0.5 bg-red-500 text-white rounded-full text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('closure-requests')}
              className={`flex-1 sm:flex-initial px-3 sm:px-6 py-3 sm:py-4 font-bold text-xs sm:text-sm uppercase tracking-wide transition-all relative whitespace-nowrap ${
                activeTab === 'closure-requests'
                  ? 'text-xah-blue border-b-4 border-xah-blue'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="hidden sm:inline">CLOSURE REQUESTS</span>
              <span className="sm:hidden">CLOSURES</span>
              {closureRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 px-2 py-0.5 bg-orange-500 text-white rounded-full text-[10px] font-bold">
                  {closureRequests.length}
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
                        <div className="flex-1 mr-2">
                          <div className="mb-1">
                            <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">JOB NAME: </span>
                            <span className="font-bold text-gray-900 text-sm uppercase tracking-wide">
                              {channel.jobName}
                            </span>
                          </div>
                          <div className="mb-1">
                            <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">WORKER: </span>
                            <span className="font-bold text-xah-blue text-xs uppercase tracking-wide">
                              {channel.worker}
                            </span>
                          </div>
                          <div className="mt-1">
                            <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">CHANNEL ID: </span>
                            <span className="text-[10px] text-gray-600 font-mono break-all">
                              {channel.channelId}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          {channel.status === 'closing' && isChannelExpired(channel) ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 text-white rounded-full text-[10px] font-bold bg-red-600 animate-pulse">
                                ● EXPIRED - READY TO FINALIZE
                              </span>
                              <span className="text-[9px] text-gray-500 uppercase">
                                Worker can claim {channel.balance.toLocaleString()} XAH
                              </span>
                            </div>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 text-white rounded-full text-[10px] font-bold ${
                              channel.status === 'active' ? 'bg-green-500' :
                              channel.status === 'closing' ? 'bg-yellow-500' :
                              channel.status === 'closed' ? 'bg-gray-500' :
                              'bg-blue-500'
                            }`}>
                              ● {channel.status.toUpperCase()}
                              {channel.status === 'closing' && channel.expirationTime && (
                                <span className="ml-1">- {getTimeRemaining(channel.expirationTime)}</span>
                              )}
                            </span>
                          )}
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
                            Completed Sessions
                          </p>
                          <p className="text-base font-extrabold text-green-600">
                            {channel.balance.toLocaleString()} XAH
                          </p>
                          <p className="text-[8px] text-gray-500 mt-0.5">
                            SAVED TO DATABASE
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
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-green-200">
                        <div className="flex items-center gap-1 text-[10px] text-gray-600 uppercase tracking-wide">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Last updated: {channel.lastUpdate}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSyncChannel(channel)}
                            disabled={syncingChannels.has(channel.channelId || '') || wasRecentlySynced(channel.lastLedgerSync || null) || !channel.channelId}
                            className={`px-3 py-1 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors disabled:cursor-not-allowed ${
                              wasRecentlySynced(channel.lastLedgerSync || null)
                                ? 'bg-green-600'
                                : 'bg-purple-500 hover:bg-purple-600 disabled:opacity-50'
                            }`}
                          >
                            {syncingChannels.has(channel.channelId || '') ? (
                              'SYNCING...'
                            ) : wasRecentlySynced(channel.lastLedgerSync || null) ? (
                              'SYNCED ✓'
                            ) : (
                              'SYNC WITH LEDGER'
                            )}
                          </button>
                          {channel.status === 'closing' && isChannelExpired(channel) ? (
                            <button
                              onClick={() => handleCancelClick(channel)}
                              disabled={cancelingChannel === channel.channelId}
                              className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {cancelingChannel === channel.channelId ? 'FINALIZING...' : 'FINALIZE CLOSURE'}
                            </button>
                          ) : channel.status === 'closing' ? (
                            <button
                              onClick={() => handleCancelClick(channel)}
                              disabled={true}
                              className="px-3 py-1 bg-yellow-500 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors opacity-50 cursor-not-allowed"
                            >
                              CLOSING...
                            </button>
                          ) : (channel.balance || 0) > 0 ? (
                            <button
                              onClick={() => handleCancelClick(channel)}
                              disabled={cancelingChannel === channel.channelId}
                              className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {cancelingChannel === channel.channelId ? 'REQUESTING...' : 'REQUEST CLOSURE'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleCancelClick(channel)}
                              disabled={cancelingChannel === channel.channelId}
                              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {cancelingChannel === channel.channelId ? 'CLOSING...' : 'CLOSE CHANNEL'}
                            </button>
                          )}
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
            {/* Recent Activity - Enhanced with Phase 1-3 */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Recent Activity</h3>
              <div className="space-y-3">
                {recentActivity.length > 0 ? (
                  recentActivity.slice(0, 8).map((activity, index) => {
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

                    const style = priorityStyles[activity.priority] || priorityStyles.normal

                    return (
                      <div
                        key={index}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-md ${style.bg} ${style.border}`}
                      >
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${style.indicator}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-sm uppercase tracking-wide ${style.text}`}>
                            {activity.worker}
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
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowAddWorkerModal(true)}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors"
                >
                  + ADD WORKER
                </button>
                <button
                  onClick={() => setShowDeleteWorkerModal(true)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors"
                >
                  🗑️ DELETE WORKER
                </button>
              </div>
            </div>
          </div>
            </>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && organizationId && (
            <NGONotifications organizationId={organizationId} onCountChange={refreshUnreadCount} />
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

          {/* Closure Requests Tab */}
          {activeTab === 'closure-requests' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-extrabold text-gray-900 uppercase tracking-tight">
                  WORKER CLOSURE REQUESTS
                </h2>
                <p className="text-sm text-gray-600 uppercase tracking-wide mt-2">
                  REVIEW AND APPROVE WORKER REQUESTS TO CLOSE PAYMENT CHANNELS
                </p>
              </div>

              {loadingRequests ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-xah-blue"></div>
                  <p className="text-sm text-gray-600 uppercase tracking-wide mt-4">
                    LOADING CLOSURE REQUESTS...
                  </p>
                </div>
              ) : closureRequests.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="text-4xl mb-4">📋</div>
                  <p className="text-gray-600 font-bold uppercase tracking-wide">
                    NO PENDING CLOSURE REQUESTS
                  </p>
                  <p className="text-sm text-gray-500 uppercase tracking-wide mt-2">
                    WORKERS CAN REQUEST CHANNEL CLOSURES FROM THEIR DASHBOARD
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {closureRequests.map((request) => (
                    <div
                      key={request.request_id}
                      className="bg-white border-2 border-gray-200 rounded-lg p-6 hover:border-xah-blue transition-colors"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-extrabold text-gray-900 uppercase tracking-tight mb-2">
                            {request.worker_name || request.worker_wallet}
                          </h3>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="col-span-2">
                              <p className="text-gray-600 uppercase tracking-wide font-semibold">WORKER WALLET:</p>
                              <p className="text-gray-900 font-mono text-xs break-all">{request.worker_wallet}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-gray-600 uppercase tracking-wide font-semibold">CHANNEL ID:</p>
                              <p className="text-gray-900 font-mono text-xs break-all">{request.channel_id}</p>
                            </div>
                            <div>
                              <p className="text-gray-600 uppercase tracking-wide font-semibold">JOB:</p>
                              <p className="text-gray-900 font-bold">{request.job_title}</p>
                            </div>
                            <div>
                              <p className="text-gray-600 uppercase tracking-wide font-semibold">BALANCE TO PAY:</p>
                              <p className="text-green-600 font-bold text-lg">{request.accumulated_balance} XAH</p>
                            </div>
                            <div>
                              <p className="text-gray-600 uppercase tracking-wide font-semibold">ESCROW:</p>
                              <p className="text-blue-600 font-bold">{request.escrow_amount} XAH</p>
                            </div>
                            <div>
                              <p className="text-gray-600 uppercase tracking-wide font-semibold">REQUESTED:</p>
                              <p className="text-gray-900 font-bold">
                                {new Date(request.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          {request.request_message && (
                            <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                              <p className="text-xs text-gray-700 uppercase tracking-wide font-semibold mb-1">
                                MESSAGE:
                              </p>
                              <p className="text-sm text-gray-900">{request.request_message}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => handleApproveRequest(request)}
                          disabled={processingRequestId === request.request_id}
                          className="flex-1 px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingRequestId === request.request_id
                            ? '⏳ PROCESSING...'
                            : '✅ APPROVE & CLOSE'}
                        </button>
                        <button
                          onClick={() => handleRejectRequest(request)}
                          disabled={processingRequestId === request.request_id}
                          className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingRequestId === request.request_id ? '⏳ PROCESSING...' : '❌ REJECT'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {/* Delete Worker Modal */}
      <DeleteWorkerModal
        isOpen={showDeleteWorkerModal}
        onClose={() => setShowDeleteWorkerModal(false)}
        onSuccess={() => {
          // Refresh dashboard data after worker is deleted
          refreshData()
        }}
        workers={workers}
      />

      {/* Payment Channel Closure Confirmation Modal (Cancel/Finalize) */}
      {showCancelConfirm && selectedChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl">
            <div className="mb-4">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-2">
                {isChannelExpired(selectedChannel)
                  ? 'FINALIZE CHANNEL CLOSURE'
                  : parseFloat(selectedChannel.balance || '0') > 0
                    ? 'REQUEST CHANNEL CLOSURE'
                    : 'CLOSE PAYMENT CHANNEL'}
              </h3>
              <p className="text-sm text-gray-700 uppercase">
                {isChannelExpired(selectedChannel) ? (
                  <>
                    FINALIZE THE EXPIRED PAYMENT CHANNEL FOR{' '}
                    <strong className="text-gray-900">{selectedChannel.worker}</strong>?
                  </>
                ) : parseFloat(selectedChannel.balance || '0') > 0 ? (
                  <>
                    REQUEST SCHEDULED CLOSURE FOR{' '}
                    <strong className="text-gray-900">{selectedChannel.worker}</strong>?
                  </>
                ) : (
                  <>
                    CLOSE THE PAYMENT CHANNEL FOR{' '}
                    <strong className="text-gray-900">{selectedChannel.worker}</strong>?
                  </>
                )}
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
            <div className={`border rounded-lg p-4 mb-6 ${
              isChannelExpired(selectedChannel)
                ? 'bg-orange-50 border-orange-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex gap-2">
                <div className={`text-xl flex-shrink-0 ${
                  isChannelExpired(selectedChannel) ? 'text-orange-600' : 'text-yellow-600'
                }`}>
                  {isChannelExpired(selectedChannel) ? '🎯' : '⚠️'}
                </div>
                <div className={`space-y-2 text-xs uppercase ${
                  isChannelExpired(selectedChannel) ? 'text-orange-800' : 'text-yellow-800'
                }`}>
                  <p className="font-bold uppercase tracking-wide">
                    {isChannelExpired(selectedChannel) ? 'FINALIZATION DETAILS:' : 'IMPORTANT:'}
                  </p>
                  {isChannelExpired(selectedChannel) ? (
                    <>
                      <p>• CHANNEL HAS PASSED EXPIRATION TIME</p>
                      <p>• WORKER WILL RECEIVE: <strong>{selectedChannel.balance?.toLocaleString() || '0'} XAH</strong></p>
                      <p>• UNUSED ESCROW RETURNS TO YOUR WALLET</p>
                      <p>• FINALIZES PERMANENT CHANNEL CLOSURE</p>
                    </>
                  ) : (
                    <>
                      <p>• UNUSED ESCROW WILL BE RETURNED TO YOUR WALLET</p>
                      <p>• WORKER WILL RECEIVE ACCUMULATED BALANCE: <strong>{selectedChannel.balance?.toLocaleString() || '0'} XAH</strong></p>
                      <p>• THIS ACTION CANNOT BE UNDONE</p>
                    </>
                  )}
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
                {isChannelExpired(selectedChannel) ? 'GO BACK' : 'KEEP CHANNEL'}
              </button>
              <button
                onClick={() => handleCancelConfirm()}
                disabled={cancelingChannel === selectedChannel.channelId}
                className={`flex-1 px-4 py-2 text-white font-bold rounded uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isChannelExpired(selectedChannel)
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : (selectedChannel.balance || 0) > 0
                      ? 'bg-yellow-500 hover:bg-yellow-600'
                      : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {cancelingChannel === selectedChannel.channelId
                  ? (isChannelExpired(selectedChannel)
                      ? 'FINALIZING...'
                      : parseFloat(selectedChannel.balance || '0') > 0
                        ? 'REQUESTING...'
                        : 'CLOSING...')
                  : (isChannelExpired(selectedChannel)
                      ? 'FINALIZE CLOSURE'
                      : parseFloat(selectedChannel.balance || '0') > 0
                        ? 'REQUEST CLOSURE'
                        : 'CLOSE CHANNEL')
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NgoDashboard
