/**
 * OrganizationSetupStep Component
 * Step 2 of multi-step signup for NGO/Employer users
 *
 * Collects organization details:
 * - Organization Name (required, pre-filled from step 1)
 * - Website (optional, URL validation)
 * - Mission Statement/Description (optional, max 2000 chars)
 */

import { useState } from 'react'
import { organizationApi } from '../services/api'
import type { OrganizationCreateRequest } from '../types/api'

interface OrganizationSetupStepProps {
  walletAddress: string
  organizationName: string // Pre-filled from step 1
  onComplete: () => void
  onBack: () => void
}

interface FormErrors {
  organizationName?: string
  website?: string
  description?: string
  submit?: string
}

export default function OrganizationSetupStep({
  walletAddress,
  organizationName: initialOrgName,
  onComplete,
  onBack,
}: OrganizationSetupStepProps) {
  const [formData, setFormData] = useState({
    organizationName: initialOrgName,
    website: '',
    description: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSaving, setIsSaving] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Required: Organization name
    if (!formData.organizationName.trim()) {
      newErrors.organizationName = 'ORGANIZATION NAME IS REQUIRED'
    }

    // Optional: Website URL validation
    if (formData.website && formData.website.trim()) {
      try {
        new URL(formData.website)
      } catch (e) {
        newErrors.website = 'INVALID WEBSITE URL (MUST START WITH HTTP:// OR HTTPS://)'
      }
    }

    // Optional: Description length validation
    if (formData.description && formData.description.length > 2000) {
      newErrors.description = 'DESCRIPTION MUST BE 2000 CHARACTERS OR LESS'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSaving(true)
    setErrors({})

    try {
      // CRITICAL: Create organization with escrow_wallet_address = user's wallet address
      // This establishes the 1:1 mapping needed for payment channel creation
      const requestData: OrganizationCreateRequest = {
        organizationName: formData.organizationName,
        escrowWalletAddress: walletAddress, // CRITICAL: Must match user's wallet_address
        website: formData.website || undefined,
        description: formData.description || undefined,
      }

      await organizationApi.create(requestData)

      console.log('[ORG_CREATED_CLIENT]', {
        walletAddress,
        mapping: 'Client confirmed 1:1 mapping established',
      })

      // Call completion callback to proceed to dashboard
      onComplete()
    } catch (error: any) {
      console.error('[ORG_CREATE_ERROR_CLIENT]', error)

      // Handle specific error cases
      let errorMessage = 'FAILED TO CREATE ORGANIZATION'

      if (error.message) {
        errorMessage = error.message
      }

      // Handle 409 conflict specifically
      if (error.status === 409) {
        errorMessage = 'AN ORGANIZATION ALREADY EXISTS FOR THIS WALLET ADDRESS'
      }

      setErrors({ submit: errorMessage })
    } finally {
      setIsSaving(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const charCount = formData.description.length
  const charCountColor = charCount > 2000 ? 'text-red-500' : 'text-gray-500'

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Organization Details (2/2)
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Complete your organization profile
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
          {/* Organization Name (Required) */}
          <div>
            <label
              htmlFor="organizationName"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Organization Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="organizationName"
              name="organizationName"
              value={formData.organizationName}
              onChange={handleChange}
              className={`w-full px-4 py-3 border ${
                errors.organizationName ? 'border-red-500' : 'border-gray-300'
              } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              placeholder="Good Money Collective"
            />
            {errors.organizationName && (
              <p className="mt-1 text-sm text-red-500">{errors.organizationName}</p>
            )}
          </div>

          {/* Website (Optional) */}
          <div>
            <label
              htmlFor="website"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Website (Optional)
            </label>
            <input
              type="url"
              id="website"
              name="website"
              value={formData.website}
              onChange={handleChange}
              className={`w-full px-4 py-3 border ${
                errors.website ? 'border-red-500' : 'border-gray-300'
              } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              placeholder="https://goodmoney.org"
            />
            {errors.website && (
              <p className="mt-1 text-sm text-red-500">{errors.website}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              💡 Help workers learn more about you
            </p>
          </div>

          {/* Mission Statement (Optional) */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Mission Statement (Optional)
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              maxLength={2000}
              className={`w-full px-4 py-3 border ${
                errors.description ? 'border-red-500' : 'border-gray-300'
              } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none`}
              placeholder="We provide financial services to underserved communities in rural areas, focusing on microloans and financial literacy education."
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-500">{errors.description}</p>
            )}
            <p className={`mt-1 text-sm ${charCountColor}`}>
              {charCount}/2000 characters
            </p>
            <p className="mt-1 text-sm text-gray-500">
              ℹ️ Complete profiles help workers trust your organization
            </p>
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{errors.submit}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onBack}
              disabled={isSaving}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Creating...' : 'Complete Setup →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
