# Plan: HTTP 429 Rate Limiting Error Fix

**Date**: 2025-12-11
**Error**: Multiple HTTP 429 "Too Many Requests" errors on NGO dashboard load
**Impact**: NGO dashboard fails to load data on initial connection

## Hypothesis

**Error Pattern Analysis**:
```
8 simultaneous API requests hit rate limiter:
1. /api/work-sessions/ngo-active (x2 - duplicate!)
2. /api/organizations/:wallet (x2 - duplicate!)
3. /api/organizations/stats/:wallet
4. /api/organizations/workers/:wallet
5. /api/organizations/payment-channels/:wallet
6. /api/organizations/activity/:wallet
```

**Root Cause Hypothesis**:

The `useEffect` in DataContext.tsx (line 266-272) triggers `refreshData()` which fires ALL NGO API requests in parallel. If this effect runs TWICE (React 18 Strict Mode double-mounting OR rapid re-renders), it creates **8 requests instantly**, exceeding the rate limit of **100 requests per 15 minutes**.

**Most Likely**: React 18 Strict Mode in development causes double-mounting → useEffect runs twice → 8 requests total → instant rate limit breach

## Expected Outcomes

**Fix Goals**:
1. Eliminate duplicate API calls during component mount
2. Ensure NGO dashboard loads successfully on first connection
3. Maintain security (keep rate limiting active)
4. Zero impact on production behavior

**Success Criteria**:
- NGO dashboard loads without 429 errors
- Single set of API requests on wallet connection
- Rate limit remains protective against abuse
- Solution works in both dev and production

## Risks & Mitigation

**Risk 1**: React Strict Mode double-mounting (development only)
- **Mitigation**: Add dependency array stability, consider cleanup function
- **Action**: Fix useEffect dependencies or disable Strict Mode in dev

**Risk 2**: Rapid wallet connection/disconnection triggering multiple refreshes
- **Mitigation**: Debounce refreshData calls
- **Action**: Add 100-200ms debounce to useEffect

**Risk 3**: Increasing rate limit too much compromises security
- **Mitigation**: Keep limit reasonable, fix root cause instead
- **Action**: Increase limit modestly (100 → 200) as temporary measure

## Investigation Strategy

**Phase 1: Confirm React Strict Mode Issue**
- Check if main.tsx uses `<React.StrictMode>`
- Verify error only occurs in development
- Test if disabling Strict Mode eliminates duplicates

**Phase 2: Analyze useEffect Dependencies**
- Review dependency array: `[walletAddress, userType]`
- Check if missing `refreshData` in deps (intentional to avoid infinite loop)
- Verify if dependencies change rapidly during mount

**Phase 3: Solution Design**
- **Option A**: Add cleanup function to useEffect (prevent double execution)
- **Option B**: Add isFirstMount ref to skip duplicate calls
- **Option C**: Increase rate limit for development environment
- **Option D**: Debounce refreshData with useCallback + setTimeout

## Context Notes

**Current Configuration**:
- Rate Limit: 100 requests per 15 minutes (global, per IP)
- DataContext useEffect: Runs on `[walletAddress, userType]` change
- NGO Dashboard: 4 parallel API calls (stats, workers, channels, activity)
- Work Sessions: 1 separate API call
- Organizations: 1 organization info call

**Development vs Production**:
- Dev: React Strict Mode ON (likely)
- Production: React Strict Mode OFF (standard)
- Error likely only manifests in development

## Solution Approaches

### Option 1: Fix useEffect (RECOMMENDED)
**Add ref to track first mount and prevent duplicate calls**

```typescript
const hasFetchedOnce = useRef(false)

useEffect(() => {
  if (walletAddress && userType && !hasFetchedOnce.current) {
    hasFetchedOnce.current = true
    refreshData()
  } else if (!walletAddress || !userType) {
    hasFetchedOnce.current = false
    clearData()
  }
}, [walletAddress, userType, refreshData])
```

### Option 2: Debounce refreshData
**Add 200ms delay to prevent rapid-fire calls**

```typescript
useEffect(() => {
  if (walletAddress && userType) {
    const timer = setTimeout(() => refreshData(), 200)
    return () => clearTimeout(timer)
  } else {
    clearData()
  }
}, [walletAddress, userType, refreshData])
```

### Option 3: Increase Rate Limit (TEMPORARY)
**Raise limit for development, keep low in production**

```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 200 : 100,
  // ...
})
```

## Next Steps

1. Confirm React Strict Mode is enabled in main.tsx
2. Test if error reproduces in production build
3. Implement Option 1 (useRef to prevent duplicate calls)
4. Verify fix eliminates 429 errors
5. Document solution in PDCA act.md
