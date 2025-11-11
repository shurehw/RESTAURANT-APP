-- Setup organization with admin user
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  org_id UUID := 'f6eb8362-5879-464b-aca7-a73c7740c4f2';
  test_user_id UUID;
  user_count INTEGER;
BEGIN
  -- Check if any users exist
  SELECT COUNT(*) INTO user_count FROM auth.users;

  IF user_count = 0 THEN
    RAISE NOTICE 'No users found. Please sign up at your app first, then run this script again.';
    RAISE NOTICE 'Go to: http://localhost:3003 and create an account';
    RAISE EXCEPTION 'Cannot proceed without a user account';
  ELSE
    -- Get the first user
    SELECT id INTO test_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;

    RAISE NOTICE 'Found user: %', test_user_id;

    -- Link user to organization as owner
    INSERT INTO organization_users (organization_id, user_id, role, is_active, accepted_at)
    VALUES (org_id, test_user_id, 'owner', TRUE, NOW())
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = 'owner', is_active = TRUE, accepted_at = NOW();

    RAISE NOTICE 'Successfully linked user to organization';

    -- Ensure organization has settings
    INSERT INTO organization_settings (organization_id)
    VALUES (org_id)
    ON CONFLICT (organization_id) DO NOTHING;

    RAISE NOTICE 'Organization setup complete!';
  END IF;
END $$;

-- Show all users
SELECT
  id,
  email,
  created_at,
  email_confirmed_at
FROM auth.users
ORDER BY created_at ASC;

-- Show organization users
SELECT
  ou.id,
  ou.role,
  ou.is_active,
  au.email,
  o.name as organization_name
FROM organization_users ou
JOIN auth.users au ON au.id = ou.user_id
JOIN organizations o ON o.id = ou.organization_id
WHERE ou.organization_id = 'f6eb8362-5879-464b-aca7-a73c7740c4f2';
