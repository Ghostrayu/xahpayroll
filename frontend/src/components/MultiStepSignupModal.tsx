/**
 * MultiStepSignupModal Component
 * Orchestrates multi-step signup flow
 *
 * Flow:
 * 1. UserProfileStep (all users) → collect name, email, type, org name
 * 2. If employee: Save user → Complete
 * 3. If NGO/Employer: OrganizationSetupStep → Save user + org → Complete
 *
 * Critical: Establishes 1:1 mapping between users.wallet_address and organizations.escrow_wallet_address
 */

import { useState } from 'react'
import { userApi, workerDeletionApi } from '../services/api'
import type { OrphanedRecordsStats } from '../types/api'
import UserProfileStep, { UserProfileData } from './UserProfileStep'
import OrganizationSetupStep from './OrganizationSetupStep'
import OrphanedRecordsModal from './OrphanedRecordsModal'

interface MultiStepSignupModalProps {
  isOpen: boolean
  walletAddress: string
  onComplete: () => void
  onError?: (error: string) => void
}

export default function MultiStepSignupModal({
  isOpen,
  walletAddress,
  onComplete,
  onError,
}: MultiStepSignupModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)
  const [userProfileData, setUserProfileData] = useState<UserProfileData | null>(null)
  const [showTermsOverlay, setShowTermsOverlay] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [termsError, setTermsError] = useState<string>()
  const [isSaving, setIsSaving] = useState(false)
  const [showOrphanedRecordsModal, setShowOrphanedRecordsModal] = useState(false)
  const [orphanedStats, setOrphanedStats] = useState<OrphanedRecordsStats | null>(null)
  const [newUserId, setNewUserId] = useState<number | null>(null)

  // Handle Step 1 completion (User Profile)
  const handleUserProfileComplete = (data: UserProfileData) => {
    setUserProfileData(data)

    // Check if user is employee (skip org step, show terms)
    if (data.userType === 'employee') {
      // Show terms acceptance overlay for employees
      setShowTermsOverlay(true)
    } else {
      // NGO/Employer: Move to step 2 (Organization Setup)
      setCurrentStep(2)
    }
  }

  // Handle Step 2 completion (Organization Setup) - NGO/Employer only
  const handleOrganizationSetupComplete = () => {
    // Show terms acceptance overlay for NGO/Employer
    setShowTermsOverlay(true)
  }

  // Handle final submission after terms acceptance
  const handleFinalSubmit = async () => {
    if (!userProfileData) {
      if (onError) onError('USER PROFILE DATA MISSING')
      return
    }

    // Check terms acceptance
    if (!acceptedTerms) {
      setTermsError('YOU MUST ACCEPT THE TERMS OF SERVICE TO CONTINUE')
      return
    }

    // Save user profile (and organization if NGO/Employer)
    await saveUserProfile(userProfileData)
  }

  // Save user profile to database
  const saveUserProfile = async (data: UserProfileData) => {
    setIsSaving(true)
    try {
      // Save user profile via API
      const profileData = {
        walletAddress,
        displayName: data.displayName,
        email: data.email || '',
        userType: data.userType,
        organizationName: data.organizationName || '',
      }

      const userResponse = await userApi.saveProfile(profileData)

      console.log('[SIGNUP_SUCCESS]', {
        userType: data.userType,
        walletAddress,
        organizationCreated: data.userType === 'ngo' || data.userType === 'employer',
      })

      // Check for orphaned records (only for employees)
      if (data.userType === 'employee' && userResponse?.id) {
        try {
          const orphanedData = await workerDeletionApi.checkOrphanedRecords(walletAddress)

          if (orphanedData.hasOrphanedRecords) {
            // Show orphaned records modal
            setOrphanedStats(orphanedData)
            setNewUserId(userResponse.id)
            setShowOrphanedRecordsModal(true)
            setIsSaving(false)
            return
          }
        } catch (orphanedError) {
          console.error('[ORPHANED_RECORDS_CHECK_ERROR]', orphanedError)
          // Continue with signup if orphaned check fails
        }
      }

      // Complete signup flow (no orphaned records or not an employee)
      onComplete()
    } catch (error: any) {
      console.error('[SIGNUP_ERROR]', error)
      const errorMessage = error.message || 'FAILED TO COMPLETE SIGNUP. PLEASE TRY AGAIN.'
      if (onError) onError(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle back button (from terms overlay or step 2 to step 1)
  const handleBack = () => {
    if (showTermsOverlay) {
      // From terms overlay: hide overlay
      setShowTermsOverlay(false)
      setAcceptedTerms(false)
      setTermsError(undefined)
    } else if (currentStep === 2) {
      // From step 2: go back to step 1
      setCurrentStep(1)
      setTermsError(undefined)
    }
  }

  const handleCancel = () => {
    setShowTermsOverlay(false)
    setUserProfileData(null)
    setAcceptedTerms(false)
    setTermsError(undefined)
  }

  // Handle orphaned records re-association
  const handleReassociateRecords = async () => {
    if (!newUserId) {
      console.error('[REASSOCIATE_ERROR] newUserId is null')
      if (onError) onError('USER ID NOT FOUND')
      return
    }

    try {
      await workerDeletionApi.reassociateRecords(walletAddress, newUserId)
      console.log('[REASSOCIATE_SUCCESS] Records re-associated')

      // Close orphaned records modal and complete signup
      setShowOrphanedRecordsModal(false)
      onComplete()
    } catch (error: any) {
      console.error('[REASSOCIATE_ERROR]', error)
      if (onError) {
        const errorMessage = error.message || 'FAILED TO RE-ASSOCIATE RECORDS'
        onError(errorMessage)
      }
      throw error
    }
  }

  // Handle skip orphaned records re-association
  const handleSkipReassociation = () => {
    console.log('[REASSOCIATE_SKIP] User chose to skip re-association')

    // Close orphaned records modal and complete signup
    setShowOrphanedRecordsModal(false)
    onComplete()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Step 1: User Profile */}
      {currentStep === 1 && !showTermsOverlay && (
        <UserProfileStep
          walletAddress={walletAddress}
          onComplete={handleUserProfileComplete}
        />
      )}

      {/* Step 2: Organization Setup (NGO/Employer only) */}
      {currentStep === 2 && !showTermsOverlay && userProfileData && (
        <OrganizationSetupStep
          walletAddress={walletAddress}
          organizationName={userProfileData.organizationName || ''}
          onComplete={handleOrganizationSetupComplete}
          onBack={handleBack}
        />
      )}

      {/* Terms of Service Overlay (shown after completing steps) */}
      {showTermsOverlay && userProfileData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Terms of Service
            </h3>

            {/* Terms Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked)
                  if (e.target.checked) setTermsError(undefined)
                }}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                I ACCEPT THE{' '}
                <a
                  href="https://docs.fileverse.io/document/bQRHzmhagkrGY1oqeDjv2R"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  TERMS OF SERVICE
                </a>
                {' '}AND ACKNOWLEDGE THAT ALL BLOCKCHAIN TRANSACTIONS ARE IRREVERSIBLE AND I AM SOLELY RESPONSIBLE FOR THE SECURITY OF MY WALLET.
              </span>
            </label>

            {termsError && (
              <p className="text-sm text-red-500 mb-4">{termsError}</p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalSubmit}
                disabled={!acceptedTerms || isSaving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orphaned Records Modal (shown after successful signup if records found) */}
      {showOrphanedRecordsModal && orphanedStats && (
        <OrphanedRecordsModal
          isOpen={showOrphanedRecordsModal}
          walletAddress={walletAddress}
          orphanedStats={orphanedStats}
          onReassociate={handleReassociateRecords}
          onSkip={handleSkipReassociation}
        />
      )}
    </>
  )
}
