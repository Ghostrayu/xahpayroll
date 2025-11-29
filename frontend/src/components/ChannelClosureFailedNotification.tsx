import React from 'react'
import type { NGONotification } from '../types/api'

interface ChannelClosureFailedNotificationProps {
  notification: NGONotification
  onMarkAsRead: (id: number) => void
}

const ChannelClosureFailedNotification: React.FC<ChannelClosureFailedNotificationProps> = ({
  notification,
  onMarkAsRead,
}) => {
  const metadata = notification.metadata || {}
  const channelId = metadata.channelId || 'UNKNOWN'
  const txHash = metadata.txHash || 'UNKNOWN'
  const error = metadata.error || 'VALIDATION_FAILED'
  const jobName = metadata.jobName || 'PAYMENT CHANNEL'

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div
      className={`
        border-2 rounded-lg p-4 transition-all
        ${
          notification.isRead
            ? 'bg-gray-50 border-gray-200'
            : 'bg-red-50 border-red-300 shadow-md'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-3xl">⚠️</div>
          <div>
            <h4 className="font-extrabold text-gray-900 uppercase tracking-tight text-sm">
              CHANNEL CLOSURE VALIDATION FAILED
            </h4>
            <p className="text-xs text-gray-600 uppercase mt-1">
              {formatDate(notification.createdAt)}
            </p>
          </div>
        </div>

        {!notification.isRead && (
          <button
            onClick={() => onMarkAsRead(notification.id)}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded text-xs uppercase tracking-wide transition-colors"
          >
            MARK READ
          </button>
        )}
      </div>

      {/* Message */}
      <div className="bg-white border-2 border-red-200 rounded-lg p-4 mb-3">
        <p className="text-sm text-gray-900 font-bold uppercase leading-relaxed">
          {notification.message}
        </p>
      </div>

      {/* Worker Info */}
      <div className="bg-white border-2 border-gray-200 rounded-lg p-3 mb-3">
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div>
            <span className="text-gray-600 uppercase font-semibold">WORKER:</span>{' '}
            <span className="text-gray-900 font-bold">
              {notification.workerName || 'UNKNOWN'}
            </span>
          </div>
          <div>
            <span className="text-gray-600 uppercase font-semibold">WALLET:</span>{' '}
            <span className="text-gray-900 font-mono text-[10px]">
              {notification.workerWalletAddress}
            </span>
          </div>
          <div>
            <span className="text-gray-600 uppercase font-semibold">JOB:</span>{' '}
            <span className="text-gray-900 font-bold">{jobName}</span>
          </div>
        </div>
      </div>

      {/* Technical Details */}
      <details className="bg-gray-100 border-2 border-gray-200 rounded-lg p-3">
        <summary className="cursor-pointer text-xs font-bold text-gray-700 uppercase tracking-wide hover:text-gray-900">
          🔍 TECHNICAL DETAILS
        </summary>
        <div className="mt-3 space-y-2 text-xs">
          <div>
            <span className="text-gray-600 uppercase font-semibold">CHANNEL ID:</span>
            <p className="text-gray-900 font-mono text-[10px] break-all mt-1">
              {channelId}
            </p>
          </div>
          <div>
            <span className="text-gray-600 uppercase font-semibold">TRANSACTION HASH:</span>
            <p className="text-gray-900 font-mono text-[10px] break-all mt-1">
              {txHash}
            </p>
          </div>
          <div>
            <span className="text-gray-600 uppercase font-semibold">ERROR:</span>
            <p className="text-red-700 font-bold mt-1">{error}</p>
          </div>
          {metadata.validated !== undefined && (
            <div>
              <span className="text-gray-600 uppercase font-semibold">TX VALIDATED:</span>{' '}
              <span className={`font-bold ${metadata.validated ? 'text-green-600' : 'text-red-600'}`}>
                {metadata.validated ? 'YES' : 'NO'}
              </span>
            </div>
          )}
          {metadata.channelRemoved !== undefined && (
            <div>
              <span className="text-gray-600 uppercase font-semibold">CHANNEL REMOVED:</span>{' '}
              <span className={`font-bold ${metadata.channelRemoved ? 'text-green-600' : 'text-red-600'}`}>
                {metadata.channelRemoved ? 'YES' : 'NO'}
              </span>
            </div>
          )}
        </div>
      </details>

      {/* Action Info */}
      <div className="mt-3 p-3 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
        <p className="text-xs text-yellow-900 font-bold uppercase leading-relaxed">
          ℹ️ THE CHANNEL HAS BEEN AUTOMATICALLY ROLLED BACK TO ACTIVE STATUS. YOU CAN TRY CLOSING IT AGAIN.
        </p>
      </div>
    </div>
  )
}

export default ChannelClosureFailedNotification
