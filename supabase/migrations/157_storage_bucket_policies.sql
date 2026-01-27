-- Create the opsos-invoices bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'opsos-invoices', 
  'opsos-invoices', 
  false,
  157286400, -- 150MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 157286400,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated uploads to opsos-invoices" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads from opsos-invoices" ON storage.objects;
DROP POLICY IF EXISTS "Allow service role full access to opsos-invoices" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_uploads_opsos_invoices" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_reads_opsos_invoices" ON storage.objects;

-- Policy: Allow authenticated users to upload invoices (INSERT)
CREATE POLICY "authenticated_uploads_opsos_invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'opsos-invoices');

-- Policy: Allow authenticated users to read invoices (SELECT)
CREATE POLICY "authenticated_reads_opsos_invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'opsos-invoices');

-- Policy: Allow authenticated users to update their uploads (UPDATE)
CREATE POLICY "authenticated_updates_opsos_invoices"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'opsos-invoices')
WITH CHECK (bucket_id = 'opsos-invoices');

-- Policy: Allow authenticated users to delete their uploads (DELETE)
CREATE POLICY "authenticated_deletes_opsos_invoices"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'opsos-invoices');
