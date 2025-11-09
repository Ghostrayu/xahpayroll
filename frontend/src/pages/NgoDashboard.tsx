import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import { useData } from '../contexts/DataContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import CreatePaymentChannelModal from '../components/CreatePaymentChannelModal'
import AddWorkerModal from '../components/AddWorkerModal'

const NgoDashboard: React.FC = () => {
  const { userName } = useAuth()
  const { balance, reserve, isConnected, walletAddress, network } = useWallet()
  const { orgStats, workers, paymentChannels, recentActivity, refreshData } = useData()
  const [showEscrowModal, setShowEscrowModal] = useState(false)
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false)

  // Use data from context with fallback defaults
  const stats = orgStats || {
    totalWorkers: 0,
    activeWorkers: 0,
    escrowBalance: 0,
    totalPaid: 0,
    avgHourlyRate: 0,
    hoursThisMonth: 0
  }

  return (
    <div className="min-h-screen x-pattern-bg-light">
      <Navbar />
      
      {/* Dashboard Header */}
      <div className="pt-28 pb-8 bg-gradient-to-br from-xah-light via-white to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
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
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Organization:</span>
                    <span className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                      Good Money Collective
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Wallet:</span>
                    <code className="text-xs font-mono text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {walletAddress}
                    </code>
                    <span className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border ${
                      network === 'mainnet' 
                        ? 'text-green-700 bg-green-50 border-green-300' 
                        : 'bg-orange-100 text-orange-700 border-orange-300'
                    }`}>
                      {network === 'mainnet' ? 'MAINNET XAHAU' : 'TESTNET XAHAU'}
                    </span>
                  </div>
                  {isConnected && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Balance:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                          {parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} XAH
                        </span>
                        <span className="text-xs text-gray-400 uppercase">
                          ({parseFloat(reserve).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAH RESERVED)
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Workers:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                        {stats.totalWorkers}
                      </span>
                      <span className="text-xs font-semibold text-green-600">
                        ({stats.activeWorkers} CLOCKED IN)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Escrow Balance:</span>
                    <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {stats.escrowBalance.toLocaleString()} XAH
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Paid:</span>
                    <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {stats.totalPaid.toLocaleString()} XAH
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Hours This Month:</span>
                    <span className="text-sm font-bold text-xah-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {stats.hoursThisMonth}
                    </span>
                  </div>
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

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button 
              onClick={() => setShowAddWorkerModal(true)}
              className="bg-xah-blue hover:bg-primary-700 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg"
            >
              ➕ ADD WORKER
            </button>
            <button 
              onClick={() => setShowEscrowModal(true)}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg"
            >
              ⚡ OPEN PAYMENT CHANNEL
            </button>
            <button className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-4 px-6 rounded-xl text-sm uppercase tracking-wide transition-colors shadow-lg">
              ⚙️ SETTINGS
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Active Payment Channels Section */}
          <div className="mb-12">
            <div className="bg-white rounded-2xl shadow-xl p-4 border-2 border-green-500/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-extrabold text-gray-900 uppercase tracking-tight">Active Payment Channels</h3>
                <span className="px-3 py-1 bg-green-500 text-white rounded-full text-xs font-bold">
                  {paymentChannels.length} ACTIVE
                </span>
              </div>

              {paymentChannels.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">⚡</div>
                  <h4 className="text-lg font-bold text-gray-900 uppercase mb-2">No Active Payment Channels</h4>
                  <p className="text-sm text-gray-600 uppercase tracking-wide mb-6">
                    Create a payment channel to start paying workers
                  </p>
                  <button 
                    onClick={() => setShowEscrowModal(true)}
                    className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-sm uppercase tracking-wide transition-colors"
                  >
                    ⚡ Open Payment Channel
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentChannels.map((channel) => (
                    <div 
                      key={channel.id} 
                      className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-3 border-2 border-green-200 hover:border-green-400 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-bold text-xs">
                              {channel.worker.split(' ').map((n: string) => n[0]).join('')}
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">
                              {channel.jobName || channel.worker}
                            </p>
                            <p className="text-[10px] text-gray-600 uppercase tracking-wide">
                              {channel.worker} • {channel.channelId}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex items-center px-2 py-0.5 bg-green-500 text-white rounded-full text-[10px] font-bold">
                            ● ACTIVE
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                        <div className="bg-white/60 rounded-lg p-2 border border-orange-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Escrow Balance
                          </p>
                          <p className="text-base font-extrabold text-orange-600">
                            {channel.escrowBalance ? channel.escrowBalance.toLocaleString() : '0'} XAH
                          </p>
                        </div>
                        <div className="bg-white/60 rounded-lg p-2 border border-green-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Accumulated Balance
                          </p>
                          <p className="text-base font-extrabold text-green-600">
                            {channel.balance.toLocaleString()} XAH
                          </p>
                        </div>
                        <div className="bg-white/60 rounded-lg p-2 border border-blue-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Hourly Rate
                          </p>
                          <p className="text-base font-extrabold text-xah-blue">
                            {channel.hourlyRate.toFixed(2)} XAH
                          </p>
                        </div>
                        <div className="bg-white/60 rounded-lg p-2 border border-purple-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Hours Tracked
                          </p>
                          <p className="text-base font-extrabold text-purple-600">
                            {channel.hoursAccumulated.toFixed(1)}h
                          </p>
                        </div>
                        <div className="bg-white/60 rounded-lg p-2 border border-gray-200">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-0.5">
                            Update Frequency
                          </p>
                          <p className="text-sm font-bold text-gray-900 uppercase">
                            {channel.balanceUpdateFrequency}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-green-200">
                        <div className="flex items-center gap-1 text-[10px] text-gray-600 uppercase tracking-wide">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Last updated: {channel.lastUpdate}
                        </div>
                        <div className="flex gap-2">
                          <button className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded text-[10px] uppercase tracking-wide transition-colors">
                            View Details
                          </button>
                          <button className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded text-[10px] uppercase tracking-wide transition-colors">
                            Close Channel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <div className="text-2xl">ℹ️</div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-2">
                      How Payment Channels Work
                    </p>
                    <ul className="text-xs text-gray-700 space-y-1 uppercase tracking-wide">
                      <li>• <strong>Off-chain tracking:</strong> Hours tracked in database, balance updates in real-time</li>
                      <li>• <strong>Signed claims:</strong> Generated based on update frequency (hourly/30min/15min)</li>
                      <li>• <strong>Accumulating balance:</strong> Worker sees total accumulated amount grow over time</li>
                      <li>• <strong>Efficient:</strong> Only 2 on-chain transactions (open channel + close/claim at end)</li>
                      <li>• <strong>Worker claims:</strong> Workers can claim anytime, but claiming closes the channel</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity and Workers Grid */}
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Recent Activity</h3>
              <div className="space-y-4">
                {recentActivity.length > 0 ? (
                  recentActivity.slice(0, 5).map((activity, index) => (
                    <div key={index} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
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
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">No recent activity</p>
                  </div>
                )}
              </div>
              <button className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors">
                VIEW FULL HISTORY
              </button>
            </div>

            {/* Workers */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-green-500/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Workers</h3>
              <div className="space-y-4">
                {workers.length > 0 ? (
                  workers.map((worker, index) => (
                    <div key={index} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">
                          {worker.name.split(' ').map((n: string) => n[0]).join('')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">{worker.name}</p>
                        <code className="text-xs font-mono text-gray-600 break-all">{worker.employee_wallet_address}</code>
                        {worker.rate && (
                          <p className="text-xs text-green-600 font-bold uppercase tracking-wide mt-1">{worker.rate} XAH/hr</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">No workers added yet</p>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setShowAddWorkerModal(true)}
                className="w-full mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors"
              >
                + ADD WORKER
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      
      {/* Payment Channel Modal */}
      <CreatePaymentChannelModal
        isOpen={showEscrowModal}
        onClose={() => setShowEscrowModal(false)}
        onSuccess={refreshData}
      />

      {/* Add Worker Modal */}
      <AddWorkerModal
        isOpen={showAddWorkerModal}
        onClose={() => setShowAddWorkerModal(false)}
        onSuccess={() => {
          // Refresh dashboard data after worker is added
          refreshData()
        }}
      />
    </div>
  )
}

export default NgoDashboard
