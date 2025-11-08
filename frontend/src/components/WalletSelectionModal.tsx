import React, { useState } from 'react'
import { useWallet, WalletProvider } from '../contexts/WalletContext'
import { useAuth, UserType } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import ProfileSetupModal, { ProfileData } from './ProfileSetupModal'
import crossmarkLogo from '../assets/images/primary_128x128.png'
import xamanLogo from '../assets/images/App icon 512px.png'

interface WalletSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  userType: UserType
}

interface WalletOption {
  id: WalletProvider
  name: string
  icon?: string
  logo?: string
  description: string
  available: boolean
}

const WalletSelectionModal: React.FC<WalletSelectionModalProps> = ({ isOpen, onClose, userType }) => {
  const { connectWallet, isLoading, error, xamanQrUrl, walletAddress } = useWallet()
  const { login, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [selectedWallet, setSelectedWallet] = useState<WalletProvider | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [showProfileSetup, setShowProfileSetup] = useState(false)
  const [isCheckingProfile, setIsCheckingProfile] = useState(false)

  // Check if browser extensions are available
  const isCrossmarkAvailable = typeof window !== 'undefined' && !!(window as any).crossmark
  const isGemWalletAvailable = typeof window !== 'undefined' && !!(window as any).gemWallet

  const walletOptions: WalletOption[] = [
    {
      id: 'xaman',
      name: 'Xaman (Xumm)',
      logo: xamanLogo,
      description: 'Scan QR with mobile app',
      available: true // Always available - uses QR code
    },
    {
      id: 'crossmark',
      name: 'Crossmark',
      logo: crossmarkLogo,
      description: 'Browser extension wallet',
      available: isCrossmarkAvailable
    },
    {
      id: 'gemwallet',
      name: 'GemWallet',
      icon: '💎',
      description: 'Browser extension wallet',
      available: isGemWalletAvailable
    }
  ]

  const handleWalletConnect = async (walletId: WalletProvider) => {
    setSelectedWallet(walletId)
    setConnectionError(null)

    try {
      await connectWallet(walletId)
      
      // Check if user already has a profile
      setIsCheckingProfile(true)
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      
      try {
        const profileResponse = await fetch(`${backendUrl}/api/users/profile/${walletAddress}`)
        
        if (profileResponse.ok) {
          // User has existing profile - log them in directly
          const profileData = await profileResponse.json()
          const profile = profileData.data.profile
          
          console.log('Existing profile found:', profile)
          
          // Update profile in auth context
          updateProfile({
            displayName: profile.displayName,
            organizationName: profile.organizationName,
            email: profile.email,
            phoneNumber: profile.phoneNumber
          })
          
          // Log in the user
          login(profile.displayName, profile.userType, walletAddress)
          
          // Close modal
          onClose()
          
          // Navigate to appropriate dashboard
          const dashboardPath = profile.userType === 'employee' ? '/worker/dashboard' : '/ngo/dashboard'
          navigate(dashboardPath)
        } else {
          // No existing profile - show profile setup modal
          console.log('No existing profile found, showing profile setup')
          setShowProfileSetup(true)
        }
      } catch (profileError) {
        console.log('Error checking profile, showing profile setup:', profileError)
        // If profile check fails, show profile setup modal
        setShowProfileSetup(true)
      } finally {
        setIsCheckingProfile(false)
      }
    } catch (err: any) {
      console.error('Wallet connection failed:', err)
      setConnectionError(err.message || 'Failed to connect wallet')
      setSelectedWallet(null)
      setIsCheckingProfile(false)
    }
  }

  const handleProfileComplete = (profileData: ProfileData) => {
    // Update profile in auth context
    updateProfile({
      displayName: profileData.displayName,
      organizationName: profileData.organizationName,
      email: profileData.email,
      phoneNumber: profileData.phoneNumber
    })
    
    // Log in the user with their display name
    login(profileData.displayName, userType, walletAddress)
    
    // Close modals
    setShowProfileSetup(false)
    onClose()
    
    // Navigate to appropriate dashboard
    const dashboardPath = userType === 'employee' ? '/worker/dashboard' : '/ngo/dashboard'
    navigate(dashboardPath)
  }

  const handleClose = () => {
    if (!isLoading) {
      setSelectedWallet(null)
      setConnectionError(null)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 border-4 border-xah-blue/40">
        {/* Header */}
        <div className="bg-gradient-to-r from-xah-blue to-primary-700 text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-extrabold uppercase tracking-tight">
              Connect Wallet
            </h2>
            {!isLoading && (
              <button
                onClick={handleClose}
                className="text-white hover:text-secondary-500 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-sm mt-2 text-white/90 uppercase tracking-wide">
            Choose your XRPL wallet
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Show Xaman QR Code if connecting */}
          {xamanQrUrl && selectedWallet === 'xaman' && (
            <div className="mb-6 text-center">
              <p className="text-sm font-bold text-gray-700 uppercase mb-4">
                Scan QR Code with Xaman App
              </p>
              <img 
                src={xamanQrUrl} 
                alt="Xaman QR Code" 
                className="mx-auto border-4 border-xah-blue rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-3 uppercase">
                Waiting for approval...
              </p>
            </div>
          )}

          {/* Error Message */}
          {(connectionError || error) && (
            <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-sm text-red-600 font-semibold">
                ⚠️ {connectionError || error}
              </p>
            </div>
          )}

          {/* Wallet Options */}
          {!xamanQrUrl && (
            <div className="space-y-3">
              {walletOptions.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => handleWalletConnect(wallet.id)}
                  disabled={!wallet.available || isLoading || isCheckingProfile}
                  className={`
                    w-full p-4 rounded-lg border-2 text-left transition-all
                    ${wallet.available && !isLoading && !isCheckingProfile
                      ? 'border-xah-blue/30 hover:border-xah-blue hover:bg-primary-50 cursor-pointer'
                      : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                    }
                    ${selectedWallet === wallet.id ? 'border-xah-blue bg-primary-50' : ''}
                  `}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 flex items-center justify-center">
                      {wallet.logo ? (
                        <img 
                          src={wallet.logo} 
                          alt={`${wallet.name} logo`}
                          className="w-10 h-10 object-contain"
                        />
                      ) : (
                        <span className="text-3xl">{wallet.icon}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 uppercase text-sm">
                        {wallet.name}
                      </h3>
                      <p className="text-xs text-gray-600 uppercase tracking-wide">
                        {wallet.available ? wallet.description : 'Not installed'}
                      </p>
                    </div>
                    {selectedWallet === wallet.id && (isLoading || isCheckingProfile) && (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-xah-blue"></div>
                        {isCheckingProfile && (
                          <span className="text-xs text-gray-600 font-semibold uppercase">
                            Checking Profile...
                          </span>
                        )}
                      </div>
                    )}
                    {!wallet.available && (
                      <span className="text-xs text-red-500 font-bold uppercase">
                        Install Required
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Installation Links */}
          {!xamanQrUrl && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-semibold">
                Don't have a wallet?
              </p>
              <div className="space-y-2 text-xs">
                <a
                  href="https://crossmark.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xah-blue hover:text-primary-700 font-semibold uppercase transition-colors"
                >
                  <img 
                    src={crossmarkLogo} 
                    alt="Crossmark logo"
                    className="w-5 h-5 object-contain"
                  />
                  Install Crossmark (Recommended) →
                </a>
                <a
                  href="https://gemwallet.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xah-blue hover:text-primary-700 font-semibold uppercase"
                >
                  💎 Install GemWallet →
                </a>
                <a
                  href="https://xaman.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-gray-600 font-semibold uppercase transition-colors"
                >
                  <img 
                    src={xamanLogo} 
                    alt="Xaman logo"
                    className="w-5 h-5 object-contain"
                  />
                  Download Xaman →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Profile Setup Modal */}
      {showProfileSetup && (
        <ProfileSetupModal
          isOpen={showProfileSetup}
          onComplete={handleProfileComplete}
          userType={userType}
          walletAddress={walletAddress}
        />
      )}
    </div>
  )
}

export default WalletSelectionModal
