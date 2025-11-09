import React, { useState } from 'react'

interface AddWorkerModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const AddWorkerModal: React.FC<AddWorkerModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [workerName, setWorkerName] = useState('')
  const [ledgerAddress, setLedgerAddress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
      
      // TODO: Replace with actual API endpoint when backend is ready
      const response = await fetch(`${backendUrl}/api/workers/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: workerName.trim(),
          walletAddress: ledgerAddress.trim(),
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
    if (!isSubmitting) {
      setWorkerName('')
      setLedgerAddress('')
      setError(null)
      setSuccess(false)
      onClose()
    }
  }

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
            {!isSubmitting && (
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
                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                  XRPL Ledger Address *
                </label>
                <input
                  type="text"
                  value={ledgerAddress}
                  onChange={(e) => setLedgerAddress(e.target.value)}
                  placeholder="e.g., rN7n7otQDd6FczFgLdlqtyMVrn3HMfXpEm"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-xah-blue focus:ring-2 focus:ring-xah-blue/20 transition-colors font-mono text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                />
                <p className="text-xs text-gray-500 mt-2 uppercase tracking-wide">
                  Worker's XRPL wallet address (starts with 'r')
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
