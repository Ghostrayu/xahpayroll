import React, { useState } from 'react'
import { useWallet } from '../contexts/WalletContext'

interface Worker {
  id: number
  name: string
  employeeWalletAddress: string
  rate?: number
}

interface DeleteWorkerModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  workers: Worker[]
}

const DeleteWorkerModal: React.FC<DeleteWorkerModalProps> = ({ isOpen, onClose, onSuccess, workers }) => {
  const { walletAddress } = useWallet()
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDeleteWorker = async () => {
    if (!selectedWorker || !walletAddress) {
      setError('PLEASE SELECT A WORKER TO DELETE')
      return
    }

    setIsDeleting(true)
    setError(null)

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

      const response = await fetch(`${backendUrl}/api/workers/remove`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          walletAddress: selectedWorker.employeeWalletAddress,
          ngoWalletAddress: walletAddress
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'FAILED TO DELETE WORKER')
      }

      alert(`✅ ${data.message.toUpperCase()}`)

      // Reset modal state
      setSelectedWorker(null)

      // Close modal and trigger refresh
      onClose()
      onSuccess()
    } catch (error: any) {
      console.error('Error deleting worker:', error)

      // Handle specific error cases
      if (error.message.includes('active payment channels')) {
        setError('CANNOT DELETE WORKER WITH ACTIVE PAYMENT CHANNELS. PLEASE CLOSE ALL CHANNELS FIRST.')
      } else if (error.message.includes('unpaid balance')) {
        setError('CANNOT DELETE WORKER WITH UNPAID BALANCE. PLEASE CLOSE ALL CHANNELS FIRST.')
      } else {
        setError(error.message || 'FAILED TO DELETE WORKER. PLEASE TRY AGAIN.')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    setSelectedWorker(null)
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b-2 border-gray-200">
          <h2 className="text-2xl font-extrabold text-gray-900 uppercase tracking-tight">
            ⚠️ DELETE WORKER
          </h2>
          <p className="text-sm text-gray-600 uppercase tracking-wide mt-2">
            REMOVE A WORKER FROM YOUR ORGANIZATION
          </p>
        </div>

        <div className="p-6">
          {/* Warning Banner */}
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-900 uppercase tracking-wide mb-1">
                  ⚠️ WARNING
                </p>
                <p className="text-xs text-red-800">
                  WORKERS WITH ACTIVE PAYMENT CHANNELS OR UNPAID BALANCES CANNOT BE DELETED. PLEASE CLOSE ALL CHANNELS BEFORE REMOVING A WORKER.
                </p>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
              <p className="text-sm font-bold text-red-900 uppercase tracking-wide">
                {error}
              </p>
            </div>
          )}

          {/* Worker Selection */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
              SELECT WORKER TO DELETE
            </label>
            {workers.length > 0 ? (
              <select
                value={selectedWorker?.id || ''}
                onChange={(e) => {
                  const worker = workers.find(w => w.id === parseInt(e.target.value))
                  setSelectedWorker(worker || null)
                  setError(null)
                }}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-xah-blue focus:border-transparent uppercase font-semibold text-sm"
                disabled={isDeleting}
              >
                <option value="">SELECT A WORKER...</option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.name} ({worker.employeeWalletAddress.substring(0, 10)}...)
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 uppercase tracking-wide">NO WORKERS AVAILABLE TO DELETE</p>
              </div>
            )}
          </div>

          {/* Selected Worker Info */}
          {selectedWorker && (
            <div className="mb-6 bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-2">
                WORKER DETAILS
              </h3>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">NAME: </span>
                  <span className="text-sm text-gray-900 font-bold">{selectedWorker.name}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">WALLET: </span>
                  <code className="text-xs font-mono text-gray-900">{selectedWorker.employeeWalletAddress}</code>
                </div>
                {selectedWorker.rate !== undefined && selectedWorker.rate > 0 && (
                  <div>
                    <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">RATE: </span>
                    <span className="text-sm text-green-600 font-bold">{selectedWorker.rate} XAH/HR</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Confirmation Text */}
          {selectedWorker && (
            <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-500 rounded-lg p-4">
              <p className="text-xs text-yellow-900 uppercase tracking-wide">
                THIS ACTION WILL PERMANENTLY REMOVE <strong>{selectedWorker.name}</strong> FROM YOUR ORGANIZATION. THIS CANNOT BE UNDONE.
              </p>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="p-6 border-t-2 border-gray-200 flex gap-4">
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg text-sm uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            CANCEL
          </button>
          <button
            onClick={handleDeleteWorker}
            disabled={!selectedWorker || isDeleting}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg text-sm uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? '🗑️ DELETING...' : '🗑️ DELETE WORKER'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteWorkerModal
