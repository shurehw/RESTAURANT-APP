-- Link Adam Olson to The h.wood Group organization
-- Adam exists in auth.users but has no organization_users entry

DO $$
DECLARE
  v_adam_auth_id UUID := 'bc49ac70-2181-4117-bfd9-6438f4046f3a';
  v_hwood_org_id UUID := '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';
  v_existing_membership UUID;
BEGIN
  -- Check if membership already exists
  SELECT id INTO v_existing_membership
  FROM organization_users
  WHERE user_id = v_adam_auth_id
    AND organization_id = v_hwood_org_id;

  IF v_existing_membership IS NOT NULL THEN
    -- Reactivate if inactive
    UPDATE organization_users
    SET is_active = true
    WHERE id = v_existing_membership;
    
    RAISE NOTICE 'Reactivated existing membership for Adam';
  ELSE
    -- Create new membership
    INSERT INTO organization_users (
      user_id,
      organization_id,
      role,
      is_active
    ) VALUES (
      v_adam_auth_id,
      v_hwood_org_id,
      'viewer',  -- Default role, can be upgraded via platform admin
      true
    );
    
    RAISE NOTICE 'Created new membership for Adam as viewer';
  END IF;
  
  -- Verify the link
  RAISE NOTICE 'Adam (%) is now linked to The h.wood Group (%)', 
    v_adam_auth_id, v_hwood_org_id;
END $$;

-- Verify the result
SELECT 
  'Verification' as status,
  u.email,
  ou.role,
  ou.is_active,
  o.name as organization
FROM organization_users ou
JOIN auth.users u ON u.id = ou.user_id
JOIN organizations o ON o.id = ou.organization_id
WHERE u.email = 'aolson@hwoodgroup.com';
