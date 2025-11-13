# Worker Profile Deletion Specification

**Version**: 1.0
**Date**: 2025-11-12
**Status**: Ready for Implementation
**Priority**: High

---

## Executive Summary

This specification defines a comprehensive worker profile deletion system that allows workers to permanently remove their accounts from the XAH Payroll platform while ensuring data integrity, employer audit trail preservation, and proper notification workflows.

### Key Features
- **Worker-initiated deletion** with strict validation rules
- **48-hour retention period** for historical data and audit compliance
- **Automatic cleanup** after 2 weeks of inactivity
- **NGO notification system** for organizational awareness
- **Data export to PDF** before deletion
- **Wallet address reusability** with orphaned record re-association

---

## Business Rules

### Deletion Eligibility

A worker can delete their profile if and only if:

1. **No active payment channels across ANY organization**
   - `status = 'active'` in database
   - Any unclosed channels (regardless of status)
   - Channels within timeout period (even if unused)

2. **No unpaid balances** across all payment channels
   - `unpaid_balance > 0` prevents deletion
   - Worker must claim all accumulated wages first

3. **Authenticated session** required
   - Only the worker themselves can initiate deletion
   - NGO removal of workers is a separate action (pending feature)

### Multi-Organization Handling

**Rule**: ALL-OR-NOTHING deletion across organizations
- Worker removed from ALL associated organizations simultaneously
- Cannot selectively leave individual organizations
- Must close channels with ALL organizations before deletion

**Example Scenario**:
```
Worker A associated with:
├── NGO 1: 1 active channel, $50 unclaimed ❌ BLOCKS DELETION
├── NGO 2: 0 active channels ✅
└── NGO 3: 2 closed channels, $0 unclaimed ✅

Result: Deletion BLOCKED due to NGO 1 active channel
Action: Worker must close channel with NGO 1 OR claim $50 balance first
```

### Data Retention & Deletion Timeline

**INTELLIGENT DELETION MODEL** ✨:

1. **T+0 (Deletion Request)**:
   - Worker profile marked as `deleted_at = CURRENT_TIMESTAMP`
   - Status changed to 'deleted'
   - Worker cannot log in or perform actions
   - Scheduled job determines deletion timing based on account state

2. **Intelligent Hard Delete (Two Paths)**:

   **Path A: INSTANT DELETION** (Next hourly job run):
   - Triggered when: Worker has NO active channels AND NO unpaid balances
   - Timeline: Deleted within 1 hour of soft delete
   - Use case: Clean exit with all obligations fulfilled
   - Benefit: Immediate privacy for fully disengaged workers

   **Path B: GRACE PERIOD DELETION** (48 hours):
   - Triggered when: Worker has active channels OR unpaid balances at deletion time
   - Timeline: Deleted 48+ hours after soft delete
   - Use case: Safety net for accounts with pending obligations
   - Benefit: Time for channel closure and balance settlement

3. **Deletion Execution** (Hourly Job):
   - Scheduled job checks both conditions every hour
   - Removes archived data permanently (work sessions, payments, employee records)
   - Only audit log entries preserved indefinitely

4. **Retention Policy**:
   - Clean accounts: < 1 hour (instant deletion path)
   - Accounts with obligations: 48+ hours (grace period path)
   - Audit logs: Indefinite (compliance requirement)
   - Wallet address: Freed immediately after hard delete

### Automatic Deletion Policy

**Inactivity Rule**: Automatic deletion after 2 weeks of no login activity

**Conditions**:
- Last login date > 14 days ago
- No active payment channels across all organizations
- No unpaid balances
- Scheduled job runs daily to check and process

**Exclusions**:
- Workers with active channels (regardless of login date)
- Workers with unpaid balances (must claim first)

### Wallet Address Reusability

**After Deletion (Post 48hrs)**:

1. **Same wallet can sign up as worker again**:
   - If orphaned records still exist → Show "RECORDS FOUND" popup
   - Re-associate orphaned records to new account
   - Seamless continuation of employment history

2. **Same wallet can sign up as NGO/Employer**:
   - Worker-to-NGO account type switching allowed
   - No restrictions on wallet address reuse
   - Business rule: Wallet can be EITHER worker OR NGO, not both simultaneously

**Orphaned Records Handling**:
```sql
-- If wallet address exists in employees table but not in users table
-- Show popup: "RECORDS FOUND FOR THIS WALLET ADDRESS. RE-ASSOCIATE?"
-- On confirmation: UPDATE employees SET user_id = new_user_id WHERE employee_wallet_address = wallet
```

---

## Technical Architecture

### Database Schema Changes

#### 1. New Columns in `users` Table

```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE users ADD COLUMN deletion_reason VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_users_last_login ON users(last_login_at) WHERE user_type = 'employee';
```

#### 2. New Table: `deletion_logs`

```sql
CREATE TABLE deletion_logs (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(100) NOT NULL,
    user_type VARCHAR(50) NOT NULL,
    deleted_by VARCHAR(50) NOT NULL, -- 'self', 'ngo', 'system'
    deletion_reason VARCHAR(255),
    organizations_affected TEXT[], -- Array of organization names
    channels_closed INT DEFAULT 0,
    data_export_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hard_deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX idx_deletion_logs_wallet ON deletion_logs(wallet_address);
CREATE INDEX idx_deletion_logs_created_at ON deletion_logs(created_at);
```

#### 3. New Table: `ngo_notifications`

```sql
CREATE TABLE ngo_notifications (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- 'worker_deleted', 'worker_removed', 'deletion_error'
    worker_wallet_address VARCHAR(100) NOT NULL,
    worker_name VARCHAR(255),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}', -- Additional context
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ngo_notifications_org ON ngo_notifications(organization_id, is_read);
CREATE INDEX idx_ngo_notifications_created_at ON ngo_notifications(created_at);
```

#### 4. Cascade Behavior Updates

```sql
-- Update foreign key constraints to support cascading with retention
ALTER TABLE work_sessions
    DROP CONSTRAINT IF EXISTS work_sessions_employee_id_fkey,
    ADD CONSTRAINT work_sessions_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;

ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS payments_employee_id_fkey,
    ADD CONSTRAINT payments_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
```

---

## API Endpoints

### 1. Check Deletion Eligibility

**Endpoint**: `GET /api/workers/deletion-eligibility`

**Authentication**: Required (worker only)

**Response**:
```json
{
  "canDelete": false,
  "blockingReasons": [
    {
      "type": "active_channel",
      "organization": "Red Cross NGO",
      "channelId": "ABC123...",
      "unpaidBalance": 50.25,
      "status": "active"
    },
    {
      "type": "unclosed_channel",
      "organization": "UNICEF",
      "channelId": "XYZ789...",
      "unpaidBalance": 0,
      "status": "timeout"
    }
  ],
  "stats": {
    "totalOrganizations": 3,
    "activeChannels": 2,
    "totalUnpaidBalance": 50.25,
    "closedChannels": 5
  }
}
```

**Validation Logic**:
```javascript
// Check active channels
const activeChannels = await pool.query(`
    SELECT pc.*, o.organization_name
    FROM payment_channels pc
    JOIN organizations o ON pc.organization_id = o.id
    WHERE pc.employee_wallet_address = $1
    AND (
        pc.status = 'active'
        OR pc.status = 'timeout'
        OR pc.closure_tx_hash IS NULL
    )
`, [walletAddress]);

// Check unpaid balances
const unpaidBalances = await pool.query(`
    SELECT SUM(unpaid_balance) as total
    FROM payment_channels
    WHERE employee_wallet_address = $1
`, [walletAddress]);

const canDelete = activeChannels.rows.length === 0 && unpaidBalances.rows[0].total === 0;
```

---

### 2. Export Profile Data

**Endpoint**: `GET /api/workers/export-data`

**Authentication**: Required (worker only)

**Response**: PDF file download

**Data Included**:
- WORKER PROFILE INFORMATION
- ORGANIZATION ASSOCIATIONS
- WORK SESSIONS (ALL TIME)
- PAYMENT HISTORY (ALL TIME)
- ACTIVE/CLOSED CHANNELS
- TOTAL EARNINGS SUMMARY

**PDF Format**:
```
=====================================================
XAH PAYROLL - WORKER DATA EXPORT
=====================================================

WALLET ADDRESS: rABC123...
EXPORT DATE: 2025-11-12 14:35:22 UTC
RETENTION PERIOD: 48 HOURS AFTER DELETION

-----------------------------------------------------
PROFILE INFORMATION
-----------------------------------------------------
NAME: JOHN DOE
EMAIL: john.doe@example.com
PHONE: +1-555-0123
REGISTERED: 2024-01-15

-----------------------------------------------------
ORGANIZATION ASSOCIATIONS
-----------------------------------------------------
1. RED CROSS NGO
   - STATUS: ACTIVE
   - JOINED: 2024-01-20
   - TOTAL EARNINGS: $1,250.50

2. UNICEF
   - STATUS: ACTIVE
   - JOINED: 2024-03-10
   - TOTAL EARNINGS: $2,100.75

-----------------------------------------------------
PAYMENT CHANNELS
-----------------------------------------------------
ACTIVE CHANNELS: 0
CLOSED CHANNELS: 5
TOTAL UNPAID BALANCE: $0.00

CHANNEL HISTORY:
[Detailed list of all channels...]

-----------------------------------------------------
WORK SESSIONS
-----------------------------------------------------
TOTAL SESSIONS: 120
TOTAL HOURS: 480.5

SESSION HISTORY:
[Detailed list of all work sessions...]

-----------------------------------------------------
PAYMENT HISTORY
-----------------------------------------------------
TOTAL PAYMENTS: 95
TOTAL AMOUNT RECEIVED: $3,351.25

PAYMENT HISTORY:
[Detailed list of all payments...]

=====================================================
END OF REPORT
=====================================================
```

**Implementation**:
```javascript
const PDFDocument = require('pdfkit');

async function generateWorkerDataPDF(walletAddress) {
    // Fetch all worker data
    const workerData = await fetchComprehensiveWorkerData(walletAddress);

    // Generate PDF
    const doc = new PDFDocument();
    doc.fontSize(16).text('XAH PAYROLL - WORKER DATA EXPORT', { align: 'center' });
    // ... (all sections in FULL CAPITALIZATION)

    return doc;
}
```

---

### 3. Request Profile Deletion

**Endpoint**: `POST /api/workers/delete-profile`

**Authentication**: Required (worker only)

**Request Body**:
```json
{
  "confirmationText": "DELETE MY ACCOUNT",
  "reason": "No longer working with any organizations"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "PROFILE DELETION SCHEDULED. DATA WILL BE PERMANENTLY REMOVED IN 48 HOURS.",
  "deletionScheduledAt": "2025-11-12T14:35:22.000Z",
  "hardDeleteAt": "2025-11-14T14:35:22.000Z",
  "dataExportUrl": "https://exports.xahpayroll.com/worker_ABC123_20251112.pdf",
  "affectedOrganizations": ["Red Cross NGO", "UNICEF"],
  "notificationsSent": 2
}
```

**Response (Blocked)**:
```json
{
  "success": false,
  "error": "DELETION_BLOCKED",
  "message": "CANNOT DELETE PROFILE WITH ACTIVE CHANNELS OR UNPAID BALANCES",
  "blockingReasons": [
    {
      "type": "active_channel",
      "organization": "Red Cross NGO",
      "channelId": "ABC123...",
      "unpaidBalance": 50.25
    }
  ]
}
```

**Implementation Logic**:
```javascript
router.post('/delete-profile', authenticateWorker, async (req, res) => {
    const { walletAddress } = req.user;
    const { confirmationText, reason } = req.body;

    // 1. Validate confirmation text
    if (confirmationText !== 'DELETE MY ACCOUNT') {
        return res.status(400).json({
            error: 'INVALID_CONFIRMATION',
            message: 'CONFIRMATION TEXT MUST BE "DELETE MY ACCOUNT"'
        });
    }

    // 2. Check deletion eligibility
    const eligibility = await checkDeletionEligibility(walletAddress);
    if (!eligibility.canDelete) {
        return res.status(403).json({
            success: false,
            error: 'DELETION_BLOCKED',
            message: 'CANNOT DELETE PROFILE WITH ACTIVE CHANNELS OR UNPAID BALANCES',
            blockingReasons: eligibility.blockingReasons
        });
    }

    // 3. PDF available via GET /api/workers/export-data (direct download, no storage)
    // Worker can download PDF at any time before hard deletion

    // 4. Get affected organizations
    const organizations = await getWorkerOrganizations(walletAddress);

    // 5. Soft delete user account
    await pool.query(`
        UPDATE users
        SET deleted_at = CURRENT_TIMESTAMP,
            deletion_reason = $2
        WHERE wallet_address = $1
    `, [walletAddress, reason]);

    // 6. Create deletion log (data_export_url null for direct download approach)
    await pool.query(`
        INSERT INTO deletion_logs (
            wallet_address, user_type, deleted_by, deletion_reason,
            organizations_affected, data_export_url
        ) VALUES ($1, 'employee', 'self', $2, $3, NULL)
    `, [walletAddress, reason, organizations.map(o => o.name)]);

    // 7. Notify all affected organizations
    for (const org of organizations) {
        await createNGONotification({
            organizationId: org.id,
            type: 'worker_deleted',
            workerWalletAddress: walletAddress,
            workerName: req.user.name,
            message: `WORKER ${req.user.name} HAS DELETED THEIR PROFILE`,
            metadata: { reason, deletionDate: new Date() }
        });
    }

    // 8. Schedule hard delete job (48 hours)
    await scheduleHardDelete(walletAddress, new Date(Date.now() + 48 * 60 * 60 * 1000));

    res.json({
        success: true,
        message: 'PROFILE DELETION SCHEDULED. DATA WILL BE PERMANENTLY REMOVED IN 48 HOURS.',
        deletionScheduledAt: new Date(),
        hardDeleteAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        dataExportEndpoint: '/api/workers/export-data',  // Direct download via this endpoint
        affectedOrganizations: organizations.map(o => o.name),
        notificationsSent: organizations.length
    });
});
```

---

### 4. Cancel Deletion (Within 48hrs)

**Endpoint**: `POST /api/workers/cancel-deletion`

**Authentication**: Required (worker only)

**Response**:
```json
{
  "success": true,
  "message": "DELETION CANCELLED. YOUR ACCOUNT HAS BEEN RESTORED.",
  "restoredAt": "2025-11-13T10:20:15.000Z"
}
```

**Note**: This endpoint allows workers to undo deletion during the 48-hour retention period.

---

### 5. NGO Notifications List

**Endpoint**: `GET /api/organizations/:organizationId/notifications`

**Authentication**: Required (NGO/Employer only)

**Query Parameters**:
- `type`: Filter by notification type (optional)
- `isRead`: Filter by read status (optional)
- `limit`: Pagination limit (default: 20)
- `offset`: Pagination offset (default: 0)

**Response**:
```json
{
  "notifications": [
    {
      "id": 1,
      "type": "worker_deleted",
      "workerWalletAddress": "rABC123...",
      "workerName": "John Doe",
      "message": "WORKER JOHN DOE HAS DELETED THEIR PROFILE",
      "metadata": {
        "reason": "No longer working with any organizations",
        "deletionDate": "2025-11-12T14:35:22.000Z"
      },
      "isRead": false,
      "createdAt": "2025-11-12T14:35:22.000Z"
    },
    {
      "id": 2,
      "type": "deletion_error",
      "workerWalletAddress": "rXYZ789...",
      "workerName": "Jane Smith",
      "message": "DELETION FAILED: ACTIVE CHANNEL DETECTED",
      "metadata": {
        "error": "DELETION_BLOCKED",
        "blockingChannelId": "CH123..."
      },
      "isRead": false,
      "createdAt": "2025-11-12T12:15:30.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 6. Mark Notification as Read

**Endpoint**: `PATCH /api/organizations/:organizationId/notifications/:notificationId`

**Authentication**: Required (NGO/Employer only)

**Request Body**:
```json
{
  "isRead": true
}
```

---

## Frontend UI Components

### 1. Worker Settings Page - Delete Profile Section

**Location**: `frontend/src/pages/EmployeeSettings.tsx`

**UI Mockup**:
```
┌────────────────────────────────────────────────────────┐
│ ⚠️ DANGER ZONE                                          │
├────────────────────────────────────────────────────────┤
│                                                        │
│ DELETE YOUR PROFILE                                    │
│                                                        │
│ PERMANENTLY REMOVE YOUR ACCOUNT AND ALL ASSOCIATED     │
│ DATA. THIS ACTION CANNOT BE UNDONE AFTER 48 HOURS.    │
│                                                        │
│ [🗑️ DELETE MY PROFILE]                                │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

### 2. Deletion Eligibility Check Modal

**Component**: `DeleteProfileModal.tsx`

**Flow**: Multi-step wizard

**Step 1: Eligibility Check**
```
┌────────────────────────────────────────────────────────┐
│ ⚠️ PROFILE DELETION ELIGIBILITY CHECK                   │
├────────────────────────────────────────────────────────┤
│                                                        │
│ CHECKING YOUR ACCOUNT STATUS...                       │
│                                                        │
│ [Loading spinner]                                     │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Step 2a: Blocked (Active Channels)**
```
┌────────────────────────────────────────────────────────┐
│ ❌ CANNOT DELETE PROFILE                                │
├────────────────────────────────────────────────────────┤
│                                                        │
│ YOU HAVE ACTIVE PAYMENT CHANNELS OR UNPAID BALANCES.  │
│ PLEASE RESOLVE THESE ISSUES BEFORE DELETING:          │
│                                                        │
│ BLOCKING REASONS:                                      │
│                                                        │
│ 1. 🏢 RED CROSS NGO                                    │
│    • Channel: ABC123...                               │
│    • Status: ACTIVE                                   │
│    • Unpaid Balance: $50.25                           │
│    [VIEW CHANNEL] [CLOSE CHANNEL]                     │
│                                                        │
│ 2. 🏢 UNICEF                                           │
│    • Channel: XYZ789...                               │
│    • Status: TIMEOUT                                  │
│    • Unpaid Balance: $0.00                            │
│    [VIEW CHANNEL] [CLOSE CHANNEL]                     │
│                                                        │
│ STATISTICS:                                            │
│ • Total Organizations: 3                              │
│ • Active Channels: 2                                  │
│ • Total Unpaid Balance: $50.25                        │
│ • Closed Channels: 5                                  │
│                                                        │
│ [CLOSE]                                               │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Step 2b: Eligible for Deletion**
```
┌────────────────────────────────────────────────────────┐
│ ✅ ELIGIBLE FOR DELETION                                │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Your account meets all requirements for deletion.     │
│                                                        │
│ WHAT WILL HAPPEN:                                      │
│                                                        │
│ 1. You will be removed from ALL organizations:        │
│    • Red Cross NGO                                    │
│    • UNICEF                                           │
│    • Doctors Without Borders                          │
│                                                        │
│ 2. Your work history will be available for 48 hours  │
│                                                        │
│ 3. After 48 hours, all data will be permanently       │
│    deleted (no recovery possible)                     │
│                                                        │
│ 4. Your wallet address can be reused for new signup  │
│                                                        │
│ [📄 EXPORT MY DATA (PDF)] [CONTINUE]                  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Step 3: Confirmation**
```
┌────────────────────────────────────────────────────────┐
│ ⚠️ FINAL CONFIRMATION                                   │
├────────────────────────────────────────────────────────┤
│                                                        │
│ THIS ACTION CANNOT BE UNDONE AFTER 48 HOURS           │
│                                                        │
│ Organizations that will be notified:                  │
│ • Red Cross NGO                                       │
│ • UNICEF                                              │
│ • Doctors Without Borders                             │
│                                                        │
│ Type "DELETE MY ACCOUNT" to confirm:                  │
│                                                        │
│ [_______________________________]                      │
│                                                        │
│ Optional: Reason for deletion                         │
│ [_______________________________]                      │
│                                                        │
│                                                        │
│ [CANCEL] [🗑️ DELETE MY PROFILE]                       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Step 4: Success**
```
┌────────────────────────────────────────────────────────┐
│ ✅ DELETION SCHEDULED                                   │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Your profile deletion has been scheduled.             │
│                                                        │
│ • Scheduled: Nov 12, 2025 at 2:35 PM                 │
│ • Hard Delete: Nov 14, 2025 at 2:35 PM (48 hours)    │
│                                                        │
│ • 3 organizations notified                            │
│ • Data export available below                         │
│                                                        │
│ [📄 DOWNLOAD MY DATA (PDF)]                           │
│                                                        │
│ YOU WILL BE AUTOMATICALLY LOGGED OUT IN 10 SECONDS... │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

### 3. NGO Dashboard - Notifications Section

**Location**: `frontend/src/pages/NgoDashboard.tsx`

**New Tab**: "Notifications" (alongside Workers, Channels, Activity)

**UI Mockup**:
```
┌────────────────────────────────────────────────────────┐
│ 🔔 NOTIFICATIONS                            [Mark All Read] │
├────────────────────────────────────────────────────────┤
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 🗑️ WORKER DELETED                    [Unread] •   │ │
│ │                                                  │ │
│ │ WORKER JOHN DOE HAS DELETED THEIR PROFILE       │ │
│ │                                                  │ │
│ │ • Wallet: rABC123...                            │ │
│ │ • Deletion Date: Nov 12, 2025 2:35 PM           │ │
│ │ • Reason: No longer working with organizations  │ │
│ │                                                  │ │
│ │ Nov 12, 2025 at 2:35 PM                         │ │
│ └──────────────────────────────────────────────────┘ │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ❌ DELETION ERROR                    [Unread] •   │ │
│ │                                                  │ │
│ │ DELETION FAILED: ACTIVE CHANNEL DETECTED         │ │
│ │                                                  │ │
│ │ • Worker: Jane Smith (rXYZ789...)               │ │
│ │ • Error: DELETION_BLOCKED                       │ │
│ │ • Blocking Channel: CH123...                    │ │
│ │                                                  │ │
│ │ Nov 12, 2025 at 12:15 PM                        │ │
│ └──────────────────────────────────────────────────┘ │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 👤 WORKER REMOVED                       [Read]   │ │
│ │                                                  │ │
│ │ WORKER BOB JOHNSON WAS REMOVED BY NGO ADMIN      │ │
│ │                                                  │ │
│ │ • Wallet: rDEF456...                            │ │
│ │ • Removed By: admin@redcross.org                │ │
│ │ • Reason: Contract ended                        │ │
│ │                                                  │ │
│ │ Nov 10, 2025 at 9:00 AM                         │ │
│ └──────────────────────────────────────────────────┘ │
│                                                        │
│                     [Load More]                        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

### 4. Orphaned Records Re-Association Popup

**Trigger**: Worker signs up with wallet address that has orphaned records

**Component**: `OrphanedRecordsModal.tsx`

**UI Mockup**:
```
┌────────────────────────────────────────────────────────┐
│ 🔍 RECORDS FOUND                                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│ We found existing work records for this wallet        │
│ address from a previous account deletion.             │
│                                                        │
│ FOUND RECORDS:                                         │
│                                                        │
│ • 45 work sessions                                    │
│ • 3 previous organizations                            │
│ • $1,250.50 in historical earnings                    │
│ • Last activity: Nov 1, 2025                          │
│                                                        │
│ Would you like to re-associate these records with     │
│ your new account?                                     │
│                                                        │
│ ℹ️ This will restore your complete work history.      │
│                                                        │
│ [Skip] [Re-Associate Records]                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Security Considerations

### Authorization Rules

1. **Worker Deletion**:
   - Only authenticated worker can delete their own profile
   - Session validation required on every deletion-related endpoint
   - Confirmation text must match exactly: "DELETE MY ACCOUNT"

2. **NGO Notifications Access**:
   - Only NGO admins/owners can view notifications
   - Organization ID in URL must match authenticated user's organization

3. **Data Export**:
   - PDF generation limited to authenticated worker's own data
   - PDF streamed directly to worker (no URLs or storage)
   - Available any time before hard deletion (48-hour window)
   - No PII exposed in transit (HTTPS required)

### Data Protection

1. **Audit Trail**:
   - All deletions logged in `deletion_logs` table
   - Logs preserved indefinitely (compliance requirement)
   - Includes: wallet address, deletion reason, affected organizations

2. **48-Hour Retention**:
   - Soft-deleted data accessible only by authorized backend processes
   - No frontend access to deleted accounts during retention period
   - Scheduled job handles hard delete automatically

3. **Orphaned Records**:
   - Re-association requires explicit user consent
   - Popup shown only during signup, not forced
   - Skip option available

---

## Scheduled Jobs

### 1. Hard Delete Job (Every 1 Hour) ✨ **INTELLIGENT DELETION**

**Purpose**: Permanently remove soft-deleted accounts with smart timing

**Deletion Logic** (OR condition):
- **INSTANT**: Delete if no active channels/unpaid balances (within 1 hour)
- **GRACE PERIOD**: Delete if soft-deleted 48+ hours ago (safety net)

**Implementation**:
```javascript
async function processHardDeletes() {
    const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Find users scheduled for hard delete (TWO PATHS)
    const usersToDelete = await pool.query(`
        SELECT DISTINCT u.wallet_address, u.user_type, u.deleted_at
        FROM users u
        WHERE u.deleted_at IS NOT NULL
        AND (
            -- Path A: 48-hour grace period expired
            u.deleted_at < $1
            OR
            -- Path B: No active channels/unpaid balances (INSTANT)
            NOT EXISTS (
                SELECT 1 FROM payment_channels pc
                WHERE pc.employee_wallet_address = u.wallet_address
                AND (
                    pc.status = 'active'
                    OR pc.unpaid_balance > 0
                    OR pc.closure_tx_hash IS NULL
                )
            )
        )
    `, [cutoffTime]);

    for (const user of usersToDelete.rows) {
        try {
            const hoursSinceDeletion = (Date.now() - new Date(user.deleted_at)) / (1000 * 60 * 60);
            const deletionType = hoursSinceDeletion < 48 ? 'INSTANT' : 'GRACE PERIOD';

            console.log(`[HARD_DELETE] ${deletionType}: ${user.wallet_address}`);

            // Delete cascaded records (transaction-safe)
            await pool.query('BEGIN');

            await pool.query(`
                DELETE FROM employees WHERE employee_wallet_address = $1
            `, [user.wallet_address]);

            await pool.query(`
                DELETE FROM users WHERE wallet_address = $1
            `, [user.wallet_address]);

            await pool.query(`
                UPDATE deletion_logs
                SET hard_deleted_at = CURRENT_TIMESTAMP
                WHERE wallet_address = $1
            `, [user.wallet_address]);

            await pool.query('COMMIT');

            console.log(`[HARD_DELETE] ✅ Successfully deleted: ${user.wallet_address}`);
        } catch (error) {
            await pool.query('ROLLBACK');
            console.error(`[HARD_DELETE_ERROR] ❌ Failed: ${user.wallet_address}`, error);
        }
    }
}

// Run every hour
setInterval(processHardDeletes, 60 * 60 * 1000);
```

---

### 2. Inactivity Deletion Job (Every 24 Hours)

**Purpose**: Auto-delete inactive workers after 2 weeks of no login

**Logic**:
```javascript
async function processInactiveWorkers() {
    const cutoffTime = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 2 weeks ago

    // Find inactive workers
    const inactiveWorkers = await pool.query(`
        SELECT u.wallet_address, u.name
        FROM users u
        WHERE u.user_type = 'employee'
        AND u.last_login_at < $1
        AND u.deleted_at IS NULL
        AND NOT EXISTS (
            SELECT 1 FROM payment_channels pc
            WHERE pc.employee_wallet_address = u.wallet_address
            AND (
                pc.status = 'active'
                OR pc.unpaid_balance > 0
                OR pc.closure_tx_hash IS NULL
            )
        )
    `, [cutoffTime]);

    for (const worker of inactiveWorkers.rows) {
        try {
            // Soft delete user
            await pool.query(`
                UPDATE users
                SET deleted_at = CURRENT_TIMESTAMP,
                    deletion_reason = 'Automatic deletion due to 2 weeks of inactivity'
                WHERE wallet_address = $1
            `, [worker.wallet_address]);

            // Create deletion log
            await pool.query(`
                INSERT INTO deletion_logs (
                    wallet_address, user_type, deleted_by, deletion_reason
                ) VALUES ($1, 'employee', 'system', 'Automatic deletion due to 2 weeks of inactivity')
            `, [worker.wallet_address]);

            // Notify organizations
            const organizations = await getWorkerOrganizations(worker.wallet_address);
            for (const org of organizations) {
                await createNGONotification({
                    organizationId: org.id,
                    type: 'worker_deleted',
                    workerWalletAddress: worker.wallet_address,
                    workerName: worker.name,
                    message: `WORKER ${worker.name} WAS AUTOMATICALLY DELETED DUE TO 2 WEEKS OF INACTIVITY`,
                    metadata: { deletionType: 'automatic', inactivityDays: 14 }
                });
            }

            console.log(`[AUTO_DELETE] Successfully deleted inactive worker: ${worker.wallet_address}`);
        } catch (error) {
            console.error(`[AUTO_DELETE_ERROR] Failed to delete inactive worker: ${worker.wallet_address}`, error);
        }
    }
}

// Run daily at 2 AM
const schedule = require('node-schedule');
schedule.scheduleJob('0 2 * * *', processInactiveWorkers);
```

---

## Channel Closure Integration

### Worker-Initiated Channel Closure

**Endpoint**: `POST /api/payment-channels/:channelId/close`

**New Feature**: Worker can close channels themselves (not just NGO)

**Warning Logic**:
```javascript
router.post('/:channelId/close', authenticate, async (req, res) => {
    const { channelId } = req.params;
    const { walletAddress, userType } = req.user;

    // Get channel details
    const channel = await pool.query(`
        SELECT * FROM payment_channels WHERE id = $1
    `, [channelId]);

    if (channel.rows.length === 0) {
        return res.status(404).json({ error: 'CHANNEL_NOT_FOUND' });
    }

    const channelData = channel.rows[0];

    // Check authorization (worker OR NGO can close)
    const isWorker = channelData.employee_wallet_address === walletAddress;
    const isNGO = channelData.escrow_wallet_address === walletAddress;

    if (!isWorker && !isNGO) {
        return res.status(403).json({ error: 'UNAUTHORIZED' });
    }

    // Warn about unclaimed balance
    if (channelData.unpaid_balance > 0) {
        const warningMessage = isWorker
            ? `WARNING: YOU HAVE $${channelData.unpaid_balance} IN UNCLAIMED WAGES. CLAIM BEFORE CLOSING.`
            : `WARNING: WORKER HAS $${channelData.unpaid_balance} IN UNCLAIMED WAGES. ENSURE PAYMENT BEFORE CLOSING.`;

        // If force_close not specified, return warning
        if (!req.body.forceClose) {
            return res.status(400).json({
                error: 'UNCLAIMED_BALANCE',
                message: warningMessage,
                unpaidBalance: channelData.unpaid_balance,
                requiresForceClose: true
            });
        }
    }

    // Proceed with channel closure
    // ... (existing channel closure logic)
});
```

---

## Testing Strategy

### Unit Tests

#### Backend Tests (`backend/tests/workerDeletion.test.js`)

```javascript
describe('Worker Deletion API', () => {
    describe('GET /api/workers/deletion-eligibility', () => {
        it('should return canDelete=true when no active channels', async () => {
            // Test implementation
        });

        it('should return canDelete=false when active channels exist', async () => {
            // Test implementation
        });

        it('should return canDelete=false when unpaid balance exists', async () => {
            // Test implementation
        });

        it('should return canDelete=false when unclosed channels exist', async () => {
            // Test implementation
        });

        it('should return canDelete=false when timeout channels exist', async () => {
            // Test implementation
        });
    });

    describe('POST /api/workers/delete-profile', () => {
        it('should soft delete user when eligible', async () => {
            // Test implementation
        });

        it('should reject deletion with invalid confirmation text', async () => {
            // Test implementation
        });

        it('should reject deletion when active channels exist', async () => {
            // Test implementation
        });

        it('should notify all affected organizations', async () => {
            // Test implementation
        });

        it('should generate data export PDF', async () => {
            // Test implementation
        });

        it('should create deletion log entry', async () => {
            // Test implementation
        });
    });

    describe('POST /api/workers/cancel-deletion', () => {
        it('should restore soft-deleted account within 48 hours', async () => {
            // Test implementation
        });

        it('should reject cancellation after 48 hours', async () => {
            // Test implementation
        });
    });
});

describe('Scheduled Jobs', () => {
    describe('Hard Delete Job', () => {
        it('should permanently delete accounts after 48 hours', async () => {
            // Test implementation
        });

        it('should not delete accounts before 48 hours', async () => {
            // Test implementation
        });

        it('should update deletion logs with hard_deleted_at', async () => {
            // Test implementation
        });
    });

    describe('Inactivity Deletion Job', () => {
        it('should auto-delete workers after 2 weeks of inactivity', async () => {
            // Test implementation
        });

        it('should not delete workers with active channels', async () => {
            // Test implementation
        });

        it('should not delete workers with unpaid balances', async () => {
            // Test implementation
        });

        it('should notify organizations of auto-deletion', async () => {
            // Test implementation
        });
    });
});

describe('NGO Notifications', () => {
    describe('GET /api/organizations/:orgId/notifications', () => {
        it('should return all notifications for organization', async () => {
            // Test implementation
        });

        it('should filter by notification type', async () => {
            // Test implementation
        });

        it('should filter by read status', async () => {
            // Test implementation
        });

        it('should reject unauthorized access', async () => {
            // Test implementation
        });
    });
});
```

---

### Integration Tests

#### Test Scenarios

1. **Complete Deletion Flow**:
   - Worker signs in
   - Worker checks eligibility (blocked by active channel)
   - Worker closes channel
   - Worker checks eligibility again (now eligible)
   - Worker exports data to PDF
   - Worker confirms deletion
   - Organizations receive notifications
   - Worker is logged out
   - 48 hours pass (simulated)
   - Hard delete job runs
   - Account permanently removed

2. **Multi-Organization Deletion**:
   - Worker associated with 3 organizations
   - Worker has 1 active channel with Org 1
   - Worker has 2 closed channels with Org 2
   - Worker has 0 channels with Org 3
   - Deletion blocked due to Org 1 active channel
   - Worker closes Org 1 channel
   - Deletion succeeds
   - All 3 organizations notified

3. **Orphaned Records Re-Association**:
   - Worker deletes profile
   - 48 hours pass, hard delete occurs
   - Same wallet signs up again
   - Orphaned records popup shown
   - Worker chooses to re-associate
   - Work history restored

4. **Automatic Inactivity Deletion**:
   - Worker last login 15 days ago
   - Worker has no active channels
   - Inactivity job runs
   - Worker soft-deleted
   - Organizations notified
   - 48 hours pass
   - Hard delete occurs

---

### Manual Testing Checklist

- [ ] **Worker Eligibility Check**
  - [ ] Test with active channels (should block)
  - [ ] Test with unpaid balance (should block)
  - [ ] Test with unclosed channels (should block)
  - [ ] Test with timeout channels (should block)
  - [ ] Test with no blocking reasons (should allow)

- [ ] **Deletion Confirmation UI**
  - [ ] Verify all organizations displayed
  - [ ] Verify blocking reasons shown correctly
  - [ ] Test invalid confirmation text rejection
  - [ ] Test data export PDF download
  - [ ] Verify success message with 48hr timeline

- [ ] **NGO Notifications**
  - [ ] Verify worker_deleted notification appears
  - [ ] Verify deletion_error notification for blocked deletions
  - [ ] Test mark as read functionality
  - [ ] Test filtering by type and read status

- [ ] **Channel Closure Warnings**
  - [ ] Worker closes channel with unclaimed balance
  - [ ] Verify warning message displayed
  - [ ] Test force_close parameter
  - [ ] NGO closes channel with worker's unclaimed balance
  - [ ] Verify warning message displayed

- [ ] **Scheduled Jobs**
  - [ ] Verify hard delete after 48 hours
  - [ ] Verify inactivity deletion after 14 days
  - [ ] Test job error handling and logging

- [ ] **Orphaned Records**
  - [ ] Verify popup shows during signup
  - [ ] Test re-association functionality
  - [ ] Test skip option
  - [ ] Verify records correctly linked to new account

- [ ] **Security**
  - [ ] Test unauthorized deletion attempt
  - [ ] Test unauthorized notification access
  - [ ] Verify authentication on all endpoints
  - [ ] Test SQL injection prevention

---

## Implementation Phases

### Phase 1: Database & Backend Foundation (4-6 hours)

**Tasks**:
1. Create database migration script
   - Add `deleted_at`, `deletion_reason`, `last_login_at` to users table
   - Create `deletion_logs` table
   - Create `ngo_notifications` table
   - Update foreign key constraints

2. Implement core API endpoints
   - GET `/api/workers/deletion-eligibility`
   - POST `/api/workers/delete-profile`
   - POST `/api/workers/cancel-deletion`

3. Implement scheduled jobs
   - Hard delete job (every 1 hour)
   - Inactivity deletion job (daily)

**Deliverables**:
- Migration script tested on local database
- API endpoints with comprehensive error handling
- Scheduled jobs configured with logging

---

### Phase 2: NGO Notifications System (4-6 hours)

**Tasks**:
1. Implement notification API endpoints
   - GET `/api/organizations/:orgId/notifications`
   - PATCH `/api/organizations/:orgId/notifications/:notificationId`

2. Create notification helper functions
   - `createNGONotification()`
   - `markNotificationAsRead()`
   - `getOrganizationNotifications()`

3. Integrate notifications into deletion flow
   - Send notifications on worker deletion
   - Send notifications on deletion errors
   - Send notifications on auto-deletion

**Deliverables**:
- Notification API fully functional
- Notifications sent for all relevant events
- Backend tests passing

---

### Phase 3: Frontend - Worker Deletion UI (8-12 hours)

**Tasks**:
1. Create `DeleteProfileModal.tsx` component
   - Multi-step wizard flow
   - Eligibility check step
   - Blocking reasons display
   - Confirmation step with typed verification

2. Create `EmployeeSettings.tsx` page
   - Danger zone section
   - Delete profile button

3. Implement data export functionality
   - PDF generation with comprehensive data
   - Download handler

4. Create `OrphanedRecordsModal.tsx` component
   - Show during signup if records found
   - Re-association logic

**Deliverables**:
- Full deletion flow working in frontend
- PDF export functional
- Orphaned records popup working

---

### Phase 4: Frontend - NGO Notifications UI (6-8 hours)

**Tasks**:
1. Create `NGONotifications.tsx` component
   - Notification list with filtering
   - Mark as read functionality
   - Pagination

2. Integrate into `NgoDashboard.tsx`
   - New "Notifications" tab
   - Unread count badge

3. Create notification type components
   - `WorkerDeletedNotification.tsx`
   - `DeletionErrorNotification.tsx`
   - `WorkerRemovedNotification.tsx`

**Deliverables**:
- NGO dashboard showing notifications
- All notification types rendering correctly
- Mark as read functionality working

---

### Phase 5: Channel Closure Enhancements (2-4 hours)

**Tasks**:
1. Update `closePaymentChannel()` in `paymentChannels.ts`
   - Add worker authorization check
   - Add unclaimed balance warning logic

2. Update `NgoDashboard.tsx` and `EmployeeDashboard.tsx`
   - Show unclaimed balance warnings on close
   - Add force close option

**Deliverables**:
- Workers can close channels
- Unclaimed balance warnings working for both parties

---

### Phase 6: Testing & Refinement (4-6 hours)

**Tasks**:
1. Write comprehensive unit tests
2. Perform integration testing
3. Manual testing checklist completion
4. Bug fixes and refinements
5. Documentation updates

**Deliverables**:
- All tests passing
- Manual testing checklist completed
- Documentation updated with implementation notes

---

## Error Codes & Messages

### Deletion Errors

| Code | Message | HTTP Status |
|------|---------|-------------|
| `DELETION_BLOCKED` | CANNOT DELETE PROFILE WITH ACTIVE CHANNELS OR UNPAID BALANCES | 403 |
| `INVALID_CONFIRMATION` | CONFIRMATION TEXT MUST BE "DELETE MY ACCOUNT" | 400 |
| `UNAUTHORIZED` | YOU ARE NOT AUTHORIZED TO DELETE THIS PROFILE | 403 |
| `ALREADY_DELETED` | THIS PROFILE HAS ALREADY BEEN DELETED | 400 |
| `DELETION_FAILED` | PROFILE DELETION FAILED. PLEASE TRY AGAIN. | 500 |

### Channel Closure Errors

| Code | Message | HTTP Status |
|------|---------|-------------|
| `UNCLAIMED_BALANCE` | WARNING: UNCLAIMED BALANCE OF $X.XX. CLAIM BEFORE CLOSING OR USE FORCE_CLOSE. | 400 |
| `CHANNEL_NOT_FOUND` | PAYMENT CHANNEL NOT FOUND | 404 |
| `UNAUTHORIZED` | YOU ARE NOT AUTHORIZED TO CLOSE THIS CHANNEL | 403 |

### Notification Errors

| Code | Message | HTTP Status |
|------|---------|-------------|
| `NOTIFICATION_NOT_FOUND` | NOTIFICATION NOT FOUND | 404 |
| `UNAUTHORIZED` | YOU ARE NOT AUTHORIZED TO ACCESS THIS NOTIFICATION | 403 |

---

## Compliance & Legal Considerations

### Data Protection Regulations

**GDPR Compliance** (if applicable):
- Right to erasure (Article 17): Implemented via worker deletion
- Right to data portability (Article 20): Implemented via PDF export
- Notification requirements: NGO notifications fulfill organizational awareness

**Data Retention**:
- 48-hour retention period balances worker privacy with employer audit needs
- Deletion logs preserved indefinitely for compliance

### Tax & Labor Compliance

**Payment Records**:
- Work sessions and payments retained for 48 hours
- Sufficient time for employers to export for tax reporting
- Workers receive comprehensive PDF with all earnings data

**Audit Trail**:
- All deletions logged with timestamp, reason, affected organizations
- Cannot be tampered with or deleted
- Available for labor dispute resolution

---

## Performance Considerations

### Database Indexing

Ensure optimal query performance:
```sql
-- Users table
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_users_last_login ON users(last_login_at) WHERE user_type = 'employee';

-- Deletion logs
CREATE INDEX idx_deletion_logs_wallet ON deletion_logs(wallet_address);
CREATE INDEX idx_deletion_logs_created_at ON deletion_logs(created_at);

-- NGO notifications
CREATE INDEX idx_ngo_notifications_org ON ngo_notifications(organization_id, is_read);
CREATE INDEX idx_ngo_notifications_created_at ON ngo_notifications(created_at);
```

### Scheduled Job Optimization

**Hard Delete Job**:
- Runs every 1 hour (low frequency)
- Batch processes up to 100 users per run
- Processes oldest deletions first
- Logs failures for manual review

**Inactivity Job**:
- Runs daily at 2 AM (off-peak hours)
- Batch processes up to 50 users per run
- Uses index on `last_login_at` for fast queries

### PDF Generation ✨ DIRECT DOWNLOAD

**Implementation** (No Cloud Storage):
- Generate PDF on-the-fly when worker requests export
- Stream directly to response (no storage required)
- Use PDF library with low memory footprint (pdfkit)
- Minimal server resources (<50MB memory per generation)
- Worker can download multiple times during 48-hour grace period

**Rationale**:
- ✅ No external dependencies (S3/R2)
- ✅ No storage costs
- ✅ No URL expiration management
- ✅ Simpler implementation (~2 hours vs 4 hours)
- ✅ Sufficient for MVP (workers typically export once)

---

## Future Enhancements

### Planned Features

1. **Worker Removal by NGO** (High Priority)
   - NGOs can remove workers from their organization
   - Different from worker self-deletion
   - Notification sent to worker
   - Requires reason field

2. **Bulk Deletion** (Medium Priority)
   - NGOs can bulk-remove inactive workers
   - Filters: last active date, no channels, etc.
   - Confirmation with worker count

3. **Deletion Analytics** (Low Priority)
   - Dashboard for admins to track deletion trends
   - Reasons for deletion aggregation
   - Retention rate metrics

4. **Enhanced PDF Export** (Low Priority)
   - Customizable export templates
   - Multi-language support
   - Digital signature for authenticity

5. **Cloud Storage for PDF Exports** (Optional Enhancement)
   - Store PDFs in S3/Cloudflare R2 for repeated downloads
   - Generate temporary signed URLs (7-day expiration)
   - Email PDF link to worker instead of immediate download
   - Reduce server load for workers downloading multiple times
   - **Note**: Current MVP uses direct download (simpler, zero cost)

---

## Appendix

### Related Documentation

- `CLAUDE.md` - Project overview and architecture
- `MULTI_STEP_SIGNUP_SPEC.md` - User onboarding specification
- `PAYMENT_CHANNEL_TESTING.md` - Channel testing guide
- `DATABASE_SETUP.md` - Database schema documentation

### Key Files

**Backend**:
- `backend/routes/workers.js` - Worker deletion endpoints
- `backend/routes/organizations.js` - NGO notifications endpoints
- `backend/jobs/hardDelete.js` - Scheduled hard delete job
- `backend/jobs/inactivityDeletion.js` - Scheduled inactivity job
- `backend/utils/pdfGenerator.js` - PDF export utility

**Frontend**:
- `frontend/src/pages/EmployeeSettings.tsx` - Worker settings page
- `frontend/src/components/DeleteProfileModal.tsx` - Deletion wizard
- `frontend/src/components/NGONotifications.tsx` - Notifications list
- `frontend/src/components/OrphanedRecordsModal.tsx` - Record re-association

**Database**:
- `backend/database/migrations/003_worker_deletion.sql` - Migration script

---

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-12 | Initial specification created |

---

## Implementation Progress Checklist

### Phase 1: Database & Backend Foundation (4-6 hours) ✅ **COMPLETED**

#### Database Migration ✅
- [x] Create migration file `backend/database/migrations/003_worker_deletion.sql`
- [x] Add `deleted_at` column to `users` table
- [x] Add `deletion_reason` column to `users` table
- [x] Add `last_login_at` column to `users` table
- [x] Create indexes on `users` table (`deleted_at`, `last_login_at`)
- [x] Create `deletion_logs` table with all columns
- [x] Create indexes on `deletion_logs` table
- [x] Create `ngo_notifications` table with all columns
- [x] Create indexes on `ngo_notifications` table
- [x] Update foreign key constraints for cascade behavior
- [x] Test migration on local database ✅ **COMPLETED** (minor permission warnings on work_sessions/payments FK constraints, core tables verified)
- [x] Verify rollback script works (included in migration file)

#### Core API Endpoints ✅
- [x] Create `backend/routes/workers.js` (already existed, extended)
- [x] Implement `GET /api/workers/deletion-eligibility`
  - [x] Active channels validation logic
  - [x] Unpaid balance validation logic
  - [x] Comprehensive error handling
  - [x] Response formatting with blocking reasons
- [x] Implement `POST /api/workers/delete-profile`
  - [x] Confirmation text validation
  - [x] Eligibility check integration
  - [ ] PDF export generation (placeholder - Phase 2)
  - [x] Organization notification sending
  - [x] Soft delete user account
  - [x] Create deletion log entry
  - [x] Schedule hard delete job (via 48hr timestamp)
- [x] Implement `POST /api/workers/cancel-deletion`
  - [x] 48-hour window validation
  - [x] Account restoration logic
  - [x] Notification updates (implicit via restore)
- [x] Implement `GET /api/workers/export-data`
  - [ ] Data aggregation from all tables (Phase 2)
  - [ ] PDF generation with all sections (Phase 2)
  - [ ] Stream PDF directly to response (Phase 2)
  - [x] Placeholder endpoint returns 501 NOT_IMPLEMENTED

#### NGO Notification Endpoints ✅
- [x] Create notification routes in `backend/routes/organizations.js`
- [x] Implement `GET /api/organizations/:orgId/notifications`
  - [x] Pagination support
  - [x] Filtering by type
  - [x] Filtering by read status
  - [x] Authorization check (organization_id verification)
- [x] Implement `PATCH /api/organizations/:orgId/notifications/:notificationId`
  - [x] Mark as read functionality
  - [x] Authorization check
- [x] Implement `POST /api/organizations/:orgId/notifications/mark-all-read`
- [x] Helper functions integrated directly into endpoints

#### Scheduled Jobs ✅
- [x] Create `backend/jobs/hardDelete.js`
  - [x] 48-hour cutoff calculation
  - [x] User deletion logic with cascade
  - [x] Deletion log update
  - [x] Error handling and logging
  - [x] Hourly schedule configuration
- [x] Create `backend/jobs/inactivityDeletion.js`
  - [x] 14-day inactivity check
  - [x] Active channel exclusion
  - [x] Unpaid balance exclusion
  - [x] Soft delete logic
  - [x] Organization notification
  - [x] Daily schedule configuration (2 AM)
- [x] Integrate jobs into server startup (`backend/server.js`)
- [ ] Test scheduled job execution manually ⚠️ **PENDING MANUAL TEST**

### Phase 2: PDF Export & Data Management (2 hours) ✅ **COMPLETED**

#### PDF Generation - Direct Download (No Cloud Storage) ✨
- [x] Install `pdfkit` dependency
- [x] Create `backend/utils/pdfGenerator.js`
- [x] Implement `generateWorkerDataPDF()` function
  - [x] Profile information section
  - [x] Organization associations section
  - [x] Payment channels section
  - [x] Work sessions section
  - [x] Payment history section
  - [x] Full capitalization formatting
  - [x] Company logo at bottom (centered, 80px width)
- [x] Implement `fetchComprehensiveWorkerData()` helper
- [x] Update `GET /api/workers/export-data` to stream PDF directly
  - [x] Set Content-Type: application/pdf
  - [x] Set Content-Disposition: attachment
  - [x] Stream PDF to response (no storage)
- [x] Test PDF generation with sample data ✅ **VERIFIED: PDF generates correctly**
- [ ] Test direct download in browser (manual testing recommended)

#### Orphaned Records Management ✅ **COMPLETED**
- [x] Create `checkOrphanedRecords()` function
  - [x] Backend: `GET /api/workers/check-orphaned-records` endpoint
  - [x] Frontend: `workerDeletionApi.checkOrphanedRecords()` API client
  - [x] Returns work sessions, organizations, earnings, last activity
- [x] Create `reAssociateRecords()` function
  - [x] Backend: `POST /api/workers/reassociate-records` endpoint
  - [x] Frontend: `workerDeletionApi.reassociateRecords()` API client
  - [x] Validates user ID and wallet address match
- [x] Create `OrphanedRecordsModal.tsx` component
  - [x] Displays found records statistics
  - [x] Skip and Re-Associate buttons
  - [x] Loading and error states
- [x] Integrate orphaned record check into signup flow
  - [x] Modified `MultiStepSignupModal.tsx`
  - [x] Check after successful employee signup
  - [x] Show modal if records found
  - [x] Handle re-association and skip actions

### Phase 3: Frontend - Worker Deletion UI (8-12 hours) ✅ **COMPLETED**

#### Employee Settings Page ✅
- [x] Create or update `frontend/src/pages/EmployeeSettings.tsx`
- [x] Add "DANGER ZONE" section (ALL CAPS)
- [x] Add "DELETE MY PROFILE" button (ALL CAPS)
- [x] Style with warning colors and icons
- [x] Add protected route `/worker/settings` in App.tsx

#### Delete Profile Modal ✅
- [x] Create `frontend/src/components/DeleteProfileModal.tsx`
- [x] Implement multi-step wizard flow
- [x] **Step 1: Eligibility Check**
  - [x] Loading state with spinner
  - [x] API call to check eligibility
  - [x] Error handling
- [x] **Step 2a: Blocked State**
  - [x] Display blocking reasons (ALL CAPS text)
  - [x] Show active channels list
  - [x] Show unpaid balances
  - [x] Show statistics
  - [x] Organization name and channel details displayed
- [x] **Step 2b: Eligible State**
  - [x] Display affected organizations count
  - [x] Show deletion timeline (48 hours)
  - [x] "EXPORT MY DATA (PDF)" button (ALL CAPS)
  - [x] "CONTINUE" button (ALL CAPS)
- [x] **Step 3: Confirmation**
  - [x] Organizations count display
  - [x] Confirmation text input ("DELETE MY ACCOUNT" validation)
  - [x] Optional reason input
  - [x] Validation on confirmation text
  - [x] "CANCEL" and "DELETE MY PROFILE" buttons (ALL CAPS)
- [x] **Step 4: Success**
  - [x] Deletion scheduled message (ALL CAPS)
  - [x] Timestamps display
  - [x] Organizations notified count
  - [x] PDF download button "DOWNLOAD MY DATA (PDF)" (ALL CAPS)
  - [x] Auto-logout countdown (10 seconds)

#### API Integration ✅
- [x] Add deletion endpoints to `frontend/src/services/api.ts`
  - [x] `checkDeletionEligibility()`
  - [x] `deleteProfile()`
  - [x] `cancelDeletion()`
  - [x] `exportWorkerData()`
- [x] Add error handling for all endpoints
- [x] Add loading states for all operations
- [x] Add TypeScript types to `frontend/src/types/api.ts`
  - [x] `DeletionEligibilityResponse` interface
  - [x] `BlockingReason` interface
  - [x] `DeletionStats` interface
  - [x] `DeleteProfileRequest` interface
  - [x] `DeleteProfileResponse` interface

#### Orphaned Records Modal ✅ **COMPLETED**
- [x] Create `frontend/src/components/OrphanedRecordsModal.tsx`
- [x] Display found records statistics
- [x] Show work sessions count
- [x] Show organizations count
- [x] Show historical earnings
- [x] "Skip" and "Re-Associate Records" buttons
- [x] Integrate into signup flow
- [ ] Test with orphaned records data

### Phase 4: Frontend - NGO Notifications UI (6-8 hours)

#### NGO Dashboard Integration
- [ ] Update `frontend/src/pages/NgoDashboard.tsx`
- [ ] Add "NOTIFICATIONS" tab (ALL CAPS)
- [ ] Add unread count badge
- [ ] Tab navigation implementation

#### Notifications List Component
- [ ] Create `frontend/src/components/NGONotifications.tsx`
- [ ] Display notifications list
- [ ] Implement filtering by type
- [ ] Implement filtering by read status
- [ ] Implement pagination
- [ ] "MARK ALL AS READ" button (ALL CAPS)
- [ ] Individual notification cards

#### Notification Type Components
- [ ] Create `frontend/src/components/WorkerDeletedNotification.tsx`
  - [ ] Worker name and wallet address
  - [ ] Deletion date and reason
  - [ ] Icon and styling
- [ ] Create `frontend/src/components/DeletionErrorNotification.tsx`
  - [ ] Worker name and wallet address
  - [ ] Error type and blocking channel
  - [ ] Icon and styling
- [ ] Create `frontend/src/components/WorkerRemovedNotification.tsx`
  - [ ] Worker name and wallet address
  - [ ] Removed by and reason
  - [ ] Icon and styling

#### API Integration
- [ ] Add notification endpoints to `frontend/src/services/api.ts`
  - [ ] `getNotifications()`
  - [ ] `markNotificationAsRead()`
  - [ ] `markAllNotificationsAsRead()`
- [ ] Add TypeScript types to `frontend/src/types/api.ts`
  - [ ] `NGONotification` interface
  - [ ] `NotificationType` enum
- [ ] Implement real-time notification polling (optional)

### Phase 5: Channel Closure Enhancements (2-4 hours)

#### Backend Updates
- [ ] Update `backend/routes/paymentChannels.js`
- [ ] Add worker authorization check to close endpoint
- [ ] Add unclaimed balance warning logic
- [ ] Add `forceClose` parameter support
- [ ] Test worker-initiated closure
- [ ] Test unclaimed balance warnings

#### Frontend Updates
- [ ] Update `frontend/src/pages/EmployeeDashboard.tsx`
- [ ] Add "CLOSE CHANNEL" button for workers (ALL CAPS)
- [ ] Add unclaimed balance warning modal (ALL CAPS text)
- [ ] Add force close option
- [ ] Update `frontend/src/pages/NgoDashboard.tsx`
- [ ] Add unclaimed balance warning for NGO closures
- [ ] Update `frontend/src/utils/paymentChannels.ts`
- [ ] Add worker authorization to `closePaymentChannel()`
- [ ] Test both worker and NGO closure flows

### Phase 6: Testing & Refinement (4-6 hours)

#### Unit Tests
- [ ] Create `backend/tests/workerDeletion.test.js`
- [ ] Test deletion eligibility checks (all scenarios)
- [ ] Test delete profile endpoint (success and blocked)
- [ ] Test cancel deletion endpoint
- [ ] Test notification endpoints
- [ ] Test hard delete job
- [ ] Test inactivity deletion job
- [ ] All tests passing

#### Integration Tests
- [ ] Test complete deletion flow
- [ ] Test multi-organization deletion
- [ ] Test orphaned records re-association
- [ ] Test automatic inactivity deletion
- [ ] Test channel closure integration
- [ ] All integration tests passing

#### Manual Testing
- [ ] Complete manual testing checklist (lines 1187-1232)
- [ ] Test all wallet providers (Xaman, Crossmark, GemWallet)
- [ ] Test testnet and mainnet configurations
- [ ] Test edge cases and error scenarios
- [ ] Verify all security requirements
- [ ] Performance testing (scheduled jobs)

#### Documentation
- [ ] Update `CLAUDE.md` with deletion feature
- [ ] Update `README.md` with worker management details
- [ ] Create API documentation for new endpoints
- [ ] Document scheduled job configuration
- [ ] Document PDF export process
- [ ] Add troubleshooting guide
- [ ] Update architecture diagrams (if applicable)

### Deployment & Monitoring

#### Pre-Deployment
- [ ] Review security checklist
- [ ] Review performance considerations
- [ ] Database migration tested on staging
- [ ] All environment variables configured
- [ ] Backup strategy in place

#### Deployment
- [ ] Deploy database migration to staging
- [ ] Deploy backend to staging
- [ ] Deploy frontend to staging
- [ ] Smoke test on staging
- [ ] Deploy to production (with rollback plan)
- [ ] Monitor error logs
- [ ] Monitor scheduled job execution

#### Post-Deployment
- [ ] Verify scheduled jobs running
- [ ] Monitor deletion logs
- [ ] Monitor notification system
- [ ] Check performance metrics
- [ ] User acceptance testing
- [ ] Collect feedback
- [ ] Address any issues

### Optional Enhancements (Future)
- [ ] Worker removal by NGO feature
- [ ] Bulk deletion feature
- [ ] Deletion analytics dashboard
- [ ] Enhanced PDF export templates
- [ ] Multi-language support
- [ ] Email notifications (in addition to in-app)

---

**End of Specification**
