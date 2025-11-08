import React, { useState } from 'react'
import { UserType } from '../contexts/AuthContext'

interface ProfileSetupModalProps {
  isOpen: boolean
  onComplete: (profileData: ProfileData) => void
  userType: UserType
  walletAddress: string
}

export interface ProfileData {
  displayName: string
  organizationName?: string
  email?: string
  phoneNumber?: string
  userType: UserType
  walletAddress: string
}

const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ 
  isOpen, 
  onComplete, 
  userType,
  walletAddress 
}) => {
  const [formData, setFormData] = useState<ProfileData>({
    displayName: '',
    organizationName: userType === 'ngo' || userType === 'employer' ? '' : undefined,
    email: '',
    phoneNumber: '',
    userType,
    walletAddress
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.displayName.trim()) {
      newErrors.displayName = 'Display name is required'
    }

    if ((userType === 'ngo' || userType === 'employer') && !formData.organizationName?.trim()) {
      newErrors.organizationName = 'Organization name is required'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    if (!acceptedTerms) {
      newErrors.terms = 'You must accept the Terms of Service to continue'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSaving(true)

    try {
      // Save profile to backend
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      const response = await fetch(`${backendUrl}/api/users/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'Failed to save profile')
      }

      const result = await response.json()
      console.log('Profile saved:', result)

      // Call onComplete callback
      onComplete(formData)
    } catch (error: any) {
      console.error('Error saving profile:', error)
      setErrors({ submit: error.message || 'Failed to save profile. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full my-8 border-4 border-xah-blue/40">
        {/* Header */}
        <div className="bg-gradient-to-r from-xah-blue to-primary-700 text-white p-6 rounded-t-xl relative">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors p-1 hover:bg-white/10 rounded-lg"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight pr-8">
            Complete Your Profile
          </h2>
          <p className="text-sm mt-2 text-white/90 uppercase tracking-wide">
            {userType === 'ngo' || userType === 'employer' ? 'Organization Information' : 'Worker Information'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Warning Message */}
          <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
            <p className="text-xs text-yellow-800 font-bold uppercase text-center">
              ⚠️ PLEASE NOTE: ADDRESS CANNOT BE ASSOCIATED WITH BOTH NGO AND EMPLOYEE.
            </p>
          </div>

          {/* Wallet Address Display */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
              Wallet Address
            </label>
            <div className="p-3 bg-gray-100 rounded-lg border-2 border-gray-200">
              <p className="text-xs font-mono text-gray-600 break-all">
                {walletAddress}
              </p>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label htmlFor="displayName" className="block text-xs font-bold text-gray-700 uppercase mb-2">
              Display Name *
            </label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              value={formData.displayName}
              onChange={handleChange}
              placeholder={userType === 'employee' ? 'John Doe' : 'Your Name'}
              className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-xah-blue uppercase text-sm ${
                errors.displayName ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.displayName && (
              <p className="text-xs text-red-500 mt-1 font-semibold">{errors.displayName}</p>
            )}
          </div>

          {/* Organization Name (for NGO/Employer only) */}
          {(userType === 'ngo' || userType === 'employer') && (
            <div>
              <label htmlFor="organizationName" className="block text-xs font-bold text-gray-700 uppercase mb-2">
                Organization Name *
              </label>
              <input
                type="text"
                id="organizationName"
                name="organizationName"
                value={formData.organizationName || ''}
                onChange={handleChange}
                placeholder="Good Money Collective"
                className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-xah-blue uppercase text-sm ${
                  errors.organizationName ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.organizationName && (
                <p className="text-xs text-red-500 mt-1 font-semibold">{errors.organizationName}</p>
              )}
            </div>
          )}

          {/* Email (Optional) */}
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-gray-700 uppercase mb-2">
              Email (Optional)
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email || ''}
              onChange={handleChange}
              placeholder="your@email.com"
              className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-xah-blue text-sm ${
                errors.email ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.email && (
              <p className="text-xs text-red-500 mt-1 font-semibold">{errors.email}</p>
            )}
          </div>

          {/* Phone Number (Optional) */}
          <div>
            <label htmlFor="phoneNumber" className="block text-xs font-bold text-gray-700 uppercase mb-2">
              Phone Number (Optional)
            </label>
            <input
              type="tel"
              id="phoneNumber"
              name="phoneNumber"
              value={formData.phoneNumber || ''}
              onChange={handleChange}
              placeholder="+1 (555) 123-4567"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-xah-blue text-sm"
            />
          </div>

          {/* Terms of Service Checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked)
                  if (errors.terms) {
                    setErrors(prev => ({ ...prev, terms: '' }))
                  }
                }}
                className="mt-1 w-4 h-4 text-xah-blue border-2 border-gray-300 rounded focus:ring-2 focus:ring-xah-blue cursor-pointer"
              />
              <span className="text-xs text-gray-700 leading-relaxed">
                I ACCEPT THE{' '}
                <a
                  href="https://docs.fileverse.io/document/bQRHzmhagkrGY1oqeDjv2R"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xah-blue font-bold hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  TERMS OF SERVICE
                </a>
                {' '}AND ACKNOWLEDGE THAT ALL BLOCKCHAIN TRANSACTIONS ARE IRREVERSIBLE AND I AM SOLELY RESPONSIBLE FOR THE SECURITY OF MY WALLET.
              </span>
            </label>
            {errors.terms && (
              <p className="text-xs text-red-500 mt-2 font-semibold ml-7">{errors.terms}</p>
            )}
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-sm text-red-600 font-semibold">
                ⚠️ {errors.submit}
              </p>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className={`w-full bg-gradient-to-r from-xah-blue to-primary-700 text-white py-3 px-6 rounded-lg font-bold uppercase text-sm transition-all duration-200 ${
                isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg hover:scale-105'
              }`}
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                  Saving...
                </span>
              ) : (
                'Complete Setup →'
              )}
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            * Required fields
          </p>
        </form>
      </div>
      </div>
    </div>
  )
}

export default ProfileSetupModal
