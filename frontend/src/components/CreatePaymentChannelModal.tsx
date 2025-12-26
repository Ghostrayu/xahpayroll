import React, { useState, useEffect } from 'react'
import { useWallet } from '../contexts/WalletContext'
import {
  preparePaymentChannelTransaction,
  xahToDrops,
  toRippleTime,
  getChannelIdFromTransaction,
  checkAccountExists
} from '../utils/paymentChannels'
import { submitTransactionWithWallet } from '../utils/walletTransactions'
import type { WorkerForChannel } from '../types/api'

interface CreatePaymentChannelModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

type PaymentFrequency = 'hourly' | 'every-30min' | 'every-15min' | 'continuous'

interface PaymentChannelConfig {
  jobName: string
  workerAddress: string
  workerName: string
  hourlyRate: string
  maxHoursPerDay: string
  startDate: string
  endDate: string
  totalFundingAmount: string
  paymentFrequency: PaymentFrequency
  settleDelay: string
  paymentStructure: 'accumulating' | 'fixed'
  autoRelease: boolean
}

const CreatePaymentChannelModal: React.FC<CreatePaymentChannelModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { walletAddress, balance, provider, network } = useWallet()

  const [config, setConfig] = useState<PaymentChannelConfig>({
    jobName: '',
    workerAddress: '',
    workerName: '',
    hourlyRate: '15.00',
    maxHoursPerDay: '8',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days default
    totalFundingAmount: '',
    paymentFrequency: 'hourly',
    settleDelay: '24',
    paymentStructure: 'accumulating',
    autoRelease: true
  })

  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setStatus] = useState<string>('') // Used for UI status updates during creation
  const [xahUsdPrice, setXahUsdPrice] = useState<number | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [usdConverterInput, setUsdConverterInput] = useState<string>('')
  const [priceTimestamp, setPriceTimestamp] = useState<Date | null>(null)

  // Workers state
  const [workers, setWorkers] = useState<WorkerForChannel[]>([])
  const [workersLoading, setWorkersLoading] = useState(false)
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('')

  // Fetch XAH/USD price on mount
  useEffect(() => {
    const fetchXahPrice = async () => {
      setPriceLoading(true)
      try {
        // Try CoinGecko API first
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=xahau&vs_currencies=usd')
        if (response.ok) {
          const data = await response.json()
          if (data.xahau?.usd) {
            setXahUsdPrice(data.xahau.usd)
            setPriceTimestamp(new Date())
            return
          }
        }
        
        // Fallback: Use a default estimate if API fails
        console.warn('Could not fetch XAH price, using estimate')
        setXahUsdPrice(0.015) // Fallback estimate
        setPriceTimestamp(new Date())
      } catch (error) {
        console.error('Error fetching XAH price:', error)
        setXahUsdPrice(0.015) // Fallback estimate
        setPriceTimestamp(new Date())
      } finally {
        setPriceLoading(false)
      }
    }

    if (isOpen) {
      fetchXahPrice()
    }
  }, [isOpen])

  // Fetch workers for this organization
  useEffect(() => {
    const fetchWorkers = async () => {
      if (!walletAddress || !isOpen) return

      setWorkersLoading(true)
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
        const response = await fetch(`${backendUrl}/api/workers/list/${walletAddress}`)

        if (!response.ok) {
          throw new Error('Failed to fetch workers')
        }

        const data = await response.json()
        if (data.success && data.data) {
          setWorkers(data.data)
        }
      } catch (error) {
        console.error('Error fetching workers:', error)
        setWorkers([])
      } finally {
        setWorkersLoading(false)
      }
    }

    fetchWorkers()
  }, [walletAddress, isOpen])

  // Handle worker selection
  const handleWorkerSelect = (workerId: string) => {
    setSelectedWorkerId(workerId)
    if (workerId) {
      const worker = workers.find(w => w.id === parseInt(workerId))
      if (worker) {
        setConfig(prev => ({
          ...prev,
          workerName: worker.name,
          workerAddress: worker.walletAddress
        }))
      }
    } else {
      setConfig(prev => ({
        ...prev,
        workerName: '',
        workerAddress: ''
      }))
    }
    setError(null)
  }

  const calculateJobTime = () => {
    const start = new Date(config.startDate)
    const end = new Date(config.endDate)
    const diffMs = end.getTime() - start.getTime()
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    
    if (days < 0) return { days: 0, weeks: 0, months: 0, text: 'Invalid dates' }
    
    const weeks = Math.floor(days / 7)
    const months = Math.floor(days / 30)
    
    let text = ''
    if (months > 0) {
      text = `${months} month${months > 1 ? 's' : ''}`
      const remainingDays = days - (months * 30)
      if (remainingDays > 0) text += `, ${remainingDays} day${remainingDays > 1 ? 's' : ''}`
    } else if (weeks > 0) {
      text = `${weeks} week${weeks > 1 ? 's' : ''}`
      const remainingDays = days - (weeks * 7)
      if (remainingDays > 0) text += `, ${remainingDays} day${remainingDays > 1 ? 's' : ''}`
    } else {
      text = `${days} day${days > 1 ? 's' : ''}`
    }
    
    return { days, weeks, months, text }
  }

  const calculateEstimatedCost = () => {
    const hourlyRate = parseFloat(config.hourlyRate) || 0
    const maxHours = parseFloat(config.maxHoursPerDay) || 0
    const jobTime = calculateJobTime()
    
    return (hourlyRate * maxHours * jobTime.days).toFixed(2)
  }

  const handleInputChange = (field: keyof PaymentChannelConfig, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleUsdToXahConversion = (usdAmount: string) => {
    setUsdConverterInput(usdAmount)
    if (xahUsdPrice && parseFloat(usdAmount) > 0) {
      const xahAmount = (parseFloat(usdAmount) / xahUsdPrice).toFixed(2)
      handleInputChange('hourlyRate', xahAmount)
    }
  }

  const isValidXrplAddress = (address: string): boolean => {
    // XRPL classic addresses start with 'r' and are 25-35 characters
    return address.startsWith('r') && address.length >= 25 && address.length <= 35
  }

  const hasValidationErrors = (): boolean => {
    if (!config.workerAddress || !isValidXrplAddress(config.workerAddress)) return true
    if (!config.workerName.trim()) return true
    if (!config.hourlyRate || parseFloat(config.hourlyRate) <= 0) return true
    if (!config.maxHoursPerDay || parseFloat(config.maxHoursPerDay) <= 0 || parseFloat(config.maxHoursPerDay) > 24) return true
    if (new Date(config.startDate) >= new Date(config.endDate)) return true
    
    const estimatedCost = parseFloat(calculateEstimatedCost())
    const fundingAmount = parseFloat(config.totalFundingAmount) || estimatedCost
    if (fundingAmount > parseFloat(balance)) return true
    
    return false
  }

  const validateForm = (): boolean => {
    if (!config.workerAddress || !isValidXrplAddress(config.workerAddress)) {
      setError('Please select a worker from the dropdown')
      return false
    }
    if (!config.workerName.trim()) {
      setError('Please select a worker from the dropdown')
      return false
    }
    if (parseFloat(config.hourlyRate) <= 0) {
      setError('Hourly rate must be greater than 0')
      return false
    }
    if (parseFloat(config.maxHoursPerDay) <= 0 || parseFloat(config.maxHoursPerDay) > 24) {
      setError('Max hours per day must be between 0 and 24')
      return false
    }
    if (new Date(config.startDate) >= new Date(config.endDate)) {
      setError('End date must be after start date')
      return false
    }
    
    const estimatedCost = parseFloat(calculateEstimatedCost())
    const fundingAmount = parseFloat(config.totalFundingAmount) || estimatedCost
    
    if (fundingAmount > parseFloat(balance)) {
      setError(`Insufficient balance. You have ${balance} XAH available`)
      return false
    }
    
    return true
  }

  const handleCreateChannel = async () => {
    if (!validateForm()) return

    setIsCreating(true)
    setError(null)

    try {
      const fundingAmountXah = config.totalFundingAmount || calculateEstimatedCost()
      const fundingAmountDrops = xahToDrops(fundingAmountXah)
      const settleDelaySeconds = parseInt(config.settleDelay) * 3600
      const expirationTime = toRippleTime(new Date(config.endDate))
      
      console.log('Creating Payment Channel with parameters:', {
        jobName: config.jobName,
        destination: config.workerAddress,
        workerName: config.workerName,
        amount: fundingAmountXah,
        amountDrops: fundingAmountDrops,
        expiration: expirationTime,
        settleDelay: settleDelaySeconds,
        balanceUpdateFrequency: config.paymentFrequency
      })

      // Step 0: PRE-FLIGHT VALIDATION - Check if worker account exists on ledger
      console.log('Checking if worker account exists on ledger...')
      const workerAccountExists = await checkAccountExists(config.workerAddress, network)

      if (!workerAccountExists) {
        const networkName = network === 'mainnet' ? 'MAINNET' : 'TESTNET'
        const faucetInfo = network === 'testnet'
          ? '\n\nFOR TESTNET: USE XAHAU TESTNET FAUCET AT https://xahau-test.net/portal/faucet'
          : ''

        throw new Error(
          `WORKER WALLET NOT ACTIVATED ON ${networkName}.\n\n` +
          `THE WORKER'S WALLET ADDRESS (${config.workerAddress}) DOES NOT EXIST ON THE XAH LEDGER YET.\n\n` +
          `BEFORE CREATING A PAYMENT CHANNEL, THE WORKER MUST:\n` +
          `1. INSTALL XAMAN WALLET (OR CROSSMARK/GEMWALLET)\n` +
          `2. CREATE OR IMPORT THEIR WALLET\n` +
          `3. RECEIVE AT LEAST 10-20 XAH TO ACTIVATE THE ACCOUNT\n` +
          `4. CONFIRM WALLET SHOWS A BALANCE (NOT "ACCOUNT NOT FOUND")${faucetInfo}\n\n` +
          `ONCE THE WORKER'S WALLET IS ACTIVATED, RETRY CREATING THE PAYMENT CHANNEL.`
        )
      }

      console.log('✅ Worker account exists on ledger - proceeding with channel creation')

      // Step 1: Prepare the PayChannelCreate transaction
      const paymentChannelTx = preparePaymentChannelTransaction({
        sourceAddress: walletAddress,
        destinationAddress: config.workerAddress,
        amount: fundingAmountDrops,
        settleDelay: settleDelaySeconds
        // REMOVED: cancelAfter field to enable immediate closure
        // Without CancelAfter, channels can be closed immediately with tfClose flag
      })

      console.log('Prepared transaction:', paymentChannelTx)

      // Build custom description for Xaman sign request
      const jobTime = calculateJobTime()
      const xamanDescription = `CREATE PAYMENT CHANNEL "${config.jobName.toUpperCase() || 'UNNAMED JOB'}" FOR "${config.workerName.toUpperCase()}"; ${fundingAmountXah} XAH PAID OVER ${jobTime.text.toUpperCase()}`

      console.log('Xaman description:', xamanDescription)

      // Step 2: Submit transaction using the connected wallet (GemWallet, Crossmark, Xaman, or Manual)
      const txResult = await submitTransactionWithWallet(paymentChannelTx, provider, network, xamanDescription)

      if (!txResult.success) {
        throw new Error(txResult.error || 'Transaction failed')
      }

      console.log('Transaction result:', txResult)

      // Step 3: Get the actual channel ID from the ledger transaction
      console.log('Querying ledger for actual channel ID...')
      const channelId = await getChannelIdFromTransaction(
        txResult.hash || '',
        walletAddress,
        network
      )
      console.log('Channel ID retrieved:', channelId)

      // Step 4: Save payment channel to database with retry logic
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      const maxRetries = 3
      const retryDelays = [2000, 4000, 8000] // Exponential backoff: 2s, 4s, 8s
      let lastError: Error | null = null
      let dbSaveSuccess = false

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[DB_SAVE] Retry attempt ${attempt}/${maxRetries}...`)
            setStatus(`RETRYING DATABASE SAVE (ATTEMPT ${attempt}/${maxRetries})...`)
            await new Promise(resolve => setTimeout(resolve, retryDelays[attempt - 1]))
          }

          const response = await fetch(`${backendUrl}/api/payment-channels/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              organizationWalletAddress: walletAddress,
              workerWalletAddress: config.workerAddress,
              workerName: config.workerName,
              jobName: config.jobName,
              hourlyRate: parseFloat(config.hourlyRate),
              fundingAmount: parseFloat(fundingAmountXah),
              channelId: channelId,
              settleDelay: settleDelaySeconds,
              expiration: expirationTime,
              balanceUpdateFrequency: config.paymentFrequency === 'hourly' ? 'Hourly' :
                                       config.paymentFrequency === 'every-30min' ? 'Every 30 Minutes' :
                                       config.paymentFrequency === 'every-15min' ? 'Every 15 Minutes' : 'Continuous'
            })
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error?.message || 'Failed to save payment channel')
          }

          const data = await response.json()
          console.log('[DB_SAVE] Payment channel saved successfully:', data)
          dbSaveSuccess = true
          break // Success! Exit retry loop
        } catch (err: any) {
          console.error(`[DB_SAVE] Attempt ${attempt + 1} failed:`, err.message)
          lastError = err

          // Don't retry on last attempt
          if (attempt === maxRetries) {
            console.error('[DB_SAVE] All retry attempts exhausted')
          }
        }
      }

      // If all retries failed, try ledger sync as fallback
      if (!dbSaveSuccess) {
        console.log('[DB_SAVE] Attempting ledger sync fallback...')
        setStatus('DATABASE SAVE FAILED. ATTEMPTING LEDGER SYNC...')

        try {
          const syncResponse = await fetch(`${backendUrl}/api/payment-channels/sync-from-ledger`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              channelId: channelId,
              organizationWalletAddress: walletAddress,
              workerWalletAddress: config.workerAddress,
              jobName: config.jobName,
              hourlyRate: config.hourlyRate
            })
          })

          if (syncResponse.ok) {
            const syncData = await syncResponse.json()
            console.log('[LEDGER_SYNC] Channel synced from ledger:', syncData)
            dbSaveSuccess = true
          } else {
            const syncError = await syncResponse.json()
            console.error('[LEDGER_SYNC] Failed:', syncError)
          }
        } catch (syncErr: any) {
          console.error('[LEDGER_SYNC] Exception:', syncErr.message)
        }
      }

      // Final handling
      if (!dbSaveSuccess) {
        // Complete failure - log orphan channel for admin
        console.error('[ORPHAN_CHANNEL] Channel created on ledger but not saved to database:', {
          channelId,
          organizationWallet: walletAddress,
          workerWallet: config.workerAddress,
          workerName: config.workerName,
          fundingAmount: fundingAmountXah,
          timestamp: new Date().toISOString()
        })

        throw new Error(
          `PAYMENT CHANNEL CREATED ON LEDGER BUT DATABASE SYNC FAILED.\n\n` +
          `CHANNEL ID: ${channelId}\n` +
          `FUNDING: ${fundingAmountXah} XAH\n\n` +
          `THE CHANNEL EXISTS ON THE BLOCKCHAIN BUT IS NOT IN YOUR DASHBOARD.\n` +
          `CONTACT SUPPORT WITH THIS CHANNEL ID TO MANUALLY SYNC.\n\n` +
          `LAST ERROR: ${lastError?.message || 'Unknown error'}`
        )
      }

      // Success! Refresh dashboard BEFORE closing modal
      alert(`✅ PAYMENT CHANNEL CREATED!\n\nCHANNEL ID: ${channelId}\nFUNDING: ${fundingAmountXah} XAH\nWORKER: ${config.workerName}`)

      // Call onSuccess callback if provided, otherwise reload page
      if (onSuccess) {
        await onSuccess() // Wait for async refresh to complete
      } else {
        window.location.reload()
      }

      // Close modal AFTER refresh completes
      onClose()
    } catch (err: any) {
      console.error('Error creating payment channel:', err)
      setError(err.message || 'Failed to create payment channel')
    } finally {
      setIsCreating(false)
    }
  }

  if (!isOpen) return null

  const estimatedCost = calculateEstimatedCost()
  const fundingAmount = config.totalFundingAmount || estimatedCost

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-xah-blue to-primary-700 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-white uppercase tracking-tight">
                Create Payment Channel
              </h2>
              <p className="text-sm text-blue-100 mt-2 uppercase">
                ⚡ Streaming hourly payments • Near-zero fees • Auto-settlement
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isCreating}
              className={`text-white transition-colors ${isCreating ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-200'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* HOW PAYMENT CHANNELS WORK */}
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">⚡</span>
              <div>
                <h4 className="text-sm font-bold text-green-900 uppercase">HOW PAYMENT CHANNELS WORK</h4>
                <p className="text-xs text-green-700 mt-1 uppercase">
                  Time tracked off-chain, balance accumulates in real-time. Worker claims when ready (recommended: end of job). Only 2 on-chain transactions total.
                </p>
              </div>
            </div>
          </div>

          {/* Job Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 uppercase tracking-tight">
              Job Information
            </h3>
            
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                Job Name
              </label>
              <input
                type="text"
                value={config.jobName}
                onChange={(e) => handleInputChange('jobName', e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:outline-none"
                placeholder="WEBSITE DEVELOPMENT"
              />
              <p className="text-xs text-gray-500 mt-1 uppercase">
                Give this payment channel a descriptive name
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                Select Worker
              </label>
              {workersLoading ? (
                <div className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm uppercase">
                  Loading workers...
                </div>
              ) : workers.length === 0 ? (
                <div className="w-full px-4 py-2 border-2 border-orange-300 bg-orange-50 rounded-lg">
                  <p className="text-sm text-orange-700 font-semibold uppercase">
                    ⚠️ No workers found
                  </p>
                  <p className="text-xs text-orange-600 mt-1 uppercase">
                    Please add workers first using the "Add Worker" button on the dashboard
                  </p>
                </div>
              ) : (
                <>
                  <select
                    value={selectedWorkerId}
                    onChange={(e) => handleWorkerSelect(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:outline-none"
                  >
                    <option value="">-- SELECT A WORKER --</option>
                    {workers.map(worker => (
                      <option key={worker.id} value={worker.id}>
                        {worker.name.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  {selectedWorkerId && config.workerAddress && (
                    <div className="mt-2 px-3 py-2 bg-gray-50 rounded border border-gray-200">
                      <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Wallet Address:</p>
                      <p className="text-xs font-mono text-gray-600 break-all">
                        {config.workerAddress}
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <p className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                    Workers must be added to your organization before creating payment channels
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 uppercase tracking-tight">
              Payment Configuration
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  Hourly Rate (XAH)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={config.hourlyRate}
                  onChange={(e) => handleInputChange('hourlyRate', e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:outline-none"
                />
                {xahUsdPrice !== null && parseFloat(config.hourlyRate) > 0 && (
                  <p className="text-xs text-gray-600 mt-1.5 flex items-center gap-1">
                    <span className="text-green-600 font-semibold">≈ ${(parseFloat(config.hourlyRate) * xahUsdPrice).toFixed(2)} USD</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500">
                      1 XAH = ${xahUsdPrice.toFixed(4)} per{' '}
                      <a 
                        href="https://www.coingecko.com/en/coins/xahau" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        CoinGecko
                      </a>
                      {priceTimestamp && ` (${priceTimestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })} PST)`}
                    </span>
                  </p>
                )}
                {priceLoading && (
                  <p className="text-xs text-gray-400 mt-1.5 uppercase">Loading price...</p>
                )}
                
                {/* USD to XAH Converter */}
                {xahUsdPrice !== null && (
                  <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-blue-900 uppercase">💱 USD Converter</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={usdConverterInput}
                          onChange={(e) => handleUsdToXahConversion(e.target.value)}
                          placeholder="ENTER USD AMOUNT"
                          className="w-full px-3 py-1.5 text-sm border border-blue-300 rounded focus:border-xah-blue focus:outline-none"
                        />
                      </div>
                      <span className="text-xs text-gray-500 font-semibold uppercase">USD/hr</span>
                    </div>
                    {usdConverterInput && parseFloat(usdConverterInput) > 0 && (
                      <p className="text-xs text-blue-700 mt-2 font-semibold">
                        ✓ ${usdConverterInput} USD = {(parseFloat(usdConverterInput) / xahUsdPrice).toFixed(2)} XAH
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  Max Hours/Day
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={config.maxHoursPerDay}
                  onChange={(e) => handleInputChange('maxHoursPerDay', e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={config.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={config.endDate}
                  onChange={(e) => handleInputChange('endDate', e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:outline-none"
                />
              </div>
            </div>

            {/* Job Time Display */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-700 uppercase mb-1">Job Duration</p>
                  <p className="text-2xl font-extrabold text-purple-700 uppercase">
                    {calculateJobTime().text}
                  </p>
                  <p className="text-xs text-gray-600 mt-1 uppercase">
                    {calculateJobTime().days} total working days
                  </p>
                  <p className="text-xs text-purple-600 mt-2 uppercase">
                    ℹ️ Includes both start and end dates
                  </p>
                </div>
                <div className="text-5xl">⏱️</div>
              </div>
            </div>
          </div>

          {/* Channel Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 uppercase tracking-tight">
              Channel Settings
            </h3>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                Claim Generation Frequency
              </label>
              <select
                value={config.paymentFrequency}
                onChange={(e) => handleInputChange('paymentFrequency', e.target.value as PaymentFrequency)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:outline-none"
              >
                <option value="hourly">Every Hour (Recommended)</option>
                <option value="every-30min">Every 30 Minutes</option>
                <option value="every-15min">Every 15 Minutes</option>
              </select>
              <p className="text-xs text-gray-500 mt-1 uppercase">
                {config.paymentFrequency === 'hourly' && '✓ Generate new signed claim every completed hour (most efficient)'}
                {config.paymentFrequency === 'every-30min' && '✓ Generate new signed claim every 30 minutes (more frequent updates)'}
                {config.paymentFrequency === 'every-15min' && '✓ Generate new signed claim every 15 minutes (maximum frequency)'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                Settle Delay (Hours)
              </label>
              <select
                value={config.settleDelay}
                onChange={(e) => handleInputChange('settleDelay', e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:outline-none"
              >
                <option value="1">1 Hour</option>
                <option value="3">3 Hours</option>
                <option value="6">6 Hours</option>
                <option value="12">12 Hours</option>
                <option value="24">24 Hours (Recommended)</option>
                <option value="48">48 Hours</option>
                <option value="72">72 Hours</option>
              </select>
              <p className="text-xs text-gray-500 mt-1 uppercase">
                ⏱️ Time delay before channel can close after final claim. Gives you time to dispute if needed.
              </p>
            </div>

            {/* Channel Expiration Info */}
            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-lg">⏰</span>
                <div className="flex-1">
                  <p className="text-xs font-bold text-purple-900 uppercase mb-1">Auto-Expiration</p>
                  <p className="text-xs text-purple-700 uppercase">
                    Channel expires at end of day on <span className="font-bold">{new Date(config.endDate).toLocaleDateString()}</span>
                  </p>
                  <p className="text-xs text-purple-600 mt-1 uppercase">
                    ✓ Unclaimed funds automatically return to your wallet
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Funding Summary */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase mb-3">
              Funding Summary
            </h3>
            
            <div className="space-y-2 text-sm uppercase">
              <div className="flex justify-between">
                <span className="text-gray-600">Job Duration:</span>
                <span className="font-bold text-purple-700">{calculateJobTime().text}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Rate × Hours × Days:</span>
                <span className="font-bold text-gray-700">
                  {config.hourlyRate} × {config.maxHoursPerDay} × {calculateJobTime().days}
                </span>
              </div>
              <div className="flex justify-between border-t border-blue-300 pt-2 mt-2">
                <span className="text-gray-600">Estimated Total Cost:</span>
                <span className="font-bold text-gray-900">{estimatedCost} XAH</span>
              </div>
              {xahUsdPrice !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-600 text-xs">≈ USD Equivalent:</span>
                  <span className="font-semibold text-gray-700 text-xs">
                    ${(parseFloat(estimatedCost) * xahUsdPrice).toFixed(2)} USD
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Your Available Balance:</span>
                <span className={`font-bold ${parseFloat(balance) < parseFloat(estimatedCost) ? 'text-red-600' : 'text-green-600'}`}>
                  {parseFloat(balance).toFixed(2)} XAH
                </span>
              </div>
              {parseFloat(balance) < parseFloat(estimatedCost) && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                  <p className="text-xs text-red-700 font-semibold uppercase">
                    ⚠️ Insufficient balance! You need {(parseFloat(estimatedCost) - parseFloat(balance)).toFixed(2)} more XAH to fund this channel.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                Funding Amount (XAH)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={config.totalFundingAmount}
                onChange={(e) => handleInputChange('totalFundingAmount', e.target.value)}
                placeholder={estimatedCost}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1 uppercase">
                Leave empty to use estimated cost ({estimatedCost} XAH)
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-600 font-semibold">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4">
            {hasValidationErrors() && !error && (
              <div className="mb-3 bg-red-50 border-2 border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700 font-semibold mb-1 uppercase">
                  ⚠️ Please check the following:
                </p>
                <ul className="text-xs text-red-700 space-y-1 ml-4 uppercase">
                  {(!config.workerAddress || !isValidXrplAddress(config.workerAddress)) && (
                    <li>• Select a worker from the dropdown</li>
                  )}
                  {!config.workerName.trim() && <li>• Worker must be selected</li>}
                  {(!config.hourlyRate || parseFloat(config.hourlyRate) <= 0) && <li>• Hourly rate greater than 0</li>}
                  {(!config.maxHoursPerDay || parseFloat(config.maxHoursPerDay) <= 0 || parseFloat(config.maxHoursPerDay) > 24) && (
                    <li>• Max hours per day (between 0 and 24)</li>
                  )}
                  {new Date(config.startDate) >= new Date(config.endDate) && <li>• End date must be after start date</li>}
                  {parseFloat(calculateEstimatedCost()) > parseFloat(balance) && (
                    <li>• Insufficient balance for this job</li>
                  )}
                </ul>
              </div>
            )}
            <div className="flex gap-4">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-6 rounded-lg text-sm uppercase tracking-wide transition-colors"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateChannel}
                disabled={isCreating || hasValidationErrors()}
                className="flex-1 bg-xah-blue hover:bg-primary-700 text-white font-bold py-3 px-6 rounded-lg text-sm uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Opening Channel...
                  </span>
                ) : (
                  `Open Payment Channel (${fundingAmount} XAH)`
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreatePaymentChannelModal
