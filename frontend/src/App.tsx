import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { WalletProvider } from './contexts/WalletContext'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import WorkerPage from './pages/WorkerPage'
import WorkerDashboard from './pages/WorkerDashboard'
import NgoPage from './pages/NgoPage'
import NgoDashboard from './pages/NgoDashboard'
import ScrollToTop from './components/ScrollToTop'

const App: React.FC = () => {
  return (
    <AuthProvider>
      <WalletProvider>
        <Router>
          <ScrollToTop />
          <div className="App">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/worker" element={<WorkerPage />} />
              <Route 
                path="/worker/dashboard" 
                element={
                  <ProtectedRoute allowedUserTypes={['employee']} redirectTo="/worker">
                    <WorkerDashboard />
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
      </WalletProvider>
    </AuthProvider>
  )
}

export default App
