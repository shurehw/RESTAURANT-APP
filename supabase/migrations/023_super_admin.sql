-- Super Admin System
-- Allows specific users to manage all organizations

-- ============================================================================
-- SUPER ADMIN TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE, -- References auth.users
  granted_by UUID, -- References auth.users
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_super_admins_user ON super_admins(user_id, is_active);

COMMENT ON TABLE super_admins IS 'Users with super admin access to all organizations';

-- ============================================================================
-- SUPER ADMIN FUNCTIONS
-- ============================================================================

-- Check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM super_admins
    WHERE user_id = auth.uid()
      AND is_active = TRUE
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================================================
-- RLS POLICIES FOR SUPER ADMINS
-- ============================================================================

ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- Only super admins can view super admin records
CREATE POLICY "Super admins can view super admin records"
  ON super_admins FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- Only existing super admins can insert new super admins
CREATE POLICY "Super admins can create super admins"
  ON super_admins FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

-- Update RLS policies on organizations to allow super admin access
DROP POLICY IF EXISTS "Only owners can manage customer databases" ON customer_databases;

CREATE POLICY "Only owners and super admins can manage customer databases"
  ON customer_databases FOR ALL
  TO authenticated
  USING (
    is_super_admin() OR
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- ============================================================================
-- GRANT YOUR USER SUPER ADMIN ACCESS
-- ============================================================================

-- TODO: Replace with your actual user email after running this migration
-- You'll need to manually insert your user_id from auth.users
-- Run this query after the migration:
--
-- INSERT INTO super_admins (user_id, notes)
-- SELECT id, 'Initial super admin'
-- FROM auth.users
-- WHERE email = 'your-email@example.com'
-- ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE super_admins IS 'Run: INSERT INTO super_admins (user_id, notes) SELECT id, ''Initial super admin'' FROM auth.users WHERE email = ''your@email.com'';';
