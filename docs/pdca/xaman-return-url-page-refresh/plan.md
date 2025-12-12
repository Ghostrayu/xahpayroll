# Plan: Xaman return_url Causing Page Refresh During Channel Cancellation

**Date**: 2025-12-11
**Issue**: Cancel channel button not working - page refreshes after Xaman QR scan, channel persists on ledger
**Impact**: Payment channels cannot be closed via Xaman wallet, orphaned channels remain on ledger

## Hypothesis

**User Report**:
> "cancel channel button not working. After scanning the xaman qr code the page refreshes but the channel still exists on ledger"

**Initial Hypothesis**:
The 3-step cancellation flow is being interrupted by a page refresh after Xaman transaction signing. This prevents Step 3 (database confirmation) from executing, leaving the channel closed on-chain but still marked as 'active' in the database.

## Expected Outcomes

**Fix Goals**:
1. Prevent page refresh after Xaman transaction signing
2. Allow 3-step cancellation flow to complete uninterrupted
3. Ensure channel is closed both on ledger AND in database
4. Maintain sign-in flow functionality (which needs return_url)

**Success Criteria**:
- Cancel channel button completes all 3 steps without page refresh
- Channel closed on Xahau ledger (verified via ledger query)
- Channel status updated to 'closed' in database
- Sign-in flow continues to work (return_url still present)

## Risks & Mitigation

**Risk 1**: Removing return_url breaks sign-in flow
- **Mitigation**: Only remove return_url for transaction payloads, keep for SignIn
- **Action**: Sign-in endpoint has its own payload creation with explicit return_url

**Risk 2**: Xaman mobile app behavior different from web
- **Mitigation**: Test with both Xaman mobile app and web interface
- **Action**: Verify polling loop works regardless of Xaman platform

**Risk 3**: Page refresh interrupts polling loop
- **Mitigation**: Do NOT set return_url for transaction payloads
- **Action**: Frontend polling loop will wait for transaction without redirect

## Investigation Strategy

**Phase 1: Trace Cancellation Flow**
- Locate cancel channel button handler (NgoDashboard.tsx)
- Verify 3-step flow: API call → XRPL transaction → Database confirmation
- Check if flow completes or gets interrupted

**Phase 2: Analyze Xaman Implementation**
- Read submitWithXaman function (walletTransactions.ts)
- Check if return_url is set in request body
- Verify polling loop waits for transaction completion

**Phase 3: Identify Page Refresh Source**
- Search for return_url usage in frontend and backend
- Determine if Xaman redirects back after signing
- Confirm page refresh interrupts Step 3

**Phase 4: Apply Fix**
- Remove return_url from transaction payloads
- Keep return_url for sign-in payloads only
- Verify polling loop completes without redirect

## Context Notes

**3-Step Cancellation Flow**:
```
Step 1 (API): POST /api/payment-channels/:channelId/close
→ Backend returns XRPL transaction details

Step 2 (XRPL): Execute PaymentChannelClaim with tfClose flag
→ Xaman signs transaction
→ [PROBLEM: Page refreshes here, interrupting flow]

Step 3 (DB): POST /api/payment-channels/:channelId/close/confirm
→ Never executes because page refreshed!
```

**Xaman return_url Behavior**:
- If `return_url` is set: Xaman redirects to URL after signing
- Redirect causes page refresh
- Page refresh kills JavaScript execution (polling loop stops)
- Step 3 never executes

**Solution**:
- Do NOT set `return_url` for transaction payloads
- Frontend polling loop waits for transaction completion
- No redirect = no page refresh = flow completes

**Key Files**:
- `frontend/src/pages/NgoDashboard.tsx` - Cancel button handler (3-step flow)
- `frontend/src/utils/paymentChannels.ts` - closePaymentChannel function
- `frontend/src/utils/walletTransactions.ts` - submitWithXaman (sets return_url)
- `backend/routes/xaman.js` - create-payload endpoint (hardcodes return_url)

## Next Steps

1. Analyze cancel channel button flow
2. Check Xaman transaction signing implementation
3. Verify PaymentChannelClaim transaction parameters
4. Identify page refresh issue interrupting flow
5. Check if return_url causes premature redirect
6. Apply fix to prevent page refresh during transaction
7. Test with Xaman wallet to verify fix works
