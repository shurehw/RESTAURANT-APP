-- ============================================================================
-- VERIFY MULTI-TENANT RLS CONFIGURATION
-- Run this AFTER 146_fix_multi_tenant_rls.sql to verify everything is correct
-- ============================================================================

-- 1. Show RLS status for all tenant-critical tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations',
    'organization_users', 
    'organization_settings',
    'organization_usage',
    'venues',
    'invoices',
    'invoice_lines',
    'vendors',
    'items',
    'item_pack_configurations',
    'employees'
  )
ORDER BY tablename;

-- 2. Show all policies on tenant tables
SELECT 
  tablename,
  policyname,
  permissive,
  roles::text,
  cmd,
  LEFT(qual::text, 80) as using_clause
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations',
    'organization_users',
    'invoices',
    'invoice_lines',
    'vendors',
    'items'
  )
ORDER BY tablename, policyname;

-- 3. Verify organization_users FK constraint exists
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'organization_users';

-- 4. Count users in each organization (sanity check)
SELECT 
  o.name as org_name,
  o.id as org_id,
  COUNT(ou.id) as member_count,
  STRING_AGG(DISTINCT ou.role, ', ') as roles_present
FROM organizations o
LEFT JOIN organization_users ou ON ou.organization_id = o.id AND ou.is_active = true
GROUP BY o.id, o.name
ORDER BY o.name;

-- 5. Check for any orphaned records (should be 0)
SELECT 'organization_users without valid auth.users' as check_name, COUNT(*) as orphan_count
FROM organization_users ou
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = ou.user_id)

UNION ALL

SELECT 'invoices without valid organization' as check_name, COUNT(*) as orphan_count
FROM invoices i
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = i.organization_id)

UNION ALL

SELECT 'vendors without valid organization' as check_name, COUNT(*) as orphan_count
FROM vendors v
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = v.organization_id)

UNION ALL

SELECT 'items without valid organization' as check_name, COUNT(*) as orphan_count
FROM items it
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = it.organization_id);
