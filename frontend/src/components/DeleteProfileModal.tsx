import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import { workerDeletionApi } from '../services/api'
import type {
  DeletionEligibilityResponse,
  BlockingReason,
  DeleteProfileResponse,
} from '../types/api'

interface DeleteProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

type ModalStep = 'eligibility-check' | 'blocked' | 'eligible' | 'confirmation' | 'success'

const DeleteProfileModal: React.FC<DeleteProfileModalProps> = ({ isOpen, onClose }) => {
  const { logout } = useAuth()
  const { walletAddress, disconnectWallet } = useWallet()

  const [currentStep, setCurrentStep] = useState<ModalStep>('eligibility-check')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Eligibility data
  const [eligibilityData, setEligibilityData] = useState<DeletionEligibilityResponse | null>(null)

  // Confirmation inputs
  const [confirmationText, setConfirmationText] = useState('')
  const [reason, setReason] = useState('')

  // Success data
  const [deleteResponse, setDeleteResponse] = useState<DeleteProfileResponse | null>(null)
  const [logoutCountdown, setLogoutCountdown] = useState(10)

  // Check eligibility on modal open
  useEffect(() => {
    if (isOpen) {
      checkEligibility()
    }
  }, [isOpen])

  // Auto-logout countdown after successful deletion
  useEffect(() => {
    if (currentStep === 'success' && logoutCountdown > 0) {
      const timer = setTimeout(() => {
        setLogoutCountdown(logoutCountdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (currentStep === 'success' && logoutCountdown === 0) {
      handleAutoLogout()
    }
  }, [currentStep, logoutCountdown])

  const checkEligibility = async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await workerDeletionApi.checkDeletionEligibility(walletAddress)
      setEligibilityData(data)

      // Move to next step
      if (data.canDelete) {
        setCurrentStep('eligible')
      } else {
        setCurrentStep('blocked')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'UNKNOWN ERROR OCCURRED')
      setCurrentStep('blocked')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProfile = async () => {
    if (confirmationText.toUpperCase() !== 'DELETE MY ACCOUNT') {
      setError('CONFIRMATION TEXT MUST BE "DELETE MY ACCOUNT"')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await workerDeletionApi.deleteProfile(
        walletAddress,
        confirmationText,
        reason || undefined
      )

      setDeleteResponse(data)
      setCurrentStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DELETION FAILED')
    } finally {
      setLoading(false)
    }
  }

  const handleExportData = () => {
    workerDeletionApi.exportWorkerData(walletAddress)
  }

  const handleAutoLogout = () => {
    disconnectWallet() // Disconnect wallet first to prevent auto-reconnect
    logout() // Then logout from auth
    window.location.href = '/'
  }

  const handleClose = () => {
    // Reset state
    setCurrentStep('eligibility-check')
    setEligibilityData(null)
    setConfirmationText('')
    setReason('')
    setError(null)
    setDeleteResponse(null)
    setLogoutCountdown(10)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        {/* Step 1: Eligibility Check */}
        {currentStep === 'eligibility-check' && (
          <div className="p-8">
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-gray-900 uppercase tracking-wide mb-4">
                PROFILE DELETION ELIGIBILITY CHECK
              </h3>
              <p className="text-sm text-gray-600 uppercase mb-6">
                CHECKING YOUR ACCOUNT STATUS...
              </p>
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-xah-blue"></div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2a: Error State (API failure) */}
        {currentStep === 'blocked' && error && !eligibilityData && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-red-900 uppercase tracking-wide mb-2">
                ERROR CHECKING ELIGIBILITY
              </h3>
              <p className="text-sm text-red-600 uppercase mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                {error}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={checkEligibility}
                className="flex-1 bg-xah-blue hover:bg-primary-700 text-white font-bold py-3 px-6 rounded-lg text-sm uppercase tracking-wide transition-colors"
              >
                TRY AGAIN
              </button>
              <button
                onClick={handleClose}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 px-6 rounded-lg text-sm uppercase tracking-wide transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}

        {/* Step 2b: Blocked State (has blocking reasons) */}
        {currentStep === 'blocked' && eligibilityData && !eligibilityData.canDelete && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">❌</div>
              <h3 className="text-xl font-bold text-red-900 uppercase tracking-wide mb-2">
                CANNOT DELETE PROFILE
              </h3>
              <p className="text-sm text-gray-600 uppercase">
                YOU HAVE ACTIVE PAYMENT CHANNELS OR UNPAID BALANCES.
              </p>
              <p className="text-sm text-gray-600 uppercase mt-2">
                PLEASE RESOLVE THESE ISSUES BEFORE DELETING:
              </p>
            </div>

            {/* Blocking Reasons */}
            <div className="space-y-4 mb-6">
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                BLOCKING REASONS:
              </h4>

              {eligibilityData.blockingReasons.map((reason: BlockingReason, index: number) => (
                <div
                  key={index}
                  className="bg-red-50 border-2 border-red-200 rounded-lg p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🏢</span>
                    <div className="flex-1">
                      <h5 className="font-bold text-gray-900 uppercase text-sm mb-2">
                        {reason.organization}
                      </h5>
                      <div className="space-y-1 text-xs text-gray-700">
                        <p>• CHANNEL: {reason.channelId}</p>
                        <p>• STATUS: {reason.status.toUpperCase()}</p>
                        <p>• UNPAID BALANCE: {reason.unpaidBalance.toFixed(2)} XAH</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Statistics */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">
                STATISTICS:
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-600 uppercase">Total Organizations:</span>
                  <span className="font-bold text-gray-900 ml-2">
                    {eligibilityData.stats.totalOrganizations}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 uppercase">Active Channels:</span>
                  <span className="font-bold text-red-600 ml-2">
                    {eligibilityData.stats.activeChannels}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 uppercase">Total Unpaid Balance:</span>
                  <span className="font-bold text-red-600 ml-2">
                    {eligibilityData.stats.totalUnpaidBalance.toFixed(2)} XAH
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 uppercase">Closed Channels:</span>
                  <span className="font-bold text-gray-900 ml-2">
                    {eligibilityData.stats.closedChannels}
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold text-sm uppercase tracking-wide rounded-lg transition-all"
            >
              CLOSE
            </button>
          </div>
        )}

        {/* Step 2b: Eligible State */}
        {currentStep === 'eligible' && eligibilityData && eligibilityData.canDelete && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-xl font-bold text-green-900 uppercase tracking-wide mb-2">
                ELIGIBLE FOR DELETION
              </h3>
              <p className="text-sm text-gray-600">
                Your account meets all requirements for deletion.
              </p>
            </div>

            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 mb-6">
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">
                WHAT WILL HAPPEN:
              </h4>

              <div className="space-y-4 text-sm text-gray-700">
                {eligibilityData.stats.totalOrganizations > 0 && (
                  <div>
                    <p className="font-bold uppercase text-gray-900 mb-2">
                      1. YOU WILL BE REMOVED FROM ALL ORGANIZATIONS:
                    </p>
                    <p className="text-xs text-gray-600 uppercase ml-4">
                      • {eligibilityData.stats.totalOrganizations} ORGANIZATION
                      {eligibilityData.stats.totalOrganizations !== 1 ? 'S' : ''} AFFECTED
                    </p>
                  </div>
                )}

                <div>
                  <p className="font-bold uppercase text-gray-900">
                    2. YOUR WORK HISTORY WILL BE AVAILABLE FOR 48 HOURS
                  </p>
                </div>

                <div>
                  <p className="font-bold uppercase text-gray-900">
                    3. AFTER 48 HOURS, ALL DATA WILL BE PERMANENTLY DELETED
                  </p>
                  <p className="text-xs text-gray-600 ml-4">(NO RECOVERY POSSIBLE)</p>
                </div>

                <div>
                  <p className="font-bold uppercase text-gray-900">
                    4. YOUR WALLET ADDRESS CAN BE REUSED FOR NEW SIGNUP
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleExportData}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm uppercase tracking-wide rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <span>📄</span>
                EXPORT MY DATA (PDF)
              </button>
              <button
                onClick={() => setCurrentStep('confirmation')}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm uppercase tracking-wide rounded-lg transition-all"
              >
                CONTINUE
              </button>
            </div>

            <button
              onClick={handleClose}
              className="w-full mt-3 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-sm uppercase tracking-wide rounded-lg transition-all"
            >
              CANCEL
            </button>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {currentStep === 'confirmation' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-red-900 uppercase tracking-wide mb-2">
                FINAL CONFIRMATION
              </h3>
              <p className="text-sm text-red-600 uppercase font-bold">
                THIS ACTION CANNOT BE UNDONE AFTER 48 HOURS
              </p>
            </div>

            {eligibilityData && eligibilityData.stats.totalOrganizations > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-xs font-bold text-gray-900 uppercase mb-2">
                  ORGANIZATIONS THAT WILL BE NOTIFIED:
                </p>
                <p className="text-xs text-gray-700 uppercase">
                  • {eligibilityData.stats.totalOrganizations} ORGANIZATION
                  {eligibilityData.stats.totalOrganizations !== 1 ? 'S' : ''}
                </p>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
                  Type "DELETE MY ACCOUNT" to confirm:
                </label>
                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none uppercase font-mono"
                  placeholder="DELETE MY ACCOUNT"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
                  Optional: Reason for deletion
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none resize-none"
                  rows={3}
                  placeholder="Optional reason..."
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm uppercase">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-sm uppercase tracking-wide rounded-lg transition-all disabled:opacity-50"
              >
                CANCEL
              </button>
              <button
                onClick={handleDeleteProfile}
                disabled={loading || confirmationText.toUpperCase() !== 'DELETE MY ACCOUNT'}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm uppercase tracking-wide rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>🗑️</span>
                {loading ? 'DELETING...' : 'DELETE MY PROFILE'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {currentStep === 'success' && deleteResponse && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-xl font-bold text-green-900 uppercase tracking-wide mb-2">
                DELETION SCHEDULED
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                YOUR PROFILE DELETION HAS BEEN SCHEDULED.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-700 uppercase font-semibold">Scheduled:</span>
                <span className="font-bold text-gray-900">
                  {new Date(deleteResponse.deletionScheduledAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-700 uppercase font-semibold">Hard Delete:</span>
                <span className="font-bold text-red-600">
                  {new Date(deleteResponse.hardDeleteAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-700 uppercase font-semibold">Organizations Notified:</span>
                <span className="font-bold text-gray-900">
                  {deleteResponse.notificationsSent}
                </span>
              </div>
            </div>

            <button
              onClick={handleExportData}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm uppercase tracking-wide rounded-lg transition-all flex items-center justify-center gap-2 mb-6"
            >
              <span>📄</span>
              DOWNLOAD MY DATA (PDF)
            </button>

            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-center">
              <p className="text-sm font-bold text-gray-900 uppercase">
                YOU WILL BE AUTOMATICALLY LOGGED OUT IN {logoutCountdown} SECONDS...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DeleteProfileModal
