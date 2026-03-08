-- Landing page request info capture
-- Stores early access requests from the coming-soon page

CREATE TABLE IF NOT EXISTS landing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company text NOT NULL,
  venues text,
  role text,
  message text,
  source text DEFAULT 'coming-soon',
  created_at timestamptz DEFAULT now()
);

-- Index for dedup and lookup
CREATE INDEX idx_landing_requests_email ON landing_requests(email);
CREATE INDEX idx_landing_requests_created ON landing_requests(created_at DESC);

-- No RLS needed — service key only (no user auth on landing page)
ALTER TABLE landing_requests ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role manages landing requests"
  ON landing_requests FOR ALL
  USING (auth.role() = 'service_role');
