/**
 * OrganizationSetupStep Component
 * Step 2 of multi-step signup for NGO/Employer users
 *
 * Collects organization details:
 * - Organization Name (required, pre-filled from step 1)
 */

import { useState } from 'react'

export interface OrganizationData {
  organizationName: string
}

interface OrganizationSetupStepProps {
  walletAddress: string
  organizationName: string // Pre-filled from step 1
  onComplete: (orgData: OrganizationData) => void
  onBack: () => void
}

interface FormErrors {
  organizationName?: string
  submit?: string
}

export default function OrganizationSetupStep({
  walletAddress,
  organizationName: initialOrgName,
  onComplete,
  onBack,
}: OrganizationSetupStepProps) {
  const [formData, setFormData] = useState({
    organizationName: initialOrgName
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSaving] = useState(false) // Kept for UI state, actual saving happens in parent

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Required: Organization name
    if (!formData.organizationName.trim()) {
      newErrors.organizationName = 'ORGANIZATION NAME IS REQUIRED'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    // Pass organization data back to parent (MultiStepSignupModal)
    // Parent will create user FIRST, then organization
    const orgData: OrganizationData = {
      organizationName: formData.organizationName
    }

    console.log('[ORG_DATA_COLLECTED]', {
      walletAddress,
      organizationName: orgData.organizationName,
      note: 'Organization data collected, will be created after user creation'
    })

    onComplete(orgData)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

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
              ORGANIZATION NAME <span className="text-red-500">*</span>
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
              placeholder="GOOD MONEY COLLECTIVE"
            />
            {errors.organizationName && (
              <p className="mt-1 text-sm text-red-500">{errors.organizationName}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              💡 THIS NAME WILL BE VISIBLE TO WORKERS WHEN THEY RECEIVE PAYMENTS
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
