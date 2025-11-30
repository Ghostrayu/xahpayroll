#!/bin/bash

# Test script for ledger sync endpoint
# This tests the POST /api/payment-channels/sync-from-ledger endpoint

echo "=========================================="
echo "TESTING LEDGER SYNC ENDPOINT"
echo "=========================================="
echo ""

# Configuration
BACKEND_URL="http://localhost:3001"
CHANNEL_ID="A798F6B1E5E47E99E1F340F5A4997919B4C26C5F6560BE85E119E9293143A29A"
ORG_WALLET="ryWmg93m9hzJWr36ajV5JmAMdBLA7SiQW"
WORKER_WALLET="rQHERc4JCVRtoHvwnoeqoqc1GBgrXPDrLS"

echo "Test Parameters:"
echo "  Backend URL: $BACKEND_URL"
echo "  Channel ID: $CHANNEL_ID"
echo "  Org Wallet: $ORG_WALLET"
echo "  Worker Wallet: $WORKER_WALLET"
echo ""
echo "Sending request..."
echo ""

# Make the request
curl -X POST "$BACKEND_URL/api/payment-channels/sync-from-ledger" \
  -H "Content-Type: application/json" \
  -d "{
    \"channelId\": \"$CHANNEL_ID\",
    \"organizationWalletAddress\": \"$ORG_WALLET\",
    \"workerWalletAddress\": \"$WORKER_WALLET\"
  }" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | python3 -m json.tool 2>/dev/null || cat

echo ""
echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
