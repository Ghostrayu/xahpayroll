# Validation Failure Notifications

**Date**: 2025-11-29
**Feature**: Payment Channel Closure Validation Failure Alerts
**Status**: ✅ **IMPLEMENTED**

---

## Overview

This document describes the notification system for payment channel closure validation failures. When a channel closure transaction fails validation on the XRPL ledger, the system automatically:

1. Rolls back the channel to `active` status
2. Creates a notification for the NGO organization
3. Logs detailed technical information for debugging
4. Displays the notification in the NGO dashboard

---

## Problem Solved

**Previous Behavior**:
- Validation failures occurred silently without user notification
- NGOs were unaware that channel closures had failed
- Channels appeared stuck in 'closing' state with no explanation
- Manual investigation required to identify validation issues

**New Behavior**:
- Immediate notification created when validation fails
- NGOs see alert in notification center
- Technical details available for debugging
- Clear message about automatic rollback to 'active' state

---

## Implementation

### Backend API Changes

**File**: `backend/routes/paymentChannels.js:660-715`

**Notification Creation Logic**:
```javascript
// On validation failure, after rollback to 'active'
try {
  const workerResult = await query(
    `SELECT e.employee_wallet_address, e.name, pc.job_name
    FROM employees e
    JOIN payment_channels pc ON e.id = pc.employee_id
    WHERE pc.channel_id = $1`,
    [channelId]
  )

  if (workerResult.rows.length > 0) {
    const worker = workerResult.rows[0]
    const notificationMessage = `CHANNEL CLOSURE VALIDATION FAILED FOR ${worker.job_name || 'PAYMENT CHANNEL'}. CHANNEL AUTOMATICALLY ROLLED BACK TO ACTIVE STATE.`

    await query(
      `INSERT INTO ngo_notifications (
        organization_id,
        notification_type,
        worker_wallet_address,
        worker_name,
        message,
        metadata,
        is_read,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        channel.organization_id,
        'channel_closure_failed',
        worker.employee_wallet_address,
        worker.name,
        notificationMessage,
        JSON.stringify({
          channelId,
          txHash,
          error: validationResult.error,
          validated: validationResult.validated,
          channelRemoved: validationResult.channelRemoved,
          jobName: worker.job_name
        }),
        false
      ]
    )
  }
} catch (notifError) {
  // Don't fail the request if notification creation fails
  console.error('[NOTIFICATION_ERROR] Failed to create validation failure notification', notifError)
}
```

**Notification Metadata Structure**:
```json
{
  "channelId": "A3D68ED1D0736EF166E2FBBCDD777EB4F3D8665F5FA338E759D5E92239C5C9AF",
  "txHash": "8838DEE22F6A8D64B9225F4DB52CC41F9A11BD88016E7EFED004E196DAB08B43",
  "error": "TRANSACTION NOT VALIDATED ON LEDGER",
  "validated": false,
  "channelRemoved": false,
  "jobName": "Construction Worker"
}
```

### Frontend Type Definitions

**File**: `frontend/src/types/api.ts:341-345`

**New Notification Type**:
```typescript
export type NotificationType =
  | 'worker_deleted'              // Worker self-deleted their profile
  | 'worker_removed'              // Worker removed by NGO admin
  | 'deletion_error'              // Deletion attempt failed
  | 'channel_closure_failed'      // Payment channel closure validation failed (NEW)
```

### Frontend Notification Component

**File**: `frontend/src/components/ChannelClosureFailedNotification.tsx`

**Key Features**:
- Red/yellow color scheme for warning
- Worker information display (name, wallet, job)
- Technical details in collapsible section
- Channel ID and transaction hash for debugging
- Validation status indicators (validated, channelRemoved)
- Clear action message about automatic rollback

**UI Layout**:
```
┌─────────────────────────────────────────────┐
│ ⚠️ CHANNEL CLOSURE VALIDATION FAILED         │
│ 2025-11-29 02:45:32                         │
│                                 [MARK READ]  │
├─────────────────────────────────────────────┤
│ CHANNEL CLOSURE VALIDATION FAILED FOR       │
│ CONSTRUCTION WORKER. CHANNEL AUTOMATICALLY  │
│ ROLLED BACK TO ACTIVE STATE.                │
├─────────────────────────────────────────────┤
│ WORKER: John Doe                            │
│ WALLET: rN7n7otQDd6FczFgLdlqtyMVUa6E...     │
│ JOB: Construction Worker                    │
├─────────────────────────────────────────────┤
│ 🔍 TECHNICAL DETAILS ▼                      │
│   CHANNEL ID: A3D68ED1D0736...              │
│   TRANSACTION HASH: 8838DEE22F6A8D64...     │
│   ERROR: TRANSACTION NOT VALIDATED          │
│   TX VALIDATED: NO                          │
│   CHANNEL REMOVED: NO                       │
├─────────────────────────────────────────────┤
│ ℹ️ THE CHANNEL HAS BEEN AUTOMATICALLY       │
│ ROLLED BACK TO ACTIVE STATUS. YOU CAN TRY   │
│ CLOSING IT AGAIN.                           │
└─────────────────────────────────────────────┘
```

### NGONotifications Component Updates

**File**: `frontend/src/components/NGONotifications.tsx`

**Changes**:
1. Import new notification component (line 7)
2. Add case in switch statement (line 109-110)
3. Add filter option (line 162)

```typescript
// Import
import ChannelClosureFailedNotification from './ChannelClosureFailedNotification'

// Render logic
case 'channel_closure_failed':
  return <ChannelClosureFailedNotification key={notification.id} {...props} />

// Filter dropdown
<option value="channel_closure_failed">CHANNEL CLOSURE FAILED</option>
```

---

## Notification Flow

### 1. Validation Failure Occurs

**Trigger**: Channel closure transaction fails validation on ledger

**Validation Checks**:
- ❌ Transaction not validated on ledger
- ❌ Transaction result not `tesSUCCESS`
- ❌ Channel still exists on ledger after claim transaction

### 2. Automatic Rollback

**Database Update**:
```sql
UPDATE payment_channels
SET
  status = 'active',
  last_validation_at = NOW(),
  updated_at = NOW()
WHERE channel_id = $1
```

### 3. Notification Creation

**Database Insert**:
```sql
INSERT INTO ngo_notifications (
  organization_id,
  notification_type,
  worker_wallet_address,
  worker_name,
  message,
  metadata,
  is_read,
  created_at
) VALUES (...)
```

### 4. Frontend Display

**NGO Dashboard**:
- Notification badge shows unread count
- Notification center displays new alert
- Red/yellow styling indicates warning
- Technical details available for investigation

---

## Error Scenarios

### Scenario 1: Transaction Not Validated

**Cause**: Transaction never confirmed on ledger
```json
{
  "error": "TRANSACTION NOT VALIDATED ON LEDGER",
  "validated": false,
  "channelRemoved": false
}
```

**User Action**: Check wallet connection, retry channel closure

### Scenario 2: Transaction Failed

**Cause**: Transaction validated but failed (e.g., `temBAD_AMOUNT`)
```json
{
  "error": "TRANSACTION FAILED: temBAD_AMOUNT",
  "validated": true,
  "channelRemoved": false
}
```

**User Action**: Check transaction parameters, ensure sufficient balance

### Scenario 3: Channel Still Exists

**Cause**: Transaction succeeded but channel not removed from ledger
```json
{
  "error": "CHANNEL STILL EXISTS ON LEDGER",
  "validated": true,
  "channelRemoved": false
}
```

**User Action**: Contact support, investigate ledger state manually

---

## Testing Guide

### Manual Testing Steps

1. **Create Test Channel**:
   - Create payment channel with testnet XAH
   - Verify channel shows as 'active' in dashboard

2. **Simulate Validation Failure**:
   - Trigger channel closure
   - Disconnect network during validation (to simulate timeout)
   - OR use invalid transaction parameters

3. **Verify Notification**:
   - Check notification center shows new alert
   - Verify red/yellow styling
   - Confirm worker details are correct
   - Expand technical details section
   - Verify channel ID and transaction hash

4. **Check Rollback**:
   - Verify channel status returned to 'active'
   - Confirm channel can be closed again
   - Check database: `status = 'active'`, `last_validation_at` updated

5. **Test Notification Actions**:
   - Click "MARK READ" button
   - Verify notification badge count decreases
   - Filter by type: "CHANNEL CLOSURE FAILED"
   - Check pagination with multiple notifications

### Database Queries for Testing

**Check Notification Created**:
```sql
SELECT * FROM ngo_notifications
WHERE notification_type = 'channel_closure_failed'
ORDER BY created_at DESC
LIMIT 1;
```

**Check Channel Rollback**:
```sql
SELECT channel_id, status, last_validation_at, updated_at
FROM payment_channels
WHERE channel_id = 'A3D68ED1D0736...'
ORDER BY updated_at DESC;
```

**Count Unread Notifications**:
```sql
SELECT COUNT(*) as unread_count
FROM ngo_notifications
WHERE organization_id = 1 AND is_read = false;
```

---

## Notification Database Schema

**Table**: `ngo_notifications`

```sql
CREATE TABLE ngo_notifications (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  notification_type VARCHAR(50) NOT NULL,
  worker_wallet_address VARCHAR(100) NOT NULL,
  worker_name VARCHAR(255),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
- `idx_ngo_notifications_org` on `(organization_id, is_read)`
- `idx_ngo_notifications_created_at` on `created_at`

---

## API Endpoints

### Get Notifications

**Endpoint**: `GET /api/organizations/:organizationId/notifications`

**Query Parameters**:
- `type` - Filter by notification type (optional)
- `isRead` - Filter by read status (optional)
- `limit` - Pagination limit (default: 20)
- `offset` - Pagination offset (default: 0)

**Response**:
```json
{
  "notifications": [
    {
      "id": 1,
      "organizationId": 1,
      "notificationType": "channel_closure_failed",
      "workerWalletAddress": "rN7n7otQDd6FczFgLdlqtyMVUa6E...",
      "workerName": "John Doe",
      "message": "CHANNEL CLOSURE VALIDATION FAILED...",
      "metadata": {
        "channelId": "A3D68ED1D0736...",
        "txHash": "8838DEE22F6A8D64...",
        "error": "TRANSACTION NOT VALIDATED",
        "validated": false,
        "channelRemoved": false,
        "jobName": "Construction Worker"
      },
      "isRead": false,
      "createdAt": "2025-11-29T02:45:32.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

### Mark as Read

**Endpoint**: `PUT /api/organizations/:organizationId/notifications/:notificationId/read`

**Response**:
```json
{
  "success": true
}
```

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Validation Failure Rate**:
   ```sql
   SELECT COUNT(*) as failure_count
   FROM ngo_notifications
   WHERE notification_type = 'channel_closure_failed'
   AND created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Notification Read Rate**:
   ```sql
   SELECT
     COUNT(CASE WHEN is_read THEN 1 END) * 100.0 / COUNT(*) as read_percentage
   FROM ngo_notifications
   WHERE notification_type = 'channel_closure_failed';
   ```

3. **Time to Read**:
   ```sql
   SELECT
     AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_seconds
   FROM ngo_notifications
   WHERE notification_type = 'channel_closure_failed'
   AND is_read = true;
   ```

### Alerts to Set Up

- **High Failure Rate**: > 10 validation failures per hour
- **Unread Notifications**: Notifications unread for > 24 hours
- **Notification Creation Errors**: Log errors in notification creation

---

## Future Enhancements

### Phase 2: Email Notifications
- Send email alerts for critical validation failures
- Include technical details and resolution steps
- Configurable notification preferences

### Phase 3: Webhook Integration
- Trigger webhooks for external monitoring systems
- POST validation failure events to configured endpoints
- Support Slack, Discord, Teams integrations

### Phase 4: Retry Mechanism
- Automatic retry with exponential backoff
- Background job to revalidate failed closures
- Update notifications when retry succeeds

---

## Related Documentation

- **Migration**: `backend/database/migrations/004_add_closing_state.sql`
- **Validation System**: `CLAUDE.md` - Critical Fix #4
- **Validation Function**: `frontend/src/utils/paymentChannels.ts:330-509`
- **Backend API**: `backend/routes/paymentChannels.js:347-715`
- **Roadmap**: `backend/claudedocs/CHANNEL_VALIDATION_ROADMAP.md`

---

## Files Modified

**Backend**:
- `backend/routes/paymentChannels.js` (+60 lines)

**Frontend**:
- `frontend/src/types/api.ts` (+1 line)
- `frontend/src/components/ChannelClosureFailedNotification.tsx` (NEW, 150 lines)
- `frontend/src/components/NGONotifications.tsx` (+3 lines)

---

**Created**: 2025-11-29
**Author**: Claude Code (Implementation Agent)
**Status**: ✅ **READY FOR TESTING**
