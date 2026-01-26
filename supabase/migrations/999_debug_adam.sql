-- Debug Adam's access - comprehensive check
-- Run this to see Adam's full status

-- 1. Check auth.users
SELECT 
  'auth.users' as table_name,
  id::text,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at
FROM auth.users 
WHERE LOWER(email) = 'aolson@hwoodgroup.com';

-- 2. Check custom users table
SELECT 
  'custom users' as table_name,
  id::text,
  email,
  full_name,
  is_active
FROM users 
WHERE LOWER(email) = 'aolson@hwoodgroup.com';

-- 3. Check organization_users membership
SELECT 
  'organization_users' as table_name,
  ou.id::text,
  ou.user_id::text,
  ou.organization_id::text,
  ou.role,
  ou.is_active,
  o.name as org_name
FROM organization_users ou
LEFT JOIN organizations o ON o.id = ou.organization_id
WHERE ou.user_id IN (
  SELECT id FROM auth.users WHERE LOWER(email) = 'aolson@hwoodgroup.com'
);

-- 4. Check if h.wood organization exists
SELECT 
  'organizations' as table_name,
  id::text,
  name,
  slug
FROM organizations 
WHERE LOWER(name) LIKE '%hwood%' OR LOWER(name) LIKE '%h.wood%';
