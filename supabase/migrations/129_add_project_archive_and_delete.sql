-- Add is_archived field to proforma_projects
ALTER TABLE proforma_projects
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id);

-- Add index for filtering archived projects
CREATE INDEX IF NOT EXISTS idx_proforma_projects_archived
  ON proforma_projects (is_archived, org_id);

-- Add comment
COMMENT ON COLUMN proforma_projects.is_archived IS 'Whether this project has been archived (soft delete)';
COMMENT ON COLUMN proforma_projects.archived_at IS 'When the project was archived';
COMMENT ON COLUMN proforma_projects.archived_by IS 'User who archived the project';
