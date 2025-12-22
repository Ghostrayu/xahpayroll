import React, { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { WalletProvider } from './contexts/WalletContext'
import { DataProvider } from './contexts/DataContext'
import { ActiveSessionsProvider } from './contexts/ActiveSessionsContext'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardRedirect from './components/DashboardRedirect'
import ScrollToTop from './components/ScrollToTop'

// Lazy load page components for code-splitting
const HomePage = lazy(() => import('./pages/HomePage'))
const WorkerPage = lazy(() => import('./pages/WorkerPage'))
const WorkerDashboard = lazy(() => import('./pages/WorkerDashboard'))
const EmployeeSettings = lazy(() => import('./pages/EmployeeSettings'))
const NgoPage = lazy(() => import('./pages/NgoPage'))
const NgoDashboard = lazy(() => import('./pages/NgoDashboard'))
const NgoSettings = lazy(() => import('./pages/NgoSettings'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))

// Loading component for Suspense fallback
const LoadingSpinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-secondary-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-xah-blue mx-auto mb-4"></div>
      <p className="text-gray-600 font-semibold uppercase tracking-wide">LOADING...</p>
    </div>
  </div>
)

const App: React.FC = () => {
  const [networkMismatch, setNetworkMismatch] = useState<string | null>(null)

  // Validate network configuration on app load
  useEffect(() => {
    const validateNetworkConfig = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
        const frontendNetwork = import.meta.env.VITE_XRPL_NETWORK || 'testnet'

        const response = await fetch(`${backendUrl}/health`)
        const data = await response.json()

        if (data.network !== frontendNetwork) {
          const mismatchMsg = `⚠️ NETWORK MISMATCH DETECTED!\n\nFRONTEND: ${frontendNetwork.toUpperCase()}\nBACKEND: ${data.network.toUpperCase()}\n\nPLEASE UPDATE .ENV FILES AND RESTART SERVERS.`
          setNetworkMismatch(mismatchMsg)
          console.error('[NETWORK_VALIDATION] Mismatch detected:', {
            frontend: frontendNetwork,
            backend: data.network
          })
        } else {
          console.log('[NETWORK_VALIDATION] ✅ Networks match:', frontendNetwork)
        }
      } catch (error) {
        console.warn('[NETWORK_VALIDATION] Failed to validate network config:', error)
      }
    }

    validateNetworkConfig()
  }, [])

  // Display network mismatch warning if detected
  if (networkMismatch) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
        <div className="max-w-2xl mx-4 p-8 bg-white border-4 border-red-500 rounded-lg shadow-2xl">
          <div className="text-center">
            <div className="text-6xl mb-4">🚨</div>
            <h1 className="text-2xl font-bold text-red-600 mb-4 uppercase tracking-wide">
              CONFIGURATION ERROR
            </h1>
            <pre className="text-left bg-red-50 p-4 rounded border-2 border-red-300 mb-6 font-mono text-sm whitespace-pre-wrap">
              {networkMismatch}
            </pre>
            <div className="text-sm text-gray-700 space-y-2 text-left">
              <p className="font-semibold">HOW TO FIX:</p>
              <ol className="list-decimal ml-6 space-y-1">
                <li>UPDATE <code className="bg-gray-200 px-2 py-1 rounded">frontend/.env</code> → VITE_XRPL_NETWORK</li>
                <li>UPDATE <code className="bg-gray-200 px-2 py-1 rounded">backend/.env</code> → XRPL_NETWORK</li>
                <li>RESTART BOTH SERVERS</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      <WalletProvider>
        <DataProvider>
          <ActiveSessionsProvider>
            <Router>
              <ScrollToTop />
              <div className="App">
                <Suspense fallback={<LoadingSpinner />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/dashboard" element={<DashboardRedirect />} />
                    <Route path="/worker" element={<WorkerPage />} />
                    <Route
                      path="/worker/dashboard"
                      element={
                        <ProtectedRoute allowedUserTypes={['employee']} redirectTo="/worker">
                          <WorkerDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/worker/settings"
                      element={
                        <ProtectedRoute allowedUserTypes={['employee']} redirectTo="/worker">
                          <EmployeeSettings />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/ngo" element={<NgoPage />} />
                    <Route
                      path="/ngo/dashboard"
                      element={
                        <ProtectedRoute allowedUserTypes={['ngo', 'employer']} redirectTo="/ngo">
                          <NgoDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/ngo/settings"
                      element={
                        <ProtectedRoute allowedUserTypes={['ngo', 'employer']} redirectTo="/ngo">
                          <NgoSettings />
                        </ProtectedRoute>
                      }
                    />
                  </Routes>
                </Suspense>
              </div>
            </Router>
          </ActiveSessionsProvider>
        </DataProvider>
      </WalletProvider>
    </AuthProvider>
  )
}

export default App
