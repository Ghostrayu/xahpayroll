import React, { useState } from 'react'
import type { OrphanedRecordsStats } from '../types/api'

interface OrphanedRecordsModalProps {
  isOpen: boolean
  walletAddress: string
  orphanedStats: OrphanedRecordsStats
  onReassociate: () => Promise<void>
  onSkip: () => void
}

const OrphanedRecordsModal: React.FC<OrphanedRecordsModalProps> = ({
  isOpen,
  walletAddress,
  orphanedStats,
  onReassociate,
  onSkip,
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReassociate = async () => {
    setLoading(true)
    setError(null)

    try {
      await onReassociate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'FAILED TO RE-ASSOCIATE RECORDS')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (!isOpen || !orphanedStats.hasOrphanedRecords) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-900 uppercase tracking-wide mb-2">
              RECORDS FOUND
            </h3>
            <p className="text-sm text-gray-600">
              WE FOUND EXISTING WORK RECORDS FOR THIS WALLET ADDRESS FROM A PREVIOUS ACCOUNT DELETION.
            </p>
          </div>

          {/* Found Records Section */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">
              FOUND RECORDS:
            </h4>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 uppercase font-semibold">Work Sessions:</span>
                <span className="text-lg font-bold text-xah-blue">
                  {orphanedStats.workSessionsCount}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 uppercase font-semibold">Organizations:</span>
                <span className="text-lg font-bold text-xah-blue">
                  {orphanedStats.organizationsCount}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 uppercase font-semibold">Historical Earnings:</span>
                <span className="text-lg font-bold text-green-600">
                  {orphanedStats.totalEarnings.toFixed(2)} XAH
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 uppercase font-semibold">Last Activity:</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatDate(orphanedStats.lastActivityDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">ℹ️</span>
              <div>
                <p className="text-xs font-semibold text-gray-900 uppercase mb-1">
                  WOULD YOU LIKE TO RE-ASSOCIATE THESE RECORDS?
                </p>
                <p className="text-xs text-gray-700">
                  This will restore your complete work history.
                </p>
              </div>
            </div>
          </div>

          {/* Wallet Address */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              WALLET ADDRESS
            </label>
            <code className="block text-xs font-mono text-xah-blue bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 break-all">
              {walletAddress}
            </code>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm uppercase">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onSkip}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-sm uppercase tracking-wide rounded-lg transition-all disabled:opacity-50"
            >
              SKIP
            </button>
            <button
              onClick={handleReassociate}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-xah-blue hover:bg-blue-700 text-white font-bold text-sm uppercase tracking-wide rounded-lg transition-all disabled:opacity-50"
            >
              {loading ? 'RE-ASSOCIATING...' : 'RE-ASSOCIATE RECORDS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrphanedRecordsModal
