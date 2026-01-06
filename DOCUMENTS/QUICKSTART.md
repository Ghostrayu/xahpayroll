# XAH PAYROLL - QUICK START GUIDE

## 🚀 GET STARTED IN 3 STEPS

### STEP 1: INSTALL DEPENDENCIES

```bash
npm run install:all
```

THIS WILL INSTALL DEPENDENCIES FOR:
- ROOT PROJECT
- FRONTEND (REACT + VITE + MULTI-WALLET SUPPORT)
- BACKEND (EXPRESS + POSTGRESQL + XAMAN API)

### STEP 2: CONFIGURE ENVIRONMENT

#### BACKEND CONFIGURATION
```bash
cd backend
cp .env.example .env
```

EDIT `BACKEND/.ENV` AND ADD YOUR XAMAN API CREDENTIALS:
```env
XAMAN_API_KEY=your_xaman_api_key_here
XAMAN_API_SECRET=your_xaman_api_secret_here
```

GET YOUR CREDENTIALS FROM: https://apps.xumm.dev/

#### FRONTEND CONFIGURATION
```bash
cd frontend
cp .env.example .env
```

THE FRONTEND `.ENV` SHOULD ALREADY HAVE:
```env
VITE_BACKEND_URL=http://localhost:3001
```

### STEP 3: START DEVELOPMENT

FROM THE ROOT DIRECTORY:

```bash
npm run dev
```

THIS WILL:
- ✅ START THE BACKEND API SERVER ON `http://localhost:3001`
- ✅ START THE FRONTEND DEV SERVER ON `http://localhost:3000`
- ✅ AUTOMATICALLY OPEN YOUR BROWSER TO THE APP

## 📱 TESTING WALLET CONNECTION

### XAMAN (PRIMARY WALLET - RECOMMENDED FOR PRODUCTION)
1. INSTALL XAMAN APP FROM https://xaman.app
2. CREATE OR IMPORT YOUR WALLET
3. CLICK "CONNECT WALLET" ON XAH PAYROLL
4. SCAN QR CODE WITH XAMAN MOBILE APP (OR CLICK DEEP LINK ON DESKTOP)
5. APPROVE THE SIGN-IN IN XAMAN APP

**WHY XAMAN?**
- ✅ Most secure option (enterprise-grade security)
- ✅ Works on any device (QR code scanning)
- ✅ Official XRPL Foundation supported
- ✅ Hardware security module (HSM) support
- ✅ Biometric authentication

### Manual Mode (Testing Only - NOT FOR PRODUCTION)
- Direct seed/address input for development and debugging
- ⚠️ NEVER use with real funds or production wallets
- ⚠️ Only for testnet development

## 🎯 What's Next?

### ⚠️ IMPORTANT: Wallet Address Restrictions
**A wallet address can only be registered as EITHER an Employee OR an NGO/Employer, NOT both.**
- Use separate wallet addresses for different account types
- If your wallet is already registered as an Employee, you cannot use it for NGO/Employer
- If your wallet is already registered as NGO/Employer, you cannot use it for Employee
- Switching between NGO and Employer is allowed (both are organization types)

### FOR WORKERS:
1. CONNECT YOUR WALLET (MUST NOT BE REGISTERED AS NGO/EMPLOYER)
2. COMPLETE YOUR PROFILE AND ACCEPT TERMS OF SERVICE
3. NAVIGATE TO WORKER DASHBOARD
4. START LOGGING HOURS
5. RECEIVE PAYMENT WHEN CHANNEL CLOSES (ALL ACCUMULATED EARNINGS IN SINGLE TRANSACTION)

### FOR NGOS/EMPLOYERS:
1. CONNECT YOUR WALLET (MUST NOT BE REGISTERED AS EMPLOYEE)

## TROUBLESHOOTING

### BACKEND WON'T START
- CHECK THAT PORT 3001 IS NOT IN USE
- VERIFY XAMAN API CREDENTIALS IN `BACKEND/.ENV`
- RUN `CD BACKEND && NPM INSTALL` TO ENSURE DEPENDENCIES ARE INSTALLED

### FRONTEND WON'T START
- CHECK THAT PORT 3000 IS NOT IN USE
- VERIFY `VITE_BACKEND_URL` IN `FRONTEND/.ENV`
- RUN `CD FRONTEND && NPM INSTALL` TO ENSURE DEPENDENCIES ARE INSTALLED

### WALLET CONNECTION FAILS
- **XAMAN**: ENSURE BACKEND IS RUNNING AND API CREDENTIALS ARE VALID
- **MANUAL MODE**: VERIFY SEED/ADDRESS FORMAT IS CORRECT

### CORS ERRORS
- MAKE SURE BACKEND IS RUNNING ON PORT 3001
- CHECK THAT `FRONTEND_URL` IN `BACKEND/.ENV` MATCHES YOUR FRONTEND URL

## ADDITIONAL RESOURCES

- [BACKEND API DOCUMENTATION](./BACKEND/README.MD)
- [MAIN README](./README.MD)
- [XAMAN DEVELOPER DOCS](https://xumm.readme.io/)
- [XRPL DOCUMENTATION](https://xrpl.org/)

## PRO TIPS

1. **USE XAMAN FOR PRODUCTION** - ENTERPRISE-GRADE SECURITY AND OFFICIAL XRPL SUPPORT
2. **USE MANUAL MODE FOR QUICK TESTING** - FASTER ITERATION DURING DEVELOPMENT
3. **KEEP BOTH TERMINALS VISIBLE** - WATCH BACKEND AND FRONTEND LOGS SIMULTANEOUSLY
4. **CHECK BROWSER CONSOLE** - USEFUL FOR DEBUGGING WALLET CONNECTIONS
5. **TEST ON TESTNET FIRST** - USE TESTNET XAH BEFORE GOING TO MAINNET
2. **Use Manual mode for quick testing** - Faster iteration during development
3. **Keep both terminals visible** - Watch backend and frontend logs simultaneously
4. **Check browser console** - Useful for debugging wallet connections
5. **Test on testnet first** - Use testnet XAH before going to mainnet

## 🆘 NEED HELP?

- CHECK THE BROWSER CONSOLE (F12) FOR ERRORS
- CHECK TERMINAL OUTPUT FOR BACKEND ERRORS
- VERIFY ALL ENVIRONMENT VARIABLES ARE SET CORRECTLY
- Ensure you're using Node.js v18 or higher

Happy coding! 🎉
