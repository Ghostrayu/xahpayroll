# Deleted Workers Display Fix - 2025-12-07

## Problem
Workers with deleted user profiles still appeared in NGO dashboard workers list.

**Example**: Worker "RAN W - TEST" (wallet: `rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS`, 15 XAH/hr) continued to appear in NGO dashboard even after profile deletion.

## Root Cause
The workers list query (`backend/routes/organizations.js:270-286`) only filtered by `employees.employment_status = 'active'` but didn't check if the user account had been soft-deleted.

**Database State**:
- `employees` table: `employment_status = 'active'` (not updated on user deletion)
- `users` table: `deleted_at IS NOT NULL` (soft-deleted)
- Query didn't JOIN with users table to check deletion status

**Original Query**:
```sql
SELECT
  e.id,
  e.full_name as name,
  e.employee_wallet_address,
  e.hourly_rate as rate,
  e.employment_status as status,
  COALESCE(
    EXTRACT(EPOCH FROM (NOW() - ws.clock_in)) / 3600,
    0
  ) as hours_today
FROM employees e
LEFT JOIN work_sessions ws ON e.id = ws.employee_id
  AND ws.clock_out IS NULL
  AND ws.session_status = 'active'
WHERE e.organization_id = $1
AND e.employment_status = 'active'  -- ❌ Missing user deletion check
ORDER BY ws.clock_in DESC NULLS LAST
```

## Solution
Added JOIN with `users` table and filter condition `u.deleted_at IS NULL` to exclude soft-deleted workers.

**Fixed Query**:
```sql
SELECT
  e.id,
  e.full_name as name,
  e.employee_wallet_address,
  e.hourly_rate as rate,
  e.employment_status as status,
  COALESCE(
    EXTRACT(EPOCH FROM (NOW() - ws.clock_in)) / 3600,
    0
  ) as hours_today
FROM employees e
JOIN users u ON e.employee_wallet_address = u.wallet_address  -- ✅ Added JOIN
LEFT JOIN work_sessions ws ON e.id = ws.employee_id
  AND ws.clock_out IS NULL
  AND ws.session_status = 'active'
WHERE e.organization_id = $1
AND e.employment_status = 'active'
AND u.deleted_at IS NULL  -- ✅ Added deletion filter
ORDER BY ws.clock_in DESC NULLS LAST
```

## Files Modified
- `backend/routes/organizations.js` (lines 269-290)
  - Added `JOIN users u ON e.employee_wallet_address = u.wallet_address`
  - Added `AND u.deleted_at IS NULL` to WHERE clause
  - Added comment explaining deletion filtering

## Testing Results

### Before Fix
```sql
-- Query WITHOUT deletion filter (organization_id = 2)
SELECT e.id, e.full_name, e.employment_status, u.deleted_at
FROM employees e
JOIN users u ON e.employee_wallet_address = u.wallet_address
WHERE e.organization_id = 2
AND e.employment_status = 'active';

-- Result: Shows deleted worker ❌
 id |     name      | employment_status |         deleted_at
----+---------------+-------------------+----------------------------
  4 | IRAN W - TEST | active            | 2025-12-07 15:10:12.212776
```

### After Fix
```sql
-- Query WITH deletion filter (organization_id = 2)
SELECT e.id, e.full_name, e.employment_status, u.deleted_at
FROM employees e
JOIN users u ON e.employee_wallet_address = u.wallet_address
WHERE e.organization_id = 2
AND e.employment_status = 'active'
AND u.deleted_at IS NULL;

-- Result: Correctly excludes deleted worker ✅
 id | name | employment_status | deleted_at
----+------+-------------------+------------
(0 rows)
```

## Impact
- **NGO Dashboard**: Workers list now correctly excludes soft-deleted workers
- **User Experience**: NGOs no longer see deleted workers in their workers list
- **Data Integrity**: Workers list accurately reflects active, non-deleted employees
- **Grace Period**: Deleted workers disappear immediately from NGO view (even during 48-hour grace period)

## Related Systems
This fix complements the worker deletion system:
- **Soft Delete**: Workers marked as deleted (`users.deleted_at IS NOT NULL`)
- **Grace Period**: 48 hours for worker to cancel deletion
- **Hard Delete**: Permanent removal after grace period expires
- **NGO Notifications**: NGOs receive notification when worker deletes profile

## Edge Cases Handled
1. **Worker deletes profile**: Immediately removed from NGO workers list ✅
2. **Worker cancels deletion**: Immediately reappears in NGO workers list ✅
3. **Multiple organizations**: Works correctly for workers employed by multiple NGOs ✅
4. **Active work sessions**: Deleted workers with active sessions correctly excluded ✅

## Performance Considerations
- **Query Performance**: Added JOIN with users table is efficient (indexed on wallet_address)
- **Database Load**: Minimal impact, users table already indexed
- **Frontend Impact**: No changes required, API response automatically excludes deleted workers

## Future Considerations
1. **Employee Status Update**: Consider updating `employees.employment_status` to 'deleted' when user deletes profile
2. **Cascade Behavior**: Document relationship between user deletion and employee records
3. **Audit Trail**: Deleted workers remain in database for audit purposes (soft delete only)

## Related Documentation
- `backend/claudedocs/WORKER_DELETION_DEPLOYMENT_GUIDE.md` - Worker deletion system overview
- `backend/claudedocs/WORKER_DELETION_TESTING_CHECKLIST.md` - Testing procedures
- `backend/database/migrations/003_worker_deletion.sql` - Database schema for deletion system
