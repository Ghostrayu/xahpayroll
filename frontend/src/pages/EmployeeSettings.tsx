import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import DeleteProfileModal from '../components/DeleteProfileModal'

const EmployeeSettings: React.FC = () => {
  const { userName } = useAuth()
  const { walletAddress, network } = useWallet()
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  return (
    <div className="min-h-screen x-pattern-bg-light">
      <Navbar />

      {/* Page Header */}
      <div className="pt-28 pb-8 bg-gradient-to-br from-xah-light via-white to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 uppercase tracking-tight">
                SETTINGS
              </h1>
              <p className="text-sm text-gray-600 uppercase tracking-wide mt-2">
                Manage your account settings
              </p>
            </div>
            <Link
              to="/worker/dashboard"
              className="inline-flex items-center gap-2 text-xah-blue hover:text-primary-700 font-bold text-sm uppercase tracking-wide transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              BACK TO DASHBOARD
            </Link>
          </div>
        </div>
      </div>

      {/* Settings Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Profile Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wide">
              PROFILE INFORMATION
            </h2>
          </div>
          <div className="px-6 py-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                NAME
              </label>
              <p className="text-base font-medium text-gray-900">{userName || 'NOT PROVIDED'}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                WALLET ADDRESS
              </label>
              <code className="text-sm font-mono text-xah-blue bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 inline-block">
                {walletAddress}
              </code>
              <p className="text-xs text-gray-500 italic mt-2">
                ADDRESS CHANGES NOT SUPPORTED AT THIS TIME
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                NETWORK
              </label>
              <span className={`text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-lg border inline-block ${
                network === 'mainnet'
                  ? 'text-green-700 bg-green-50 border-green-300'
                  : 'bg-orange-100 text-orange-700 border-orange-300'
              }`}>
                {network === 'mainnet' ? 'MAINNET XAHAU' : 'TESTNET XAHAU'}
              </span>
            </div>
          </div>
        </div>

        {/* Danger Zone Section */}
        <div className="bg-white rounded-2xl shadow-sm border-2 border-red-200 overflow-hidden">
          <div className="px-6 py-4 bg-red-50 border-b-2 border-red-200">
            <h2 className="text-lg font-bold text-red-900 uppercase tracking-wide flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              DANGER ZONE
            </h2>
          </div>
          <div className="px-6 py-8">
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide mb-2">
                  DELETE YOUR PROFILE
                </h3>
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                  PERMANENTLY REMOVE YOUR ACCOUNT AND ALL ASSOCIATED DATA.
                  THIS ACTION CANNOT BE UNDONE AFTER 48 HOURS.
                </p>
              </div>

              <button
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm uppercase tracking-wide rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <span className="text-lg">🗑️</span>
                DELETE MY PROFILE
              </button>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {/* Delete Profile Modal */}
      <DeleteProfileModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      />
    </div>
  )
}

export default EmployeeSettings
