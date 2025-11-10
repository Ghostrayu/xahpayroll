import React, { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, UserType } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactElement
  allowedUserTypes?: UserType[]
  redirectTo?: string
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  allowedUserTypes,
  redirectTo = '/'
}) => {
  const { isLoggedIn, userType } = useAuth()
  const [isAuthLoaded, setIsAuthLoaded] = useState(false)

  // Wait for auth to load from localStorage
  useEffect(() => {
    // Auth context should load quickly from localStorage
    // If it's been more than 100ms and we still don't have auth state, assume not logged in
    const timer = setTimeout(() => {
      setIsAuthLoaded(true)
    }, 100)

    // If auth state is already available, mark as loaded
    if (isLoggedIn !== undefined) {
      setIsAuthLoaded(true)
      clearTimeout(timer)
    }

    return () => clearTimeout(timer)
  }, [isLoggedIn])

  // Show nothing while auth is loading to prevent flash of redirect
  if (!isAuthLoaded) {
    return null
  }

  // Check if user is logged in
  if (!isLoggedIn) {
    return <Navigate to={redirectTo} replace />
  }

  // Check if user type is allowed (if specified)
  if (allowedUserTypes && userType && !allowedUserTypes.includes(userType)) {
    // Redirect to appropriate dashboard based on user type
    const dashboardPath = userType === 'employee' ? '/worker/dashboard' : '/ngo/dashboard'
    return <Navigate to={dashboardPath} replace />
  }

  return children
}

export default ProtectedRoute
