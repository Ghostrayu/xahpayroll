import React from 'react'
import type { NGONotification } from '../types/api'

interface ClosureRequestedNotificationProps {
  notification: NGONotification
  onMarkAsRead: (id: number) => void
}

const ClosureRequestedNotification: React.FC<ClosureRequestedNotificationProps> = ({
  notification,
  onMarkAsRead,
}) => {
  const metadata = notification.metadata || {}
  const requestId = metadata.request_id || metadata.requestId
  const channelId = metadata.channel_id || metadata.channelId || 'UNKNOWN'
  const accumulatedBalance = metadata.accumulated_balance || metadata.accumulatedBalance || '0'
  const escrowAmount = metadata.escrow_amount || metadata.escrowAmount || '0'
  const jobTitle = metadata.job_title || metadata.jobTitle || 'PAYMENT CHANNEL'

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
            : 'bg-blue-50 border-blue-300 shadow-md'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🔔</div>
          <div>
            <h4 className="font-extrabold text-gray-900 uppercase tracking-tight text-sm">
              CLOSURE REQUEST RECEIVED
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
      <div className="bg-white border-2 border-blue-200 rounded-lg p-4 mb-3">
        <p className="text-sm text-gray-900 font-bold uppercase leading-relaxed">
          {notification.message}
        </p>
      </div>

      {/* Worker Info - PROMINENTLY DISPLAYED */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-2xl">👤</div>
          <h5 className="text-sm font-extrabold text-gray-900 uppercase tracking-tight">
            WORKER INFORMATION
          </h5>
        </div>

        <div className="space-y-3">
          {/* Worker Name - MOST PROMINENT */}
          <div className="bg-white border-2 border-blue-200 rounded-lg p-3">
            <span className="text-xs text-gray-600 uppercase font-semibold block mb-1">WORKER NAME:</span>
            <span className="text-lg text-blue-900 font-extrabold">
              {notification.workerName || 'UNKNOWN WORKER'}
            </span>
          </div>

          {/* Wallet Address - SECONDARY */}
          <div>
            <span className="text-xs text-gray-600 uppercase font-semibold block mb-1">WALLET ADDRESS:</span>
            <span className="text-gray-900 font-mono text-[10px] break-all">
              {notification.workerWalletAddress}
            </span>
          </div>
        </div>
      </div>

      {/* Channel Details */}
      <div className="bg-white border-2 border-gray-200 rounded-lg p-3 mb-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-gray-600 uppercase font-semibold">JOB:</span>{' '}
            <span className="text-gray-900 font-bold">{jobTitle}</span>
          </div>
          <div>
            <span className="text-gray-600 uppercase font-semibold">ACCUMULATED BALANCE:</span>{' '}
            <span className="text-green-700 font-bold">{accumulatedBalance} XAH</span>
          </div>
          <div>
            <span className="text-gray-600 uppercase font-semibold">ESCROW AMOUNT:</span>{' '}
            <span className="text-gray-900 font-bold">{escrowAmount} XAH</span>
          </div>
          {requestId && (
            <div>
              <span className="text-gray-600 uppercase font-semibold">REQUEST ID:</span>{' '}
              <span className="text-gray-900 font-bold">#{requestId}</span>
            </div>
          )}
        </div>
      </div>

      {/* Technical Details */}
      <details className="bg-gray-100 border-2 border-gray-200 rounded-lg p-3 mb-3">
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
        </div>
      </details>

      {/* Action Required */}
      <div className="p-3 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
        <div className="flex items-start gap-2">
          <div className="text-xl">⚠️</div>
          <div>
            <p className="text-xs text-yellow-900 font-bold uppercase leading-relaxed mb-2">
              ACTION REQUIRED
            </p>
            <p className="text-xs text-yellow-800 leading-relaxed">
              PLEASE REVIEW THIS CLOSURE REQUEST AND APPROVE OR REJECT IT FROM THE "CLOSURE REQUESTS" TAB.
              THE WORKER CANNOT CLOSE THE CHANNEL WITHOUT YOUR APPROVAL.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClosureRequestedNotification
