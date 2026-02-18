-- AI Attestation Narratives + Structured Tags
-- Adds multi-select driver tags to attestations and a cache table for AI narratives.

-- 1. Add tag columns to nightly_attestations
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS revenue_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS labor_tags TEXT[] DEFAULT '{}';

COMMENT ON COLUMN nightly_attestations.revenue_tags IS 'Multi-select revenue driver tags (e.g. private_event, weather_impact). Queryable across venues/time.';
COMMENT ON COLUMN nightly_attestations.labor_tags IS 'Multi-select labor driver tags (e.g. call_out, event_staffing). Queryable across venues/time.';

-- 2. AI narrative cache (follows ai_comp_review_cache pattern from migration 208)
CREATE TABLE IF NOT EXISTS ai_attestation_narrative_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES venues(id),
  business_date date NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours',

  UNIQUE(venue_id, business_date, input_hash)
);

CREATE INDEX idx_ai_attestation_narrative_cache_lookup
  ON ai_attestation_narrative_cache(venue_id, business_date, input_hash);

CREATE INDEX idx_ai_attestation_narrative_cache_expires
  ON ai_attestation_narrative_cache(expires_at);

ALTER TABLE ai_attestation_narrative_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all" ON ai_attestation_narrative_cache
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE ai_attestation_narrative_cache IS
  'Caches AI-generated revenue/labor narratives keyed by input hash. Same data → instant return, no Claude cost.';
