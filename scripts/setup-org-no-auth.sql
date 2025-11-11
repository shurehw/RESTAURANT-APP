-- Setup organization WITHOUT authentication
-- Temporary solution while auth is disabled during development

DO $$
DECLARE
  org_id UUID := 'f6eb8362-5879-464b-aca7-a73c7740c4f2';
BEGIN
  -- Ensure organization has settings
  INSERT INTO organization_settings (organization_id)
  VALUES (org_id)
  ON CONFLICT (organization_id) DO NOTHING;

  RAISE NOTICE 'Organization settings created successfully';
END $$;

-- Temporarily disable RLS on all tables (for development only)
ALTER TABLE venues DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE time_punches DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_swap_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_availability DISABLE ROW LEVEL SECURITY;

-- Verify settings exist
SELECT
  os.*,
  o.name as organization_name
FROM organization_settings os
JOIN organizations o ON o.id = os.organization_id
WHERE os.organization_id = 'f6eb8362-5879-464b-aca7-a73c7740c4f2';
