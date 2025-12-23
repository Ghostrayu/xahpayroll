import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const NgoSettings: React.FC = () => {
  const { userName, userType } = useAuth()
  const { walletAddress, network } = useWallet()

  return (
    <div className="min-h-screen x-pattern-bg-light">
      <Navbar />

      {/* Page Header */}
      <div className="pt-28 pb-8 bg-gradient-to-br from-xah-light via-white to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 uppercase tracking-tight">
                ORGANIZATION SETTINGS
              </h1>
              <p className="text-sm text-gray-600 uppercase tracking-wide mt-2">
                Manage your organization account settings
              </p>
            </div>
            <Link
              to="/ngo/dashboard"
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

        {/* Organization Profile Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wide">
              ORGANIZATION INFORMATION
            </h2>
          </div>
          <div className="px-6 py-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                ORGANIZATION NAME
              </label>
              <p className="text-base font-medium text-gray-900">{userName || 'NOT PROVIDED'}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                ACCOUNT TYPE
              </label>
              <span className="text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-lg border bg-purple-50 text-purple-700 border-purple-300 inline-block">
                {userType === 'ngo' ? 'NGO' : 'EMPLOYER'}
              </span>
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

        {/* Payment Channel Settings Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wide">
              PAYMENT CHANNEL SETTINGS
            </h2>
          </div>
          <div className="px-6 py-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                DEFAULT BALANCE UPDATE FREQUENCY
              </label>
              <select
                className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg text-sm uppercase font-medium focus:outline-none focus:ring-2 focus:ring-xah-blue focus:border-transparent"
                defaultValue="hourly"
              >
                <option value="hourly">HOURLY</option>
                <option value="daily">DAILY</option>
                <option value="weekly">WEEKLY</option>
                <option value="manual">MANUAL ONLY</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                HOW OFTEN WORKER BALANCES ARE UPDATED IN PAYMENT CHANNELS
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                NOTIFICATIONS
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 text-xah-blue border-gray-300 rounded focus:ring-xah-blue"
                  />
                  <span className="text-sm text-gray-700 uppercase">
                    WORKER PROFILE DELETIONS
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 text-xah-blue border-gray-300 rounded focus:ring-xah-blue"
                  />
                  <span className="text-sm text-gray-700 uppercase">
                    PAYMENT CHANNEL ACTIVITY
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 text-xah-blue border-gray-300 rounded focus:ring-xah-blue"
                  />
                  <span className="text-sm text-gray-700 uppercase">
                    LOW ESCROW BALANCE ALERTS
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Information Section */}
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-6">
          <div className="flex gap-3">
            <span className="text-2xl">ℹ️</span>
            <div>
              <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide mb-2">
                ABOUT ORGANIZATION ACCOUNTS
              </h3>
              <p className="text-sm text-blue-800 leading-relaxed">
                ORGANIZATION ACCOUNTS (NGO/EMPLOYER) CREATE AND MANAGE PAYMENT CHANNELS FOR WORKERS.
                YOUR WALLET ADDRESS CANNOT BE USED AS A WORKER ACCOUNT. TO RECEIVE PAYMENTS AS A WORKER,
                USE A SEPARATE WALLET ADDRESS.
              </p>
            </div>
          </div>
        </div>

      </div>

      <Footer />
    </div>
  )
}

export default NgoSettings
