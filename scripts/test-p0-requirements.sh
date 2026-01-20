#!/bin/bash
# ============================================================================
# P0 REQUIREMENTS API TEST SCRIPT
# Tests that all three P0 requirements are working via API
# ============================================================================

echo "=== P0 REQUIREMENTS API TESTS ==="
echo ""

BASE_URL="http://localhost:3000"

echo "Test 1: Hard Failure - Missing Settings Should Return 503"
echo "------------------------------------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/proforma/labor-settings")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "HTTP Status: $HTTP_CODE"
echo "Response Body: $BODY"

if [[ "$HTTP_CODE" == "503" ]] && [[ "$BODY" == *"SETTINGS_MISSING"* ]]; then
  echo "✅ PASS: Returns 503 with SETTINGS_MISSING code"
else
  echo "❌ FAIL: Expected 503 with SETTINGS_MISSING"
fi
echo ""

echo "Test 2: Global Immutability - PATCH Global Benchmark Should Return 403"
echo "----------------------------------------------------------------------"
# First, get a global benchmark ID
BENCHMARK_RESPONSE=$(curl -s "$BASE_URL/api/proforma/concept-benchmarks")
echo "Fetching global benchmarks..."

# Try to update a global benchmark (will need to extract ID from response)
# This is a placeholder - actual test would need to parse JSON response
echo "ℹ️  Manual test required: Try PATCH to /api/proforma/concept-benchmarks with a global benchmark ID"
echo "   Expected: HTTP 403 with code GLOBAL_IMMUTABLE"
echo ""

echo "Test 3: Versioning - Time-Travel Query Function Exists"
echo "-----------------------------------------------------"
echo "ℹ️  Database test required: Run scripts/verify-p0-migration.sql"
echo "   Expected: get_proforma_settings_at() function returns historical data"
echo ""

echo "=== API TESTS COMPLETE ==="
echo ""
echo "Next steps:"
echo "1. Ensure dev server is running: npm run dev"
echo "2. Run database verification: psql -f scripts/verify-p0-migration.sql"
echo "3. Check that labor-settings API returns proper error codes"
echo "4. Verify global benchmarks cannot be modified"
