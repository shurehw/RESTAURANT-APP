-- Directly link Adam to h.wood group organization
-- This finds Adam in the custom users table, ensures he has an auth user, and links him

DO $$
DECLARE
  v_org_id UUID;
  v_adam_custom RECORD;
  v_adam_auth_id UUID;
  v_adam_email TEXT;
  v_user RECORD;
BEGIN
  -- Get h.wood group organization
  SELECT id INTO v_org_id
  FROM organizations
  WHERE slug = 'hwood-group'
     OR name = 'The h.wood Group'
     OR name = 'Hwood Group'
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'h.wood group organization not found';
  END IF;

  RAISE NOTICE 'Found organization: % (%)', (SELECT name FROM organizations WHERE id = v_org_id), v_org_id;

  -- Find Adam (aolson@hwoodgroup.com) in custom users table
  SELECT id, email, full_name INTO v_adam_custom
  FROM users
  WHERE LOWER(email) = 'aolson@hwoodgroup.com'
     OR LOWER(email) LIKE '%aolson%@hwoodgroup.com'
     OR LOWER(email) LIKE '%adam%@hwoodgroup.com'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_adam_custom IS NULL THEN
    -- Try to find by exact email
    SELECT id, email, full_name INTO v_adam_custom
    FROM users
    WHERE LOWER(email) = 'aolson@hwoodgroup.com';
    
    IF v_adam_custom IS NULL THEN
      -- List all users to help identify
      RAISE NOTICE 'Adam (aolson@hwoodgroup.com) not found. Listing recent users:';
      FOR v_user IN 
        SELECT id, email, full_name, created_at 
        FROM users 
        ORDER BY created_at DESC 
        LIMIT 10
      LOOP
        RAISE NOTICE '  - % (%) - Created: %', v_user.email, COALESCE(v_user.full_name, 'No name'), v_user.created_at;
      END LOOP;
      RAISE EXCEPTION 'Adam (aolson@hwoodgroup.com) not found in users table.';
    END IF;
  END IF;

  v_adam_email := v_adam_custom.email;
  RAISE NOTICE 'Found Adam in custom users table: % (%) - %', v_adam_email, v_adam_custom.id, COALESCE(v_adam_custom.full_name, 'No name');

  -- Check if auth user exists
  SELECT id INTO v_adam_auth_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(v_adam_email);

  IF v_adam_auth_id IS NULL THEN
    RAISE NOTICE '⚠️  Adam does not have an auth.users entry.';
    RAISE NOTICE '   The signup process should have created one, but it may have failed.';
    RAISE NOTICE '   You will need to either:';
    RAISE NOTICE '   1. Have Adam sign up again (the new signup code will create both)';
    RAISE NOTICE '   2. Or manually create an auth user using Supabase Admin API';
    RAISE EXCEPTION 'Adam needs an auth.users entry to be linked to organization. Please have him sign up again or create auth user manually.';
  END IF;

  RAISE NOTICE 'Found Adam in auth.users: % (%)', v_adam_email, v_adam_auth_id;

  -- Check if already linked
  IF EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = v_adam_auth_id
      AND organization_id = v_org_id
  ) THEN
    -- Update to ensure active
    UPDATE organization_users
    SET is_active = true,
        updated_at = NOW()
    WHERE user_id = v_adam_auth_id
      AND organization_id = v_org_id;

    RAISE NOTICE '✅ Adam is already linked to h.wood group. Ensured active status.';
  ELSE
    -- Link Adam to organization
    INSERT INTO organization_users (organization_id, user_id, role, is_active)
    VALUES (v_org_id, v_adam_auth_id, 'viewer', true);

    RAISE NOTICE '✅ Successfully linked Adam (%) to h.wood group organization', v_adam_email;
  END IF;

  -- Show final status
  RAISE NOTICE '';
  RAISE NOTICE 'Adam''s current organization membership:';
  RAISE NOTICE '  Role: %, Active: %, Organization: %', 
    (SELECT role FROM organization_users WHERE user_id = v_adam_auth_id AND organization_id = v_org_id),
    (SELECT is_active FROM organization_users WHERE user_id = v_adam_auth_id AND organization_id = v_org_id),
    (SELECT name FROM organizations WHERE id = v_org_id);

END $$;
