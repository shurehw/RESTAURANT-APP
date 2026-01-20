-- ============================================================================
-- P0 IMPLEMENTATION VALIDATION SCRIPT
-- Run this after applying migration 115 to verify everything works
-- ============================================================================

-- Test 1: Verify version columns exist
-- ============================================================================
SELECT
  'proforma_settings' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'proforma_settings'
  AND column_name IN ('version', 'effective_from', 'effective_to', 'is_active', 'created_by', 'superseded_by')
ORDER BY column_name;

-- Expected: 6 rows showing all new columns

-- Test 2: Verify composite primary key
-- ============================================================================
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'proforma_settings'
  AND constraint_type = 'PRIMARY KEY';

-- Expected: Primary key exists (should be on org_id, version)

-- Test 3: Verify indexes created
-- ============================================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'proforma_settings'
  AND indexname LIKE 'idx_%';

-- Expected: idx_proforma_settings_active and others

-- Test 4: Verify SQL functions exist
-- ============================================================================
SELECT
  routine_name,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_proforma_settings_at',
    'get_concept_benchmarks_at',
    'proforma_settings_version_on_update',
    'is_global_immutable'
  )
ORDER BY routine_name;

-- Expected: 4 functions

-- Test 5: Verify all existing settings have version = 1
-- ============================================================================
SELECT
  COUNT(*) as total_settings,
  COUNT(CASE WHEN version = 1 THEN 1 END) as version_1_count,
  COUNT(CASE WHEN version IS NULL THEN 1 END) as null_version_count
FROM proforma_settings;

-- Expected: null_version_count = 0, version_1_count = total_settings

-- Test 6: Verify only one active version per org
-- ============================================================================
WITH active_versions AS (
  SELECT
    org_id,
    COUNT(*) as active_count
  FROM proforma_settings
  WHERE is_active = true
    AND effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
  GROUP BY org_id
)
SELECT
  CASE
    WHEN MAX(active_count) > 1 THEN 'FAIL: Multiple active versions found'
    WHEN MAX(active_count) = 1 THEN 'PASS: One active version per org'
    ELSE 'FAIL: No active versions'
  END as result,
  MAX(active_count) as max_active_versions
FROM active_versions;

-- Expected: "PASS: One active version per org"

-- Test 7: Test time-travel function (requires test data)
-- ============================================================================
-- First, let's see what orgs exist
SELECT org_id, version, effective_from, effective_to
FROM proforma_settings
LIMIT 5;

-- Pick an org_id from above and test time-travel
-- Replace '[org-id]' with actual org_id from previous query
-- SELECT * FROM get_proforma_settings_at('[org-id]', now());

-- Expected: Returns one row with current settings

-- Test 8: Verify global benchmarks exist (tenant_id IS NULL)
-- ============================================================================
SELECT
  COUNT(*) as global_benchmark_count,
  COUNT(DISTINCT concept_type) as distinct_concepts
FROM proforma_concept_benchmarks
WHERE tenant_id IS NULL
  AND is_active = true;

-- Expected: 6 global benchmarks (one per concept type)

-- Test 9: Test concept benchmarks function
-- ============================================================================
SELECT * FROM get_concept_benchmarks_at(
  'casual-dining',  -- concept_type
  'MID',            -- market_tier
  NULL,             -- tenant_id (NULL = get global)
  CURRENT_DATE      -- as_of date
);

-- Expected: Returns casual-dining benchmarks

-- Test 10: Verify audit triggers are attached
-- ============================================================================
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE 'audit_%'
  AND event_object_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Expected: audit_proforma_settings, audit_concept_benchmarks, etc.

-- Test 11: Check audit log structure
-- ============================================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'settings_audit_log'
ORDER BY ordinal_position;

-- Expected: id, table_name, record_id, field_name, old_value, new_value, user_id, user_email, changed_at, ip_address, user_agent, change_reason

-- Test 12: Simulate hard failure test (delete settings for test org)
-- ============================================================================
-- WARNING: This will delete settings for the test org
-- Uncomment and replace [test-org-id] to test
-- DELETE FROM proforma_settings WHERE org_id = '[test-org-id]';
-- Then make API request to /api/proforma/labor-settings
-- Should get 503 SETTINGS_MISSING

-- Test 13: Verify no hardcoded defaults in database functions
-- ============================================================================
SELECT
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('calculate_position_hourly_rate', 'get_wage_calculation_breakdown')
  AND routine_definition LIKE '%0.95%';

-- Expected: 0 rows (no hardcoded 0.95 in SQL functions anymore)
-- If rows returned, hardcoded values still exist in SQL

-- Test 14: Count total settings by version
-- ============================================================================
SELECT
  version,
  COUNT(*) as setting_count,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
FROM proforma_settings
GROUP BY version
ORDER BY version DESC;

-- Expected: Most rows at version 1 (unless updates have been made)

-- Test 15: Verify RLS policies still work
-- ============================================================================
-- This requires running as non-superuser
-- SET ROLE authenticated;
-- SELECT COUNT(*) FROM proforma_settings;
-- Should only see settings for user's org

-- ============================================================================
-- SUMMARY CHECKS
-- ============================================================================

SELECT 'P0 IMPLEMENTATION VALIDATION' as check_category;

SELECT
  'Schema' as category,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'proforma_settings'
        AND column_name = 'version'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as version_column_exists;

SELECT
  'Functions' as category,
  CASE
    WHEN COUNT(*) = 4 THEN '✅ PASS'
    ELSE '❌ FAIL: Expected 4 functions, found ' || COUNT(*)
  END as sql_functions_created
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_proforma_settings_at',
    'get_concept_benchmarks_at',
    'proforma_settings_version_on_update',
    'is_global_immutable'
  );

SELECT
  'Data Integrity' as category,
  CASE
    WHEN COUNT(CASE WHEN version IS NULL THEN 1 END) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL: ' || COUNT(CASE WHEN version IS NULL THEN 1 END) || ' rows missing version'
  END as all_rows_versioned
FROM proforma_settings;

SELECT
  'Global Benchmarks' as category,
  CASE
    WHEN COUNT(*) = 6 THEN '✅ PASS'
    ELSE '⚠️ WARNING: Expected 6 global benchmarks, found ' || COUNT(*)
  END as global_benchmarks_seeded
FROM proforma_concept_benchmarks
WHERE tenant_id IS NULL AND is_active = true;

-- ============================================================================
-- MANUAL TEST INSTRUCTIONS
-- ============================================================================

/*
AFTER RUNNING THIS SCRIPT, PERFORM THESE MANUAL TESTS:

1. TEST HARD FAILURE (SETTINGS_MISSING):
   - Pick a test org ID
   - DELETE FROM proforma_settings WHERE org_id = '[test-org]';
   - curl http://localhost:3000/api/proforma/labor-settings
   - Verify response: {"code": "SETTINGS_MISSING", ...} with status 503

2. TEST GLOBAL IMMUTABILITY:
   - SELECT id FROM proforma_concept_benchmarks WHERE tenant_id IS NULL LIMIT 1;
   - curl -X PATCH http://localhost:3000/api/proforma/concept-benchmarks \
       -H "Content-Type: application/json" \
       -d '{"id":"[global-id]","sf_per_seat_min":999}'
   - Verify response: {"code": "GLOBAL_IMMUTABLE", ...} with status 403

3. TEST TIME TRAVEL:
   - SELECT * FROM get_proforma_settings_at('[org-id]', '2024-01-01');
   - Should return settings that were active on Jan 1, 2024

4. TEST VERSION INCREMENT (after enabling trigger):
   - UPDATE proforma_settings SET market_tier_low_multiplier = 0.94 WHERE org_id = '[test-org]';
   - SELECT version FROM proforma_settings WHERE org_id = '[test-org]' ORDER BY version DESC;
   - Should see version 2 created

5. RUN TEST SUITE:
   - npm test tests/p0-settings-hard-failure.test.ts
   - npm test tests/p0-global-immutability.test.ts
   - npm test tests/p0-versioning-time-travel.test.ts
*/
