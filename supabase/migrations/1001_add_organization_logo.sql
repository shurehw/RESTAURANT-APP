-- ============================================================================
-- ADD LOGO SUPPORT TO ORGANIZATIONS
-- Enables organizations to upload logos for branded policy documents
-- ============================================================================

-- Add logo_url field to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN organizations.logo_url IS 'URL to organization logo for branded documents (SOPs, reports, etc.)';

-- Index for quick logo lookups (optional but helpful)
CREATE INDEX IF NOT EXISTS idx_organizations_logo
  ON organizations(id)
  WHERE logo_url IS NOT NULL;
