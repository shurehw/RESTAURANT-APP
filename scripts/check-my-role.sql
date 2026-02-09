-- Check your current organization membership and role
-- Replace 'your.email@example.com' with your actual email

SELECT
  o.name as organization,
  ou.role,
  ou.is_active,
  au.email
FROM organization_users ou
INNER JOIN organizations o ON o.id = ou.organization_id
INNER JOIN auth.users au ON au.id = ou.user_id
WHERE au.email = 'your.email@example.com';  -- ← Replace with your email

-- If you need to grant yourself admin access:
-- UPDATE organization_users
-- SET role = 'admin'
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your.email@example.com');
