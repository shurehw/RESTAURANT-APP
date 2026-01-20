-- ============================================================================
-- P0 MIGRATION VERIFICATION SCRIPT
-- Run this to verify migration 115 was applied successfully
-- ============================================================================

\echo '=== P0 MIGRATION VERIFICATION ==='
\echo ''

-- Check 1: Verify versioning columns added to proforma_settings
\echo 'Check 1: Versioning columns on proforma_settings'
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'proforma_settings'
  AND column_name IN ('version', 'effective_from', 'effective_to', 'is_active', 'created_by', 'superseded_by_org_id', 'superseded_by_version')
ORDER BY column_name;

\echo ''
\echo 'Check 2: Composite primary key on proforma_settings'
SELECT
  tc.constraint_name,
  kcu.column_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'proforma_settings'
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY kcu.ordinal_position;

\echo ''
\echo 'Check 3: Composite foreign key for superseded_by'
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'proforma_settings'
  AND tc.constraint_name = 'proforma_settings_superseded_by_fkey'
ORDER BY kcu.ordinal_position;

\echo ''
\echo 'Check 4: Version columns added to other tables'
SELECT
  table_name,
  COUNT(*) as version_columns
FROM information_schema.columns
WHERE table_name IN ('proforma_concept_benchmarks', 'proforma_validation_rules', 'proforma_city_wage_presets')
  AND column_name IN ('version', 'effective_from', 'effective_to')
GROUP BY table_name
ORDER BY table_name;

\echo ''
\echo 'Check 5: Version-aware indexes created'
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname IN (
  'idx_proforma_settings_active',
  'idx_concept_benchmarks_active_version',
  'idx_validation_rules_active_version',
  'idx_city_presets_active_version'
)
ORDER BY tablename, indexname;

\echo ''
\echo 'Check 6: Time-travel functions exist'
SELECT
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_name IN (
  'get_proforma_settings_at',
  'get_concept_benchmarks_at',
  'is_global_immutable',
  'proforma_settings_version_on_update',
  'audit_proforma_settings_change'
)
ORDER BY routine_name;

\echo ''
\echo 'Check 7: Audit trigger recreated'
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'audit_proforma_settings'
  AND event_object_table = 'proforma_settings';

\echo ''
\echo 'Check 8: Existing settings rows have version = 1'
SELECT
  org_id,
  version,
  effective_from IS NOT NULL as has_effective_from,
  is_active,
  effective_to IS NULL as is_current_version
FROM proforma_settings
LIMIT 5;

\echo ''
\echo 'Check 9: Test time-travel query function'
SELECT
  org_id,
  version,
  effective_from,
  effective_to,
  market_tier_low_multiplier,
  market_tier_high_multiplier
FROM get_proforma_settings_at(
  (SELECT org_id FROM proforma_settings LIMIT 1),
  now()
);

\echo ''
\echo '=== VERIFICATION COMPLETE ==='
\echo 'If all checks returned results, migration was successful!'
