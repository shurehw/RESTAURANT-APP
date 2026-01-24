-- Debug Adam's access - check all user records
SELECT 'Custom Users Table' as source, id::text, email, full_name, is_active::text as status
FROM users 
WHERE LOWER(email) LIKE '%aolson%' OR LOWER(email) LIKE '%adam%'

UNION ALL

SELECT 'Auth Users' as source, id::text, email, raw_user_meta_data->>'full_name' as full_name, 'confirmed' as status
FROM auth.users 
WHERE LOWER(email) LIKE '%aolson%' OR LOWER(email) LIKE '%adam%'

UNION ALL

SELECT 'Org Members' as source, user_id::text, role, is_active::text as full_name, organization_id::text as status
FROM organization_users 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE LOWER(email) LIKE '%aolson%' OR LOWER(email) LIKE '%adam%'
);
