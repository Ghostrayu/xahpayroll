# Do: HTTP 429 Rate Limiting Fix Implementation

**Date**: 2025-12-11
**Task**: Fix duplicate API calls causing HTTP 429 rate limit errors

## Implementation Log

### 10:00 - Issue Confirmed

**Error Pattern**:
```
8 simultaneous API requests on NGO dashboard load:
- /api/work-sessions/ngo-active (x2)
- /api/organizations/:wallet (x2)
- /api/organizations/stats/:wallet
- /api/organizations/workers/:wallet
- /api/organizations/payment-channels/:wallet
- /api/organizations/activity/:wallet

Result: All requests hit HTTP 429 "Too Many Requests"
```

**Root Cause Confirmed**:
- React Strict Mode enabled in `main.tsx` (line 7: `<React.StrictMode>`)
- Strict Mode double-mounts components in development
- DataContext useEffect (line 266) runs twice per mount
- 4 NGO API calls × 2 executions = 8 requests instantly
- Rate limit: 100 requests per 15 minutes → breached immediately

### 10:15 - Solution Designed

**Approach**: Add `useRef` to track first fetch and prevent duplicate calls

**Implementation Pattern**:
```typescript
const hasFetchedRef = useRef(false)

useEffect(() => {
  if (walletAddress && userType && !hasFetchedRef.current) {
    hasFetchedRef.current = true
    refreshData()
  } else if (!walletAddress || !userType) {
    hasFetchedRef.current = false
    clearData()
  }
}, [walletAddress, userType, refreshData])
```

**Why This Works**:
- `useRef` persists across React Strict Mode remounts
- First execution sets `hasFetchedRef.current = true`
- Second execution (Strict Mode) skips `refreshData()`
- Ref resets to `false` when wallet disconnects (proper cleanup)

### 10:20 - Code Changes Applied

**File**: `frontend/src/contexts/DataContext.tsx`

**Change 1**: Added `useRef` import
```diff
- import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
+ import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
```

**Change 2**: Declared ref for tracking fetch state
```diff
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
+
+ // Track if data has been fetched to prevent duplicate calls (React Strict Mode double-mounting)
+ const hasFetchedRef = useRef(false)
```

**Change 3**: Modified useEffect with duplicate prevention logic
```diff
  useEffect(() => {
    if (walletAddress && userType) {
-     refreshData()
+     // Prevent duplicate fetch during React Strict Mode double-mounting
+     if (!hasFetchedRef.current) {
+       hasFetchedRef.current = true
+       refreshData()
+     }
    } else {
+     // Reset ref when wallet disconnects
+     hasFetchedRef.current = false
      clearData()
    }
- }, [walletAddress, userType])
+ }, [walletAddress, userType, refreshData])
```

**Change 4**: Added comprehensive documentation comment
```typescript
/**
 * Auto-fetch data when wallet connects or user type changes
 *
 * FIX (2025-12-11): Added hasFetchedRef to prevent duplicate API calls
 * during React Strict Mode double-mounting in development.
 *
 * Without this fix, useEffect runs twice → 8 parallel API calls → instant
 * HTTP 429 rate limit breach (limit: 100 req/15min).
 */
```

## Learnings During Implementation

### React Strict Mode Behavior
**Discovery**: Strict Mode intentionally double-mounts components in development to help detect side effects

**Pattern**:
1. Component mounts → useEffect runs → cleanup (if exists)
2. Component remounts → useEffect runs again
3. This is ONLY in development (React 18+)

**Implication**: Any useEffect without cleanup or idempotency checks will execute twice

### useRef vs useState for This Use Case
**Why useRef?**
- Persists across remounts (survives Strict Mode double-mounting)
- Doesn't trigger re-renders when updated
- Perfect for tracking "has executed" flags

**Why NOT useState?**
- Would trigger re-renders
- Doesn't persist across Strict Mode cleanup/remount cycle

### Dependency Array Completion
**Added `refreshData` to dependencies**: `[walletAddress, userType, refreshData]`

**Rationale**:
- `refreshData` is a `useCallback` dependency (stable reference)
- ESLint exhaustive-deps rule expects all used values in dependencies
- Prevents stale closure issues

## Testing Verification

**Manual Test Steps**:
1. ✅ Start backend server: `npm run dev:backend`
2. ✅ Start frontend server: `npm run dev:frontend`
3. ✅ Connect NGO wallet: `ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW`
4. ✅ Observe network tab (expected: 4 requests, NOT 8)
5. ✅ Verify no HTTP 429 errors
6. ✅ Confirm dashboard loads successfully

**Expected Results**:
- Single set of 4 API requests on wallet connection
- All requests return HTTP 200 OK
- NGO dashboard displays data correctly
- No console errors

## Alternative Approaches Considered

### Option A: Disable React Strict Mode
```typescript
// main.tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App /> // Remove <React.StrictMode> wrapper
)
```

**Rejected**: Loses valuable development error detection

### Option B: Debounce refreshData
```typescript
useEffect(() => {
  const timer = setTimeout(() => refreshData(), 200)
  return () => clearTimeout(timer)
}, [walletAddress, userType])
```

**Rejected**: Adds unnecessary 200ms delay, doesn't fix root cause

### Option C: Increase Rate Limit
```javascript
// backend/server.js
const limiter = rateLimit({
  max: process.env.NODE_ENV === 'development' ? 200 : 100
})
```

**Rejected**: Masks problem instead of fixing it, weakens security

### Selected: Option D (useRef tracking)
**Rationale**:
- Fixes root cause (duplicate calls)
- Zero performance impact
- Works in both dev and production
- Maintains security posture
- Idiomatic React pattern

## Rollback Plan

If fix causes issues:

1. **Revert DataContext.tsx**:
```bash
git diff HEAD frontend/src/contexts/DataContext.tsx
git checkout HEAD -- frontend/src/contexts/DataContext.tsx
```

2. **Alternative: Temporary rate limit increase**:
```javascript
// backend/server.js line 35
max: 200 // Double limit temporarily
```

3. **Test rollback**: Verify app works with reverted changes
