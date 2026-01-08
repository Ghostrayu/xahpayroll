# NETLIFY FRONTEND DEPLOYMENT GUIDE

Complete guide for deploying the XAH Payroll frontend to Netlify.

**Last Updated**: 2026-01-07
**Deployment Platform**: Netlify
**Team**: GOOD MONEY COLLECTIVE
**Deployer**: Ghostrayu
**Branch**: main

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Deployment](#quick-deployment)
3. [Configuration](#configuration)
4. [Environment Variables](#environment-variables)
5. [Build Settings](#build-settings)
6. [Troubleshooting](#troubleshooting)
7. [Post-Deployment](#post-deployment)

---

## Prerequisites

### Required Accounts
- ✅ Netlify account (linked to GitHub)
- ✅ Member of GOOD MONEY COLLECTIVE team on Netlify
- ✅ GitHub repository access (Ghostrayu/xahpayroll)

### Required Files
- ✅ `netlify.toml` in repository root (already configured)
- ✅ `frontend/package.json` with build script
- ✅ `frontend/vite.config.ts` with proper build configuration

### Backend Requirements
- ✅ Backend deployed and accessible (Render deployment)
- ✅ Backend URL for CORS configuration
- ✅ XRPL network decision (testnet or mainnet)

---

## Quick Deployment

### Option 1: Netlify UI (Recommended)

1. **Login to Netlify**: https://app.netlify.com
2. **Select Team**: Switch to "GOOD MONEY COLLECTIVE" team
3. **New Site**: Click "Add new site" → "Import an existing project"
4. **Connect GitHub**: Select "GitHub" as Git provider
5. **Repository**: Choose `Ghostrayu/xahpayroll`
6. **Configure**:
   - **Branch**: `main`
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`
7. **Environment Variables**: Add required variables (see section below)
8. **Deploy**: Click "Deploy site"

### Option 2: Netlify CLI

```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Login to Netlify
netlify login

# Link to GOOD MONEY COLLECTIVE team
netlify link

# Deploy to production
cd /path/to/xahpayroll
npm run deploy

# Or deploy preview
npm run deploy:preview
```

---

## Configuration

### netlify.toml (Repository Root)

The `netlify.toml` file is **already configured** at the repository root with:

```toml
[build]
  base = "frontend"
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18"
  NPM_VERSION = "9"

# React Router SPA redirects
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
  force = false

# Security headers
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "geolocation=(), microphone=(), camera=()"

# Static asset caching
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

**Key Features**:
- ✅ Automatic React Router SPA support
- ✅ Security headers (DENY, nosniff, XSS protection)
- ✅ Optimized static asset caching
- ✅ Node.js 18 environment

---

## Environment Variables

### Required Variables

Add these in Netlify dashboard: **Site settings → Environment variables**

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_BACKEND_URL` | `https://your-backend.onrender.com` | Backend API endpoint (Render deployment) |
| `VITE_XRPL_NETWORK` | `mainnet` or `testnet` | XRPL network configuration |

### Production Example

```bash
VITE_BACKEND_URL=https://xahpayroll-backend.onrender.com
VITE_XRPL_NETWORK=mainnet
```

### Testnet Example

```bash
VITE_BACKEND_URL=https://xahpayroll-backend-staging.onrender.com
VITE_XRPL_NETWORK=testnet
```

### How to Add Environment Variables (UI)

1. Go to **Site settings** → **Environment variables**
2. Click **Add a variable** → **Add a single variable**
3. Enter key: `VITE_BACKEND_URL`
4. Enter value: `https://your-backend.onrender.com`
5. Click **Create variable**
6. Repeat for `VITE_XRPL_NETWORK`
7. **Trigger redeploy** for changes to take effect

### ⚠️ CRITICAL: Environment Variable Prefix

**All frontend environment variables MUST start with `VITE_`** to be accessible in the React app. This is a Vite requirement.

❌ Wrong: `BACKEND_URL=...`
✅ Correct: `VITE_BACKEND_URL=...`

---

## Build Settings

### Build Configuration

| Setting | Value |
|---------|-------|
| **Base directory** | `frontend` |
| **Build command** | `npm run build` |
| **Publish directory** | `frontend/dist` |
| **Node version** | 18 |
| **Package manager** | npm 9 |

### Build Process

The build command executes:

```bash
cd frontend
npm install
npm run build  # Runs: tsc && vite build
```

**Build Output**:
- TypeScript compilation: `tsc` (type checking)
- Vite production build: `vite build` (outputs to `dist/`)
- Code splitting: XRPL core, wallet integrations, React vendor
- Asset optimization: Minification, tree-shaking, chunk splitting

**Build Time**: ~2-3 minutes (cold build)

---

## Troubleshooting

### Common Issues

#### 1. Build Failed: "Cannot find module '@'"

**Error**:
```
Error: Cannot find module '@/components/...'
```

**Cause**: TypeScript path alias not resolved during build

**Solution**: Verify `vite.config.ts` has correct alias:
```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
}
```

#### 2. Runtime Error: "Backend API Unreachable"

**Error**: Network errors when calling backend API

**Cause**: `VITE_BACKEND_URL` not set or incorrect

**Solution**:
1. Verify environment variable is set in Netlify dashboard
2. Ensure URL includes protocol: `https://...`
3. Check backend CORS allows frontend domain
4. Trigger redeploy after adding variables

#### 3. Wallet Connection Issues

**Error**: Xaman wallet QR codes not working

**Cause**: Wrong network configuration

**Solution**:
1. Verify `VITE_XRPL_NETWORK` matches backend configuration
2. Ensure Xaman app is on same network (testnet/mainnet)
3. Check backend has correct XAMAN_API_KEY/SECRET

#### 4. React Router 404 Errors

**Error**: Refreshing pages returns 404

**Cause**: SPA redirect not configured

**Solution**: Verify `netlify.toml` has redirect rule:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### 5. Deploy Preview vs Production Mismatch

**Issue**: Preview works but production doesn't

**Cause**: Different environment variables for contexts

**Solution**:
1. Go to **Site settings → Environment variables**
2. Ensure variables are set for **All scopes** (not just specific contexts)
3. Or explicitly set for Production context

---

## Post-Deployment

### Verification Checklist

After successful deployment, verify:

- [ ] **Site loads**: Visit production URL, no console errors
- [ ] **Routing works**: Navigate between pages, refresh works
- [ ] **Backend connection**: API calls succeed (check Network tab)
- [ ] **Wallet integration**: Xaman QR codes generate correctly
- [ ] **Network config**: Correct testnet/mainnet configuration
- [ ] **Security headers**: Check headers in browser DevTools
- [ ] **Asset caching**: Static assets have proper cache headers

### Testing Flow

1. **Authentication**: Test Xaman sign-in flow
2. **Worker Dashboard**: Verify payment channels load
3. **NGO Dashboard**: Test worker management and channel creation
4. **Payment Flow**: Test channel creation and closure (testnet only)
5. **Mobile**: Test Xaman deep linking on mobile devices

### Performance Optimization

Netlify automatically provides:
- ✅ Global CDN distribution
- ✅ Automatic HTTPS
- ✅ Brotli/Gzip compression
- ✅ HTTP/2 support
- ✅ Smart CDN caching

**Lighthouse Score Target**: >90 for all metrics

---

## Custom Domain (Optional)

### Add Custom Domain

1. **Domain settings**: Site settings → Domain management
2. **Add domain**: Click "Add domain alias"
3. **DNS Configuration**: Point DNS to Netlify:
   - **A record**: `75.2.60.5`
   - **CNAME**: `[your-site].netlify.app`
4. **SSL Certificate**: Netlify auto-provisions Let's Encrypt certificate
5. **HTTPS Enforcement**: Enable "Force HTTPS"

### Example Configuration

For domain: `app.xahpayroll.xyz`

```
Type    Name    Value
A       @       75.2.60.5
CNAME   www     xahpayroll.netlify.app
```

**Backend CORS Update**: Add custom domain to backend CORS_ORIGINS:
```bash
CORS_ORIGINS=https://app.xahpayroll.xyz,https://xahpayroll.netlify.app
```

---

## Deployment Workflow

### Continuous Deployment

Netlify automatically deploys when:
- Commits pushed to `main` branch
- Pull requests merged (if configured)

**Build trigger**: GitHub webhook → Netlify build → Deploy

### Manual Deployment

```bash
# CLI deployment (requires netlify login)
npm run deploy          # Production
npm run deploy:preview  # Preview
```

### Rollback

If deployment fails:
1. Go to **Deploys** tab
2. Find last successful deployment
3. Click **...** → **Publish deploy**

---

## Environment-Specific Deployments

### Production (Mainnet)

```bash
VITE_BACKEND_URL=https://xahpayroll-backend.onrender.com
VITE_XRPL_NETWORK=mainnet
```

**Domain**: `xahpayroll.netlify.app` or custom domain
**Backend**: Production Render deployment (mainnet)
**Wallet**: Xaman mainnet accounts

### Staging (Testnet)

Create separate site for staging:

```bash
VITE_BACKEND_URL=https://xahpayroll-backend-staging.onrender.com
VITE_XRPL_NETWORK=testnet
```

**Domain**: `xahpayroll-staging.netlify.app`
**Backend**: Staging Render deployment (testnet)
**Wallet**: Xaman testnet accounts

---

## Monitoring

### Netlify Analytics

Enable Netlify Analytics for:
- Page views and unique visitors
- Top pages and referrers
- Bandwidth usage
- 404 errors

**Cost**: $9/month per site

### Performance Monitoring

Monitor via Netlify dashboard:
- **Build time**: Should be <5 minutes
- **Deploy time**: Should be <30 seconds
- **Bundle size**: Track over time (target: <500KB initial)

---

## Security Considerations

### Headers Configuration

`netlify.toml` includes security headers:
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Referrer-Policy: strict-origin-when-cross-origin` - Referrer control
- `Permissions-Policy` - Restricts geolocation, microphone, camera

### HTTPS Enforcement

Netlify automatically:
- Provisions SSL certificates
- Redirects HTTP → HTTPS
- Renews certificates automatically

### Environment Variable Security

- ✅ Never commit `.env` files
- ✅ Use Netlify dashboard for secrets
- ✅ Rotate credentials regularly
- ✅ Use different credentials for staging/production

---

## Team Collaboration

### GOOD MONEY COLLECTIVE Team

**Team Settings**: https://app.netlify.com/teams/good-money-collective/settings

**Members**: Ensure team members have appropriate access:
- **Owner**: Full control (billing, team, sites)
- **Collaborator**: Deploy and configure sites
- **Controller**: Limited access

**Best Practices**:
- Use team context for all XAH Payroll deployments
- Share environment variables via team settings
- Document deployment processes in team wiki

---

## Cost Estimation

### Netlify Pricing (GOOD MONEY COLLECTIVE Team)

**Free Tier** (likely sufficient for MVP):
- ✅ 100GB bandwidth/month
- ✅ 300 build minutes/month
- ✅ Unlimited sites
- ✅ HTTPS included
- ✅ Deploy previews

**Pro Tier** ($19/month, if needed):
- ✅ 400GB bandwidth/month
- ✅ 1000 build minutes/month
- ✅ Analytics included
- ✅ Priority support

---

## Support and Resources

### Netlify Documentation
- **General**: https://docs.netlify.com/
- **Build Settings**: https://docs.netlify.com/configure-builds/overview/
- **Environment Variables**: https://docs.netlify.com/environment-variables/overview/
- **Redirects**: https://docs.netlify.com/routing/redirects/

### XAH Payroll Documentation
- **Project README**: `../README.md`
- **Backend Deployment**: `SUPABASE_RENDER_DEPLOYMENT.md`
- **Database Setup**: `DATABASE_SETUP.md`
- **Wallet Integration**: `WALLET_INTEGRATION.md`

### Contact
- **Email**: admin@xahpayroll.xyz
- **GitHub Issues**: https://github.com/Ghostrayu/xahpayroll/issues
- **Team**: GOOD MONEY COLLECTIVE on Netlify

---

## Checklist: First Deployment

- [ ] Logged into Netlify as Ghostrayu
- [ ] Switched to GOOD MONEY COLLECTIVE team
- [ ] Connected GitHub repository (Ghostrayu/xahpayroll)
- [ ] Configured build settings (base: frontend, command: npm run build, publish: frontend/dist)
- [ ] Added environment variables (VITE_BACKEND_URL, VITE_XRPL_NETWORK)
- [ ] Verified netlify.toml exists in repository root
- [ ] Deployed site
- [ ] Verified build succeeded
- [ ] Tested authentication flow
- [ ] Verified backend API connectivity
- [ ] Tested Xaman wallet integration
- [ ] Checked security headers in DevTools
- [ ] Updated backend CORS to include Netlify domain
- [ ] Documented production URL for team

---

**END OF GUIDE**
