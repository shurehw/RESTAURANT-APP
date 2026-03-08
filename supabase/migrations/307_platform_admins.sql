-- ============================================================================
-- PLATFORM ADMINS TABLE
-- Super admins who can manage all organizations (not tied to any single org)
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  UNIQUE(user_id),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON platform_admins(email);
CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id ON platform_admins(user_id);

-- RLS: Only platform admins can see other platform admins
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Platform admins can view the list
CREATE POLICY "Platform admins can view admins list"
  ON platform_admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.is_active = true
    )
  );

-- Service role can manage (for seeding and API routes)
CREATE POLICY "Service role full access to platform_admins"
  ON platform_admins FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE platform_admins IS 'Super admins with cross-organization access';

-- ============================================================================
-- SEED INITIAL PLATFORM ADMIN: jacob@hwoodgroup.com
-- ============================================================================

DO $$
DECLARE
  v_jacob_auth_id UUID;
BEGIN
  -- Find Jacob's auth.users ID
  SELECT id INTO v_jacob_auth_id
  FROM auth.users
  WHERE LOWER(email) = 'jacob@hwoodgroup.com'
  LIMIT 1;

  IF v_jacob_auth_id IS NULL THEN
    RAISE NOTICE 'jacob@hwoodgroup.com not found in auth.users. Will need to be added after Jacob signs up.';
    
    -- Insert placeholder that will be updated when Jacob signs up
    INSERT INTO platform_admins (id, user_id, email, notes)
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000'::UUID, -- placeholder
      'jacob@hwoodgroup.com',
      'Initial platform admin - user_id will be updated on first login'
    )
    ON CONFLICT (email) DO NOTHING;
  ELSE
    -- Insert Jacob as platform admin
    INSERT INTO platform_admins (user_id, email, notes)
    VALUES (
      v_jacob_auth_id,
      'jacob@hwoodgroup.com',
      'Initial platform admin'
    )
    ON CONFLICT (email) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      is_active = true;
    
    RAISE NOTICE 'jacob@hwoodgroup.com added as platform admin with user_id %', v_jacob_auth_id;
  END IF;
END $$;

-- ============================================================================
-- HELPER FUNCTION: Check if current user is platform admin
-- ============================================================================

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION is_platform_admin() IS 'Returns true if current user is a platform admin';
