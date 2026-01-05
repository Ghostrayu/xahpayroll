# XAH Payroll - Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Install Dependencies

```bash
npm run install:all
```

This will install dependencies for:
- Root project
- Frontend (React + Vite + Multi-Wallet Support)
- Backend (Express + PostgreSQL + Xaman API)

### Step 2: Configure Environment

#### Backend Configuration
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your Xaman API credentials:
```env
XAMAN_API_KEY=your_xaman_api_key_here
XAMAN_API_SECRET=your_xaman_api_secret_here
```

Get your credentials from: https://apps.xumm.dev/

#### Frontend Configuration
```bash
cd frontend
cp .env.example .env
```

The frontend `.env` should already have:
```env
VITE_BACKEND_URL=http://localhost:3001
```

### Step 3: Start Development

From the root directory:

```bash
npm run dev
```

This will:
- ✅ Start the backend API server on `http://localhost:3001`
- ✅ Start the frontend dev server on `http://localhost:3000`
- ✅ Automatically open your browser to the app

## 📱 Testing Wallet Connection

### Xaman (Primary Wallet - RECOMMENDED FOR PRODUCTION)
1. Install Xaman app from https://xaman.app
2. Create or import your wallet
3. Click "Connect Wallet" on XAH Payroll
4. Scan QR code with Xaman mobile app (or click deep link on desktop)
5. Approve the sign-in in Xaman app

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

### For Workers:
1. Connect your wallet (must not be registered as NGO/Employer)
2. Complete your profile and accept Terms of Service
3. Navigate to Worker Dashboard
4. Start logging hours
5. Receive payment when channel closes (all accumulated earnings in single transaction)

### For NGOs/Employers:
1. Connect your wallet (must not be registered as Employee)
2. Complete your organization profile and accept Terms of Service
3. Navigate to NGO Dashboard
4. Add workers
5. Fund escrow
6. Monitor payments

## 🔧 Troubleshooting

### Backend won't start
- Check that port 3001 is not in use
- Verify Xaman API credentials in `backend/.env`
- Run `cd backend && npm install` to ensure dependencies are installed

### Frontend won't start
- Check that port 3000 is not in use
- Verify `VITE_BACKEND_URL` in `frontend/.env`
- Run `cd frontend && npm install` to ensure dependencies are installed

### Wallet connection fails
- **Xaman**: Ensure backend is running and API credentials are valid
- **Manual Mode**: Verify seed/address format is correct

### CORS errors
- Make sure backend is running on port 3001
- Check that `FRONTEND_URL` in `backend/.env` matches your frontend URL

## 📚 Additional Resources

- [Backend API Documentation](./backend/README.md)
- [Main README](./README.md)
- [Xaman Developer Docs](https://xumm.readme.io/)
- [XRPL Documentation](https://xrpl.org/)

## 💡 Pro Tips

1. **Use Xaman for production** - Enterprise-grade security and official XRPL support
2. **Use Manual mode for quick testing** - Faster iteration during development
3. **Keep both terminals visible** - Watch backend and frontend logs simultaneously
4. **Check browser console** - Useful for debugging wallet connections
5. **Test on testnet first** - Use testnet XAH before going to mainnet

## 🆘 Need Help?

- Check the browser console (F12) for errors
- Check terminal output for backend errors
- Verify all environment variables are set correctly
- Ensure you're using Node.js v18 or higher

Happy coding! 🎉
