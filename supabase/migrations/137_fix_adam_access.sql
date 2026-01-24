-- Fix Adam's access - verify and link if needed
-- This will check if Adam exists and ensure he's linked to h.wood group

DO $$
DECLARE
  v_org_id UUID;
  v_adam_user_id UUID;
  v_adam_email TEXT;
  v_adam_custom_id UUID;
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

  -- First, show all @hwoodgroup.com users to help identify Adam
  RAISE NOTICE '';
  RAISE NOTICE 'All users with @hwoodgroup.com emails in auth.users:';
  FOR v_user IN 
    SELECT id, email FROM auth.users WHERE LOWER(email) LIKE '%@hwoodgroup.com' ORDER BY email
  LOOP
    RAISE NOTICE '  - % (%)', v_user.email, v_user.id;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'All users with @hwoodgroup.com emails in custom users table:';
  FOR v_user IN 
    SELECT id, email FROM users WHERE LOWER(email) LIKE '%@hwoodgroup.com' ORDER BY email
  LOOP
    RAISE NOTICE '  - % (%)', v_user.email, v_user.id;
  END LOOP;

  RAISE NOTICE '';

  -- Find Adam in auth.users (try multiple patterns)
  SELECT id, email INTO v_adam_user_id, v_adam_email
  FROM auth.users
  WHERE LOWER(email) LIKE '%adam%@hwoodgroup.com'
     OR LOWER(email) = 'adam@hwoodgroup.com'
  LIMIT 1;

  -- Also check custom users table
  SELECT id INTO v_adam_custom_id
  FROM users
  WHERE LOWER(email) LIKE '%adam%@hwoodgroup.com'
     OR LOWER(email) = 'adam@hwoodgroup.com'
  LIMIT 1;

  IF v_adam_user_id IS NULL THEN
    IF v_adam_custom_id IS NOT NULL THEN
      RAISE NOTICE '⚠️  Adam found in custom users table (%) but NOT in auth.users', (SELECT email FROM users WHERE id = v_adam_custom_id);
      RAISE NOTICE '   This means the signup process did not create an auth user.';
      RAISE EXCEPTION 'Adam needs to sign up again, or an admin needs to create his auth user manually.';
    ELSE
      RAISE NOTICE '⚠️  Adam not found with email pattern containing "adam" and @hwoodgroup.com';
      RAISE NOTICE '   Please check the email address above or have Adam sign up if they haven''t yet.';
      RAISE EXCEPTION 'Adam not found. Please verify the email address or have Adam sign up.';
    END IF;
  END IF;

  RAISE NOTICE 'Found Adam in auth.users: % (%)', v_adam_email, v_adam_user_id;

  -- Check if already linked
  IF EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = v_adam_user_id
      AND organization_id = v_org_id
  ) THEN
    -- Update to ensure active
    UPDATE organization_users
    SET is_active = true,
        updated_at = NOW()
    WHERE user_id = v_adam_user_id
      AND organization_id = v_org_id;

    RAISE NOTICE '✅ Adam is already linked to h.wood group. Ensured active status.';
  ELSE
    -- Link Adam to organization
    INSERT INTO organization_users (organization_id, user_id, role, is_active)
    VALUES (v_org_id, v_adam_user_id, 'viewer', true)
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET
      role = COALESCE(EXCLUDED.role, organization_users.role),
      is_active = true,
      updated_at = NOW();

    RAISE NOTICE '✅ Successfully linked Adam (%) to h.wood group organization', v_adam_email;
  END IF;

  -- Show current status
  RAISE NOTICE '';
  RAISE NOTICE 'Adam''s organization membership:';
  SELECT 
    ou.role,
    ou.is_active,
    o.name as org_name
  FROM organization_users ou
  JOIN organizations o ON o.id = ou.organization_id
  WHERE ou.user_id = v_adam_user_id
    AND ou.organization_id = v_org_id;

END $$;
