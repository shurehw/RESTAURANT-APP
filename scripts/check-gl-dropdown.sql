-- Check GL accounts for Hwood Group
SELECT
  COUNT(*) as total_accounts,
  COUNT(*) FILTER (WHERE is_active = true) as active_accounts,
  COUNT(*) FILTER (WHERE is_active = true AND is_summary = false) as usable_accounts
FROM gl_accounts
WHERE org_id = (SELECT id FROM organizations WHERE name = 'Hwood Group' LIMIT 1);

-- Show sample GL accounts
SELECT
  external_code,
  name,
  section,
  is_active,
  is_summary,
  display_order
FROM gl_accounts
WHERE org_id = (SELECT id FROM organizations WHERE name = 'Hwood Group' LIMIT 1)
  AND is_active = true
  AND is_summary = false
ORDER BY section, display_order
LIMIT 10;
