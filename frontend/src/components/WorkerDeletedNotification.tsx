import React from 'react'
import type { NGONotification } from '../types/api'

interface WorkerDeletedNotificationProps {
  notification: NGONotification
  onMarkAsRead?: (notificationId: number) => void
}

const WorkerDeletedNotification: React.FC<WorkerDeletedNotificationProps> = ({
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
          : 'bg-red-50 border-red-300 hover:border-red-400'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-2xl flex-shrink-0">🗑️</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-bold text-gray-900 text-sm uppercase tracking-wide">
              WORKER DELETED
            </h4>
            {!notification.isRead && (
              <span className="inline-flex items-center px-2 py-0.5 bg-red-500 text-white rounded-full text-[10px] font-bold">
                UNREAD •
              </span>
            )}
          </div>

          <p className="text-sm text-gray-900 font-bold uppercase mb-2">
            {notification.message}
          </p>

          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wide">WALLET:</span>
              <code className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                {notification.workerWalletAddress}
              </code>
            </div>

            {notification.metadata.deletionDate && (
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wide">DELETION DATE:</span>
                <span className="uppercase">{formatDate(notification.metadata.deletionDate)}</span>
              </div>
            )}

            {notification.metadata.reason && (
              <div className="flex items-start gap-2">
                <span className="font-semibold uppercase tracking-wide">REASON:</span>
                <span className="uppercase">{notification.metadata.reason}</span>
              </div>
            )}

            {notification.metadata.deletionType && (
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wide">TYPE:</span>
                <span className={`uppercase font-bold ${
                  notification.metadata.deletionType === 'automatic' ? 'text-orange-600' : 'text-gray-700'
                }`}>
                  {notification.metadata.deletionType}
                  {notification.metadata.inactivityDays &&
                    ` (${notification.metadata.inactivityDays} DAYS INACTIVE)`
                  }
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500 uppercase tracking-wide mt-3">
            {formatDate(notification.createdAt)}
          </p>
        </div>
      </div>
    </div>
  )
}

export default WorkerDeletedNotification
