#!/usr/bin/env node

/**
 * Environment Configuration Validation Script
 *
 * Validates that frontend and backend .env files have matching network configurations
 * to prevent deployment with mismatched environments.
 *
 * Usage:
 *   node scripts/validate-env.js
 *   npm run validate:env
 *
 * Exit Codes:
 *   0 - Validation passed
 *   1 - Validation failed (network mismatch or missing files)
 */

const fs = require('fs')
const path = require('path')

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
}

/**
 * Parse .env file into key-value object
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const env = {}

  content.split('\n').forEach(line => {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || !line.trim()) {
      return
    }

    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      let value = match[2].trim()

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      env[key] = value
    }
  })

  return env
}

/**
 * Validate network configuration between frontend and backend
 */
function validateNetworkConfig() {
  console.log(`\n${colors.bold}🔍 ENVIRONMENT CONFIGURATION VALIDATION${colors.reset}\n`)

  const rootDir = path.join(__dirname, '..')
  const frontendEnvPath = path.join(rootDir, 'frontend', '.env')
  const backendEnvPath = path.join(rootDir, 'backend', '.env')

  // Check if .env files exist
  const frontendExists = fs.existsSync(frontendEnvPath)
  const backendExists = fs.existsSync(backendEnvPath)

  if (!frontendExists || !backendExists) {
    console.error(`${colors.red}${colors.bold}❌ VALIDATION FAILED${colors.reset}`)
    console.error(`\n${colors.red}MISSING ENVIRONMENT FILES:${colors.reset}`)

    if (!frontendExists) {
      console.error(`  - frontend/.env ${colors.red}(NOT FOUND)${colors.reset}`)
      console.error(`    ${colors.yellow}→ Copy frontend/.env.example to frontend/.env${colors.reset}`)
    }

    if (!backendExists) {
      console.error(`  - backend/.env ${colors.red}(NOT FOUND)${colors.reset}`)
      console.error(`    ${colors.yellow}→ Copy backend/.env.example to backend/.env${colors.reset}`)
    }

    console.error('')
    return false
  }

  // Parse .env files
  const frontendEnv = parseEnvFile(frontendEnvPath)
  const backendEnv = parseEnvFile(backendEnvPath)

  const frontendNetwork = frontendEnv.VITE_XRPL_NETWORK || 'testnet'
  const backendNetwork = backendEnv.XRPL_NETWORK || 'testnet'

  // Display current configuration
  console.log(`${colors.blue}CURRENT CONFIGURATION:${colors.reset}`)
  console.log(`  Frontend Network: ${colors.bold}${frontendNetwork}${colors.reset}`)
  console.log(`  Backend Network:  ${colors.bold}${backendNetwork}${colors.reset}`)
  console.log('')

  // Check for network mismatch
  if (frontendNetwork !== backendNetwork) {
    console.error(`${colors.red}${colors.bold}❌ NETWORK MISMATCH DETECTED!${colors.reset}`)
    console.error(`\n${colors.red}FRONTEND: ${frontendNetwork.toUpperCase()}${colors.reset}`)
    console.error(`${colors.red}BACKEND:  ${backendNetwork.toUpperCase()}${colors.reset}`)
    console.error(`\n${colors.yellow}HOW TO FIX:${colors.reset}`)
    console.error(`  1. Choose target network (testnet or mainnet)`)
    console.error(`  2. Update frontend/.env → VITE_XRPL_NETWORK=${backendNetwork}`)
    console.error(`  3. OR update backend/.env → XRPL_NETWORK=${frontendNetwork}`)
    console.error(`  4. Restart both servers\n`)
    return false
  }

  // Validation passed
  console.log(`${colors.green}${colors.bold}✅ NETWORK CONFIGURATION VALID${colors.reset}`)
  console.log(`${colors.green}Both frontend and backend are configured for: ${frontendNetwork.toUpperCase()}${colors.reset}\n`)

  // Additional validation warnings
  const warnings = []

  // Check for missing backend URL
  if (!frontendEnv.VITE_BACKEND_URL) {
    warnings.push('VITE_BACKEND_URL not set in frontend/.env (will default to http://localhost:3001)')
  }

  // Check for missing database configuration
  if (!backendEnv.DB_NAME) {
    warnings.push('DB_NAME not set in backend/.env (will default to xahpayroll)')
  }

  if (!backendEnv.DB_USER) {
    warnings.push('DB_USER not set in backend/.env')
  }

  if (!backendEnv.DB_PASSWORD) {
    warnings.push('DB_PASSWORD not set in backend/.env')
  }

  // Check for production-ready secrets
  if (backendEnv.JWT_SECRET === 'your_jwt_secret_here') {
    warnings.push('JWT_SECRET still using default value (INSECURE - change before production!)')
  }

  if (backendEnv.DB_PASSWORD === 'CHANGE_THIS_PASSWORD') {
    warnings.push('DB_PASSWORD still using default value (INSECURE - change before production!)')
  }

  // Display warnings if any
  if (warnings.length > 0) {
    console.log(`${colors.yellow}⚠️  CONFIGURATION WARNINGS:${colors.reset}`)
    warnings.forEach(warning => {
      console.log(`  - ${warning}`)
    })
    console.log('')
  }

  return true
}

/**
 * Main execution
 */
function main() {
  const isValid = validateNetworkConfig()
  process.exit(isValid ? 0 : 1)
}

// Run validation
main()
