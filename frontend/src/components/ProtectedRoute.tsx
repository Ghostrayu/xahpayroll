import React from 'react'
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
