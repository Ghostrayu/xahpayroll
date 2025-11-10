import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const DashboardRedirect: React.FC = () => {
  const { userType, isLoggedIn } = useAuth()

  // If not logged in, redirect to home
  if (!isLoggedIn) {
    return <Navigate to="/" replace />
  }

  // Redirect based on user type
  if (userType === 'employee') {
    return <Navigate to="/worker/dashboard" replace />
  } else if (userType === 'ngo' || userType === 'employer') {
    return <Navigate to="/ngo/dashboard" replace />
  }

  // Default fallback
  return <Navigate to="/" replace />
}

export default DashboardRedirect
