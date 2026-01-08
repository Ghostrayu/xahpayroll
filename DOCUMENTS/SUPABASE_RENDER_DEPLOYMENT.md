# SUPABASE + RENDER DEPLOYMENT GUIDE

## XAH PAYROLL - HYBRID FREE TIER DEPLOYMENT

**Architecture**: Supabase (Database) + Render (Backend) + Netlify (Frontend)

**Cost**: $0/month forever (500MB database, sufficient for 100+ demo users)

---

## UNDERSTANDING COLD STARTS

### What Are Cold Starts?

**Cold Start** = The delay when a service "wakes up" after being idle.

**How It Works**:
```
User Request → Service Asleep → Boot Time (30-60s) → Response
             vs
User Request → Service Awake → Instant Response (<100ms)
```

### In XAH Payroll Context

#### Backend Cold Starts (Render Free Tier)
```
1. User opens app after 15 minutes of inactivity
2. Render backend is "spun down" (sleeping)
3. First API request triggers:
   - Container startup: ~20s
   - Node.js initialization: ~10s
   - Database connection: ~5s
   - Total: ~30-60 seconds

4. Subsequent requests: instant (<100ms)
5. After 15 min idle: cycle repeats
```

**Impact on User Experience**:
- ✅ **Worker Dashboard**: Initial load slow, then fast
- ✅ **Clock In/Out**: First action slow, rest instant
- ✅ **Payment Channels**: List load delayed once, updates fast
- ⚠️ **Peak Usage**: Multiple users = service stays warm

**Mitigation Strategies**:
1. **Accept It** (Recommended for demo): Users see "Loading..." for 30s max
2. **Keep-Alive Ping** (Free): Use UptimeRobot to ping every 10 minutes
3. **Upgrade to Paid** ($7/month): Service stays awake 24/7

#### Database Cold Starts (Why Supabase Wins)

**Render Free PostgreSQL**:
- ❌ Database also spins down when idle
- ❌ Cold start affects BOTH backend + database = 60-90s delay
- ❌ Expires after 90 days (must renew)

**Supabase PostgreSQL**:
- ✅ Database stays **always-on** (no cold starts)
- ✅ Only backend has cold starts (30s max)
- ✅ Never expires
- ✅ Queries execute instantly once backend connects

**Combined Effect**:
```
Render-Only:        Backend Cold Start (30s) + Database Cold Start (30s) = 60s
Supabase + Render:  Backend Cold Start (30s) + Instant DB = 30s
Paid Render:        No Cold Starts = <100ms
```

---

## PREREQUISITES

- GitHub account with xahpayroll repository
- Supabase account (free tier)
- Render.com account (free tier)
- Netlify account (frontend deployment)
- Mainnet Xaman wallet for testing

---

## PHASE 1: SUPABASE DATABASE SETUP

### 1. CREATE SUPABASE PROJECT

1. Visit https://supabase.com/dashboard
2. Click "New Project"
3. **Configuration**:
   - **Name**: `xahpayroll-mainnet`
   - **Database Password**: Generate strong password (save securely!)
   - **Region**: Choose closest to your users (e.g., US West, EU Central)
   - **Pricing Plan**: Free
4. Click "Create new project"
5. Wait ~2 minutes for project initialization

### 2. GET DATABASE CONNECTION STRING

1. In Supabase dashboard: **Settings** → **Database**
2. Scroll to **Connection string** section
3. Select **URI** tab
4. Copy the connection string:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
5. **IMPORTANT**: Replace `[YOUR-PASSWORD]` with your actual database password
6. Save this string securely (needed for Render backend)

### 3. INITIALIZE DATABASE SCHEMA

**Option A: Via SQL Editor (Recommended)**:
1. In Supabase dashboard: **SQL Editor** → **New query**
2. Copy contents of `backend/database/schema.sql`
3. Paste into SQL Editor
4. Click **Run** (or press Ctrl+Enter)
5. Verify success: **Database** → **Tables** should show 13 tables

**Option B: Via psql (Local)**:
```bash
# Navigate to project root
cd /path/to/xahaupayroll

# Connect to Supabase database
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Run initialization script
\i backend/database/schema.sql

# Verify tables
\dt
# Should show 13 tables

# Exit
\q
```

**Note**: `schema.sql` is the production-ready schema file used by `npm run init-db`.

### 4. VERIFY DATABASE

1. In Supabase dashboard: **Table Editor**
2. You should see 13 tables:
   - `users`
   - `organizations`
   - `employees`
   - `payment_channels`
   - `work_sessions`
   - `payments`
   - `escrow_transactions`
   - `payment_configurations`
   - `activity_logs`
   - `notifications`
   - `ngo_notifications`
   - `deletion_logs`
   - `api_keys`

---

## PHASE 2: RENDER BACKEND SETUP

### 1. CREATE RENDER ACCOUNT

1. Visit https://render.com
2. Sign up with GitHub (recommended for auto-deploy)
3. Authorize Render to access your repositories

### 2. CREATE WEB SERVICE

1. Click "New +" → "Web Service"
2. **Connect Repository**:
   - Find and select: `Ghostrayu/xahpayroll`
   - Click "Connect"

### 3. CONFIGURE WEB SERVICE

**Basic Settings**:
- **Name**: `xahpayroll-mainnet-api`
- **Region**: Same as Supabase (e.g., Oregon for US West)
- **Branch**: `main`
- **Root Directory**: `backend` ⚠️ **CRITICAL** - must point to backend folder
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start` (NOT `npm run dev`)
- **Instance Type**: Free

### 4. ENVIRONMENT VARIABLES

Click "Advanced" → "Add Environment Variable" for each:

```bash
# DATABASE - Supabase Connection String (from Phase 1)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
DB_NAME=postgres

# XAMAN WALLET INTEGRATION - REQUIRED FOR WALLET AUTHENTICATION
# Get credentials from: https://apps.xumm.dev/
XAMAN_API_KEY=[your_xaman_api_key]
XAMAN_API_SECRET=[your_xaman_api_secret]

# XAHAU NETWORK
XRPL_NETWORK=mainnet

# SERVER
PORT=3001
NODE_ENV=production

# FRONTEND (update after deployment)
FRONTEND_URL=https://your-app.netlify.app
CORS_ORIGINS=https://your-app.netlify.app

# SECURITY - GENERATE SECURE RANDOM STRINGS
# Run locally: openssl rand -base64 32
JWT_SECRET=[generate_secure_random_string]
SESSION_SECRET=[generate_secure_random_string]

# RATE LIMITING
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# LOGGING
LOG_LEVEL=info
LOG_FORMAT=json
```

**Generate Secure Secrets** (run locally):
```bash
# Generate JWT_SECRET
openssl rand -base64 32

# Generate SESSION_SECRET
openssl rand -base64 32
```

**Get Xaman API Credentials**:
1. Visit https://apps.xumm.dev/
2. Sign in with your Xaman wallet (mainnet or testnet matching XRPL_NETWORK)
3. Click "Create New Application"
4. Fill in application details:
   - **Name**: `XAH Payroll Mainnet` (or `XAH Payroll Testnet`)
   - **Description**: `Decentralized hourly payroll system`
   - **Redirect URLs**: Add your Netlify frontend URL
5. Save application and copy:
   - **API Key**: Use for `XAMAN_API_KEY`
   - **API Secret**: Use for `XAMAN_API_SECRET`
6. ⚠️ **SECURITY**: Never commit these credentials to Git!

### 5. DEPLOY BACKEND

1. Click "Create Web Service"
2. Render will automatically:
   - Clone repository
   - Install dependencies (`npm install`)
   - Start server (`npm start`)
3. Wait for deployment (~5-10 minutes)
4. **Copy Backend URL** from dashboard:
   ```
   https://xahpayroll-mainnet-api.onrender.com
   ```

### 6. VERIFY BACKEND HEALTH

```bash
# Test health endpoint
curl https://xahpayroll-mainnet-api.onrender.com/health

# Expected response:
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-01-07T..."
}
```

**If First Request Takes 30-60 Seconds**: This is normal cold start behavior (see explanation above).

---

## PHASE 3: NETLIFY FRONTEND UPDATE

### 1. UPDATE ENVIRONMENT VARIABLES

1. Go to Netlify dashboard
2. Navigate to: **Site Settings** → **Environment Variables**
3. **Update/Add**:
```bash
VITE_BACKEND_URL=https://xahpayroll-mainnet-api.onrender.com
VITE_XRPL_NETWORK=mainnet
```

### 2. UPDATE BACKEND CORS

1. Return to Render web service dashboard
2. **Environment Variables** → Edit:
```bash
FRONTEND_URL=https://your-actual-app.netlify.app
CORS_ORIGINS=https://your-actual-app.netlify.app
```
3. Click "Manual Deploy" → "Deploy latest commit"

### 3. REDEPLOY NETLIFY

1. Netlify dashboard: **Deploys** → **Trigger deploy** → **Deploy site**
2. Wait for build (~2-3 minutes)
3. Site will auto-publish

---

## PHASE 4: END-TO-END TESTING

### 1. TEST BACKEND API

```bash
# Health check (may take 30-60s on first request - cold start)
curl https://xahpayroll-mainnet-api.onrender.com/health

# Test database connection
curl https://xahpayroll-mainnet-api.onrender.com/api/users/test

# Subsequent requests should be instant
```

### 2. TEST FRONTEND CONNECTION

1. Visit: `https://your-app.netlify.app`
2. Open Browser DevTools → **Network** tab
3. Click "GET STARTED AS WORKER"
4. Verify API calls to Render backend succeed (200 status)

### 3. FULL WORKFLOW TEST

**Worker Flow**:
1. ✅ Connect Xaman wallet (mainnet)
2. ✅ Sign in as worker
3. ✅ View dashboard (loads payment channels)
4. ✅ Clock in/out (records work sessions)

**NGO/Employer Flow**:
1. ✅ Connect Xaman wallet (mainnet)
2. ✅ Sign in as NGO
3. ✅ Add worker via "Add Worker" button
4. ✅ Create payment channel (select worker from dropdown)
5. ✅ Verify channel in dashboard
6. ✅ Worker sees channel in their dashboard

**Payment Channel Lifecycle**:
1. ✅ NGO creates channel (funds escrow on XAH Ledger)
2. ✅ Worker logs hours (database records)
3. ✅ NGO cancels channel (worker receives balance + unused escrow returns)
4. ✅ Channel marked as 'closed'

---

## MAINTENANCE

### WEEKLY DATA RESET (OPTIONAL FOR DEMO)

**Via Supabase SQL Editor**:
1. Supabase dashboard → **SQL Editor** → **New query**
2. Paste and run:
```sql
-- Clear demo data (keeps schema intact)
TRUNCATE TABLE
  work_sessions,
  payments,
  payment_channels,
  employees,
  organizations,
  users
RESTART IDENTITY CASCADE;

-- Verify empty
SELECT COUNT(*) FROM users;
-- Should return 0
```

**Via Render Shell**:
1. Render web service dashboard → **Shell** tab
2. Run:
```bash
node backend/scripts/reset-demo-db.js
```

### MONITORING

**Supabase Dashboard**:
- **Database** → **Database**: Check storage usage (500MB limit)
- **API** → **Logs**: Real-time database query logs
- **Reports**: Query performance, slow queries

**Render Dashboard**:
- **Metrics**: CPU, memory, bandwidth usage
- **Logs**: Backend application logs
- **Events**: Deployment history, cold start frequency

### BACKUP & RECOVERY

**Automatic Backups** (Supabase Free Tier):
- Daily automatic backups
- 7-day retention
- **Restore**: Dashboard → **Database** → **Backups** → **Restore**

**Manual Backup** (Recommended before major changes):
```bash
# Export database to SQL file
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" > backup-$(date +%Y%m%d).sql

# Import backup
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" < backup-20250107.sql
```

---

## COLD START MITIGATION (OPTIONAL)

### Option 1: Accept Cold Starts (Recommended)
**Best for demo with <50 users/month**
- No additional setup
- Users see 30-60s loading on first request
- Add loading message: "WAKING UP SERVER... PLEASE WAIT"

### Option 2: Keep-Alive Ping (Free)
**Keeps backend warm via scheduled pings**

1. Create account at https://uptimerobot.com (free)
2. Add new monitor:
   - **Type**: HTTP(s)
   - **URL**: `https://xahpayroll-mainnet-api.onrender.com/health`
   - **Interval**: 10 minutes
3. Backend stays warm = no cold starts

**Trade-off**: Uses more Render bandwidth (~4GB/month extra)

### Option 3: Upgrade Render ($7/month)
**Production-ready performance**
- Zero cold starts (always-on)
- 512MB RAM (double free tier)
- One-off jobs enabled (run maintenance scripts)
- SSH access for debugging

**When to upgrade**:
- Active user base (>50 users/month)
- Cold starts negatively impact UX
- Need reliable response times (<100ms)

---

## SECURITY CONSIDERATIONS

### 1. DEMO WARNING BANNER

Add to `frontend/src/App.tsx`:
```tsx
<div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 text-center">
  <p className="uppercase font-semibold">
    ⚠️ PUBLIC DEMO - MAINNET MODE. REAL XAH TRANSACTIONS OCCUR.
    USE SMALL AMOUNTS FOR TESTING ONLY.
  </p>
</div>
```

### 2. DATABASE SECURITY

✅ **Already Secured**:
- Supabase uses encrypted connections (SSL)
- Connection string includes authentication
- Environment variables secured on Render
- No SQL injection (parameterized queries)

### 3. WALLET SECURITY

✅ **Non-Custodial Design**:
- Users control their own private keys
- Xaman handles all signing client-side
- No private keys stored on server
- Wallet addresses used for authentication

### 4. RATE LIMITING

✅ **Already Configured**:
- 100 requests per 15 minutes per IP
- Prevents abuse and API spam
- Configured in `backend/server.js`

### 5. MONITOR FOR ABUSE

**Check Weekly**:
- Render logs for suspicious activity
- Supabase database size (approaching 500MB?)
- Unusual payment channel patterns

---

## TROUBLESHOOTING

### BACKEND COLD STARTS (30-60s FIRST REQUEST)

**Symptom**: Frontend shows "Loading..." for 30-60 seconds on first use

**Solution**:
- ✅ **Expected behavior** on free tier
- ✅ Subsequent requests instant
- ✅ Consider keep-alive ping (Option 2 above)
- ✅ Or accept as demo limitation

**Add User Feedback**:
```tsx
// frontend/src/components/Loading.tsx
<div className="flex flex-col items-center justify-center">
  <div className="spinner" />
  <p className="text-gray-600 mt-4">
    WAKING UP SERVER (FREE TIER)... THIS MAY TAKE 30-60 SECONDS
  </p>
</div>
```

### DATABASE CONNECTION ERRORS

**Symptom**: Backend logs show `ECONNREFUSED` or `Connection timeout`

**Check**:
1. ✅ Verify `DATABASE_URL` in Render environment variables
2. ✅ Ensure password in connection string is correct (no special chars escaped)
3. ✅ Test connection locally:
   ```bash
   psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" -c "SELECT version();"
   ```
4. ✅ Check Supabase project status (Dashboard → Settings)

### CORS ERRORS

**Symptom**: Browser console shows `CORS policy: No 'Access-Control-Allow-Origin'`

**Solution**:
1. ✅ Verify `CORS_ORIGINS` matches exact Netlify URL (include `https://`)
2. ✅ No trailing slash in URL
3. ✅ Redeploy Render backend after updating CORS
4. ✅ Hard refresh browser (Ctrl+Shift+R)

**Correct Format**:
```bash
# ✅ Correct
CORS_ORIGINS=https://xahpayroll.netlify.app

# ❌ Wrong
CORS_ORIGINS=xahpayroll.netlify.app
CORS_ORIGINS=https://xahpayroll.netlify.app/
```

### 404 ERRORS ON API ROUTES

**Symptom**: All API calls return 404 Not Found

**Check**:
1. ✅ Root Directory set to `backend` in Render web service
2. ✅ Build command: `npm install`
3. ✅ Start command: `npm start` (NOT `npm run dev`)
4. ✅ Verify backend URL in Netlify env vars

### SUPABASE 500MB STORAGE LIMIT

**Symptom**: Database operations fail, Supabase dashboard shows 500MB used

**Solution**:
1. **Clean demo data**:
   ```sql
   TRUNCATE TABLE work_sessions, payments, payment_channels CASCADE;
   ```
2. **Upgrade to Supabase Pro** ($25/month = 8GB storage)
3. **Optimize storage**:
   - Delete old closed payment channels
   - Archive completed work sessions

**Monitor Storage**:
- Supabase dashboard → **Database** → **Database**
- Check "Database size" chart
- Set up email alerts at 400MB (80% threshold)

---

## COST ANALYSIS

### FREE TIER SUSTAINABILITY

**Supabase Free Tier**:
- ✅ 500MB database storage
- ✅ 2GB data transfer/month
- ✅ 50,000 monthly active users
- ✅ 500MB file storage
- ✅ Daily backups (7-day retention)
- ✅ **Never expires**

**Render Free Tier**:
- ✅ 750 hours/month (24/7 coverage)
- ✅ 100GB bandwidth/month
- ✅ 512MB RAM
- ⚠️ Cold starts after 15 min idle

**Netlify Free Tier**:
- ✅ 100GB bandwidth/month
- ✅ 300 build minutes/month
- ✅ Unlimited sites

**Estimated Monthly Usage** (10-50 demo users):
- Backend bandwidth: ~2-5GB
- Frontend bandwidth: ~3-8GB
- Database storage: ~50-100MB
- Database queries: ~10,000-50,000
- **Total**: Well within all free tier limits ✅

### UPGRADE PATHS

**When Database Exceeds 400MB** (80% of 500MB):
```
Supabase Pro: $25/month
- 8GB database storage
- 50GB bandwidth
- 100GB file storage
- Daily backups kept 7 days
- 99.9% uptime SLA
```

**When Cold Starts Hurt UX**:
```
Render Starter: $7/month
- No cold starts (always-on)
- 512MB RAM
- One-off jobs
- SSH access
```

**Full Production Stack** ($32/month):
- Supabase Pro: $25/month
- Render Starter: $7/month
- Netlify Free: $0
- **Total**: $32/month for enterprise-grade performance

---

## DEPLOYMENT CHECKLIST

### PRE-DEPLOYMENT
- [ ] GitHub repository accessible
- [ ] Supabase account created
- [ ] Render account created
- [ ] Netlify frontend deployed
- [ ] Mainnet Xaman wallet for testing

### SUPABASE SETUP
- [ ] Project created (xahpayroll-mainnet)
- [ ] Database password saved securely
- [ ] Connection string copied
- [ ] Database schema initialized (15 tables)
- [ ] Tables visible in Table Editor

### RENDER SETUP
- [ ] Web service created (backend folder)
- [ ] Environment variables configured
- [ ] DATABASE_URL set to Supabase connection string
- [ ] XAMAN_API_KEY and XAMAN_API_SECRET configured (from https://apps.xumm.dev/)
- [ ] JWT/Session secrets generated
- [ ] Initial deployment successful
- [ ] Health check passes (`/health` returns 200)

### NETLIFY UPDATE
- [ ] VITE_BACKEND_URL updated to Render URL
- [ ] VITE_XRPL_NETWORK set to mainnet
- [ ] Frontend redeployed
- [ ] CORS updated on backend with Netlify URL
- [ ] Backend redeployed after CORS update

### TESTING
- [ ] Backend health check works (accept 30-60s cold start)
- [ ] Frontend loads without errors
- [ ] Worker sign-in successful (Xaman)
- [ ] NGO sign-in successful (Xaman)
- [ ] Add worker functionality works
- [ ] Payment channel creation succeeds
- [ ] Work session tracking works
- [ ] Payment channel closure works
- [ ] Worker receives payment on closure

### POST-DEPLOYMENT
- [ ] Demo warning banner added (optional)
- [ ] Monitoring links bookmarked (Supabase + Render + Netlify)
- [ ] Weekly data reset process tested
- [ ] Backup process documented
- [ ] Team trained on cold start explanation

---

## ADVANTAGES OVER RENDER-ONLY DEPLOYMENT

| Feature | Render-Only | Supabase + Render |
|---------|-------------|-------------------|
| **Database Cost** | $7/month OR 90-day expiry | FREE forever |
| **Database Cold Starts** | Yes (30-60s) | No (always-on) |
| **Renewal Maintenance** | Every 90 days | Never |
| **Backups** | Manual | Automatic daily |
| **Admin UI** | Basic psql | Advanced SQL editor + Table browser |
| **Total Cold Start Time** | 60-90s | 30-60s |
| **Storage Limit** | 1GB (paid) | 500MB (free, sufficient for demo) |
| **Query Logs** | Basic | Real-time with performance metrics |
| **Total Monthly Cost** | $7-14 | $0 |

---

## SUPPORT & RESOURCES

**Documentation**:
- Supabase: https://supabase.com/docs
- Render: https://render.com/docs
- Netlify: https://docs.netlify.com

**XAH Payroll**:
- Repository: https://github.com/Ghostrayu/xahpayroll
- Issues: https://github.com/Ghostrayu/xahpayroll/issues
- Email: admin@xahpayroll.xyz

**Community**:
- Supabase Discord: https://discord.supabase.com
- Render Community: https://community.render.com

---

**Deployment Status**: Production-Ready
**Estimated Setup Time**: 1-2 hours
**Maintenance**: 15 min/week (optional data reset)
**Cost**: $0/month (scales to $32/month for production)
**Cold Start Impact**: 30-60s first request, instant thereafter
