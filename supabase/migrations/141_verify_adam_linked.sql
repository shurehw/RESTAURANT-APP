-- Verify Adam is linked to h.wood group organization
-- Run this AFTER Adam signs up again to verify everything worked

DO $$
DECLARE
  v_org_id UUID;
  v_adam_auth_id UUID;
  v_adam_email TEXT := 'aolson@hwoodgroup.com';
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

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Checking Adam''s (aolson@hwoodgroup.com) status...';
  RAISE NOTICE '========================================';

  -- Check if auth user exists
  SELECT id INTO v_adam_auth_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(v_adam_email);

  IF v_adam_auth_id IS NULL THEN
    RAISE NOTICE '';
    RAISE NOTICE '❌ Adam does NOT have an auth.users entry yet.';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Have Adam go to the signup page';
    RAISE NOTICE '2. Sign up with: aolson@hwoodgroup.com';
    RAISE NOTICE '3. Use the same password he uses to log in';
    RAISE NOTICE '4. The system will create his auth user and link him automatically';
    RAISE NOTICE '';
    RAISE NOTICE 'Then run this migration again to verify.';
    RAISE NOTICE '';
  ELSE
    RAISE NOTICE '✅ Found Adam in auth.users: % (%)', v_adam_email, v_adam_auth_id;

    -- Check if linked to organization
    IF EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = v_adam_auth_id
        AND organization_id = v_org_id
    ) THEN
      RAISE NOTICE '✅ Adam IS linked to h.wood group organization';
      RAISE NOTICE '';
      RAISE NOTICE 'Current membership:';
      RAISE NOTICE '  Role: %', (SELECT role FROM organization_users WHERE user_id = v_adam_auth_id AND organization_id = v_org_id);
      RAISE NOTICE '  Active: %', (SELECT is_active FROM organization_users WHERE user_id = v_adam_auth_id AND organization_id = v_org_id);
      RAISE NOTICE '  Organization: %', (SELECT name FROM organizations WHERE id = v_org_id);
      RAISE NOTICE '';
      RAISE NOTICE '✅ Adam should now be able to access the organization!';
    ELSE
      RAISE NOTICE '⚠️  Adam has an auth user but is NOT linked to organization yet.';
      RAISE NOTICE '';
      RAISE NOTICE 'Linking now...';
      
      INSERT INTO organization_users (organization_id, user_id, role, is_active)
      VALUES (v_org_id, v_adam_auth_id, 'viewer', true)
      ON CONFLICT (organization_id, user_id) DO UPDATE
      SET is_active = true, updated_at = NOW();

      RAISE NOTICE '✅ Successfully linked Adam to h.wood group organization!';
    END IF;
  END IF;

  RAISE NOTICE '========================================';

END $$;
