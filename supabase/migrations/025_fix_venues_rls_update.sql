-- Fix Venues RLS Policy to allow super admin updates
-- The USING clause is for SELECT, WITH CHECK is for INSERT/UPDATE

DROP POLICY IF EXISTS "Venues isolation with super admin bypass" ON venues;

-- Separate policies for better clarity
CREATE POLICY "Super admins can do anything with venues"
  ON venues
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can access their organization's venues"
  ON venues
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );
