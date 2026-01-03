/**
 * Network Utilities
 *
 * Helper functions for generating network-aware URLs and handling
 * network-specific configurations.
 */

/**
 * Get the appropriate Xahau explorer base URL based on network
 *
 * @param network - The network type ('mainnet' or 'testnet')
 * @returns Base URL for the Xahau explorer
 */
export function getExplorerBaseUrl(network: string): string {
  return network === 'mainnet'
    ? 'https://explorer.xahau.network'
    : 'https://explorer.xahau-test.net'
}

/**
 * Get the full explorer URL for a transaction hash
 *
 * @param txHash - The transaction hash
 * @param network - The network type ('mainnet' or 'testnet')
 * @returns Full URL to view the transaction on the explorer
 *
 * @example
 * ```ts
 * const url = getTransactionExplorerUrl('790FF73D...', 'testnet')
 * // Returns: 'https://explorer.xahau-test.net/tx/790FF73D...'
 * ```
 */
export function getTransactionExplorerUrl(txHash: string, network: string): string {
  const baseUrl = getExplorerBaseUrl(network)
  return `${baseUrl}/tx/${txHash}`
}

/**
 * Get the full explorer URL for an account/wallet address
 *
 * @param address - The wallet address
 * @param network - The network type ('mainnet' or 'testnet')
 * @returns Full URL to view the account on the explorer
 *
 * @example
 * ```ts
 * const url = getAccountExplorerUrl('rN7n7otQDd6FczFgLdlqtyMVrn3z1rhWT', 'mainnet')
 * // Returns: 'https://explorer.xahau.network/rN7n7otQDd6FczFgLdlqtyMVrn3z1rhWT'
 * ```
 */
export function getAccountExplorerUrl(address: string, network: string): string {
  const baseUrl = getExplorerBaseUrl(network)
  return `${baseUrl}/${address}`
}

/**
 * Get the current network from environment variables
 *
 * @returns The network type ('mainnet' or 'testnet')
 */
export function getCurrentNetwork(): string {
  return import.meta.env.VITE_XRPL_NETWORK || 'testnet'
}

/**
 * Check if the current network is testnet
 *
 * @param network - The network type to check
 * @returns True if testnet, false otherwise
 */
export function isTestnet(network?: string): boolean {
  const currentNetwork = network || getCurrentNetwork()
  return currentNetwork === 'testnet'
}

/**
 * Check if the current network is mainnet
 *
 * @param network - The network type to check
 * @returns True if mainnet, false otherwise
 */
export function isMainnet(network?: string): boolean {
  const currentNetwork = network || getCurrentNetwork()
  return currentNetwork === 'mainnet'
}
