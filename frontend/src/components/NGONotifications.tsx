import React, { useState, useEffect } from 'react'
import { notificationApi } from '../services/api'
import type { NGONotification, NotificationType } from '../types/api'
import WorkerDeletedNotification from './WorkerDeletedNotification'
import DeletionErrorNotification from './DeletionErrorNotification'
import WorkerRemovedNotification from './WorkerRemovedNotification'
import ChannelClosureFailedNotification from './ChannelClosureFailedNotification'

interface NGONotificationsProps {
  organizationId: number
}

const NGONotifications: React.FC<NGONotificationsProps> = ({ organizationId }) => {
  const [notifications, setNotifications] = useState<NGONotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters and pagination
  const [filterType, setFilterType] = useState<NotificationType | 'all'>('all')
  const [filterRead, setFilterRead] = useState<'all' | 'read' | 'unread'>('all')
  const [currentPage, setCurrentPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)

  const PAGE_SIZE = 20

  // Fetch notifications
  const fetchNotifications = async () => {
    setLoading(true)
    setError(null)

    try {
      const params: any = {
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE,
      }

      if (filterType !== 'all') {
        params.type = filterType
      }

      if (filterRead === 'read') {
        params.isRead = true
      } else if (filterRead === 'unread') {
        params.isRead = false
      }

      const response = await notificationApi.getNotifications(organizationId, params)

      setNotifications(response.notifications)
      setHasMore(response.pagination.hasMore)
      setTotal(response.pagination.total)
    } catch (err: any) {
      setError(err.message || 'FAILED TO LOAD NOTIFICATIONS')
    } finally {
      setLoading(false)
    }
  }

  // Fetch on mount and filter/page changes
  useEffect(() => {
    fetchNotifications()
  }, [organizationId, filterType, filterRead, currentPage])

  // Mark notification as read
  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await notificationApi.markAsRead(organizationId, notificationId)

      // Update local state
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, isRead: true } : n
        )
      )
    } catch (err: any) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      await notificationApi.markAllAsRead(organizationId)

      // Update local state
      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true }))
      )
    } catch (err: any) {
      alert(`FAILED TO MARK ALL AS READ: ${err.message}`)
    }
  }

  // Render notification based on type
  const renderNotification = (notification: NGONotification) => {
    const props = {
      notification,
      onMarkAsRead: handleMarkAsRead,
    }

    switch (notification.notificationType) {
      case 'worker_deleted':
        return <WorkerDeletedNotification key={notification.id} {...props} />
      case 'deletion_error':
        return <DeletionErrorNotification key={notification.id} {...props} />
      case 'worker_removed':
        return <WorkerRemovedNotification key={notification.id} {...props} />
      case 'channel_closure_failed':
        return <ChannelClosureFailedNotification key={notification.id} {...props} />
      default:
        return null
    }
  }

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight">
            🔔 NOTIFICATIONS
          </h3>
          {unreadCount > 0 && (
            <span className="px-3 py-1 bg-red-500 text-white rounded-full text-xs font-bold">
              {unreadCount} UNREAD
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="px-4 py-2 bg-xah-blue hover:bg-primary-700 text-white font-bold rounded text-xs uppercase tracking-wide transition-colors"
          >
            MARK ALL AS READ
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Type Filter */}
        <div>
          <label className="block text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">
            FILTER BY TYPE
          </label>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as NotificationType | 'all')
              setCurrentPage(0) // Reset to first page
            }}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg font-bold text-sm uppercase tracking-wide focus:border-xah-blue focus:outline-none"
          >
            <option value="all">ALL TYPES</option>
            <option value="worker_deleted">WORKER DELETED</option>
            <option value="deletion_error">DELETION ERROR</option>
            <option value="worker_removed">WORKER REMOVED</option>
            <option value="channel_closure_failed">CHANNEL CLOSURE FAILED</option>
          </select>
        </div>

        {/* Read Status Filter */}
        <div>
          <label className="block text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">
            FILTER BY STATUS
          </label>
          <select
            value={filterRead}
            onChange={(e) => {
              setFilterRead(e.target.value as 'all' | 'read' | 'unread')
              setCurrentPage(0) // Reset to first page
            }}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg font-bold text-sm uppercase tracking-wide focus:border-xah-blue focus:outline-none"
          >
            <option value="all">ALL</option>
            <option value="unread">UNREAD ONLY</option>
            <option value="read">READ ONLY</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-xah-blue"></div>
          <p className="text-sm text-gray-600 uppercase tracking-wide mt-4">
            LOADING NOTIFICATIONS...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 text-center">
          <p className="text-sm text-red-700 font-bold uppercase">{error}</p>
          <button
            onClick={fetchNotifications}
            className="mt-3 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded text-xs uppercase tracking-wide transition-colors"
          >
            RETRY
          </button>
        </div>
      )}

      {/* Notifications List */}
      {!loading && !error && (
        <>
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔔</div>
              <h4 className="text-lg font-bold text-gray-900 uppercase mb-2">
                NO NOTIFICATIONS
              </h4>
              <p className="text-sm text-gray-600 uppercase tracking-wide">
                {filterType !== 'all' || filterRead !== 'all'
                  ? 'NO NOTIFICATIONS MATCH YOUR FILTERS'
                  : 'YOU HAVE NO NOTIFICATIONS YET'
                }
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-6">
                {notifications.map(notification => renderNotification(notification))}
              </div>

              {/* Pagination */}
              {(currentPage > 0 || hasMore) && (
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600 uppercase">
                    SHOWING {currentPage * PAGE_SIZE + 1}-
                    {Math.min((currentPage + 1) * PAGE_SIZE, total)} OF {total}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                      disabled={currentPage === 0}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded text-xs uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ← PREVIOUS
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      disabled={!hasMore}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded text-xs uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      NEXT →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default NGONotifications
