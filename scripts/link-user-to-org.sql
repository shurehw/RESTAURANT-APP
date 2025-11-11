-- Link your user to the organization
-- This allows you to access organization settings

DO $$
DECLARE
  org_id UUID := 'f6eb8362-5879-464b-aca7-a73c7740c4f2'; -- Your Default Organization ID
  user_id UUID;
BEGIN
  -- Get the currently authenticated user (or first user)
  SELECT id INTO user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;

  IF user_id IS NOT NULL THEN
    -- Link user to organization as owner
    INSERT INTO organization_users (organization_id, user_id, role, is_active, accepted_at)
    VALUES (org_id, user_id, 'owner', TRUE, NOW())
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = 'owner', is_active = TRUE, accepted_at = NOW();

    RAISE NOTICE 'Successfully linked user % to organization', user_id;
  ELSE
    RAISE EXCEPTION 'No users found in auth.users table';
  END IF;

  -- Ensure organization has settings
  INSERT INTO organization_settings (organization_id)
  VALUES (org_id)
  ON CONFLICT (organization_id) DO NOTHING;

  RAISE NOTICE 'Organization setup complete!';
END $$;

-- Verify the setup
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
