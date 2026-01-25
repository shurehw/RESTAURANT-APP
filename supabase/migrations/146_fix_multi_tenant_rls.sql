-- ============================================================================
-- FIX MULTI-TENANT RLS GAPS
-- This migration hardens multi-tenant isolation by:
-- 1. Enabling RLS on organizations & organization_users tables
-- 2. Fixing invoices RLS (was using broken auth.jwt() pattern)
-- 3. Adding FK constraint on organization_users.user_id → auth.users(id)
-- 4. Ensuring invoice_lines inherit tenant isolation from invoices
-- ============================================================================

-- ============================================================================
-- 1. ENABLE RLS ON CORE TENANT TABLES
-- ============================================================================

-- Organizations table: users can only see orgs they belong to
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view organizations they are members of
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Policy: Only owners can update organization details
DROP POLICY IF EXISTS "Owners can update their organization" ON organizations;
CREATE POLICY "Owners can update their organization"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true AND role = 'owner'
    )
  );

-- Policy: Service role bypass (for admin operations)
DROP POLICY IF EXISTS "Service role full access to organizations" ON organizations;
CREATE POLICY "Service role full access to organizations"
  ON organizations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- Organization Users table: users can only see memberships in their orgs
ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view memberships in orgs they belong to
DROP POLICY IF EXISTS "Users can view org memberships" ON organization_users;
CREATE POLICY "Users can view org memberships"
  ON organization_users FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users ou
      WHERE ou.user_id = auth.uid() AND ou.is_active = true
    )
  );

-- Policy: Admins/owners can manage memberships in their org
DROP POLICY IF EXISTS "Admins can manage org memberships" ON organization_users;
CREATE POLICY "Admins can manage org memberships"
  ON organization_users FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users ou
      WHERE ou.user_id = auth.uid() AND ou.is_active = true
      AND ou.role IN ('owner', 'admin')
    )
  );

-- Policy: Service role bypass (for signup/login flows)
DROP POLICY IF EXISTS "Service role full access to organization_users" ON organization_users;
CREATE POLICY "Service role full access to organization_users"
  ON organization_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- 2. FIX INVOICES RLS POLICIES
-- Current policies use auth.jwt() -> 'organization_id' which is broken.
-- Fix to use organization_users + auth.uid() pattern like other tables.
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Drop broken policies
DROP POLICY IF EXISTS "Users can view invoices for their organization" ON invoices;
DROP POLICY IF EXISTS "Users can insert invoices for their organization" ON invoices;
DROP POLICY IF EXISTS "Users can update invoices for their organization" ON invoices;
DROP POLICY IF EXISTS "Users can delete invoices for their organization" ON invoices;

-- Create correct policies using organization_users pattern
CREATE POLICY "Users can view invoices for their organization"
  ON invoices FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can insert invoices for their organization"
  ON invoices FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can update invoices for their organization"
  ON invoices FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can delete invoices for their organization"
  ON invoices FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Service role bypass for OCR processing and bulk operations
DROP POLICY IF EXISTS "Service role full access to invoices" ON invoices;
CREATE POLICY "Service role full access to invoices"
  ON invoices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- 3. FIX INVOICE_LINES RLS
-- Lines should inherit tenant isolation from their parent invoice
-- ============================================================================

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view invoice lines for their organization" ON invoice_lines;
DROP POLICY IF EXISTS "Users can insert invoice lines for their organization" ON invoice_lines;
DROP POLICY IF EXISTS "Users can update invoice lines for their organization" ON invoice_lines;
DROP POLICY IF EXISTS "Users can delete invoice lines for their organization" ON invoice_lines;

CREATE POLICY "Users can view invoice lines for their organization"
  ON invoice_lines FOR SELECT
  USING (
    invoice_id IN (
      SELECT i.id FROM invoices i
      WHERE i.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can insert invoice lines for their organization"
  ON invoice_lines FOR INSERT
  WITH CHECK (
    invoice_id IN (
      SELECT i.id FROM invoices i
      WHERE i.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can update invoice lines for their organization"
  ON invoice_lines FOR UPDATE
  USING (
    invoice_id IN (
      SELECT i.id FROM invoices i
      WHERE i.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can delete invoice lines for their organization"
  ON invoice_lines FOR DELETE
  USING (
    invoice_id IN (
      SELECT i.id FROM invoices i
      WHERE i.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
        AND role IN ('owner', 'admin', 'manager')
      )
    )
  );

-- Service role bypass
DROP POLICY IF EXISTS "Service role full access to invoice_lines" ON invoice_lines;
CREATE POLICY "Service role full access to invoice_lines"
  ON invoice_lines FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- 4. ADD FK CONSTRAINT ON organization_users.user_id
-- This ensures referential integrity between memberships and auth.users
-- ============================================================================

-- Note: This may fail if there are orphaned rows. We handle gracefully.
DO $$
BEGIN
  -- First, check for and log any orphaned organization_users rows
  IF EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = ou.user_id)
  ) THEN
    RAISE NOTICE 'Found orphaned organization_users rows (user_id not in auth.users). Cleaning up...';
    
    -- Delete orphaned rows (users who no longer exist in auth.users)
    DELETE FROM organization_users ou
    WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = ou.user_id);
    
    RAISE NOTICE 'Orphaned rows cleaned up.';
  END IF;

  -- Now add the FK constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'organization_users_user_id_fkey'
    AND table_name = 'organization_users'
  ) THEN
    ALTER TABLE organization_users
      ADD CONSTRAINT organization_users_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Added FK constraint organization_users.user_id → auth.users(id)';
  ELSE
    RAISE NOTICE 'FK constraint already exists.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add FK constraint: %. This is non-fatal.', SQLERRM;
END $$;


-- ============================================================================
-- 5. ADD ORGANIZATION_SETTINGS RLS
-- ============================================================================

ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view settings for their org" ON organization_settings;
CREATE POLICY "Users can view settings for their org"
  ON organization_settings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage settings for their org" ON organization_settings;
CREATE POLICY "Admins can manage settings for their org"
  ON organization_settings FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Service role full access to organization_settings" ON organization_settings;
CREATE POLICY "Service role full access to organization_settings"
  ON organization_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- 6. ADD ORGANIZATION_USAGE RLS
-- ============================================================================

ALTER TABLE organization_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view usage for their org" ON organization_usage;
CREATE POLICY "Users can view usage for their org"
  ON organization_usage FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Service role full access to organization_usage" ON organization_usage;
CREATE POLICY "Service role full access to organization_usage"
  ON organization_usage FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- 7. CREATE HELPER FUNCTION FOR TENANT CONTEXT
-- Standardized way to get current user's org context
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_tenant_context()
RETURNS TABLE (
  auth_user_id UUID,
  organization_id UUID,
  role TEXT,
  is_owner BOOLEAN,
  is_admin BOOLEAN,
  is_manager BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    auth.uid() as auth_user_id,
    ou.organization_id,
    ou.role,
    (ou.role = 'owner') as is_owner,
    (ou.role IN ('owner', 'admin')) as is_admin,
    (ou.role IN ('owner', 'admin', 'manager')) as is_manager
  FROM organization_users ou
  WHERE ou.user_id = auth.uid()
    AND ou.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_user_tenant_context() IS 'Returns current user tenant context (org, role, permissions)';


-- ============================================================================
-- 8. CREATE AUDIT LOG FOR SENSITIVE OPERATIONS (optional but recommended)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_org ON tenant_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_user ON tenant_audit_log(user_id, created_at DESC);

ALTER TABLE tenant_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit log for their org
CREATE POLICY "Admins can view audit log for their org"
  ON tenant_audit_log FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin')
    )
  );

-- Service role can insert audit entries
CREATE POLICY "Service role can insert audit entries"
  ON tenant_audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON TABLE tenant_audit_log IS 'Audit trail for sensitive multi-tenant operations';


-- ============================================================================
-- VERIFICATION QUERY (run manually to verify)
-- ============================================================================
-- SELECT 
--   schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies 
-- WHERE tablename IN ('organizations', 'organization_users', 'invoices', 'invoice_lines')
-- ORDER BY tablename, policyname;
