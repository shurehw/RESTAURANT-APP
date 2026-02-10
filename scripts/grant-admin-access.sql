-- Grant Admin Access Script
-- Run this in Supabase SQL Editor to grant yourself admin access

-- ══════════════════════════════════════════════════════════════════════════
-- STEP 1: Check your current access
-- ══════════════════════════════════════════════════════════════════════════

SELECT
  au.email,
  o.name as organization,
  ou.role,
  ou.is_active,
  o.id as org_id
FROM auth.users au
LEFT JOIN organization_users ou ON ou.user_id = au.id
LEFT JOIN organizations o ON o.id = ou.organization_id
WHERE au.email = 'your.email@example.com';  -- ← REPLACE WITH YOUR EMAIL

-- ══════════════════════════════════════════════════════════════════════════
-- STEP 2: Grant yourself admin access
-- ══════════════════════════════════════════════════════════════════════════

-- Option A: If you already have a row in organization_users (just update role)
UPDATE organization_users
SET
  role = 'admin',
  is_active = true,
  updated_at = NOW()
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your.email@example.com')  -- ← REPLACE WITH YOUR EMAIL
AND organization_id = 'your-org-id-here';  -- ← REPLACE WITH ORG ID FROM STEP 1

-- Option B: If you don't have a row in organization_users (create new membership)
-- First, get your user_id and org_id from STEP 1, then run:
/*
INSERT INTO organization_users (
  organization_id,
  user_id,
  role,
  is_active,
  invited_by,
  invited_at,
  accepted_at
)
VALUES (
  'your-org-id-here',  -- ← REPLACE WITH ORG ID
  (SELECT id FROM auth.users WHERE email = 'your.email@example.com'),  -- ← REPLACE WITH YOUR EMAIL
  'admin',
  true,
  (SELECT id FROM auth.users WHERE email = 'your.email@example.com'),
  NOW(),
  NOW()
)
ON CONFLICT (organization_id, user_id)
DO UPDATE SET
  role = 'admin',
  is_active = true;
*/

-- ══════════════════════════════════════════════════════════════════════════
-- STEP 3: Verify the change
-- ══════════════════════════════════════════════════════════════════════════

SELECT
  au.email,
  o.name as organization,
  ou.role,
  ou.is_active
FROM auth.users au
INNER JOIN organization_users ou ON ou.user_id = au.id
INNER JOIN organizations o ON o.id = ou.organization_id
WHERE au.email = 'your.email@example.com'  -- ← REPLACE WITH YOUR EMAIL
AND ou.role IN ('admin', 'owner');
