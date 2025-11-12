import React, { useState } from 'react'
import { useWallet, WalletProvider } from '../contexts/WalletContext'
import { useAuth, UserType } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import MultiStepSignupModal from './MultiStepSignupModal'
import crossmarkLogo from '../assets/images/primary_128x128.png'
import xamanLogo from '../assets/images/App icon 512px.png'
import { isInstalled as gemWalletIsInstalled } from '@gemwallet/api'

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
  const [foundProfile, setFoundProfile] = useState<any>(null)
  const [showProfileFound, setShowProfileFound] = useState(false)

  // Check if browser extensions are available
  const isCrossmarkAvailable = typeof window !== 'undefined' && !!(window as any).crossmark
  
  // GemWallet detection using @gemwallet/api
  const [isGemWalletAvailable, setIsGemWalletAvailable] = React.useState(false)
  
  React.useEffect(() => {
    const checkGemWallet = async () => {
      try {
        const result = await gemWalletIsInstalled()
        console.log('GemWallet isInstalled result:', result)
        const isInstalled = result?.result?.isInstalled === true
        console.log('GemWallet available:', isInstalled)
        setIsGemWalletAvailable(isInstalled)
      } catch (error) {
        console.log('GemWallet check error:', error)
        // If the check fails, assume it's not installed
        setIsGemWalletAvailable(false)
      }
    }
    checkGemWallet()
  }, [])

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
      // Note: walletAddress will be updated via useEffect below after connection completes
    } catch (err: any) {
      console.error('Wallet connection failed:', err)
      setConnectionError(err.message || 'Failed to connect wallet')
      setSelectedWallet(null)
    }
  }

  // Check for profile after wallet address is set
  React.useEffect(() => {
    const checkProfile = async () => {
      // Only check if we have a wallet address and we just connected (selectedWallet is set)
      if (!walletAddress || !selectedWallet) return
      
      setIsCheckingProfile(true)
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      
      console.log('Checking profile for wallet address:', walletAddress)
      
      try {
        const profileResponse = await fetch(`${backendUrl}/api/users/profile/${walletAddress}`)
        
        if (profileResponse.ok) {
          // User has existing profile - show confirmation dialog
          const profileData = await profileResponse.json()
          const profile = profileData.data.profile
          
          console.log('Existing profile found:', profile)
          
          // Store profile and show confirmation dialog
          setFoundProfile(profile)
          setShowProfileFound(true)
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
        setSelectedWallet(null) // Reset after check completes
      }
    }
    
    checkProfile()
  }, [walletAddress, selectedWallet, login, updateProfile, navigate, onClose])

  const handleSignInWithFoundProfile = () => {
    if (!foundProfile) return
    
    // Update profile in auth context
    updateProfile({
      displayName: foundProfile.displayName,
      organizationName: foundProfile.organizationName,
      email: foundProfile.email,
      phoneNumber: foundProfile.phoneNumber
    })
    
    // Log in the user
    login(foundProfile.displayName, foundProfile.userType, walletAddress)
    
    // Close modals
    setShowProfileFound(false)
    onClose()
    
    // Navigate to unified dashboard route
    navigate('/dashboard')
  }

  const handleProfileComplete = async () => {
    // After signup completes, fetch the profile from database
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

    try {
      const profileResponse = await fetch(`${backendUrl}/api/users/profile/${walletAddress}`)

      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        const profile = profileData.data.profile

        // Update profile in auth context
        updateProfile({
          displayName: profile.displayName,
          organizationName: profile.organizationName,
          email: profile.email,
          phoneNumber: profile.phoneNumber
        })

        // Log in the user
        login(profile.displayName, profile.userType, walletAddress)

        // Close modals
        setShowProfileSetup(false)
        onClose()

        // Navigate to unified dashboard route
        navigate('/dashboard')
      } else {
        throw new Error('FAILED TO FETCH PROFILE AFTER SIGNUP')
      }
    } catch (error: any) {
      console.error('Error fetching profile after signup:', error)
      setConnectionError(error.message || 'SIGNUP COMPLETED BUT FAILED TO LOAD PROFILE')
      setShowProfileSetup(false)
    }
  }

  const handleSignupError = (error: string) => {
    setConnectionError(error)
    setShowProfileSetup(false)
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
                  href="https://xaman.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xah-blue hover:text-primary-700 font-semibold uppercase transition-colors"
                >
                  <img 
                    src={xamanLogo} 
                    alt="Xaman logo"
                    className="w-5 h-5 object-contain"
                  />
                  Download Xaman (Recommended) →
                </a>
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
                  Install Crossmark →
                </a>
                <a
                  href="https://gemwallet.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xah-blue hover:text-primary-700 font-semibold uppercase"
                >
                  💎 Install GemWallet →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Step Signup Modal */}
      {showProfileSetup && (
        <MultiStepSignupModal
          isOpen={showProfileSetup}
          walletAddress={walletAddress}
          onComplete={handleProfileComplete}
          onError={handleSignupError}
        />
      )}

      {/* Profile Found Confirmation Dialog */}
      {showProfileFound && foundProfile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 border-4 border-green-500/40 animate-[fadeIn_0.3s_ease-in-out]">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-6 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold uppercase tracking-tight">
                    PROFILE FOUND!
                  </h2>
                  <p className="text-sm text-white/90 uppercase tracking-wide">
                    WELCOME BACK
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="bg-gradient-to-br from-green-50 to-primary-50 rounded-xl p-5 mb-6 border-2 border-green-200">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">DISPLAY NAME</p>
                    <p className="text-lg font-bold text-gray-900 uppercase">{foundProfile.displayName}</p>
                  </div>
                  
                  {foundProfile.organizationName && (
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">ORGANIZATION</p>
                      <p className="text-lg font-bold text-gray-900 uppercase">{foundProfile.organizationName}</p>
                    </div>
                  )}
                  
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">ACCOUNT TYPE</p>
                    <p className="text-sm font-bold text-xah-blue uppercase">
                      {foundProfile.userType === 'employee' ? '👷 WORKER' : '🏢 NGO/EMPLOYER'}
                    </p>
                  </div>

                  {foundProfile.email && (
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">EMAIL</p>
                      <p className="text-sm text-gray-700">{foundProfile.email}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowProfileFound(false)
                    setFoundProfile(null)
                    onClose()
                  }}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors uppercase text-sm border-2 border-gray-300"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleSignInWithFoundProfile}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all uppercase text-sm shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  ✓ SIGN IN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletSelectionModal
