/**
 * UserProfileStep Component
 * Step 1 of multi-step signup for all user types
 *
 * Collects basic user information:
 * - Display Name (required)
 * - Email (optional, with validation)
 * - User Type (radio buttons: employee/ngo/employer)
 * - Organization Name (required for NGO/Employer, hidden for employee)
 *
 * Does NOT save to database - passes data to orchestrator via onComplete
 */

import { useState } from 'react'
import { UserType } from '../contexts/AuthContext'

export interface UserProfileData {
  displayName: string
  email?: string
  userType: UserType
  organizationName?: string
}

interface UserProfileStepProps {
  walletAddress: string
  onComplete: (data: UserProfileData) => void
}

interface FormErrors {
  displayName?: string
  email?: string
  userType?: string
  organizationName?: string
}

export default function UserProfileStep({
  walletAddress,
  onComplete,
}: UserProfileStepProps) {
  const [formData, setFormData] = useState<UserProfileData>({
    displayName: '',
    email: '',
    userType: 'employee', // Default to employee
    organizationName: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Required: Display name
    if (!formData.displayName.trim()) {
      newErrors.displayName = 'DISPLAY NAME IS REQUIRED'
    }

    // Optional: Email validation
    if (formData.email && formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email)) {
        newErrors.email = 'INVALID EMAIL FORMAT'
      }
    }

    // Required: Organization name for NGO
    if (
      formData.userType === 'ngo' &&
      !formData.organizationName?.trim()
    ) {
      newErrors.organizationName = 'ORGANIZATION NAME IS REQUIRED FOR NGO ACCOUNTS'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    // Pass data to orchestrator (does NOT save to database)
    onComplete({
      displayName: formData.displayName,
      email: formData.email || undefined,
      userType: formData.userType,
      organizationName:
        formData.userType === 'ngo'
          ? formData.organizationName
          : undefined,
    })
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

  const handleUserTypeChange = (type: UserType) => {
    setFormData((prev) => ({
      ...prev,
      userType: type,
      // Clear organization name if switching to employee
      organizationName: type === 'employee' ? '' : prev.organizationName,
    }))
    // Clear organization name error when switching types
    if (errors.organizationName) {
      setErrors((prev) => ({ ...prev, organizationName: undefined }))
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            CREATE YOUR PROFILE (1/2)
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            LET'S GET STARTED WITH YOUR BASIC INFORMATION
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
          {/* Warning Message */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 font-medium">
              ⚠️ A WALLET ADDRESS CAN ONLY BE REGISTERED AS EITHER AN EMPLOYEE OR AN NGO, NEVER BOTH
            </p>
          </div>

          {/* Wallet Address Display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CONNECTED WALLET ADDRESS
            </label>
            <div className="px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg">
              <p className="text-sm font-mono text-gray-600 break-all">
                {walletAddress}
              </p>
            </div>
          </div>

          {/* Display Name (Required) */}
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              DISPLAY NAME <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              value={formData.displayName}
              onChange={handleChange}
              className={`w-full px-4 py-3 border ${
                errors.displayName ? 'border-red-500' : 'border-gray-300'
              } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              placeholder="JOHN DOE"
            />
            {errors.displayName && (
              <p className="mt-1 text-sm text-red-500">{errors.displayName}</p>
            )}
          </div>

          {/* Email (Optional) */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              EMAIL (OPTIONAL)
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`w-full px-4 py-3 border ${
                errors.email ? 'border-red-500' : 'border-gray-300'
              } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              placeholder="YOUR@EMAIL.COM"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-500">{errors.email}</p>
            )}
          </div>

          {/* User Type Selection (Radio Buttons) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              I AM A <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              {/* Employee Option */}
              <label className="flex items-start p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                <input
                  type="radio"
                  name="userType"
                  value="employee"
                  checked={formData.userType === 'employee'}
                  onChange={() => handleUserTypeChange('employee')}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">
                    EMPLOYEE / WORKER
                  </span>
                  <span className="block text-xs text-gray-500 mt-1">
                    I WORK FOR ORGANIZATIONS AND RECEIVE HOURLY PAYMENTS
                  </span>
                </div>
              </label>

              {/* NGO Option */}
              <label className="flex items-start p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                <input
                  type="radio"
                  name="userType"
                  value="ngo"
                  checked={formData.userType === 'ngo'}
                  onChange={() => handleUserTypeChange('ngo')}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">
                    NGO / EMPLOYER / BUSINESS
                  </span>
                  <span className="block text-xs text-gray-500 mt-1">
                    I MANAGE WORKERS AND CREATE PAYMENT CHANNELS
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Organization Name (Conditional - NGO only) */}
          {formData.userType === 'ngo' && (
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
                📝 YOU'LL BE ABLE TO ADD MORE ORGANIZATION DETAILS IN THE NEXT STEP
              </p>
            </div>
          )}

          {/* Next Button (No Back button since this is Step 1) */}
          <div className="pt-4">
            <button
              type="submit"
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              NEXT →
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            * REQUIRED FIELDS
          </p>
        </form>
      </div>
    </div>
  )
}
