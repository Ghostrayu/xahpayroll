import React from 'react'
import type { NGONotification } from '../types/api'

interface DeletionErrorNotificationProps {
  notification: NGONotification
  onMarkAsRead?: (notificationId: number) => void
}

const DeletionErrorNotification: React.FC<DeletionErrorNotificationProps> = ({
  notification,
  onMarkAsRead,
}) => {
  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleClick = () => {
    if (!notification.isRead && onMarkAsRead) {
      onMarkAsRead(notification.id)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={`rounded-lg p-4 border-2 transition-all cursor-pointer ${
        notification.isRead
          ? 'bg-gray-50 border-gray-200'
          : 'bg-yellow-50 border-yellow-300 hover:border-yellow-400'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-2xl flex-shrink-0">❌</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-bold text-gray-900 text-sm uppercase tracking-wide">
              DELETION ERROR
            </h4>
            {!notification.isRead && (
              <span className="inline-flex items-center px-2 py-0.5 bg-yellow-500 text-white rounded-full text-[10px] font-bold">
                UNREAD •
              </span>
            )}
          </div>

          <p className="text-sm text-gray-900 font-bold uppercase mb-2">
            {notification.message}
          </p>

          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wide">WORKER:</span>
              <span className="uppercase">
                {notification.workerName} ({notification.workerWalletAddress.substring(0, 10)}...)
              </span>
            </div>

            {notification.metadata.error && (
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wide">ERROR:</span>
                <span className="uppercase font-bold text-red-600">
                  {notification.metadata.error}
                </span>
              </div>
            )}

            {notification.metadata.blockingChannelId && (
              <div className="flex items-start gap-2">
                <span className="font-semibold uppercase tracking-wide">BLOCKING CHANNEL:</span>
                <code className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                  {notification.metadata.blockingChannelId}
                </code>
              </div>
            )}
          </div>

          <div className="mt-3 bg-yellow-100 border border-yellow-200 rounded p-2">
            <p className="text-xs text-yellow-800 uppercase">
              <strong>ACTION REQUIRED:</strong> THE WORKER MUST CLOSE ALL ACTIVE CHANNELS BEFORE DELETION
            </p>
          </div>

          <p className="text-xs text-gray-500 uppercase tracking-wide mt-3">
            {formatDate(notification.createdAt)}
          </p>
        </div>
      </div>
    </div>
  )
}

export default DeletionErrorNotification
