import React, { lazy, Suspense } from 'react'
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
