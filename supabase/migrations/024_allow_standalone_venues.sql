-- Allow Standalone Venues (organization_id can be NULL)
-- This enables venues to exist without being part of an organization

ALTER TABLE venues ALTER COLUMN organization_id DROP NOT NULL;

COMMENT ON COLUMN venues.organization_id IS 'Optional - venues can be standalone (NULL) or part of an organization';

-- Update RLS policy to allow super admins to bypass venue isolation
DROP POLICY IF EXISTS venues_isolation ON venues;

CREATE POLICY "Venues isolation with super admin bypass" ON venues
  FOR ALL
  USING (
    -- Super admins can see all venues
    (SELECT is_super_admin()) OR
    -- Regular users can only see venues in their organization
    (organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    ))
  );
