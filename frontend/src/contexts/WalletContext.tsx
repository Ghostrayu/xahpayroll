import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Client, Wallet, dropsToXrp, xrpToDrops } from 'xrpl'
import { XummSdk } from 'xumm-sdk'

// Types
export type NetworkType = 'testnet' | 'mainnet'
export type WalletProvider = 'xaman' | 'crossmark' | 'gemwallet' | 'manual'

export interface WalletContextType {
  isConnected: boolean
  walletAddress: string
  balance: string
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
    network: 'testnet',
    provider: null,
    isLoading: false,
    error: null,
    xamanQrUrl: null
  })

  // Store wallet instance for manual connections
  const [walletInstance, setWalletInstance] = useState<Wallet | null>(null)

  // Initialize XRPL Client
  const initializeClient = async (network: NetworkType = 'testnet') => {
    try {
      if (xrplClient && xrplClient.isConnected()) {
        return xrplClient
      }

      const wsUrl = network === 'testnet' 
        ? 'wss://s.altnet.rippletest.net:51233'
        : 'wss://xrplcluster.com'

      xrplClient = new Client(wsUrl)
      await xrplClient.connect()
      console.log('XRPL Client connected to', network)
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
          setWalletState(prev => ({
            ...prev,
            isConnected: parsed.isConnected,
            walletAddress: parsed.walletAddress,
            network: parsed.network || 'testnet',
            provider: parsed.provider || null
          }))
          
          // Reconnect and fetch balance
          initializeClient(parsed.network).then(() => {
            getBalanceForAddress(parsed.walletAddress, parsed.network)
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
  const getBalanceForAddress = async (address: string, network: NetworkType = 'testnet') => {
    try {
      const client = await initializeClient(network)
      const response = await client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated'
      })
      
      const balanceInXRP = dropsToXrp(response.result.account_data.Balance)
      setWalletState(prev => ({
        ...prev,
        balance: String(balanceInXRP),
        error: null
      }))
    } catch (error: any) {
      console.error('Failed to fetch balance:', error)
      setWalletState(prev => ({
        ...prev,
        balance: '0',
        error: error.message || 'Failed to fetch balance'
      }))
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
      const network: NetworkType = 'testnet' // Default to testnet for now

      switch (provider) {
        case 'xaman':
          // Xaman (formerly Xumm) integration
          try {
            // Initialize Xumm SDK (you'll need to add your API key and secret)
            const apiKey = process.env.REACT_APP_XAMAN_API_KEY
            const apiSecret = process.env.REACT_APP_XAMAN_API_SECRET
            
            if (!apiKey || !apiSecret) {
              throw new Error('Xaman API credentials not configured. Please set REACT_APP_XAMAN_API_KEY and REACT_APP_XAMAN_API_SECRET')
            }
            
            const xumm = new XummSdk(apiKey, apiSecret)
            
            // Create a sign-in request
            const request = await xumm.payload.create({
              txjson: {
                TransactionType: 'SignIn'
              }
            })
            
            if (!request || !request.uuid) {
              throw new Error('Failed to create Xaman sign-in request')
            }

            // Set QR code URL for display
            const qrUrl = request.refs.qr_png
            setWalletState(prev => ({
              ...prev,
              xamanQrUrl: qrUrl,
              isLoading: true
            }))

            // Wait for user to sign in
            const subscription: any = await xumm.payload.subscribe(
              request.uuid,
              (event: any) => {
                if (event.signed !== null) {
                  return event
                }
              }
            )

            if (subscription?.signed && subscription?.payload_uuidv4) {
              // Get the payload details to extract the account
              const payloadData: any = await xumm.payload.get(subscription.payload_uuidv4)
              
              if (payloadData && payloadData.response && payloadData.response.account) {
                const walletAddress = payloadData.response.account
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
              } else {
                throw new Error('Failed to get user account from Xaman')
              }
            } else {
              throw new Error('Xaman sign-in was rejected or cancelled')
            }
          } catch (xamanError: any) {
            console.error('Xaman connection error:', xamanError)
            setWalletState(prev => ({
              ...prev,
              xamanQrUrl: null,
              isLoading: false
            }))
            throw new Error(xamanError.message || 'Failed to connect with Xaman')
          }
          break

        case 'crossmark':
          // Check if Crossmark extension is installed
          if (typeof window !== 'undefined' && (window as any).crossmark) {
            const crossmark = (window as any).crossmark
            const result = await crossmark.signInAndWait()
            
            if (result && result.response && result.response.data) {
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
              throw new Error('Failed to connect with Crossmark')
            }
          } else {
            throw new Error('Crossmark extension not found. Please install it from the Chrome Web Store.')
          }
          break

        case 'gemwallet':
          // Check if GemWallet extension is installed
          if (typeof window !== 'undefined' && (window as any).gemWallet) {
            const gemWallet = (window as any).gemWallet
            const result = await gemWallet.getAddress()
            
            if (result && result.address) {
              const walletAddress = result.address
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
            } else {
              throw new Error('Failed to connect with GemWallet')
            }
          } else {
            throw new Error('GemWallet extension not found. Please install it from the Chrome Web Store.')
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
      network: 'testnet',
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
