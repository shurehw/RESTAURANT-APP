-- ============================================================================
-- PLATFORM ADMIN RLS BYPASS
-- Allows platform admins to see ALL data across ALL organizations
-- ============================================================================

-- Helper function to check if current user is a platform admin
-- (Already created in 148, but ensure it exists)
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- ORGANIZATIONS - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all organizations" ON organizations;
CREATE POLICY "Platform admins can view all organizations"
  ON organizations FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all organizations" ON organizations;
CREATE POLICY "Platform admins can manage all organizations"
  ON organizations FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- ORGANIZATION_USERS - Platform admins can see all memberships
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all memberships" ON organization_users;
CREATE POLICY "Platform admins can view all memberships"
  ON organization_users FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all memberships" ON organization_users;
CREATE POLICY "Platform admins can manage all memberships"
  ON organization_users FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- INVOICES - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all invoices" ON invoices;
CREATE POLICY "Platform admins can view all invoices"
  ON invoices FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all invoices" ON invoices;
CREATE POLICY "Platform admins can manage all invoices"
  ON invoices FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- INVOICE_LINES - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all invoice lines" ON invoice_lines;
CREATE POLICY "Platform admins can view all invoice lines"
  ON invoice_lines FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all invoice lines" ON invoice_lines;
CREATE POLICY "Platform admins can manage all invoice lines"
  ON invoice_lines FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- VENDORS - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all vendors" ON vendors;
CREATE POLICY "Platform admins can view all vendors"
  ON vendors FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all vendors" ON vendors;
CREATE POLICY "Platform admins can manage all vendors"
  ON vendors FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- ITEMS - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all items" ON items;
CREATE POLICY "Platform admins can view all items"
  ON items FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all items" ON items;
CREATE POLICY "Platform admins can manage all items"
  ON items FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- VENUES - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all venues" ON venues;
CREATE POLICY "Platform admins can view all venues"
  ON venues FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all venues" ON venues;
CREATE POLICY "Platform admins can manage all venues"
  ON venues FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- EMPLOYEES - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all employees" ON employees;
CREATE POLICY "Platform admins can view all employees"
  ON employees FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all employees" ON employees;
CREATE POLICY "Platform admins can manage all employees"
  ON employees FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- ORGANIZATION_SETTINGS - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all org settings" ON organization_settings;
CREATE POLICY "Platform admins can view all org settings"
  ON organization_settings FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all org settings" ON organization_settings;
CREATE POLICY "Platform admins can manage all org settings"
  ON organization_settings FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- ORGANIZATION_USAGE - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all org usage" ON organization_usage;
CREATE POLICY "Platform admins can view all org usage"
  ON organization_usage FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage all org usage" ON organization_usage;
CREATE POLICY "Platform admins can manage all org usage"
  ON organization_usage FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================================
-- TENANT_AUDIT_LOG - Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view all audit logs" ON tenant_audit_log;
CREATE POLICY "Platform admins can view all audit logs"
  ON tenant_audit_log FOR SELECT
  USING (is_platform_admin());

-- ============================================================================
-- DONE
-- ============================================================================

SELECT 'Platform admin RLS bypass policies created successfully' as status;
