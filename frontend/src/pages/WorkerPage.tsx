import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Navbar from '../components/Navbar'
import WorkerWorkflow from '../components/WorkerWorkflow'
import Footer from '../components/Footer'
import WalletSelectionModal from '../components/WalletSelectionModal'

const WorkerPage: React.FC = () => {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuth()
  const [showWalletModal, setShowWalletModal] = useState(false)

  const handleLogin = () => {
    if (isLoggedIn) {
      // Already logged in, just navigate to dashboard
      navigate('/worker/dashboard')
    } else {
      // Show wallet selection modal
      setShowWalletModal(true)
    }
  }
  
  return (
    <div className="min-h-screen x-pattern-bg-light">
      <Navbar />
      <div className="pt-28 pb-12 bg-gradient-to-br from-xah-light via-white to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Link 
              to="/" 
              className="inline-flex items-center gap-2 text-xah-blue hover:text-primary-700 font-bold text-sm uppercase tracking-wide mb-8 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              BACK TO HOME
            </Link>
            <div className="bg-white rounded-2xl shadow-2xl p-10 border-4 border-xah-blue/40 max-w-4xl mx-auto">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-6 leading-tight uppercase tracking-tight">
                WORKER
                <br />
                <span className="text-xah-blue">DASHBOARD</span>
              </h1>
              <p className="text-sm text-gray-700 max-w-3xl mx-auto uppercase leading-relaxed tracking-wide font-semibold mb-8">
                CLOCK IN, LOG HOURS, AND RECEIVE AUTOMATIC XAH PAYMENTS DIRECTLY TO YOUR WALLET EVERY HOUR
              </p>
              <button 
                onClick={handleLogin}
                className="btn-primary text-base px-12 py-4 uppercase tracking-wide border-4 border-[#99FF9F] shadow-[0_0_20px_rgba(153,255,159,0.6)] hover:shadow-[0_0_30px_rgba(153,255,159,0.8)] transition-all duration-300"
              >
                {isLoggedIn ? 'VIEW WORKER DASHBOARD' : 'CONNECT WALLET TO VIEW DASHBOARD'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <WorkerWorkflow />
      <Footer />
      
      {/* Wallet Selection Modal */}
      <WalletSelectionModal 
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        userType="employee"
      />
    </div>
  )
}

export default WorkerPage
