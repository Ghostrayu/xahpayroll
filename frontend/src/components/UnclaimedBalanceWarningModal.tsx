import React from 'react'

interface UnclaimedBalanceWarningModalProps {
  isOpen: boolean
  onClose: () => void
  onForceClose: () => void
  unpaidBalance: number
  channelDetails: {
    jobName: string
    worker: string
    escrowBalance?: number
    hoursAccumulated?: number
  }
  callerType: 'ngo' | 'worker'
  isClosing?: boolean
}

/**
 * UnclaimedBalanceWarningModal Component
 *
 * Displays warning when attempting to close a payment channel with unclaimed balance.
 * Shows different messaging based on caller type (NGO vs Worker).
 *
 * Allows force closure with explicit acknowledgment of consequences.
 */
const UnclaimedBalanceWarningModal: React.FC<UnclaimedBalanceWarningModalProps> = ({
  isOpen,
  onClose,
  onForceClose,
  unpaidBalance,
  channelDetails,
  callerType,
  isClosing = false
}) => {
  if (!isOpen) return null

  const isWorker = callerType === 'worker'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-4xl">⚠️</div>
            <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight">
              UNCLAIMED BALANCE WARNING
            </h3>
          </div>
          <p className="text-sm text-gray-700 uppercase tracking-wide">
            {isWorker
              ? 'YOU HAVE UNCLAIMED WAGES IN THIS CHANNEL'
              : 'WORKER HAS UNCLAIMED WAGES IN THIS CHANNEL'}
          </p>
        </div>

        {/* Channel Details */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="space-y-2 text-sm uppercase">
            <div className="flex justify-between">
              <span className="text-gray-600 uppercase tracking-wide font-semibold">Job:</span>
              <span className="text-gray-900 font-bold">{channelDetails.jobName}</span>
            </div>
            {!isWorker && (
              <div className="flex justify-between">
                <span className="text-gray-600 uppercase tracking-wide font-semibold">Worker:</span>
                <span className="text-gray-900 font-bold">{channelDetails.worker}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600 uppercase tracking-wide font-semibold">Unclaimed Balance:</span>
              <span className="text-red-600 font-bold text-lg">{unpaidBalance.toFixed(2)} XAH</span>
            </div>
            {channelDetails.hoursAccumulated !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600 uppercase tracking-wide font-semibold">Hours Worked:</span>
                <span className="text-purple-600 font-bold">{channelDetails.hoursAccumulated.toFixed(1)}h</span>
              </div>
            )}
            {channelDetails.escrowBalance !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600 uppercase tracking-wide font-semibold">Escrow Remaining:</span>
                <span className="text-orange-600 font-bold">{channelDetails.escrowBalance.toFixed(2)} XAH</span>
              </div>
            )}
          </div>
        </div>

        {/* Warning Message */}
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-6">
          <div className="space-y-3 text-sm text-red-800 uppercase tracking-wide">
            {isWorker ? (
              <>
                <p className="font-bold">⚠️ IMPORTANT WARNING:</p>
                <p>• IF YOU CLOSE THIS CHANNEL, YOU WILL <strong className="text-red-900">FORFEIT {unpaidBalance.toFixed(2)} XAH</strong> IN UNCLAIMED WAGES</p>
                <p>• THIS AMOUNT REPRESENTS {channelDetails.hoursAccumulated?.toFixed(1)}H OF YOUR WORK</p>
                <p>• <strong className="text-red-900">CLAIM YOUR BALANCE FIRST</strong> TO RECEIVE YOUR EARNINGS</p>
                <p>• ONCE CLOSED, UNCLAIMED FUNDS RETURN TO EMPLOYER</p>
              </>
            ) : (
              <>
                <p className="font-bold">⚠️ IMPORTANT WARNING:</p>
                <p>• WORKER HAS <strong className="text-red-900">{unpaidBalance.toFixed(2)} XAH</strong> IN UNCLAIMED WAGES</p>
                <p>• THIS REPRESENTS {channelDetails.hoursAccumulated?.toFixed(1)}H OF COMPLETED WORK</p>
                <p>• <strong className="text-red-900">ENSURE WORKER IS PAID</strong> BEFORE CLOSING</p>
                <p>• CLOSING WILL RETURN UNCLAIMED FUNDS TO YOUR WALLET</p>
                <p>• THIS MAY VIOLATE PAYMENT AGREEMENTS</p>
              </>
            )}
          </div>
        </div>

        {/* Recommended Action */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-bold text-blue-900 uppercase tracking-wide mb-2">
            ✅ RECOMMENDED ACTION:
          </p>
          <p className="text-sm text-blue-800 uppercase">
            {isWorker
              ? 'CLAIM YOUR BALANCE FIRST, THEN CLOSE THE CHANNEL SAFELY'
              : 'WAIT FOR WORKER TO CLAIM BALANCE, OR CONTACT WORKER BEFORE CLOSING'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={onClose}
            disabled={isClosing}
            className="w-full px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← GO BACK (RECOMMENDED)
          </button>
          <button
            onClick={onForceClose}
            disabled={isClosing}
            className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-red-800"
          >
            {isClosing ? 'CLOSING CHANNEL...' : isWorker ? '⚠️ FORFEIT WAGES & CLOSE' : '⚠️ FORCE CLOSE ANYWAY'}
          </button>
        </div>

        {/* Final Warning */}
        <p className="text-xs text-center text-red-600 uppercase tracking-wide mt-4 font-bold">
          ⚠️ THIS ACTION CANNOT BE UNDONE
        </p>
      </div>
    </div>
  )
}

export default UnclaimedBalanceWarningModal
