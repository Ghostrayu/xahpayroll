# XAH Payroll - Development Commands

## Quick Start
```bash
# Install all dependencies (root + frontend + backend)
npm run install:all

# Start both servers concurrently
npm run dev
# Backend: http://localhost:3001
# Frontend: http://localhost:3000 (auto-opens)

# Health check
curl http://localhost:3001/health
```

## Individual Server Control
```bash
# Backend only (port 3001)
npm run dev:backend

# Frontend only (port 3000)
npm run dev:frontend

# Frontend with network access (for mobile testing)
npm run dev:host
```

## Building & Quality
```bash
# Build frontend for production
npm run build

# Preview production build
npm run preview

# Run linter (frontend only)
npm run lint

# Format code (backend)
cd backend && npm run format
```

## Database Operations
```bash
# Initialize database schema
cd backend && npm run init-db

# Test database connection
cd backend && npm run test:db
```

## Deployment
```bash
# Deploy to production (Netlify)
npm run deploy

# Deploy preview environment
npm run deploy:preview
```

## Testing
```bash
# Run backend tests
cd backend && npm test
```

## System Commands (macOS/Darwin)
```bash
# Find files
find . -name "*.ts" -type f

# Search content
grep -r "pattern" src/

# List files
ls -la

# Git operations
git status
git branch
git log --oneline -10
```

## Network Switching
Edit environment files and restart:
- Frontend: `frontend/.env` → `VITE_XRPL_NETWORK=testnet` or `mainnet`
- Backend: `backend/.env` → `XRPL_NETWORK=testnet` or `mainnet`
Then: `npm run dev` (restart required)
