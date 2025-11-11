-- Seed script to create initial organization and link user
-- Run this in Supabase SQL Editor after migration 016

-- 1. Get the default organization ID (created by migration)
DO $$
DECLARE
  default_org_id UUID;
  first_user_id UUID;
BEGIN
  -- Get the default organization
  SELECT id INTO default_org_id FROM organizations WHERE name = 'Default Organization' LIMIT 1;

  -- If no default org exists, create one
  IF default_org_id IS NULL THEN
    INSERT INTO organizations (name, plan, subscription_status, max_venues, max_employees)
    VALUES ('OpsOS Demo', 'enterprise', 'active', 10, 200)
    RETURNING id INTO default_org_id;

    RAISE NOTICE 'Created new organization with ID: %', default_org_id;
  ELSE
    RAISE NOTICE 'Using existing organization with ID: %', default_org_id;
  END IF;

  -- Get the first user from auth.users (your account)
  SELECT id INTO first_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;

  IF first_user_id IS NOT NULL THEN
    -- Link user to organization as owner
    INSERT INTO organization_users (organization_id, user_id, role, is_active, accepted_at)
    VALUES (default_org_id, first_user_id, 'owner', TRUE, NOW())
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = 'owner', is_active = TRUE, accepted_at = NOW();

    RAISE NOTICE 'Linked user % to organization as owner', first_user_id;
  END IF;

  -- Ensure organization has settings
  INSERT INTO organization_settings (organization_id)
  VALUES (default_org_id)
  ON CONFLICT (organization_id) DO NOTHING;

  RAISE NOTICE 'Organization setup complete!';
END $$;

-- Show results
SELECT
  o.id,
  o.name,
  o.plan,
  COUNT(ou.id) as user_count,
  COUNT(v.id) as venue_count
FROM organizations o
LEFT JOIN organization_users ou ON ou.organization_id = o.id AND ou.is_active = TRUE
LEFT JOIN venues v ON v.organization_id = o.id
GROUP BY o.id, o.name, o.plan;
