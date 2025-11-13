import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { WalletProvider } from './contexts/WalletContext'
import { DataProvider } from './contexts/DataContext'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardRedirect from './components/DashboardRedirect'
import HomePage from './pages/HomePage'
import WorkerPage from './pages/WorkerPage'
import WorkerDashboard from './pages/WorkerDashboard'
import EmployeeSettings from './pages/EmployeeSettings'
import NgoPage from './pages/NgoPage'
import NgoDashboard from './pages/NgoDashboard'
import TermsOfService from './pages/TermsOfService'
import ScrollToTop from './components/ScrollToTop'

const App: React.FC = () => {
  return (
    <AuthProvider>
      <WalletProvider>
        <DataProvider>
          <Router>
            <ScrollToTop />
            <div className="App">
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
              </Routes>
            </div>
          </Router>
        </DataProvider>
      </WalletProvider>
    </AuthProvider>
  )
}

export default App
