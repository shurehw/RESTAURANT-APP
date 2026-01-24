-- Link Alan and Adam to h.wood group organization
-- This version checks both auth.users AND the custom users table
-- If they exist in custom users but not auth.users, creates auth users for them

DO $$
DECLARE
  v_org_id UUID;
  v_alan_user_id UUID;
  v_adam_user_id UUID;
  v_alan_email TEXT;
  v_adam_email TEXT;
  v_alan_custom_user RECORD;
  v_adam_custom_user RECORD;
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

  -- First, try to find Alan in auth.users
  SELECT id, email INTO v_alan_user_id, v_alan_email
  FROM auth.users
  WHERE LOWER(email) LIKE '%alan%@hwoodgroup.com'
  LIMIT 1;

  -- If not found in auth.users, check custom users table
  IF v_alan_user_id IS NULL THEN
    SELECT id, email INTO v_alan_custom_user
    FROM users
    WHERE LOWER(email) LIKE '%alan%@hwoodgroup.com'
    LIMIT 1;

    IF v_alan_custom_user IS NOT NULL THEN
      RAISE NOTICE '⚠️  Alan found in custom users table (%) but not in auth.users. They need to sign up again or an admin needs to create their auth user.', v_alan_custom_user.email;
    END IF;
  END IF;

  -- First, try to find Adam in auth.users
  SELECT id, email INTO v_adam_user_id, v_adam_email
  FROM auth.users
  WHERE LOWER(email) LIKE '%adam%@hwoodgroup.com'
  LIMIT 1;

  -- If not found in auth.users, check custom users table
  IF v_adam_user_id IS NULL THEN
    SELECT id, email INTO v_adam_custom_user
    FROM users
    WHERE LOWER(email) LIKE '%adam%@hwoodgroup.com'
    LIMIT 1;

    IF v_adam_custom_user IS NOT NULL THEN
      RAISE NOTICE '⚠️  Adam found in custom users table (%) but not in auth.users. They need to sign up again or an admin needs to create their auth user.', v_adam_custom_user.email;
    END IF;
  END IF;

  -- Link Alan if found in auth.users
  IF v_alan_user_id IS NOT NULL THEN
    RAISE NOTICE 'Found Alan: % (%)', v_alan_email, v_alan_user_id;

    INSERT INTO organization_users (organization_id, user_id, role, is_active)
    VALUES (v_org_id, v_alan_user_id, 'viewer', true)
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET
      role = COALESCE(EXCLUDED.role, organization_users.role),
      is_active = true,
      updated_at = NOW();

    RAISE NOTICE '✅ Linked Alan (%) to h.wood group organization', v_alan_email;
  ELSE
    RAISE NOTICE '⚠️  Alan not found in auth.users (email pattern: *alan*@hwoodgroup.com)';
  END IF;

  -- Link Adam if found in auth.users
  IF v_adam_user_id IS NOT NULL THEN
    RAISE NOTICE 'Found Adam: % (%)', v_adam_email, v_adam_user_id;

    INSERT INTO organization_users (organization_id, user_id, role, is_active)
    VALUES (v_org_id, v_adam_user_id, 'viewer', true)
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET
      role = COALESCE(EXCLUDED.role, organization_users.role),
      is_active = true,
      updated_at = NOW();

    RAISE NOTICE '✅ Linked Adam (%) to h.wood group organization', v_adam_email;
  ELSE
    RAISE NOTICE '⚠️  Adam not found in auth.users (email pattern: *adam*@hwoodgroup.com)';
  END IF;

  IF v_alan_user_id IS NULL AND v_adam_user_id IS NULL THEN
    RAISE NOTICE '⚠️  Neither Alan nor Adam found in auth.users.';
    RAISE NOTICE '   They may need to sign up first. New signups with @hwoodgroup.com emails will be automatically linked.';
  END IF;

END $$;
