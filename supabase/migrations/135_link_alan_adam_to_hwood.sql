-- Link Alan and Adam to h.wood group organization
-- Finds users by email pattern and links them to the organization
--
-- PREREQUISITE: Migration 016_multi_tenant_organizations.sql must be run first
-- to create the organizations and organization_users tables

DO $$
DECLARE
  v_org_id UUID;
  v_alan_user_id UUID;
  v_adam_user_id UUID;
  v_alan_email TEXT;
  v_adam_email TEXT;
BEGIN
  -- Get h.wood group organization (try multiple name variations)
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

  -- Find Alan by email (case-insensitive search for emails containing "alan" and ending with @hwoodgroup.com)
  SELECT id, email INTO v_alan_user_id, v_alan_email
  FROM auth.users
  WHERE LOWER(email) LIKE '%alan%@hwoodgroup.com'
  LIMIT 1;

  -- Find Adam by email (case-insensitive search for emails containing "adam" and ending with @hwoodgroup.com)
  SELECT id, email INTO v_adam_user_id, v_adam_email
  FROM auth.users
  WHERE LOWER(email) LIKE '%adam%@hwoodgroup.com'
  LIMIT 1;

  -- Link Alan if found
  IF v_alan_user_id IS NOT NULL THEN
    RAISE NOTICE 'Found Alan: % (%)', v_alan_email, v_alan_user_id;

    INSERT INTO organization_users (organization_id, user_id, role, is_active)
    VALUES (v_org_id, v_alan_user_id, 'viewer', true)
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET
      role = COALESCE(EXCLUDED.role, organization_users.role),
      is_active = true,
      updated_at = NOW();

    RAISE NOTICE 'Linked Alan (%) to h.wood group organization', v_alan_email;
  ELSE
    RAISE NOTICE '⚠️  Alan not found in auth.users (email pattern: *alan*@hwoodgroup.com)';
  END IF;

  -- Link Adam if found
  IF v_adam_user_id IS NOT NULL THEN
    RAISE NOTICE 'Found Adam: % (%)', v_adam_email, v_adam_user_id;

    INSERT INTO organization_users (organization_id, user_id, role, is_active)
    VALUES (v_org_id, v_adam_user_id, 'viewer', true)
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET
      role = COALESCE(EXCLUDED.role, organization_users.role),
      is_active = true,
      updated_at = NOW();

    RAISE NOTICE 'Linked Adam (%) to h.wood group organization', v_adam_email;
  ELSE
    RAISE NOTICE '⚠️  Adam not found in auth.users (email pattern: *adam*@hwoodgroup.com)';
  END IF;

  IF v_alan_user_id IS NULL AND v_adam_user_id IS NULL THEN
    RAISE NOTICE '⚠️  Neither Alan nor Adam found. They may need to sign up first, or their emails may be different.';
  END IF;

END $$;
