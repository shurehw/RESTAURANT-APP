-- Create the opsos-invoices bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('opsos-invoices', 'opsos-invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Allow service role full access to the bucket (for API uploads)
-- Service role bypasses RLS by default, but we need explicit policies for storage

-- Policy: Allow authenticated users to upload invoices
CREATE POLICY "Allow authenticated uploads to opsos-invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'opsos-invoices');

-- Policy: Allow authenticated users to read their invoices
CREATE POLICY "Allow authenticated reads from opsos-invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'opsos-invoices');

-- Policy: Allow service role full access (for bulk upload API)
CREATE POLICY "Allow service role full access to opsos-invoices"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'opsos-invoices')
WITH CHECK (bucket_id = 'opsos-invoices');
