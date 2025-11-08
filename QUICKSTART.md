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

### Option 1: Xaman (Mobile Wallet)
1. Click "Connect Wallet"
2. Select "Xaman (Xumm)"
3. Scan QR code with Xaman mobile app
4. Approve the sign-in

### Option 2: Crossmark (Browser Extension) - Recommended
1. Install Crossmark from https://crossmark.io
2. Set up your wallet
3. Click "Connect Wallet"
4. Select "Crossmark"
5. Approve in the extension popup

### Option 3: GemWallet (Browser Extension)
1. Install GemWallet from https://gemwallet.app
2. Set up your wallet
3. Click "Connect Wallet"
4. Select "GemWallet"
5. Approve in the extension popup

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
5. Receive automatic hourly payments

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
- **Crossmark/GemWallet**: Ensure browser extension is installed and unlocked

### CORS errors
- Make sure backend is running on port 3001
- Check that `FRONTEND_URL` in `backend/.env` matches your frontend URL

## 📚 Additional Resources

- [Backend API Documentation](./backend/README.md)
- [Main README](./README.md)
- [Xaman Developer Docs](https://xumm.readme.io/)
- [XRPL Documentation](https://xrpl.org/)

## 💡 Pro Tips

1. **Use Crossmark for testing** - It's faster than Xaman for development
2. **Keep both terminals visible** - Watch backend and frontend logs simultaneously
3. **Check browser console** - Useful for debugging wallet connections
4. **Test on testnet first** - Use testnet XAH before going to mainnet

## 🆘 Need Help?

- Check the browser console (F12) for errors
- Check terminal output for backend errors
- Verify all environment variables are set correctly
- Ensure you're using Node.js v18 or higher

Happy coding! 🎉
