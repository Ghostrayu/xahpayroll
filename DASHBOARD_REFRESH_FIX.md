# Dashboard Refresh Fix - Manual Implementation Steps

## Problem
User refresh on dashboard page redirects to `/ngo` or `/worker` instead of staying on or redirecting to `/dashboard`.

## Solution
Add a unified `/dashboard` route that redirects users to their appropriate dashboard based on user type, and update back links to point to `/dashboard`.

## Steps

### Step 1: Create DashboardRedirect Component
Create a new file `frontend/src/components/DashboardRedirect.tsx`:

```tsx
import React, { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const DashboardRedirect: React.FC = () => {
  const { userType, isLoggedIn } = useAuth()

  // If not logged in, redirect to home
  if (!isLoggedIn) {
    return <Navigate to="/" replace />
  }

  // Redirect based on user type
  if (userType === 'employee') {
    return <Navigate to="/worker/dashboard" replace />
  } else if (userType === 'ngo' || userType === 'employer') {
    return <Navigate to="/ngo/dashboard" replace />
  }

  // Default fallback
  return <Navigate to="/" replace />
}

export default DashboardRedirect
```

### Step 2: Add /dashboard Route to App.tsx
Update `frontend/src/App.tsx`:

1. Add import:
```tsx
import DashboardRedirect from './components/DashboardRedirect'
```

2. Add the route inside the `<Routes>` component, before the existing routes:
```tsx
<Route path="/dashboard" element={<DashboardRedirect />} />
```

### Step 3: Update WorkerDashboard Back Link
In `frontend/src/pages/WorkerDashboard.tsx`, change the back link (around line 102-110):

Change:
```tsx
<Link to="/worker" ...>
```

To:
```tsx
<Link to="/dashboard" ...>
```

### Step 4: Update NgoDashboard Back Link
In `frontend/src/pages/NgoDashboard.tsx`, change the back link (around line 203-211):

Change:
```tsx
<Link to="/ngo" ...>
```

To:
```tsx
<Link to="/dashboard" ...>
```

### Step 5: Test the Changes
1. Start the development server
2. Log in as a worker and go to `/worker/dashboard`
3. Click the "BACK TO INFO" link - should go to `/dashboard` and redirect to `/worker/dashboard`
4. Refresh the page while on `/worker/dashboard` - should stay on `/worker/dashboard`
5. Repeat for NGO dashboard
6. Test `/dashboard` directly - should redirect to appropriate dashboard based on user type

## Expected Behavior After Changes
- Users can bookmark `/dashboard` as their main entry point
- `/dashboard` automatically redirects to the correct dashboard based on user type
- Back links in dashboards now go to `/dashboard` instead of specific info pages
- Refresh behavior should be improved with the unified entry point
