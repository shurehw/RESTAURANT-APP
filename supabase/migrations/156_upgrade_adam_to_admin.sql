-- Upgrade Adam to admin role
UPDATE organization_users
SET role = 'admin'
WHERE user_id = 'bc49ac70-2181-4117-bfd9-6438f4046f3a'
  AND organization_id = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

-- Verify
SELECT 
  u.email,
  ou.role,
  o.name as organization
FROM organization_users ou
JOIN auth.users u ON u.id = ou.user_id
JOIN organizations o ON o.id = ou.organization_id
WHERE u.email = 'aolson@hwoodgroup.com';
