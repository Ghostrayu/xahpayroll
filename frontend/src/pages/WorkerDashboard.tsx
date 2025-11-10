import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import { useData } from '../contexts/DataContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const WorkerDashboard: React.FC = () => {
  const { userName } = useAuth()
  const { balance, reserve, isConnected, walletAddress, network } = useWallet()
  const { earnings, workSessions, clockIn, clockOut, isLoading } = useData()

  // Check if currently working based on active work session
  const activeSession = workSessions.find(session => !session.clockOut)
  const isWorking = !!activeSession

  // Use data from context with fallback defaults
  const workerData = {
    hourlyRate: 15.00, // TODO: Get from payment channel or employee record
    todayHours: earnings?.today ? (earnings.today / 15.00) : 0,
    todayEarnings: earnings?.today || 0,
    weekHours: earnings?.week ? (earnings.week / 15.00) : 0,
    weekEarnings: earnings?.week || 0,
    monthHours: earnings?.month ? (earnings.month / 15.00) : 0,
    monthEarnings: earnings?.month || 0,
    employer: 'Good Money Collective'
  }

  // Recent payments from work sessions (completed)
  const recentPayments = workSessions
    .filter(session => session.clockOut && session.status === 'completed')
    .slice(0, 4)
    .map((session) => ({
      id: session.id,
      amount: session.hours ? (session.hours * workerData.hourlyRate) : 0,
      time: new Date(session.clockOut!).toLocaleString(),
      status: 'Completed',
      txHash: `0x${session.id.toString().padStart(6, '0')}`
    }))

  const handleClockInOut = async () => {
    try {
      if (isWorking) {
        await clockOut()
      } else {
        await clockIn()
      }
    } catch (error) {
      console.error('Error clocking in/out:', error)
      alert('Failed to clock in/out. Please try again.')
    }
  }

  return (
    <div className="min-h-screen x-pattern-bg-light">
      <Navbar />
      
      {/* Dashboard Header */}
      <div className="pt-28 pb-8 bg-gradient-to-br from-xah-light via-white to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 uppercase tracking-tight">
                WORKER DASHBOARD
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
                </div>
              )}
            </div>
            <Link 
              to="/worker" 
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
          
          {/* Clock In/Out Section */}
          <div className="mb-12 bg-gradient-to-br from-xah-blue to-primary-700 rounded-2xl shadow-2xl p-8 text-white">
            <div className="text-center">
              <h2 className="text-2xl font-extrabold uppercase tracking-tight mb-4">
                {isWorking ? 'CURRENTLY WORKING' : 'READY TO START'}
              </h2>
              <div className="text-6xl font-extrabold mb-6">
                --
              </div>
              <button
                onClick={handleClockInOut}
                disabled={isLoading}
                className={`px-12 py-4 rounded-xl font-bold text-lg uppercase tracking-wide transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isWorking
                    ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_30px_rgba(239,68,68,0.6)]'
                    : 'bg-secondary-500 hover:bg-secondary-600 shadow-[0_0_30px_rgba(153,255,159,0.6)]'
                }`}
              >
                {isLoading ? '⏳ PROCESSING...' : isWorking ? '⏹ CLOCK OUT' : '▶️ CLOCK IN'}
              </button>
              {isWorking && (
                <p className="mt-4 text-sm uppercase tracking-wide">
                  Earning {workerData.hourlyRate} XAH per hour
                </p>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Today */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl shadow-lg p-6 border-2 border-blue-200">
              <div className="text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">Today</p>
                <p className="text-3xl font-extrabold text-gray-900 mb-1">{workerData.todayHours}h</p>
                <p className="text-xl font-bold text-xah-blue">{workerData.todayEarnings} XAH</p>
              </div>
            </div>

            {/* This Week */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl shadow-lg p-6 border-2 border-green-200">
              <div className="text-center">
                <div className="text-4xl mb-3">📊</div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">This Week</p>
                <p className="text-3xl font-extrabold text-gray-900 mb-1">{workerData.weekHours}h</p>
                <p className="text-xl font-bold text-xah-blue">{workerData.weekEarnings} XAH</p>
              </div>
            </div>

            {/* This Month */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl shadow-lg p-6 border-2 border-purple-200">
              <div className="text-center">
                <div className="text-4xl mb-3">💰</div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">This Month</p>
                <p className="text-3xl font-extrabold text-gray-900 mb-1">{workerData.monthHours}h</p>
                <p className="text-xl font-bold text-xah-blue">{workerData.monthEarnings} XAH</p>
              </div>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Employment Info */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Employment Info</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600 uppercase tracking-wide font-semibold">Employer</span>
                  <span className="font-bold text-gray-900 uppercase text-sm">{workerData.employer}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600 uppercase tracking-wide font-semibold">Hourly Rate</span>
                  <span className="font-bold text-xah-blue text-lg">{workerData.hourlyRate} XAH</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600 uppercase tracking-wide font-semibold">Status</span>
                  <span className="px-3 py-1 bg-green-500 text-white rounded-full text-xs font-bold">ACTIVE</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600 uppercase tracking-wide font-semibold">Payment Frequency</span>
                  <span className="font-bold text-gray-900 uppercase text-sm">HOURLY</span>
                </div>
              </div>
            </div>

            {/* Recent Payments */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30">
              <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6">Recent Payments</h3>
              <div className="space-y-4">
                {recentPayments.length > 0 ? (
                  recentPayments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-lg">✓</span>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{payment.amount.toFixed(2)} XAH</p>
                          <p className="text-xs text-gray-600 uppercase tracking-wide">{payment.time}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-green-600 uppercase tracking-wide font-semibold">{payment.status}</p>
                        <a
                          href={`https://testnet.xrpl.org/transactions/${payment.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-xah-blue hover:underline"
                        >
                          {payment.txHash}
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">No payments yet</p>
                    <p className="text-xs text-gray-400 mt-2">Clock in to start earning!</p>
                  </div>
                )}
              </div>
              <button className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-4 rounded-lg text-sm uppercase tracking-wide transition-colors">
                VIEW ALL PAYMENTS
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-12 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl shadow-lg p-8 border-2 border-gray-200">
            <h3 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight mb-6 text-center">Quick Stats</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-3xl font-extrabold text-xah-blue mb-2">{workerData.hourlyRate}</p>
                <p className="text-xs text-gray-600 uppercase tracking-wide">XAH/Hour</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-extrabold text-xah-blue mb-2">{recentPayments.length}</p>
                <p className="text-xs text-gray-600 uppercase tracking-wide">Payments Today</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-extrabold text-xah-blue mb-2">$0.001</p>
                <p className="text-xs text-gray-600 uppercase tracking-wide">Avg Fee</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-extrabold text-xah-blue mb-2">100%</p>
                <p className="text-xs text-gray-600 uppercase tracking-wide">On-Time</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default WorkerDashboard
