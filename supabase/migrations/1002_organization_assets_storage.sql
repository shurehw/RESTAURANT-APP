-- ============================================================================
-- ORGANIZATION ASSETS STORAGE BUCKET
-- Storage bucket for organization logos and branded assets
-- ============================================================================

-- Note: Storage policies must be created through the Supabase Dashboard:
-- Go to Storage > organization-assets > Policies
-- See docs/ORGANIZATION_LOGO_UPLOAD.md for policy setup instructions

-- Create storage bucket for organization assets (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-assets', 'organization-assets', true)
ON CONFLICT (id) DO NOTHING;
