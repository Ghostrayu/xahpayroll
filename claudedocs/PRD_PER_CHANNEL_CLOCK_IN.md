# PRD: Per-Channel Clock-In System

**Document Version**: 1.0
**Date**: 2025-11-30
**Status**: BRAINSTORMING → SPECIFICATION
**Priority**: HIGH

---

## Executive Summary

Workers in XAH Payroll can work for multiple NGOs/organizations simultaneously. The current implementation has a single centralized "clock in" button that doesn't distinguish between different payment channels (jobs). This PRD defines a per-channel clock-in system where each payment channel has its own independent timer, allowing workers to track time separately for each employer.

---

## Problem Statement

### Current State
- Workers can be associated with multiple organizations (multi-employer support)
- WorkerDashboard displays multiple payment channels (different jobs/employers)
- Single centralized "clock in" button with no job selection
- No way to distinguish which payment channel time should be attributed to
- Work sessions tracked but not linked to specific payment channels

### Issues
1. **Ambiguity**: Worker clocks in but system doesn't know which job they're working on
2. **Accuracy**: Cannot track hours separately for different employers/jobs
3. **Payment Errors**: Accumulated balance updates not tied to correct payment channel
4. **NGO Visibility**: Employers cannot see real-time status of which workers are actively working
5. **Multi-Job Workers**: Cannot simultaneously work on multiple jobs (e.g., part-time roles)

---

## User Stories

### Worker Stories

**US-1: Clock Into Specific Job**
```
AS A worker with multiple payment channels
I WANT TO click "CLOCK IN" on a specific payment channel card
SO THAT my work time is accurately tracked for that specific job/employer
```

**Acceptance Criteria**:
- Each payment channel card has its own "CLOCK IN" button
- Button only visible when channel status is 'active' and escrow balance > 0
- Clicking button starts timer for THAT channel only
- Button changes to "CLOCK OUT" with visible running timer

**US-2: Simultaneous Multi-Job Work**
```
AS A worker with multiple part-time jobs
I WANT TO clock into multiple payment channels simultaneously
SO THAT I can accurately track time when working overlapping shifts
```

**Acceptance Criteria**:
- Can have multiple active timers running at the same time
- Each timer tracks independently
- Each timer displays real-time earnings based on that channel's hourly rate
- No interference between timers (closing one doesn't affect others)

**US-3: Timer Persistence Across Sessions**
```
AS A worker
I WANT MY active timer to continue running even if I close my browser
SO THAT my work time is not lost due to network issues or device problems
```

**Acceptance Criteria**:
- Active work sessions persist in database
- Timer resumes on browser refresh/reopen
- Elapsed time calculated from database clock_in timestamp
- Timer state survives page navigation within app

**US-4: Real-Time Earnings Display**
```
AS A worker
I WANT TO see my earnings update in real-time while clocked in
SO THAT I know exactly how much I'm earning during the current session
```

**Acceptance Criteria**:
- Timer card shows elapsed time (HH:MM:SS format)
- Earnings displayed in XAH based on hourly rate
- Updates every second (or every 10 seconds for performance)
- Formula: `earnings = (elapsed_hours * hourly_rate)`

**US-5: Maximum Session Duration Protection**
```
AS A worker
I WANT TO be warned before hitting maximum daily hours
SO THAT I don't accidentally exceed the NGO's configured limit
```

**Acceptance Criteria**:
- System checks max_daily_hours configured for payment channel
- Warning displayed at 90% of max (e.g., "8.1 hours of 9 hours max")
- Auto-stop timer at max_daily_hours limit
- Clear notification when auto-stopped

### NGO/Employer Stories

**US-6: Real-Time Worker Session Visibility**
```
AS AN NGO/employer
I WANT TO see which workers are currently clocked in
SO THAT I can monitor active work sessions and resource allocation
```

**Acceptance Criteria**:
- NGO Dashboard shows "ACTIVE WORKERS" section
- Displays worker name, job, elapsed time, current earnings
- Updates in real-time (WebSocket or polling)
- Sortable/filterable by worker, job, duration

**US-7: Configure Maximum Daily Hours**
```
AS AN NGO/employer
I WANT TO set maximum daily hours per payment channel
SO THAT I can control work limits and prevent overtime abuse
```

**Acceptance Criteria**:
- max_daily_hours field added to payment channel creation
- Default value: 8 hours (standard workday)
- Configurable range: 1-24 hours
- Worker cannot exceed this limit per session

---

## Requirements

### Functional Requirements

#### FR-1: Per-Channel Timer Controls
- Each payment channel card must have independent "CLOCK IN" / "CLOCK OUT" button
- Button states:
  - **Active channel, not clocked in**: Shows "▶️ CLOCK IN" (green button)
  - **Active channel, clocked in**: Shows "⏸️ CLOCK OUT" (red button) + timer display
  - **Closed channel**: No button (channel inactive)
  - **Insufficient escrow**: Button disabled with tooltip "INSUFFICIENT ESCROW BALANCE"

#### FR-2: Timer Display (Inline)
When clocked in, payment channel card must show:
```
┌─────────────────────────────────────────────┐
│ Red Cross - Emergency Response              │
│ Rate: $25/hr | Escrow Balance: 150 XAH      │
│                                             │
│ 🔴 CLOCKED IN                               │
│ ⏱️ Current Session: 2hr 35min 42sec         │
│ 💰 Session Earnings: 64.58 XAH             │
│ 📊 Total Hours: 120.5hrs | Balance: 15 XAH │
│                                             │
│ [⏸️ CLOCK OUT]                              │
└─────────────────────────────────────────────┘
```

#### FR-3: Simultaneous Sessions Support
- Worker can clock into multiple payment channels at the same time
- Each timer runs independently
- No global "one active session" restriction
- Database supports multiple active work_sessions per worker

#### FR-4: Timer Persistence
- Active work sessions stored in database immediately on clock-in
- clock_in timestamp recorded in UTC
- Frontend calculates elapsed time from database timestamp on page load
- Timer survives browser refresh, tab close, network interruption

#### FR-5: Real-Time Earnings Calculation
- Frontend calculates: `earnings = (elapsed_seconds / 3600) * hourly_rate`
- Updates every 1 second for visual feedback
- Displayed in XAH with 2 decimal precision
- Uses hourly_rate from payment channel (locked at clock-in time)

#### FR-6: Maximum Session Duration
- **Frontend**: `maxHoursPerDay` field ALREADY EXISTS in CreatePaymentChannelModal
  - Current default: '8' (string in frontend state)
  - Validation: 0 < value <= 24 (already implemented)
- **Backend/Database**: Activation required
  - payment_channels table gets `max_daily_hours` column (DECIMAL(4,2))
  - Default value: 8.00 hours (matches frontend, standard workday)
  - Backend must accept and store maxHoursPerDay from frontend
- **Enforcement**:
  - Worker receives warning at 90% of limit (e.g., 7.2 hours of 8.0)
  - Auto-clock-out at 100% of limit with notification
  - Backend rejects clock-in if already at max hours for the day

#### FR-7: Clock-Out Confirmation
- Clock-out shows confirmation modal:
  - Session summary (duration, earnings, timestamps)
  - "CONFIRM CLOCK OUT" / "CANCEL" buttons
  - Prevents accidental clock-outs

#### FR-8: NGO Real-Time Visibility
- NGO Dashboard new section: "ACTIVE WORK SESSIONS"
- Shows all currently clocked-in workers across all payment channels
- Displays:
  - Worker name
  - Job name
  - Elapsed time
  - Current earnings
  - Payment channel status
- Auto-refreshes every 10 seconds (WebSocket preferred)

### Non-Functional Requirements

#### NFR-1: Performance
- Timer updates must not cause UI lag (use requestAnimationFrame or Web Workers)
- Real-time earnings calculation must be client-side (no server calls per second)
- Database queries for active sessions must use indexes (response < 100ms)

#### NFR-2: Reliability
- Work session persistence must be atomic (clock-in creates DB record immediately)
- Network failures during clock-in must be retried with exponential backoff
- Zombie session cleanup: Auto-close sessions inactive > 24 hours
- Idempotency: Multiple clock-in calls should not create duplicate sessions

#### NFR-3: Security
- Workers can only clock into their own payment channels (wallet address validation)
- NGOs can only view sessions for their own payment channels
- Clock-in/out endpoints require authentication
- Rate limiting: Max 10 clock-in/out requests per minute per worker

#### NFR-4: Scalability
- WebSocket connections should scale to 1000+ concurrent users
- Database should handle 10,000+ active work sessions efficiently
- Frontend should render 50+ payment channels without performance degradation

#### NFR-5: Accessibility
- Timer controls must be keyboard accessible (Tab, Enter, Space)
- Screen reader support for timer status announcements
- High contrast mode for timer display
- ALL user-facing text in FULL CAPS per project standards

---

## Database Schema Changes

### Current State Analysis

**Existing "Max Hours/Day" Field**:
- ✅ **Frontend**: `maxHoursPerDay` field EXISTS in `CreatePaymentChannelModal.tsx` (line 26, 44, 651)
- ❌ **Backend**: Field is NOT being received or stored in `backend/routes/paymentChannels.js:create` endpoint
- ❌ **Database**: `max_daily_hours` column does NOT exist in `payment_channels` table

**Status**: Field is **ORPHANED** (UI exists but not connected to backend/database)

**Required Action**: **ACTIVATE** the existing frontend field by wiring it to backend and database

---

### Migration: 007_add_per_channel_timers.sql

```sql
-- ============================================================
-- PART 1: Add max_daily_hours column to payment_channels table
-- This ACTIVATES the existing frontend field by storing its value
-- ============================================================

ALTER TABLE payment_channels
  ADD COLUMN IF NOT EXISTS max_daily_hours DECIMAL(4,2) DEFAULT 8.00 CHECK (max_daily_hours > 0 AND max_daily_hours <= 24);

COMMENT ON COLUMN payment_channels.max_daily_hours IS 'Maximum hours worker can work per day for this channel (auto-stop timer at limit). Maps to frontend maxHoursPerDay field. Default: 8 hours (standard workday).';

-- ============================================================
-- PART 2: Add payment_channel_id to work_sessions table
-- This enables per-channel time tracking (core requirement)
-- ============================================================

ALTER TABLE work_sessions
  ADD COLUMN IF NOT EXISTS payment_channel_id INTEGER REFERENCES payment_channels(id) ON DELETE CASCADE;

COMMENT ON COLUMN work_sessions.payment_channel_id IS 'Links work session to specific payment channel for per-job time tracking';

-- ============================================================
-- PART 3: Performance Indexes
-- ============================================================

-- Index for fast lookup of active sessions by payment channel
CREATE INDEX IF NOT EXISTS idx_work_sessions_payment_channel
  ON work_sessions(payment_channel_id);

-- Index for fast lookup of active sessions by status
CREATE INDEX IF NOT EXISTS idx_work_sessions_status
  ON work_sessions(session_status) WHERE session_status = 'active';

-- Composite index for worker's active sessions (performance optimization)
CREATE INDEX IF NOT EXISTS idx_work_sessions_employee_active
  ON work_sessions(employee_id, session_status) WHERE session_status = 'active';

-- ============================================================
-- PART 4: Data Backfill (Optional)
-- ============================================================

-- Backfill existing work_sessions with payment_channel_id (if possible)
-- This query attempts to match existing sessions to payment channels based on employee_id and organization_id
UPDATE work_sessions ws
SET payment_channel_id = (
  SELECT pc.id
  FROM payment_channels pc
  WHERE pc.employee_id = ws.employee_id
    AND pc.organization_id = ws.organization_id
    AND pc.status = 'active'
  LIMIT 1
)
WHERE ws.payment_channel_id IS NULL;

-- ============================================================
-- PART 5: Data Integrity (Optional - Uncomment if desired)
-- ============================================================

-- Validate data integrity: Ensure all future work_sessions have payment_channel_id
-- (Comment out if you want to allow legacy sessions without payment_channel_id)
-- ALTER TABLE work_sessions ALTER COLUMN payment_channel_id SET NOT NULL;
```

---

## API Endpoints

### Backend: `/api/work-sessions/*`

#### POST /api/work-sessions/clock-in

**Purpose**: Start a new work session for a specific payment channel

**Request Body**:
```json
{
  "workerWalletAddress": "rN7n7otQDd6FczFgLdlqtyMVGXG1234567",
  "paymentChannelId": 42,
  "notes": "Optional: Starting emergency response shift"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "workSession": {
    "id": 1523,
    "paymentChannelId": 42,
    "employeeId": 15,
    "organizationId": 3,
    "clockIn": "2025-11-30T14:30:00.000Z",
    "clockOut": null,
    "hoursWorked": null,
    "hourlyRate": 25.00,
    "totalAmount": null,
    "sessionStatus": "active",
    "maxDailyHours": 12.00,
    "createdAt": "2025-11-30T14:30:00.000Z"
  },
  "message": "CLOCKED IN SUCCESSFULLY"
}
```

**Error Cases**:
- 400: Payment channel not found or inactive
- 400: Worker already has active session for this channel
- 400: Insufficient escrow balance in payment channel
- 400: Worker has reached max daily hours for this channel
- 401: Unauthorized (wallet address doesn't match authenticated user)
- 403: Worker wallet doesn't match payment channel employee

**Business Logic**:
1. Validate payment channel exists and status = 'active'
2. Validate worker's wallet matches payment channel's employee
3. Check for existing active session (prevent duplicates)
4. Check total hours worked today against max_daily_hours
5. Verify payment channel has sufficient escrow balance (minimum 1 hour)
6. Create work_sessions record with clock_in = NOW()
7. Return work session object

---

#### POST /api/work-sessions/clock-out

**Purpose**: End an active work session and calculate earnings

**Request Body**:
```json
{
  "workerWalletAddress": "rN7n7otQDd6FczFgLdlqtyMVGXG1234567",
  "workSessionId": 1523,
  "notes": "Optional: Completed emergency response shift"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "workSession": {
    "id": 1523,
    "paymentChannelId": 42,
    "clockIn": "2025-11-30T14:30:00.000Z",
    "clockOut": "2025-11-30T17:05:30.000Z",
    "hoursWorked": 2.59,
    "hourlyRate": 25.00,
    "totalAmount": 64.75,
    "sessionStatus": "completed",
    "createdAt": "2025-11-30T14:30:00.000Z",
    "updatedAt": "2025-11-30T17:05:30.000Z"
  },
  "paymentChannelUpdate": {
    "id": 42,
    "accumulatedBalance": 79.75,  // Previous 15.00 + 64.75
    "hoursAccumulated": 123.09    // Previous 120.5 + 2.59
  },
  "message": "CLOCKED OUT SUCCESSFULLY. SESSION EARNINGS: 64.75 XAH"
}
```

**Error Cases**:
- 400: Work session not found
- 400: Work session already completed
- 401: Unauthorized (wallet address doesn't match session employee)
- 500: Database transaction failure

**Business Logic**:
1. Validate work session exists and session_status = 'active'
2. Validate worker's wallet matches work session's employee
3. Calculate hours_worked: (clock_out - clock_in) in hours
4. Calculate total_amount: hours_worked * hourly_rate
5. Update work_sessions: clock_out = NOW(), session_status = 'completed'
6. Update payment_channels: accumulated_balance += total_amount, hours_accumulated += hours_worked
7. Return work session + payment channel update
8. **Transaction**: All updates must be atomic (BEGIN/COMMIT)

---

#### GET /api/work-sessions/active?workerWalletAddress=rN7n7...

**Purpose**: Get all active work sessions for a worker (for timer restoration on page load)

**Response (200 OK)**:
```json
{
  "success": true,
  "activeSessions": [
    {
      "id": 1523,
      "paymentChannelId": 42,
      "paymentChannel": {
        "id": 42,
        "jobName": "Emergency Response",
        "organizationName": "Red Cross",
        "hourlyRate": 25.00,
        "maxDailyHours": 12.00,
        "escrowFundedAmount": 150.00,
        "accumulatedBalance": 15.00
      },
      "clockIn": "2025-11-30T14:30:00.000Z",
      "hourlyRate": 25.00,
      "sessionStatus": "active",
      "elapsedSeconds": 9330,  // Pre-calculated on backend
      "currentEarnings": 64.58  // Pre-calculated on backend
    },
    {
      "id": 1524,
      "paymentChannelId": 58,
      "paymentChannel": {
        "id": 58,
        "jobName": "Construction",
        "organizationName": "Habitat for Humanity",
        "hourlyRate": 18.00,
        "maxDailyHours": 10.00,
        "escrowFundedAmount": 200.00,
        "accumulatedBalance": 5.00
      },
      "clockIn": "2025-11-30T15:00:00.000Z",
      "hourlyRate": 18.00,
      "sessionStatus": "active",
      "elapsedSeconds": 7530,
      "currentEarnings": 37.65
    }
  ]
}
```

**Business Logic**:
1. Query work_sessions WHERE employee_id matches worker AND session_status = 'active'
2. JOIN with payment_channels to get job details
3. JOIN with organizations to get employer name
4. Calculate elapsed_seconds: NOW() - clock_in
5. Calculate current_earnings: (elapsed_seconds / 3600) * hourly_rate
6. Return array of active sessions with pre-calculated values

---

#### GET /api/work-sessions/ngo-active?organizationWalletAddress=rN7n7...

**Purpose**: Get all active work sessions for an NGO's payment channels (for NGO dashboard)

**Response (200 OK)**:
```json
{
  "success": true,
  "activeSessions": [
    {
      "id": 1523,
      "worker": {
        "walletAddress": "rN7n7otQDd6FczFgLdlqtyMVGXG1234567",
        "fullName": "John Doe"
      },
      "paymentChannel": {
        "id": 42,
        "jobName": "Emergency Response",
        "hourlyRate": 25.00
      },
      "clockIn": "2025-11-30T14:30:00.000Z",
      "elapsedSeconds": 9330,
      "elapsedFormatted": "2h 35m",
      "currentEarnings": 64.58,
      "sessionStatus": "active"
    }
  ],
  "summary": {
    "totalActiveWorkers": 1,
    "totalActiveHours": 2.59,
    "totalCurrentEarnings": 64.58
  }
}
```

**Business Logic**:
1. Get organization_id from wallet address
2. Query work_sessions WHERE organization_id matches AND session_status = 'active'
3. JOIN with employees to get worker details
4. JOIN with payment_channels to get job details
5. Calculate elapsed time and earnings
6. Return active sessions + summary statistics

---

## Frontend Architecture

### Component Hierarchy

```
WorkerDashboard.tsx
├── PaymentChannelCard.tsx (existing, modified)
│   ├── PaymentChannelInfo.tsx (job name, rate, balance)
│   ├── WorkSessionTimer.tsx (NEW)
│   │   ├── TimerDisplay.tsx (elapsed time + earnings)
│   │   └── ClockInOutButton.tsx (state-aware button)
│   └── ClockOutConfirmModal.tsx (NEW)
├── ActiveSessionsContext.tsx (NEW - global state)
└── useWorkSessionTimer.ts (NEW - timer logic hook)
```

### New Components

#### 1. WorkSessionTimer.tsx

**Purpose**: Inline timer display within payment channel card

**Props**:
```typescript
interface WorkSessionTimerProps {
  paymentChannelId: number;
  hourlyRate: number;
  maxDailyHours: number;
  escrowBalance: number;
  channelStatus: 'active' | 'closed' | 'closing';
}
```

**State**:
```typescript
const [activeSession, setActiveSession] = useState<WorkSession | null>(null);
const [elapsedSeconds, setElapsedSeconds] = useState(0);
const [currentEarnings, setCurrentEarnings] = useState(0);
const [isClockingIn, setIsClockingIn] = useState(false);
const [isClockingOut, setIsClockingOut] = useState(false);
```

**Behavior**:
- On mount: Check `activeSessions` context for existing session
- If session exists: Start timer, calculate elapsed from clock_in timestamp
- Timer interval: Update every 1 second
- Earnings calculation: `(elapsedSeconds / 3600) * hourlyRate`
- Warning at 90% of max_daily_hours
- Auto-stop at 100% of max_daily_hours

---

#### 2. ClockInOutButton.tsx

**Purpose**: State-aware clock-in/clock-out button

**Props**:
```typescript
interface ClockInOutButtonProps {
  paymentChannelId: number;
  isActive: boolean;  // Channel is active
  hasActiveSession: boolean;  // Worker is currently clocked in
  escrowBalance: number;
  hourlyRate: number;
  onClockIn: () => Promise<void>;
  onClockOut: () => Promise<void>;
}
```

**States**:
```typescript
// Not clocked in + channel active + sufficient escrow
<button className="bg-green-600 hover:bg-green-700">
  ▶️ CLOCK IN
</button>

// Clocked in
<button className="bg-red-600 hover:bg-red-700">
  ⏸️ CLOCK OUT
</button>

// Insufficient escrow
<button disabled className="bg-gray-400 cursor-not-allowed" title="INSUFFICIENT ESCROW">
  ▶️ CLOCK IN (DISABLED)
</button>

// Channel closed
// No button rendered
```

---

#### 3. ClockOutConfirmModal.tsx

**Purpose**: Confirmation modal before clocking out (prevent accidental clicks)

**Props**:
```typescript
interface ClockOutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  sessionSummary: {
    jobName: string;
    organizationName: string;
    clockIn: Date;
    elapsedTime: string;  // "2h 35m 42s"
    earnings: number;  // XAH
    hourlyRate: number;
  };
}
```

**UI**:
```
┌─────────────────────────────────────────┐
│ ⚠️ CONFIRM CLOCK OUT                    │
├─────────────────────────────────────────┤
│                                         │
│ JOB: Emergency Response                 │
│ EMPLOYER: Red Cross                     │
│                                         │
│ STARTED: 2:30 PM                        │
│ DURATION: 2h 35m 42s                    │
│ RATE: $25/hr                            │
│ EARNINGS: 64.58 XAH                     │
│                                         │
│ [CANCEL]  [CONFIRM CLOCK OUT]           │
└─────────────────────────────────────────┘
```

---

#### 4. ActiveSessionsContext.tsx

**Purpose**: Global state management for active work sessions (avoid prop drilling)

**Context**:
```typescript
interface ActiveSessionsContextType {
  activeSessions: Map<number, WorkSession>;  // Map<paymentChannelId, WorkSession>
  addActiveSession: (paymentChannelId: number, session: WorkSession) => void;
  removeActiveSession: (paymentChannelId: number) => void;
  refreshActiveSessions: () => Promise<void>;
}

const ActiveSessionsContext = createContext<ActiveSessionsContextType | null>(null);
```

**Behavior**:
- On mount: Fetch all active sessions from `/api/work-sessions/active`
- Store in Map for O(1) lookup by payment channel ID
- Provide methods to add/remove sessions (after clock-in/out)
- Auto-refresh every 60 seconds (in case of network issues)

---

#### 5. useWorkSessionTimer.ts (Custom Hook)

**Purpose**: Reusable timer logic for work sessions

**Hook**:
```typescript
interface UseWorkSessionTimerResult {
  elapsedSeconds: number;
  elapsedFormatted: string;  // "2h 35m 42s"
  currentEarnings: number;
  isNearingLimit: boolean;  // True if > 90% of max_daily_hours
  hasReachedLimit: boolean;  // True if >= max_daily_hours
  startTimer: (clockInTime: Date) => void;
  stopTimer: () => void;
}

function useWorkSessionTimer(
  hourlyRate: number,
  maxDailyHours: number
): UseWorkSessionTimerResult;
```

**Implementation**:
```typescript
export function useWorkSessionTimer(
  hourlyRate: number,
  maxDailyHours: number
): UseWorkSessionTimerResult {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clockInTime, setClockInTime] = useState<Date | null>(null);
  const intervalRef = useRef<number | null>(null);

  const startTimer = (clockIn: Date) => {
    setClockInTime(clockIn);

    // Clear any existing interval
    if (intervalRef.current) clearInterval(intervalRef.current);

    // Update timer every second
    intervalRef.current = window.setInterval(() => {
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - clockIn.getTime()) / 1000);
      setElapsedSeconds(elapsed);

      // Auto-stop if max hours reached
      if (elapsed >= maxDailyHours * 3600) {
        stopTimer();
        // Trigger auto-clock-out (implementation detail)
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setElapsedSeconds(0);
    setClockInTime(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Calculate derived values
  const currentEarnings = (elapsedSeconds / 3600) * hourlyRate;
  const elapsedHours = elapsedSeconds / 3600;
  const isNearingLimit = elapsedHours >= maxDailyHours * 0.9;
  const hasReachedLimit = elapsedHours >= maxDailyHours;

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  const elapsedFormatted = `${hours}h ${minutes}m ${seconds}s`;

  return {
    elapsedSeconds,
    elapsedFormatted,
    currentEarnings,
    isNearingLimit,
    hasReachedLimit,
    startTimer,
    stopTimer
  };
}
```

---

### PaymentChannelCard.tsx Modification

**Before**:
```tsx
<div className="payment-channel-card">
  <h3>{jobName}</h3>
  <p>Rate: {hourlyRate} XAH/hr</p>
  <p>Balance: {accumulatedBalance} XAH</p>
  <button onClick={handleCloseChannel}>CLOSE CHANNEL</button>
</div>
```

**After**:
```tsx
<div className="payment-channel-card">
  <h3>{jobName}</h3>
  <p>Rate: {hourlyRate} XAH/hr | Escrow: {escrowBalance} XAH</p>
  <p>Balance: {accumulatedBalance} XAH</p>

  {/* NEW: Inline timer component */}
  <WorkSessionTimer
    paymentChannelId={id}
    hourlyRate={hourlyRate}
    maxDailyHours={maxDailyHours}
    escrowBalance={escrowBalance}
    channelStatus={status}
  />

  <button onClick={handleCloseChannel}>CLOSE CHANNEL</button>
</div>
```

---

## Real-Time Updates (WebSocket Strategy)

### Architecture Decision: Polling vs WebSocket

**Recommendation**: Start with **polling** (simpler), migrate to **WebSocket** if performance issues

#### Phase 1: HTTP Polling (Recommended First)

**Worker Dashboard**:
- Poll `/api/work-sessions/active` every 60 seconds
- Only when worker has at least 1 active session
- Stop polling when all sessions ended

**NGO Dashboard**:
- Poll `/api/work-sessions/ngo-active` every 10 seconds
- Only when NGO dashboard is actively viewing "ACTIVE WORKERS" section
- Use `visibilitychange` API to pause polling when tab hidden

**Pros**:
- Simple implementation (no WebSocket infrastructure)
- Works behind corporate firewalls/proxies
- Easier to debug and test

**Cons**:
- Slight delay in updates (up to 60s for workers, 10s for NGOs)
- More server requests (but manageable for < 1000 concurrent users)

---

#### Phase 2: WebSocket (Future Enhancement)

**Technology**: Socket.io (or native WebSocket + heartbeat)

**Events**:
```typescript
// Worker subscribes to their own sessions
socket.emit('subscribe:worker-sessions', { workerWalletAddress });

// Server pushes updates
socket.on('work-session:started', (session: WorkSession) => {
  // Add to activeSessions
});

socket.on('work-session:ended', (session: WorkSession) => {
  // Remove from activeSessions
});

// NGO subscribes to their organization's sessions
socket.emit('subscribe:ngo-sessions', { organizationWalletAddress });

// Server pushes updates
socket.on('ngo:session-started', (data) => {
  // Update active workers list
});

socket.on('ngo:session-ended', (data) => {
  // Update active workers list
});
```

**Implementation**:
- Socket.io server in `backend/server.js`
- Namespace `/work-sessions` for session-related events
- Authentication via JWT token in socket handshake
- Reconnection logic with exponential backoff

**Pros**:
- True real-time updates (< 1 second latency)
- Reduced server load (no constant polling)
- Better UX for NGOs monitoring active workers

**Cons**:
- More complex infrastructure
- Requires WebSocket support (firewalls may block)
- State management complexity (connection drops, reconnection)

---

## Edge Cases & Error Handling

### Edge Case 1: Browser Crash During Active Session

**Scenario**: Worker clocks in, browser crashes, never clocks out manually

**Solution**:
1. **Zombie Session Cleanup Job**: Cron job runs every hour
2. Query work_sessions WHERE session_status = 'active' AND clock_in < NOW() - INTERVAL '24 hours'
3. Auto-clock-out with session_status = 'timeout'
4. Calculate hours_worked and total_amount based on 24-hour cap
5. Notification to worker: "YOUR SESSION WAS AUTO-CLOSED AFTER 24 HOURS"

**Prevention**:
- Frontend sends heartbeat every 5 minutes while session active
- Backend tracks last_heartbeat in work_sessions
- Auto-close sessions with no heartbeat for > 30 minutes (configurable)

---

### Edge Case 2: Payment Channel Closed While Worker Clocked In

**Scenario**: NGO closes payment channel while worker has active session

**Solution**:
1. Before closing payment channel, check for active work sessions
2. If active sessions exist, show warning modal:
   ```
   ⚠️ WARNING: WORKER JOHN DOE IS CURRENTLY CLOCKED IN

   ACTIVE SESSION: 2h 35m (64.58 XAH)

   YOU MUST WAIT FOR WORKER TO CLOCK OUT BEFORE CLOSING CHANNEL

   OPTIONS:
   [NOTIFY WORKER]  [FORCE CLOSE (AUTO-CLOCK-OUT)]  [CANCEL]
   ```
3. If NGO chooses "FORCE CLOSE":
   - Auto-clock-out worker's session
   - Set session_status = 'force_closed'
   - Send notification to worker
   - Include accumulated balance in channel closure

**Alternative**: Block channel closure entirely if active sessions exist

---

### Edge Case 3: Network Interruption During Clock-In

**Scenario**: Worker clicks "CLOCK IN", request sent, network drops before response

**Solution**:
1. Frontend shows loading state: "CLOCKING IN..."
2. Retry with exponential backoff (3 attempts: 1s, 2s, 4s)
3. After 3 failures, show error: "FAILED TO CLOCK IN. CHECK NETWORK CONNECTION"
4. On retry, backend checks for duplicate sessions (idempotency):
   ```sql
   -- Before inserting, check if session already exists
   SELECT * FROM work_sessions
   WHERE employee_id = ?
     AND payment_channel_id = ?
     AND session_status = 'active'
     AND clock_in > NOW() - INTERVAL '5 minutes';

   -- If exists, return existing session instead of creating duplicate
   ```

---

### Edge Case 4: Simultaneous Clock-In from Multiple Devices

**Scenario**: Worker has app open on phone and laptop, clicks "CLOCK IN" on both simultaneously

**Solution**:
1. Backend uses database-level unique constraint or transaction locking
2. First request succeeds, second request gets 400 error: "ALREADY CLOCKED IN"
3. Frontend polls `/api/work-sessions/active` after clock-in to sync state
4. Both devices show timer after sync (< 5 seconds)

**Database Constraint**:
```sql
-- Partial unique index: Only one active session per payment channel per worker
CREATE UNIQUE INDEX idx_work_sessions_unique_active
ON work_sessions(employee_id, payment_channel_id)
WHERE session_status = 'active';
```

---

### Edge Case 5: Timer Drift (Frontend vs Backend Time)

**Scenario**: Frontend timer shows 2h 35m, backend calculates 2h 36m (timezone issues, clock drift)

**Solution**:
1. **Source of Truth**: Backend database timestamp (clock_in in UTC)
2. Frontend calculates elapsed from server-provided timestamp (not local clock)
3. On clock-out, backend recalculates hours_worked from database timestamps
4. Periodic sync: Frontend re-fetches active sessions every 60s to correct drift
5. Display warning if drift > 5 seconds: "TIMER MAY BE INACCURATE. REFRESHING..."

---

## Testing Plan

### Unit Tests

**Backend**:
- `/api/work-sessions/clock-in` endpoint
  - ✅ Success: Clock in creates work_sessions record
  - ✅ Error: Duplicate clock-in returns 400
  - ✅ Error: Insufficient escrow returns 400
  - ✅ Error: Max daily hours exceeded returns 400
  - ✅ Error: Inactive payment channel returns 400
  - ✅ Authorization: Wrong wallet address returns 403

- `/api/work-sessions/clock-out` endpoint
  - ✅ Success: Clock out updates session + payment channel balance
  - ✅ Success: Hours and earnings calculated correctly
  - ✅ Error: Session not found returns 400
  - ✅ Error: Session already completed returns 400
  - ✅ Transaction: All updates are atomic (rollback on error)

- `/api/work-sessions/active` endpoint
  - ✅ Returns all active sessions for worker
  - ✅ Pre-calculates elapsed time and earnings
  - ✅ Returns empty array if no active sessions

**Frontend**:
- `useWorkSessionTimer` hook
  - ✅ Timer increments every second
  - ✅ Earnings calculated correctly
  - ✅ Warning triggers at 90% of max hours
  - ✅ Auto-stop triggers at 100% of max hours
  - ✅ Timer persists across component re-renders

- `WorkSessionTimer` component
  - ✅ Displays timer when active session exists
  - ✅ Displays "CLOCK IN" button when no active session
  - ✅ Displays "CLOCK OUT" button when clocked in
  - ✅ Button disabled when insufficient escrow

### Integration Tests

- **End-to-End Clock-In/Out Flow**:
  1. Worker clicks "CLOCK IN" on payment channel card
  2. API creates work_sessions record
  3. Timer starts and increments
  4. Worker waits 10 seconds
  5. Worker clicks "CLOCK OUT"
  6. Confirmation modal appears
  7. Worker confirms
  8. API updates work_sessions + payment_channels
  9. Timer stops and button changes to "CLOCK IN"

- **Multi-Channel Simultaneous Sessions**:
  1. Worker clocks into Channel A
  2. Worker clocks into Channel B
  3. Both timers run independently
  4. Worker clocks out of Channel A
  5. Channel B timer continues running
  6. Database has 1 active session (Channel B) and 1 completed session (Channel A)

- **Timer Persistence Across Page Refresh**:
  1. Worker clocks in
  2. Wait 30 seconds
  3. Refresh page
  4. Timer resumes from correct elapsed time (30+ seconds)
  5. Earnings display correct value

- **NGO Real-Time Visibility**:
  1. Worker clocks into NGO's payment channel
  2. NGO dashboard shows worker in "ACTIVE WORKERS" section
  3. Worker clocks out
  4. NGO dashboard removes worker from "ACTIVE WORKERS" (within 10 seconds)

### Manual Testing Checklist

- [ ] Clock in to single payment channel
- [ ] Clock in to multiple payment channels simultaneously
- [ ] Timer displays correct elapsed time
- [ ] Earnings update in real-time
- [ ] Clock out shows confirmation modal
- [ ] Clock out updates payment channel balance
- [ ] Refresh page with active timer (timer resumes)
- [ ] Close browser with active timer, reopen (timer resumes)
- [ ] Attempt clock-in with insufficient escrow (button disabled)
- [ ] Attempt clock-in with closed payment channel (no button)
- [ ] Warning displays at 90% of max daily hours
- [ ] Auto-clock-out at 100% of max daily hours
- [ ] NGO dashboard shows active workers in real-time
- [ ] Multiple devices (phone + laptop) sync timer state
- [ ] Network interruption during clock-in (retry logic works)

---

## Implementation Phases

### Phase 1: Database & Backend API (Week 1)

**Tasks**:
- [ ] Create migration 007_add_per_channel_timers.sql
- [ ] Run migration on development database
- [ ] **ACTIVATE maxHoursPerDay field**: Wire frontend → backend → database
  - [ ] Update `backend/routes/paymentChannels.js:create` to accept `maxHoursPerDay` in request body
  - [ ] Add `maxHoursPerDay` to INSERT statement (lines 114-137)
  - [ ] Validate range: 0 < maxHoursPerDay <= 24
  - [ ] Return `maxDailyHours` in API response
- [ ] Implement POST /api/work-sessions/clock-in endpoint
  - [ ] Validate max daily hours not exceeded before clock-in
  - [ ] Check total hours worked today vs max_daily_hours from payment channel
- [ ] Implement POST /api/work-sessions/clock-out endpoint
- [ ] Implement GET /api/work-sessions/active endpoint
  - [ ] Return max_daily_hours per session for frontend timer warnings
- [ ] Implement GET /api/work-sessions/ngo-active endpoint
- [ ] Write backend unit tests (Jest)
- [ ] Test endpoints with Postman/curl

**Deliverables**:
- ✅ Database schema updated (max_daily_hours column added)
- ✅ Frontend maxHoursPerDay field ACTIVATED (wired to backend/database)
- ✅ All 4 work session endpoints functional
- ✅ Max daily hours validation enforced
- ✅ 80%+ test coverage for endpoints

---

### Phase 2: Frontend Components (Week 2)

**Tasks**:
- [ ] Create ActiveSessionsContext.tsx
- [ ] Create useWorkSessionTimer.ts hook
- [ ] Create WorkSessionTimer.tsx component
- [ ] Create ClockInOutButton.tsx component
- [ ] Create ClockOutConfirmModal.tsx component
- [ ] Modify PaymentChannelCard.tsx to include timer
- [ ] Add API client methods to frontend/src/services/api.ts
- [ ] Write frontend unit tests (Vitest/React Testing Library)

**Deliverables**:
- ✅ All components functional
- ✅ Timer displays correctly on payment channel cards
- ✅ Clock-in/out works end-to-end

---

### Phase 3: NGO Dashboard Integration (Week 2)

**Tasks**:
- [ ] Add "ACTIVE WORK SESSIONS" section to NgoDashboard.tsx
- [ ] Implement polling for /api/work-sessions/ngo-active (every 10 seconds)
- [ ] Display active workers with live timers
- [ ] Add pause polling when tab hidden (visibilitychange API)
- [ ] Add summary statistics (total active workers, total earnings)

**Deliverables**:
- ✅ NGO can see real-time worker sessions
- ✅ Polling works efficiently (pauses when tab hidden)

---

### Phase 4: Edge Case Handling & Polish (Week 3)

**Tasks**:
- [ ] Implement zombie session cleanup cron job
- [ ] Add max daily hours enforcement
- [ ] Add warning at 90% of max hours
- [ ] Add auto-clock-out at 100% of max hours
- [ ] Handle payment channel closure with active sessions
- [ ] Add retry logic for network interruptions
- [ ] Add idempotency for clock-in (prevent duplicates)
- [ ] Add timer drift correction (periodic sync)
- [ ] Add heartbeat mechanism (optional)

**Deliverables**:
- ✅ All edge cases handled
- ✅ Production-ready error handling

---

### Phase 5: Testing & Deployment (Week 3-4)

**Tasks**:
- [ ] Run full integration test suite
- [ ] Complete manual testing checklist
- [ ] Test on multiple devices (phone, tablet, laptop)
- [ ] Test on multiple browsers (Chrome, Safari, Firefox)
- [ ] Load testing (simulate 100+ concurrent workers)
- [ ] Deploy to staging environment
- [ ] User acceptance testing (UAT)
- [ ] Deploy to production
- [ ] Monitor for errors in production

**Deliverables**:
- ✅ Production deployment successful
- ✅ Zero critical bugs in first week

---

## Success Metrics

### Functional Success
- ✅ Workers can clock into multiple payment channels independently
- ✅ Timers persist across browser refresh/close
- ✅ Earnings calculated accurately in real-time
- ✅ NGOs can see live worker sessions
- ✅ Max daily hours enforced automatically

### Performance Success
- ⏱️ Clock-in API response < 200ms (p95)
- ⏱️ Clock-out API response < 300ms (p95)
- ⏱️ Active sessions query < 100ms (p95)
- ⏱️ Frontend timer updates without lag (<16ms per frame)
- 📊 Zero timer drift > 5 seconds after 8-hour session

### Reliability Success
- 🔄 99% clock-in success rate (network retries work)
- 🔄 Zero duplicate sessions created (idempotency works)
- 🔄 100% timer restoration after page refresh
- 🔄 Zombie session cleanup runs successfully daily

---

## Security Considerations

### Authorization
- ✅ Workers can only clock into their own payment channels (wallet validation)
- ✅ NGOs can only view their own organization's active sessions
- ✅ API endpoints require valid JWT authentication
- ✅ No privilege escalation vulnerabilities

### Input Validation
- ✅ Payment channel ID validated (exists, belongs to worker)
- ✅ Wallet addresses validated (XRPL format)
- ✅ Max daily hours validated (range: 1-24)
- ✅ SQL injection prevention (parameterized queries)

### Rate Limiting
- ⚠️ Max 10 clock-in/out requests per minute per worker
- ⚠️ Max 100 active sessions query per minute per user
- ⚠️ Exponential backoff on repeated failures

### Data Integrity
- ✅ Database constraints prevent duplicate active sessions
- ✅ Transactions ensure atomic updates (session + payment channel)
- ✅ Timestamp storage in UTC (no timezone issues)
- ✅ Decimal precision for hours/earnings (no floating point errors)

---

## Future Enhancements (Not in Scope)

### Post-MVP Features

1. **Session Editing**:
   - Workers can request corrections to logged hours
   - NGOs can approve/reject edit requests
   - Audit trail for all edits

2. **Break Tracking**:
   - "PAUSE" button to stop timer without clocking out
   - Breaks tracked separately from active work time
   - Unpaid break deductions from total hours

3. **Geolocation Verification**:
   - Optional GPS check-in for on-site jobs
   - NGO configures geofence radius
   - Clock-in blocked if outside geofence

4. **Overtime Rules**:
   - Automatic 1.5x rate after 8 hours
   - Configurable overtime thresholds per channel
   - Overtime balance tracked separately

5. **Advanced Analytics**:
   - Worker productivity charts (hours per week)
   - NGO workforce utilization graphs
   - Cost forecasting based on active sessions

6. **Mobile App**:
   - React Native app for workers
   - Push notifications for clock-in reminders
   - Background timer (continues even when app closed)

---

## Open Questions / Decisions Needed

1. **Heartbeat Frequency**: Should we implement heartbeat to detect zombie sessions early? (Recommended: Yes, every 5 minutes)

2. **Auto-Clock-Out Threshold**: Should max_daily_hours be strict (auto-stop) or flexible (warning only)? (Decided: Strict auto-stop)

3. **Polling vs WebSocket**: Start with polling or go straight to WebSocket? (Recommended: Polling Phase 1, WebSocket Phase 2)

4. **Session History**: Should workers see a timeline of past sessions? (Future enhancement)

5. **Notification System**: Email/SMS when worker clocks in/out? (Future enhancement)

---

## Conclusion

This PRD defines a comprehensive per-channel clock-in system that solves the multi-organization worker time tracking problem. The implementation is phased over 3-4 weeks, starting with backend APIs, then frontend components, and finally polish and edge cases.

**Key Benefits**:
- ✅ Workers can accurately track time for multiple jobs
- ✅ NGOs get real-time visibility into workforce activity
- ✅ Timers persist across sessions (no data loss)
- ✅ Earnings calculated automatically in real-time
- ✅ Maximum daily hours enforced automatically
- ✅ Scalable architecture for future growth

**Next Steps**:
1. Review PRD with stakeholders
2. Prioritize Phase 1 (database + backend)
3. Create Jira tickets for all tasks
4. Begin implementation Week 1

---

**Document Status**: ✅ READY FOR REVIEW
**Approval Required**: Product Owner, Engineering Lead
**Target Start Date**: 2025-12-02
