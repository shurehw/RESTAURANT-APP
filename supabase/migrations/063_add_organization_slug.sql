-- Add slug to organizations table for branded vendor onboarding URLs
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Generate slugs for existing organizations (lowercase, hyphenated)
UPDATE organizations
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Make slug required for new organizations
ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL;
