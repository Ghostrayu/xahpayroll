import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import CreatePaymentChannelModal from '../components/CreatePaymentChannelModal'

const NgoDashboard: React.FC = () => {
  const { userName } = useAuth()
  const { balance, reserve, isConnected, walletAddress } = useWallet()
  const [showEscrowModal, setShowEscrowModal] = useState(false)

  // Mock data for demonstration
  const stats = {
    totalWorkers: 24,
    activeWorkers: 8,
    escrowBalance: 15750.50,
    totalPaid: 42380.25,
    avgHourlyRate: 15.00,
    hoursThisMonth: 1840
  }

  const recentActivity = [
    { id: 1, worker: 'John Doe', action: 'Clocked In', time: '2 minutes ago', status: 'active' },
    { id: 2, worker: 'Jane Smith', action: 'Payment Sent', amount: '15.00 XAH', time: '15 minutes ago', status: 'completed' },
    { id: 3, worker: 'Mike Johnson', action: 'Clocked Out', time: '1 hour ago', status: 'completed' },
    { id: 4, worker: 'Sarah Williams', action: 'Payment Sent', amount: '22.50 XAH', time: '2 hours ago', status: 'completed' },
  ]

  const activeWorkers = [
    { id: 1, name: 'John Doe', rate: 15.00, hoursToday: 3.5, status: 'Working' },
    { id: 2, name: 'Alice Brown', rate: 18.00, hoursToday: 2.0, status: 'Working' },
    { id: 3, name: 'Bob Wilson', rate: 20.00, hoursToday: 4.5, status: 'Working' },
    { id: 4, name: 'Carol Davis', rate: 16.50, hoursToday: 1.5, status: 'Working' },
  ]

  return (
    <div className="min-h-screen x-pattern-bg-light">
      <Navbar />
      
      {/* Dashboard Header */}
      <div className="pt-28 pb-8 bg-gradient-to-br from-xah-light via-white to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 uppercase tracking-tight">
                NGO DASHBOARD
              </h1>
              <p className="text-sm text-gray-600 uppercase tracking-wide mt-2">
                Welcome back, {userName}
              </p>
              {walletAddress && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Wallet:</span>
                    <code className="text-xs font-mono text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {walletAddress}
                    </code>
                  </div>
                  {isConnected && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Balance:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1 rounded-lg border border-green-200">
                          {parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} XAH
                        </span>
                        <span className="text-xs text-gray-400">
                          ({parseFloat(reserve).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAH reserved)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <Link 
              to="/ngo" 
              className="inline-flex items-center gap-2 text-xah-blue hover:text-primary-700 font-bold text-sm uppercase tracking-wide transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              BACK TO INFO
            </Link>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {/* Total Workers */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl shadow-lg p-6 border-2 border-blue-200">
              <div className="flex items-center justify-between mb-4">
                <div className="text-4xl">👥</div>
                <div className="text-right">
                  <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">Total Workers</p>
                  <p className="text-3xl font-extrabold text-gray-900">{stats.totalWorkers}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 bg-green-500 text-white rounded-full font-bold">{stats.activeWorkers} ACTIVE</span>
                <span className="text-gray-600 uppercase tracking-wide">Right Now</span>
              </div>
            </div>

            {/* Escrow Balance */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl shadow-lg p-6 border-2 border-green-200">
              <div className="flex items-center justify-between mb-4">
                <div className="text-4xl">💰</div>
                <div className="text-right">
                  <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">Escrow Balance</p>
                  <p className="text-3xl font-extrabold text-gray-900">{stats.escrowBalance.toLocaleString()}</p>
                  <p className="text-xs text-gray-600 uppercase tracking-wide">XAH</p>
                </div>
              </div>
              <button 
                onClick={() => setShowEscrowModal(true)}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-xs uppercase tracking-wide transition-colors"
              >
                ⚡ OPEN CHANNEL
              </button>
            </div>

            {/* Total Paid */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl shadow-lg p-6 border-2 border-purple-200">
              <div className="flex items-center justify-between mb-4">
                <div className="text-4xl">📊</div>
                <div className="text-right">
                  <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">Total Paid</p>
                  <p className="text-3xl font-extrabold text-gray-900">{stats.totalPaid.toLocaleString()}</p>
                  <p className="text-xs text-gray-600 uppercase tracking-wide">XAH</p>
                </div>
              </div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">
                {stats.hoursThisMonth} HOURS THIS MONTH
              </p>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Active Workers */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight">Active Workers</h3>
                <span className="px-3 py-1 bg-green-500 text-white rounded-full text-xs font-bold">{stats.activeWorkers} ONLINE</span>
              </div>
              <div className="space-y-4">
                {activeWorkers.map((worker) => (
                  <div key={worker.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-xah-blue rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{worker.name.split(' ').map(n => n[0]).join('')}</span>
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">{worker.name}</p>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">{worker.rate} XAH/HR</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900 text-sm">{worker.hoursToday}h</p>
                      <p className="text-xs text-green-600 uppercase tracking-wide font-semibold">● {worker.status}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 bg-xah-blue hover:bg-primary-700 text-white font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors">
                VIEW ALL WORKERS
              </button>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Recent Activity</h3>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      activity.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">{activity.worker}</p>
                      <p className="text-xs text-gray-600 uppercase tracking-wide">{activity.action}</p>
                      {activity.amount && (
                        <p className="text-xs text-xah-blue font-bold uppercase tracking-wide mt-1">{activity.amount}</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{activity.time}</p>
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors">
                VIEW FULL HISTORY
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-4">
            <button className="bg-xah-blue hover:bg-primary-700 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg">
              ➕ ADD WORKER
            </button>
            <button 
              onClick={() => setShowEscrowModal(true)}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg"
            >
              ⚡ OPEN PAYMENT CHANNEL
            </button>
            <button className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg">
              📊 VIEW REPORTS
            </button>
            <button className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg">
              ⚙️ SETTINGS
            </button>
          </div>
        </div>
      </section>

      <Footer />
      
      {/* Payment Channel Modal */}
      <CreatePaymentChannelModal 
        isOpen={showEscrowModal} 
        onClose={() => setShowEscrowModal(false)} 
      />
    </div>
  )
}

export default NgoDashboard
