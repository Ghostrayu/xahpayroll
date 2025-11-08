import React, { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWallet } from '../contexts/WalletContext'
import footerImage from '../assets/images/IMG_4027.png'

const Navbar: React.FC = () => {
  const { isLoggedIn, userName, userType, logout } = useAuth()
  const { disconnectWallet } = useWallet()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false)
  const [showDropdown, setShowDropdown] = useState<boolean>(false)
  
  const handleLogout = () => {
    setShowDropdown(false)
    disconnectWallet() // Disconnect wallet first
    logout() // Then logout from auth
  }

  // Determine if we should show the login button
  // Hide it on /ngo and /worker pages since they have their own login buttons
  const shouldShowLoginButton = () => {
    return location.pathname === '/' || location.pathname === ''
  }

  return (
    <nav className="bg-white shadow-md fixed w-full top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <a href="/" className="flex items-center hover:opacity-80 transition-opacity">
                <img src={footerImage} alt="XahPayroll" className="h-12 w-12 object-contain" />
              </a>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-700 hover:text-xah-blue transition-colors uppercase">
              FEATURES
            </a>
            <a href="#how-it-works" className="text-gray-700 hover:text-xah-blue transition-colors uppercase">
              HOW IT WORKS
            </a>
            
            {/* Login/User Button */}
            {isLoggedIn ? (
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 bg-xah-blue hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors uppercase font-bold text-sm"
                >
                  <div className="w-8 h-8 bg-secondary-500 rounded-full flex items-center justify-center">
                    <span className="text-xah-blue font-bold text-xs">
                      {userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </span>
                  </div>
                  <span className="max-w-[150px] truncate">{userName}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Dropdown Menu */}
                {showDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border-2 border-xah-blue/20 py-2 z-50">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Logged in as</p>
                      <p className="font-bold text-gray-900 uppercase text-sm truncate">{userName}</p>
                      <p className="text-xs text-xah-blue uppercase tracking-wide">{userType}</p>
                    </div>
                    <Link 
                      to={userType === 'ngo' || userType === 'employer' ? '/ngo/dashboard' : '/worker/dashboard'} 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 uppercase tracking-wide"
                      onClick={() => setShowDropdown(false)}
                    >
                      📊 DASHBOARD
                    </Link>
                    <a href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 uppercase tracking-wide">
                      ⚙️ SETTINGS
                    </a>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 uppercase tracking-wide font-bold"
                    >
                      🚪 LOGOUT
                    </button>
                  </div>
                )}
              </div>
            ) : (
              shouldShowLoginButton() && (
                <a href="#login-cards" className="btn-primary uppercase">
                  LOGIN
                </a>
              )
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-xah-blue focus:outline-none"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {isMenuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <a
              href="#features"
              className="block px-3 py-2 text-gray-700 hover:text-xah-blue hover:bg-gray-50 rounded-md uppercase"
            >
              FEATURES
            </a>
            <a
              href="#how-it-works"
              className="block px-3 py-2 text-gray-700 hover:text-xah-blue hover:bg-gray-50 rounded-md uppercase"
            >
              HOW IT WORKS
            </a>
            
            {/* Mobile Login/User Section */}
            {isLoggedIn ? (
              <div className="mt-2 border-t pt-2">
                <div className="px-3 py-2 bg-gray-50 rounded-md">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-xah-blue rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 uppercase text-sm">{userName}</p>
                      <p className="text-xs text-xah-blue uppercase tracking-wide">{userType}</p>
                    </div>
                  </div>
                </div>
                <Link 
                  to={userType === 'ngo' || userType === 'employer' ? '/ngo/dashboard' : '/worker/dashboard'} 
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md uppercase text-sm"
                  onClick={() => setIsMenuOpen(false)}
                >
                  📊 DASHBOARD
                </Link>
                <a href="/settings" className="block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md uppercase text-sm">
                  ⚙️ SETTINGS
                </a>
                <button
                  onClick={() => {
                    setIsMenuOpen(false)
                    handleLogout()
                  }}
                  className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded-md uppercase text-sm font-bold"
                >
                  🚪 LOGOUT
                </button>
              </div>
            ) : (
              shouldShowLoginButton() && (
                <a href="#login-cards" className="block w-full mt-2 btn-primary uppercase text-center">
                  LOGIN
                </a>
              )
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
