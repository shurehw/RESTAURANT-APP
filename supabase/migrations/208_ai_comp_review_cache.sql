-- AI Comp Review Cache
-- Stores AI-generated comp reviews keyed by input hash.
-- Same inputs → instant result, no Claude cost, no latency.

CREATE TABLE IF NOT EXISTS ai_comp_review_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES venues(id),
  business_date date NOT NULL,
  input_hash text NOT NULL,          -- sha256 of minimal payload
  result jsonb NOT NULL,             -- the AI review output
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours',

  UNIQUE(venue_id, business_date, input_hash)
);

-- Fast lookup by venue + date + hash
CREATE INDEX idx_ai_comp_review_cache_lookup
  ON ai_comp_review_cache(venue_id, business_date, input_hash);

-- Auto-expire old entries
CREATE INDEX idx_ai_comp_review_cache_expires
  ON ai_comp_review_cache(expires_at);

-- RLS
ALTER TABLE ai_comp_review_cache ENABLE ROW LEVEL SECURITY;

-- Service role can read/write
CREATE POLICY "service_all" ON ai_comp_review_cache
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE ai_comp_review_cache IS
  'Caches AI comp review results keyed by input hash. Prevents duplicate Claude calls for identical data.';
