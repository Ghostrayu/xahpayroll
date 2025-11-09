import React, { useState, useEffect } from 'react'
import { useWallet } from '../contexts/WalletContext'

interface AddWorkerModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const AddWorkerModal: React.FC<AddWorkerModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { walletAddress: ngoWalletAddress } = useWallet()
  const [workerName, setWorkerName] = useState('')
  const [ledgerAddress, setLedgerAddress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Xaman QR code scanning state
  const [isScanning, setIsScanning] = useState(false)
  const [xamanQrUrl, setXamanQrUrl] = useState<string | null>(null)
  const [xamanPayloadUuid, setXamanPayloadUuid] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    // Validate inputs
    if (!workerName.trim()) {
      setError('Worker name is required')
      setIsSubmitting(false)
      return
    }

    if (!ledgerAddress.trim()) {
      setError('Ledger address is required')
      setIsSubmitting(false)
      return
    }

    // Basic XRPL address validation (starts with 'r' and is 25-35 characters)
    if (!ledgerAddress.match(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)) {
      setError('Invalid XRPL ledger address format')
      setIsSubmitting(false)
      return
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

      if (!ngoWalletAddress) {
        setError('Please connect your wallet first')
        setIsSubmitting(false)
        return
      }

      const response = await fetch(`${backendUrl}/api/workers/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: workerName.trim(),
          walletAddress: ledgerAddress.trim(),
          ngoWalletAddress: ngoWalletAddress,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'Failed to add worker')
      }

      // Success!
      setSuccess(true)
      setTimeout(() => {
        handleClose()
        if (onSuccess) onSuccess()
      }, 1500)
    } catch (err: any) {
      console.error('Error adding worker:', err)
      setError(err.message || 'Failed to add worker. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting && !isScanning) {
      setWorkerName('')
      setLedgerAddress('')
      setError(null)
      setSuccess(false)
      setScanError(null)
      setIsScanning(false)
      setXamanQrUrl(null)
      setXamanPayloadUuid(null)
      onClose()
    }
  }

  // Function to initiate Xaman QR scan
  const handleScanWithXaman = async () => {
    setScanError(null)
    setIsScanning(true)

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

      // Create sign-in payload
      const response = await fetch(`${backendUrl}/api/xaman/create-signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          returnUrl: window.location.origin
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'Failed to create Xaman sign-in request')
      }

      const { data } = await response.json()

      if (!data || !data.uuid) {
        throw new Error('Failed to create Xaman sign-in request')
      }

      // Set QR code URL and UUID for polling
      setXamanQrUrl(data.qrUrl)
      setXamanPayloadUuid(data.uuid)
    } catch (err: any) {
      console.error('Error creating Xaman scan request:', err)
      setScanError(err.message || 'Failed to create scan request. Please try again.')
      setIsScanning(false)
    }
  }

  // Function to cancel Xaman scan
  const handleCancelScan = async () => {
    if (xamanPayloadUuid) {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
        await fetch(`${backendUrl}/api/xaman/cancel/${xamanPayloadUuid}`, {
          method: 'POST'
        })
      } catch (err) {
        console.error('Error cancelling Xaman payload:', err)
      }
    }

    setIsScanning(false)
    setXamanQrUrl(null)
    setXamanPayloadUuid(null)
    setScanError(null)
  }

  // Poll for Xaman sign-in result
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null

    const pollPayloadStatus = async () => {
      if (!xamanPayloadUuid) return

      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
        const response = await fetch(`${backendUrl}/api/xaman/payload/${xamanPayloadUuid}`)

        if (!response.ok) {
          throw new Error('Failed to check sign-in status')
        }

        const { data } = await response.json()

        if (data.signed && data.account) {
          // Success! Worker signed in
          setLedgerAddress(data.account)
          setIsScanning(false)
          setXamanQrUrl(null)
          setXamanPayloadUuid(null)
          setScanError(null)

          if (pollInterval) {
            clearInterval(pollInterval)
          }
        } else if (data.expired || data.resolved) {
          // Payload expired or was rejected
          setScanError('Scan request expired or was rejected. Please try again.')
          setIsScanning(false)
          setXamanQrUrl(null)
          setXamanPayloadUuid(null)

          if (pollInterval) {
            clearInterval(pollInterval)
          }
        }
      } catch (err: any) {
        console.error('Error polling payload status:', err)
        setScanError(err.message || 'Failed to check scan status')
        setIsScanning(false)
        setXamanQrUrl(null)
        setXamanPayloadUuid(null)

        if (pollInterval) {
          clearInterval(pollInterval)
        }
      }
    }

    if (xamanPayloadUuid && isScanning) {
      // Start polling every 2 seconds
      pollInterval = setInterval(pollPayloadStatus, 2000)

      // Initial check
      pollPayloadStatus()
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
  }, [xamanPayloadUuid, isScanning])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 border-4 border-xah-blue/40">
        {/* Header */}
        <div className="bg-gradient-to-r from-xah-blue to-primary-700 text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-extrabold uppercase tracking-tight">
                ➕ ADD WORKER
              </h2>
              <p className="text-sm mt-2 text-white/90 uppercase tracking-wide">
                Add a new worker to your organization
              </p>
            </div>
            {!isSubmitting && !isScanning && (
              <button
                onClick={handleClose}
                className="text-white hover:text-secondary-500 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 uppercase mb-2">Worker Added!</h3>
              <p className="text-gray-600 uppercase text-sm tracking-wide">
                {workerName} has been added to your organization
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-600 font-semibold">⚠️ {error}</p>
                </div>
              )}

              {/* Worker Name Input */}
              <div>
                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                  Worker Name *
                </label>
                <input
                  type="text"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  placeholder="e.g., John Doe"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:ring-2 focus:ring-xah-blue/20 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                />
                <p className="text-xs text-gray-500 mt-2 uppercase tracking-wide">
                  Full name of the worker
                </p>
              </div>

              {/* Ledger Address Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">
                    XRPL Ledger Address *
                  </label>
                  <button
                    type="button"
                    onClick={handleScanWithXaman}
                    disabled={isSubmitting || isScanning}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold rounded-lg text-xs uppercase tracking-wide transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    {isScanning ? 'Scanning...' : 'Scan with Xaman'}
                  </button>
                </div>

                {/* QR Code Display */}
                {isScanning && xamanQrUrl && (
                  <div className="mb-4 p-4 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-300 rounded-lg">
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">
                        Worker: Scan QR Code with Xaman
                      </p>
                      <div className="bg-white p-4 rounded-lg inline-block shadow-lg">
                        <img
                          src={xamanQrUrl}
                          alt="Xaman QR Code"
                          className="w-48 h-48 mx-auto"
                        />
                      </div>
                      <p className="text-xs text-gray-600 uppercase tracking-wide mt-3">
                        Waiting for worker to sign in...
                      </p>
                      <div className="flex justify-center mt-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelScan}
                        className="mt-4 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-xs uppercase tracking-wide transition-colors"
                      >
                        Cancel Scan
                      </button>
                    </div>
                  </div>
                )}

                {/* Scan Error */}
                {scanError && (
                  <div className="mb-4 bg-orange-50 border-2 border-orange-200 rounded-lg p-3">
                    <p className="text-sm text-orange-600 font-semibold">⚠️ {scanError}</p>
                  </div>
                )}

                <input
                  type="text"
                  value={ledgerAddress}
                  onChange={(e) => setLedgerAddress(e.target.value)}
                  placeholder="e.g., rN7n7otQDd6FczFgLdlqtyMVrn3HMfXpEm"
                  disabled={isSubmitting || isScanning}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:ring-2 focus:ring-xah-blue/20 transition-colors font-mono text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                />
                <p className="text-xs text-gray-500 mt-2 uppercase tracking-wide">
                  {isScanning ? 'Address will auto-fill when worker scans QR code' : "Worker's XRPL wallet address (starts with 'r')"}
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <div className="text-2xl">ℹ️</div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1">
                      Important
                    </p>
                    <ul className="text-xs text-gray-700 space-y-1 uppercase tracking-wide">
                      <li>• Worker must have a valid XRPL wallet</li>
                      <li>• Use "Scan with Xaman" for easy wallet address input</li>
                      <li>• Hourly rates will be set when creating payment channels</li>
                      <li>• Worker can sign in using their wallet address</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors uppercase text-sm border-2 border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-xah-blue hover:bg-primary-700 text-white font-bold rounded-lg transition-all uppercase text-sm shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Adding...
                    </span>
                  ) : (
                    '✓ Add Worker'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default AddWorkerModal
