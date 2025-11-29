# Quick Start - Testing Worker Closure Request Feature

**Status**: ✅ Implementation Complete - Ready to Test
**Date**: 2025-11-28

---

## 🚀 Quick Start (5 Minutes)

### 1. Start Backend
```bash
cd backend
npm start
```

**Expected Output**:
```
🚀 XAH Payroll Backend running on port 3001
📡 Frontend URL: http://localhost:3000
🔐 Xaman API configured: Yes
💾 Database: xahpayroll_dev on localhost
⏰ Scheduled jobs initialized:
   - Hard delete job (runs every hour)
   - Inactivity deletion job (runs daily at 2:00 AM)
```

### 2. Start Frontend (New Terminal)
```bash
cd frontend
npm run dev
```

**Expected Output**:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

### 3. Verify Database
```bash
cd backend
npm run test:db
```

**Expected**: Should show `worker_notifications` table in the list (15 total tables)

---

## ✅ Minimal Test (10 Minutes)

**Goal**: Verify basic NGO request → Worker notification → Approval flow

### Test Setup
- **NGO Account**: Logged in with active payment channel
- **Worker Account**: Same worker who has the channel

### Test Steps

1. **NGO Side** (http://localhost:3000):
   - Log in as NGO
   - Navigate to NGO Dashboard
   - Find an active payment channel
   - Click yellow **"REQUEST CLOSURE"** button
   - **Expected**: Alert "✅ CLOSURE REQUEST SENT TO WORKER!"

2. **Worker Side** (http://localhost:3000 - different browser/incognito):
   - Log in as Worker
   - Navigate to Worker Dashboard
   - **Expected**: Red badge on "🔔 NOTIFICATIONS" button showing "1"

3. **Worker Notification Check**:
   - Click "🔔 NOTIFICATIONS" button
   - **Expected**:
     - Dropdown modal opens
     - Notification visible with message about NGO requesting closure
     - Blue background (unread)
     - "APPROVE & CLOSE" button visible

4. **Worker Approval**:
   - Click "APPROVE & CLOSE"
   - **Expected**:
     - Notification modal closes
     - Channel closure confirmation modal opens
     - Shows channel details (balance, escrow)

5. **Complete Closure** (Optional - requires testnet XAH):
   - Click "CLOSE CHANNEL" button
   - Sign transaction with wallet
   - **Expected**:
     - Transaction succeeds
     - Worker receives accumulated balance
     - Escrow returns to NGO

**Success Criteria**:
- ✅ NGO can send request
- ✅ Worker sees notification badge
- ✅ Notification displays correctly
- ✅ Approval triggers closure modal

---

## 🔍 Verify Implementation

### Backend Verification
```bash
# Check routes are registered
grep "workerNotifications" backend/server.js

# Expected output:
# const workerNotificationsRoutes = require('./routes/workerNotifications')
# app.use('/api/worker-notifications', workerNotificationsRoutes)
```

```bash
# Check migration exists
ls -la backend/database/migrations/006_create_worker_notifications.sql

# Expected: File exists with ~47 lines
```

```bash
# Check table exists
npm run test:db

# Expected: "worker_notifications" in table list
```

### Frontend Verification
```bash
# Check API client integration
grep "workerNotificationsApi" frontend/src/services/api.ts

# Expected: export const workerNotificationsApi = {
```

```bash
# Check WorkerDashboard integration
grep "notifications\|unreadCount" frontend/src/pages/WorkerDashboard.tsx | head -5

# Expected: State variables and API calls present
```

```bash
# Check NgoDashboard request button
grep "Request Closure" frontend/src/pages/NgoDashboard.tsx

# Expected: Button text found in component
```

---

## 🐛 Common Issues & Fixes

### Issue: "worker_notifications" table not found
**Fix**:
```bash
cd backend
psql -U postgres -d xahpayroll_dev -f database/migrations/006_create_worker_notifications.sql
```

### Issue: "Cannot find module './routes/workerNotifications'"
**Fix**: Check that `backend/routes/workerNotifications.js` exists (should be 266 lines)

### Issue: Notification badge doesn't appear
**Troubleshooting**:
1. Open browser console → Look for `[WORKER_NOTIFICATIONS]` logs
2. Check Network tab → Should see fetch to `/api/worker-notifications/{wallet}`
3. Verify polling is active (should fetch every 30 seconds)

### Issue: "Request Closure" button not visible
**Check**:
1. Channel status must be 'active' (not 'closed' or 'closing')
2. Button color should be yellow (`bg-yellow-500`)
3. Located in Active Payment Channels section

### Issue: TypeScript compilation errors
**Fix**:
```bash
cd frontend
rm -rf node_modules/.vite
npm run dev
```

---

## 📊 Database Inspection

### Check Notifications Table
```sql
-- View all notifications
SELECT id, worker_wallet_address, type, is_read, closure_approved, created_at
FROM worker_notifications
ORDER BY created_at DESC
LIMIT 10;
```

### Check Active Closure Requests
```sql
-- Find pending closure requests
SELECT
  wn.id,
  wn.worker_wallet_address,
  wn.message,
  wn.is_read,
  wn.closure_approved,
  wn.created_at,
  pc.job_name,
  pc.status as channel_status
FROM worker_notifications wn
LEFT JOIN payment_channels pc ON wn.channel_id = pc.channel_id
WHERE wn.type = 'closure_request'
  AND wn.closure_approved = FALSE
ORDER BY wn.created_at DESC;
```

### Check Notification Indexes
```sql
-- Verify indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'worker_notifications';
```

**Expected**:
- `idx_worker_notifications_wallet_unread`
- `idx_worker_notifications_channel`
- `idx_worker_notifications_type`

---

## 🎯 Testing Checklist

**Minimal Testing (Required)**:
- [ ] Backend starts without errors
- [ ] Frontend compiles and starts
- [ ] Database has worker_notifications table
- [ ] NGO can send closure request
- [ ] Worker sees notification badge
- [ ] Notification dropdown displays correctly
- [ ] Approval button triggers closure modal

**Enhanced Testing (Recommended)**:
- [ ] Duplicate request prevention works
- [ ] Mark as read functionality works
- [ ] Notification polling updates badge (30s)
- [ ] Zero XRP closure shows correct message
- [ ] Scheduled closure shows expiration time
- [ ] Multiple notifications display correctly
- [ ] Authorization checks prevent unauthorized actions

**Full Testing (Complete Validation)**:
- [ ] All scenarios from CLOSURE_REQUEST_TESTING_GUIDE.md
- [ ] Database queries perform well
- [ ] Browser console shows no errors
- [ ] Network requests complete successfully
- [ ] Edge cases handled correctly

---

## 📝 Next Steps After Testing

### If Testing Succeeds:
1. Document any minor issues or improvements
2. Consider production deployment
3. Update CHANGELOG.md with feature details
4. Notify stakeholders feature is ready

### If Testing Fails:
1. Review error messages in browser console
2. Check backend logs for API errors
3. Verify database state with SQL queries
4. Consult CLOSURE_REQUEST_TESTING_GUIDE.md for detailed scenarios
5. Report issues with:
   - Exact error messages
   - Browser console logs
   - Backend server logs
   - Database state at time of error

---

## 🆘 Support Resources

**Detailed Testing Guide**: `backend/claudedocs/CLOSURE_REQUEST_TESTING_GUIDE.md`
- 8 comprehensive test scenarios
- Database verification queries
- Performance testing procedures
- Edge cases and error handling

**Project Documentation**: `README.md` and `CLAUDE.md`
- Architecture overview
- API endpoints reference
- Database schema details

**Database Schema**: `backend/database/migrations/`
- All migration files including 006_create_worker_notifications.sql

---

## 🎉 Success Indicators

**Backend**:
- ✅ Server starts on port 3001
- ✅ All 15 database tables present
- ✅ No error logs on startup
- ✅ `/api/worker-notifications` route registered

**Frontend**:
- ✅ Compiles without TypeScript errors
- ✅ Runs on port 3000
- ✅ No console errors on page load
- ✅ Notification badge renders

**Feature**:
- ✅ NGO request creates notification
- ✅ Worker receives notification
- ✅ Badge count updates automatically
- ✅ Approval workflow completes successfully

---

## Time Estimates

- **Setup**: 5 minutes (start servers, verify database)
- **Basic Test**: 10 minutes (NGO request → Worker approval)
- **Enhanced Test**: 30 minutes (duplicates, read status, messaging)
- **Full Test**: 2-3 hours (all scenarios from detailed guide)

**Recommended**: Start with Basic Test (15 minutes total), then expand to Enhanced if time permits.
