import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Types
export type UserType = 'employee' | 'ngo' | 'employer'

export interface AuthContextType {
  isLoggedIn: boolean
  userName: string
  userType: UserType | null
  walletAddress: string
  login: (userName: string, userType: UserType, walletAddress?: string) => void
  logout: () => void
  updateUserInfo: (userName?: string, walletAddress?: string) => void
}

interface AuthProviderProps {
  children: ReactNode
}

interface AuthState {
  isLoggedIn: boolean
  userName: string
  userType: UserType | null
  walletAddress: string
}

// Create Context
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Local Storage Keys
const AUTH_STORAGE_KEY = 'xahpayroll_auth'

// Provider Component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    userName: '',
    userType: null,
    walletAddress: ''
  })

  // Load auth state from localStorage on mount
  useEffect(() => {
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY)
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth)
        // Validate the data before setting state
        if (parsed.isLoggedIn && parsed.userName && parsed.userType) {
          setAuthState(parsed)
        }
      } catch (error) {
        console.error('Failed to parse auth state from localStorage:', error)
        localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    }
  }, [])

  // Save auth state to localStorage whenever it changes
  useEffect(() => {
    if (authState.isLoggedIn) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState))
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }, [authState])

  // Login function
  const login = (userName: string, userType: UserType, walletAddress: string = '') => {
    setAuthState({
      isLoggedIn: true,
      userName,
      userType,
      walletAddress
    })
  }

  // Logout function
  const logout = () => {
    setAuthState({
      isLoggedIn: false,
      userName: '',
      userType: null,
      walletAddress: ''
    })
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  // Update user info
  const updateUserInfo = (userName?: string, walletAddress?: string) => {
    setAuthState(prev => ({
      ...prev,
      userName: userName || prev.userName,
      walletAddress: walletAddress || prev.walletAddress
    }))
  }

  const value: AuthContextType = {
    isLoggedIn: authState.isLoggedIn,
    userName: authState.userName,
    userType: authState.userType,
    walletAddress: authState.walletAddress,
    login,
    logout,
    updateUserInfo
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Custom Hook
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
