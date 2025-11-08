import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Client, Wallet, dropsToXrp, xrpToDrops } from 'xrpl'
import { getAddress as gemWalletGetAddress, isInstalled as gemWalletIsInstalled } from '@gemwallet/api'

// Types
export type NetworkType = 'testnet' | 'mainnet'
export type WalletProvider = 'xaman' | 'crossmark' | 'gemwallet' | 'manual'

export interface WalletContextType {
  isConnected: boolean
  walletAddress: string
  balance: string
  reserve: string
  network: NetworkType
  provider: WalletProvider | null
  isLoading: boolean
  error: string | null
  xamanQrUrl: string | null
  connectWallet: (provider: WalletProvider, address?: string, seed?: string) => Promise<void>
  disconnectWallet: () => void
  getBalance: () => Promise<void>
  sendPayment: (destination: string, amount: string, memo?: string) => Promise<string>
  signTransaction: (transaction: any) => Promise<any>
}

interface WalletProviderProps {
  children: ReactNode
}

interface WalletState {
  isConnected: boolean
  walletAddress: string
  balance: string
  reserve: string
  network: NetworkType
  provider: WalletProvider | null
  isLoading: boolean
  error: string | null
  xamanQrUrl: string | null
}

// Create Context
const WalletContext = createContext<WalletContextType | undefined>(undefined)

// Local Storage Keys
const WALLET_STORAGE_KEY = 'xahpayroll_wallet'

// XRPL Client instance
let xrplClient: Client | null = null

// Provider Component
export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    walletAddress: '',
    balance: '0',
    reserve: '0',
    network: 'mainnet',
    provider: null,
    isLoading: false,
    error: null,
    xamanQrUrl: null
  })

  // Store wallet instance for manual connections
  const [walletInstance, setWalletInstance] = useState<Wallet | null>(null)

  // Initialize XRPL Client
  const initializeClient = async (network: NetworkType = 'mainnet') => {
    try {
      if (xrplClient && xrplClient.isConnected()) {
        return xrplClient
      }

      // XAH Ledger (Xahau) WebSocket URLs
      const wsUrl = network === 'testnet' 
        ? 'wss://xahau-test.net'
        : 'wss://xahau.network'

      xrplClient = new Client(wsUrl)
      await xrplClient.connect()
      console.log('XAH Ledger Client connected to', network)
      return xrplClient
    } catch (error) {
      console.error('Failed to initialize XRPL client:', error)
      throw new Error('Failed to connect to XRPL network')
    }
  }

  // Load wallet state from localStorage on mount
  useEffect(() => {
    const savedWallet = localStorage.getItem(WALLET_STORAGE_KEY)
    if (savedWallet) {
      try {
        const parsed = JSON.parse(savedWallet)
        // Only restore connection state, not sensitive data
        if (parsed.isConnected && parsed.walletAddress) {
          // Force mainnet for all connections (migration from testnet)
          const network: NetworkType = 'mainnet'
          
          setWalletState(prev => ({
            ...prev,
            isConnected: parsed.isConnected,
            walletAddress: parsed.walletAddress,
            network: network,
            provider: parsed.provider || null
          }))
          
          // Reconnect and fetch balance
          initializeClient(network).then(() => {
            getBalanceForAddress(parsed.walletAddress, network)
          })
        }
      } catch (error) {
        console.error('Failed to parse wallet state from localStorage:', error)
        localStorage.removeItem(WALLET_STORAGE_KEY)
      }
    }

    // Cleanup on unmount
    return () => {
      if (xrplClient && xrplClient.isConnected()) {
        xrplClient.disconnect().catch(console.error)
      }
    }
  }, [])

  // Save wallet state to localStorage whenever it changes
  useEffect(() => {
    if (walletState.isConnected) {
      const stateToSave = {
        isConnected: walletState.isConnected,
        walletAddress: walletState.walletAddress,
        network: walletState.network,
        provider: walletState.provider
        // Never save balance or sensitive data
      }
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(stateToSave))
    } else {
      localStorage.removeItem(WALLET_STORAGE_KEY)
    }
  }, [walletState.isConnected, walletState.walletAddress, walletState.network, walletState.provider])

  // Get balance for a specific address
  const getBalanceForAddress = async (address: string, network: NetworkType = 'mainnet') => {
    try {
      const client = await initializeClient(network)
      const response = await client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated'
      })
      
      const balanceInXRP = dropsToXrp(response.result.account_data.Balance)
      const ownerCount = response.result.account_data.OwnerCount || 0
      
      // Calculate reserve: Base reserve (1 XAH) + Owner reserve (0.2 XAH per object)
      const baseReserve = 1
      const ownerReserve = ownerCount * 0.2
      const totalReserve = baseReserve + ownerReserve
      
      // Available balance = Total balance - Reserve
      const availableBalance = String(Math.max(0, parseFloat(balanceInXRP) - totalReserve))
      
      setWalletState(prev => ({
        ...prev,
        balance: availableBalance,
        reserve: String(totalReserve),
        error: null
      }))
    } catch (error: any) {
      console.log('Balance fetch info:', error.message)
      
      // "Account not found" is normal for unfunded testnet accounts - don't show as error
      if (error.message && error.message.includes('Account not found')) {
        setWalletState(prev => ({
          ...prev,
          balance: '0',
          error: null // Don't show error for unfunded accounts
        }))
      } else {
        console.error('Failed to fetch balance:', error)
        setWalletState(prev => ({
          ...prev,
          balance: '0',
          error: error.message || 'Failed to fetch balance'
        }))
      }
    }
  }

  // Connect Wallet function
  const connectWallet = async (
    provider: WalletProvider, 
    address?: string, 
    seed?: string
  ): Promise<void> => {
    setWalletState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const network: NetworkType = 'mainnet' // Use mainnet for production

      switch (provider) {
        case 'xaman':
          // Xaman integration via backend proxy
          try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
            
            console.log('Initializing Xaman connection via backend...')
            console.log('Network:', network)
            console.log('Backend URL:', backendUrl)
            
            // Call backend to create sign-in payload
            const response = await fetch(`${backendUrl}/api/xaman/create-signin`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                returnUrl: window.location.origin
              })
            })
            
            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(errorData.error?.message || 'Failed to create Xaman sign-in request')
            }
            
            const { data: request } = await response.json()
            
            console.log('Xaman payload created:', request.uuid)
            
            if (!request || !request.uuid) {
              throw new Error('Failed to create Xaman sign-in request')
            }

            // Set QR code URL for display
            const qrUrl = request.qrUrl
            setWalletState(prev => ({
              ...prev,
              xamanQrUrl: qrUrl,
              isLoading: true
            }))

            // Poll for payload status instead of websocket subscription
            const pollPayloadStatus = async () => {
              const maxAttempts = 60 // Poll for up to 5 minutes (60 * 5 seconds)
              let attempts = 0

              while (attempts < maxAttempts) {
                try {
                  const statusResponse = await fetch(`${backendUrl}/api/xaman/payload/${request.uuid}`)
                  
                  if (!statusResponse.ok) {
                    throw new Error('Failed to check payload status')
                  }

                  const { data: payloadStatus } = await statusResponse.json()

                  if (payloadStatus.signed && payloadStatus.account) {
                    // User signed in successfully
                    const walletAddress = payloadStatus.account
                    await initializeClient(network)
                    await getBalanceForAddress(walletAddress, network)
                    
                    setWalletState(prev => ({
                      ...prev,
                      isConnected: true,
                      walletAddress,
                      network,
                      provider: 'xaman',
                      isLoading: false,
                      error: null,
                      xamanQrUrl: null
                    }))
                    return
                  } else if (payloadStatus.resolved && !payloadStatus.signed) {
                    // User rejected the sign-in
                    throw new Error('Xaman sign-in was rejected or cancelled')
                  } else if (payloadStatus.expired) {
                    throw new Error('Xaman sign-in request expired')
                  }

                  // Wait 5 seconds before next poll
                  await new Promise(resolve => setTimeout(resolve, 5000))
                  attempts++
                } catch (pollError) {
                  console.error('Error polling payload status:', pollError)
                  throw pollError
                }
              }

              throw new Error('Xaman sign-in request timed out')
            }

            await pollPayloadStatus()
          } catch (xamanError: any) {
            console.error('Xaman connection error:', xamanError)
            console.error('Error details:', {
              message: xamanError.message,
              response: xamanError.response,
              data: xamanError.response?.data
            })
            
            setWalletState(prev => ({
              ...prev,
              xamanQrUrl: null,
              isLoading: false
            }))
            
            // Provide more helpful error message
            let errorMessage = 'Failed to connect with Xaman'
            if (xamanError.message?.includes('API')) {
              errorMessage = 'Invalid Xaman API credentials. Please check your API key and secret.'
            } else if (xamanError.response?.data?.error) {
              errorMessage = `Xaman API Error: ${xamanError.response.data.error}`
            }
            
            throw new Error(errorMessage)
          }
          break

        case 'crossmark':
          // Check if Crossmark extension is installed
          if (typeof window !== 'undefined' && (window as any).crossmark) {
            const crossmark = (window as any).crossmark
            
            // Request address from Crossmark
            const result = await crossmark.methods.signInAndWait()
            
            if (result && result.response && result.response.data && result.response.data.address) {
              const walletAddress = result.response.data.address
              await initializeClient(network)
              await getBalanceForAddress(walletAddress, network)
              
              setWalletState(prev => ({
                ...prev,
                isConnected: true,
                walletAddress,
                network,
                provider: 'crossmark',
                isLoading: false,
                error: null
              }))
            } else {
              throw new Error('Failed to connect with Crossmark. Please approve the connection request.')
            }
          } else {
            throw new Error('Crossmark extension not found. Please install it from https://crossmark.io')
          }
          break

        case 'gemwallet':
          // Connect to GemWallet using @gemwallet/api package
          try {
            // Check if GemWallet is installed
            const installCheck = await gemWalletIsInstalled()
            
            if (!installCheck.result.isInstalled) {
              throw new Error('GemWallet extension not found. Please install it from https://gemwallet.app and refresh the page.')
            }
            
            // Get address from GemWallet
            const response = await gemWalletGetAddress()
            
            if (response.type === 'response' && response.result?.address) {
              const walletAddress = response.result.address
              await initializeClient(network)
              await getBalanceForAddress(walletAddress, network)
              
              setWalletState(prev => ({
                ...prev,
                isConnected: true,
                walletAddress,
                network,
                provider: 'gemwallet',
                isLoading: false,
                error: null
              }))
            } else if (response.type === 'reject') {
              throw new Error('Connection rejected. Please approve the request in GemWallet.')
            } else {
              throw new Error('Failed to get address from GemWallet.')
            }
          } catch (gemError: any) {
            console.error('GemWallet connection error:', gemError)
            throw new Error(gemError.message || 'Failed to connect with GemWallet. Please make sure the extension is installed.')
          }
          break

        case 'manual':
          // Manual connection with address or seed
          if (seed) {
            // Connect using seed (for testing/development only)
            const wallet = Wallet.fromSeed(seed)
            setWalletInstance(wallet)
            await initializeClient(network)
            await getBalanceForAddress(wallet.address, network)
            
            setWalletState(prev => ({
              ...prev,
              isConnected: true,
              walletAddress: wallet.address,
              network,
              provider: 'manual',
              isLoading: false,
              error: null
            }))
          } else if (address) {
            // Connect using address only (read-only mode)
            await initializeClient(network)
            await getBalanceForAddress(address, network)
            
            setWalletState(prev => ({
              ...prev,
              isConnected: true,
              walletAddress: address,
              network,
              provider: 'manual',
              isLoading: false,
              error: null
            }))
          } else {
            throw new Error('Manual connection requires either an address or seed')
          }
          break

        default:
          throw new Error(`Unsupported wallet provider: ${provider}`)
      }
    } catch (error: any) {
      console.error('Failed to connect wallet:', error)
      setWalletState(prev => ({
        ...prev,
        isConnected: false,
        isLoading: false,
        error: error.message || 'Failed to connect wallet'
      }))
      throw error
    }
  }

  // Disconnect Wallet function
  const disconnectWallet = () => {
    setWalletState({
      isConnected: false,
      walletAddress: '',
      balance: '0',
      reserve: '0',
      network: 'mainnet',
      provider: null,
      isLoading: false,
      error: null,
      xamanQrUrl: null
    })
    setWalletInstance(null)
    localStorage.removeItem(WALLET_STORAGE_KEY)

    // Disconnect XRPL client
    if (xrplClient && xrplClient.isConnected()) {
      xrplClient.disconnect().catch(console.error)
      xrplClient = null
    }
  }

  // Get Balance function
  const getBalance = async (): Promise<void> => {
    if (!walletState.isConnected || !walletState.walletAddress) {
      throw new Error('Wallet not connected')
    }

    await getBalanceForAddress(walletState.walletAddress, walletState.network)
  }

  // Send Payment function
  const sendPayment = async (
    destination: string, 
    amount: string, 
    memo?: string
  ): Promise<string> => {
    if (!walletState.isConnected || !walletState.walletAddress) {
      throw new Error('Wallet not connected')
    }

    try {
      const client = await initializeClient(walletState.network)

      // Build payment transaction
      const payment: any = {
        TransactionType: 'Payment',
        Account: walletState.walletAddress,
        Destination: destination,
        Amount: xrpToDrops(amount)
      }

      // Add memo if provided
      if (memo) {
        payment.Memos = [{
          Memo: {
            MemoData: Buffer.from(memo, 'utf8').toString('hex').toUpperCase()
          }
        }]
      }

      let result: any

      // Sign and submit based on provider
      switch (walletState.provider) {
        case 'crossmark':
          if (typeof window !== 'undefined' && (window as any).crossmark) {
            const crossmark = (window as any).crossmark
            const signedTx = await crossmark.signAndSubmit(payment)
            result = signedTx.response.data
          } else {
            throw new Error('Crossmark not available')
          }
          break

        case 'gemwallet':
          if (typeof window !== 'undefined' && (window as any).gemWallet) {
            const gemWallet = (window as any).gemWallet
            const signedTx = await gemWallet.signAndSubmit(payment)
            result = signedTx
          } else {
            throw new Error('GemWallet not available')
          }
          break

        case 'manual':
          if (!walletInstance) {
            throw new Error('Manual wallet not initialized with seed. Cannot sign transactions.')
          }
          // Prepare transaction
          const prepared = await client.autofill(payment)
          // Sign transaction
          const signed = walletInstance.sign(prepared)
          // Submit transaction
          result = await client.submitAndWait(signed.tx_blob)
          break

        default:
          throw new Error('Unsupported wallet provider for transactions')
      }

      // Refresh balance after successful payment
      await getBalance()

      return result.hash || result.tx_json?.hash || 'Transaction submitted'
    } catch (error: any) {
      console.error('Failed to send payment:', error)
      setWalletState(prev => ({
        ...prev,
        error: error.message || 'Failed to send payment'
      }))
      throw error
    }
  }

  // Sign Transaction function (for custom transactions)
  const signTransaction = async (transaction: any): Promise<any> => {
    if (!walletState.isConnected || !walletState.walletAddress) {
      throw new Error('Wallet not connected')
    }

    try {
      const client = await initializeClient(walletState.network)

      switch (walletState.provider) {
        case 'crossmark':
          if (typeof window !== 'undefined' && (window as any).crossmark) {
            const crossmark = (window as any).crossmark
            const result = await crossmark.sign(transaction)
            return result.response.data
          }
          throw new Error('Crossmark not available')

        case 'gemwallet':
          if (typeof window !== 'undefined' && (window as any).gemWallet) {
            const gemWallet = (window as any).gemWallet
            const result = await gemWallet.sign(transaction)
            return result
          }
          throw new Error('GemWallet not available')

        case 'manual':
          if (!walletInstance) {
            throw new Error('Manual wallet not initialized with seed. Cannot sign transactions.')
          }
          const prepared = await client.autofill(transaction)
          const signed = walletInstance.sign(prepared)
          return signed
          
        default:
          throw new Error('Unsupported wallet provider for signing')
      }
    } catch (error: any) {
      console.error('Failed to sign transaction:', error)
      setWalletState(prev => ({
        ...prev,
        error: error.message || 'Failed to sign transaction'
      }))
      throw error
    }
  }

  const value: WalletContextType = {
    isConnected: walletState.isConnected,
    walletAddress: walletState.walletAddress,
    balance: walletState.balance,
    reserve: walletState.reserve,
    network: walletState.network,
    provider: walletState.provider,
    isLoading: walletState.isLoading,
    error: walletState.error,
    xamanQrUrl: walletState.xamanQrUrl,
    connectWallet,
    disconnectWallet,
    getBalance,
    sendPayment,
    signTransaction
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

// Custom Hook
export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

export default WalletContext
