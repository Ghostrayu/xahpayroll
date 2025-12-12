# Plan: Payment Channel Default Data Investigation

**Date**: 2025-12-11
**Issue**: Payment channels created with placeholder data "[IMPORTED - EDIT JOB NAME]" instead of actual form input
**Impact**: NGOs unable to use actual job names and hourly rates from create payment channel modal

## Hypothesis

**User Report**:
> "Payment channels are being created with default data; [IMPORTED - EDIT JOB NAME] when the modal for NGO already takes in this data when creating payment channels (job name field) the created channel should reflect this field instead of place holder data. same thing is happening with hourly rate as well"

**Initial Hypothesis**:
The CreatePaymentChannelModal form is not properly sending jobName and hourlyRate to the backend API, OR the backend is not using the provided values correctly.

## Expected Outcomes

**Fix Goals**:
1. Identify where "[IMPORTED - EDIT JOB NAME]" placeholder originates
2. Determine if issue is in frontend (data not sent) or backend (data not used)
3. Verify CreatePaymentChannelModal is correctly binding form fields
4. Ensure backend POST /create endpoint uses actual form values

**Success Criteria**:
- Payment channels created via modal show actual job name from form field
- Payment channels created via modal show actual hourly rate from form field
- No placeholder data when using CreatePaymentChannelModal
- Dashboard displays correct job names and rates

## Risks & Mitigation

**Risk 1**: Frontend form not binding jobName/hourlyRate correctly
- **Mitigation**: Inspect CreatePaymentChannelModal component for form field bindings
- **Action**: Verify state management and form value propagation

**Risk 2**: Backend ignoring request body parameters
- **Mitigation**: Check backend route handler for parameter extraction
- **Action**: Verify jobName and hourlyRate are used in INSERT query

**Risk 3**: Confusion between create and sync-all-channels flows
- **Mitigation**: Distinguish between manual channel creation and ledger import
- **Action**: Document both flows and their different purposes

## Investigation Strategy

**Phase 1: Frontend Analysis**
- Locate CreatePaymentChannelModal component
- Verify form field bindings for jobName and hourlyRate
- Check if values are sent in API request body
- Confirm fetch request includes correct parameters

**Phase 2: Backend Analysis**
- Read POST /create endpoint in backend/routes/paymentChannels.js
- Verify req.body parameter extraction
- Check INSERT query uses jobName and hourlyRate
- Identify any default value logic

**Phase 3: Search for Placeholder String**
- Search codebase for "[IMPORTED - EDIT JOB NAME]" string
- Determine which endpoint uses this placeholder
- Distinguish between create flow and import flow

## Context Notes

**Payment Channel Creation Flows**:
1. **Manual Creation** (via CreatePaymentChannelModal):
   - NGO fills form with job name, hourly rate, worker selection
   - Frontend sends PaymentChannelCreate transaction
   - Backend saves channel details with form values
   - Should use actual form data, NOT placeholders

2. **Ledger Sync/Import** (via "Sync All Channels" button):
   - NGO clicks "Sync All Channels" button
   - Backend queries Xahau ledger for existing channels
   - Imports channels that exist on-chain but not in database
   - Uses placeholder data because job name/rate unknown from ledger

**Key Files**:
- `frontend/src/components/CreatePaymentChannelModal.tsx` - Manual creation form
- `backend/routes/paymentChannels.js` - POST /create endpoint
- `backend/routes/organizations.js` - POST /sync-all-channels endpoint

## Next Steps

1. Locate CreatePaymentChannelModal component
2. Verify form field bindings for jobName and hourlyRate
3. Trace data flow from modal to API call
4. Check backend API handler for default data usage
5. Identify root cause (sync-all-channels vs create flow)
6. Apply fix if needed or document correct usage
