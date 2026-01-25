-- Check what GL account sections exist
SELECT
  section,
  COUNT(*) as account_count,
  COUNT(*) FILTER (WHERE is_active = true AND is_summary = false) as usable_accounts
FROM gl_accounts
WHERE org_id = (SELECT id FROM organizations WHERE name = 'Hwood Group' LIMIT 1)
GROUP BY section
ORDER BY section;

-- Show sample accounts from each section
SELECT
  section,
  external_code,
  name,
  is_active,
  is_summary
FROM gl_accounts
WHERE org_id = (SELECT id FROM organizations WHERE name = 'Hwood Group' LIMIT 1)
ORDER BY section, display_order
LIMIT 30;
