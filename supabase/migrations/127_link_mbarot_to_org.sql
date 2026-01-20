-- Link mbarot@hwoodgroup.com to organization
-- Creates organization if needed and links user

DO $$
DECLARE
  v_user_id UUID := '0bdd553b-1493-47d8-a79e-5cd22aba2212'; -- mbarot@hwoodgroup.com
  v_org_id UUID;
BEGIN
  -- Get or create organization
  SELECT id INTO v_org_id
  FROM organizations
  WHERE name = 'Hwood Group'
  LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, slug, plan, subscription_status, is_active)
    VALUES ('Hwood Group', 'hwood-group', 'enterprise', 'active', true)
    RETURNING id INTO v_org_id;

    RAISE NOTICE 'Created organization: Hwood Group (%)' , v_org_id;
  ELSE
    RAISE NOTICE 'Found existing organization: Hwood Group (%)' , v_org_id;
  END IF;

  -- Link user to organization
  INSERT INTO organization_users (organization_id, user_id, role, is_active)
  VALUES (v_org_id, v_user_id, 'admin', true)
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET
    role = 'admin',
    is_active = true,
    updated_at = NOW();

  RAISE NOTICE 'Linked mbarot@hwoodgroup.com to organization';
END $$;
