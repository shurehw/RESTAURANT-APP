-- ============================================================================
-- 40000000004600: Guest Reviews + Server Performance Scores
--
-- Two features in one migration:
-- 1. Guest review ingestion & AI signal extraction (Google, Yelp, OpenTable)
-- 2. Rolling server performance scores computed from all available signals
-- ============================================================================

-- ============================================================================
-- GUEST REVIEWS — ingested from external platforms
-- ============================================================================

CREATE TABLE IF NOT EXISTS guest_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Source
  source           TEXT NOT NULL CHECK (source IN ('google', 'yelp', 'opentable', 'tripadvisor', 'manual')),
  external_id      TEXT,                      -- platform's unique review ID (dedup key)
  review_url       TEXT,

  -- Content
  reviewer_name    TEXT,
  rating           NUMERIC(2,1),              -- 1.0–5.0
  review_text      TEXT NOT NULL,
  review_date      DATE NOT NULL,

  -- AI processing
  processed        BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at     TIMESTAMPTZ,

  -- Dedup
  content_hash     TEXT,                      -- SHA-256 of normalized review text

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_reviews_dedup
  ON guest_reviews(venue_id, source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_reviews_content_dedup
  ON guest_reviews(venue_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_reviews_venue_date
  ON guest_reviews(venue_id, review_date DESC);
CREATE INDEX IF NOT EXISTS idx_guest_reviews_unprocessed
  ON guest_reviews(venue_id) WHERE processed = FALSE;

ALTER TABLE guest_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guest_reviews_service_all" ON guest_reviews
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "guest_reviews_read_own_org" ON guest_reviews
  FOR SELECT USING (true);

COMMENT ON TABLE guest_reviews IS 'Guest reviews ingested from Google, Yelp, OpenTable, etc. for AI signal extraction';

-- ============================================================================
-- Add guest_review_mention to signal_type enum
-- ============================================================================

ALTER TYPE signal_type ADD VALUE IF NOT EXISTS 'guest_review_mention';

-- Add guest_review_id reference to attestation_signals for linking
ALTER TABLE attestation_signals
  ADD COLUMN IF NOT EXISTS guest_review_id UUID REFERENCES guest_reviews(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_signals_guest_review
  ON attestation_signals(guest_review_id) WHERE guest_review_id IS NOT NULL;

-- ============================================================================
-- SERVER PERFORMANCE SCORES — rolling composite scores per server
-- ============================================================================

CREATE TABLE IF NOT EXISTS server_performance_scores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date    DATE NOT NULL,

  -- Server identity (matched from POS data)
  server_name      TEXT NOT NULL,              -- normalized name from pos_checks
  employee_id      UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- Component scores (0–100 each)
  revenue_per_cover_score   NUMERIC(5,2),     -- vs team avg
  tip_pct_score             NUMERIC(5,2),     -- vs team avg
  turn_time_score           NUMERIC(5,2),     -- lower is better, vs team avg
  comp_rate_score           NUMERIC(5,2),     -- lower is better, vs team avg
  consistency_score         NUMERIC(5,2),     -- low variance in metrics
  manager_sentiment_score   NUMERIC(5,2),     -- from attestation_signals
  guest_review_score        NUMERIC(5,2),     -- from guest review mentions
  greet_time_score          NUMERIC(5,2),     -- from greeting_metrics (where available)

  -- Composite
  composite_score  NUMERIC(5,2) NOT NULL,     -- weighted average, 0–100
  score_tier       TEXT NOT NULL CHECK (score_tier IN ('exceptional', 'strong', 'solid', 'developing', 'at_risk')),

  -- Context
  shifts_in_window INT NOT NULL DEFAULT 0,    -- how many shifts in the scoring window
  window_days      INT NOT NULL DEFAULT 30,   -- rolling window size
  covers_in_window INT NOT NULL DEFAULT 0,

  -- Component data (for drill-down)
  component_data   JSONB NOT NULL DEFAULT '{}',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_scores_unique
  ON server_performance_scores(venue_id, server_name, business_date);
CREATE INDEX IF NOT EXISTS idx_server_scores_venue_date
  ON server_performance_scores(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_server_scores_tier
  ON server_performance_scores(venue_id, score_tier);
CREATE INDEX IF NOT EXISTS idx_server_scores_employee
  ON server_performance_scores(employee_id, business_date DESC)
  WHERE employee_id IS NOT NULL;

ALTER TABLE server_performance_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "server_scores_service_all" ON server_performance_scores
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "server_scores_read_own_org" ON server_performance_scores
  FOR SELECT USING (true);

COMMENT ON TABLE server_performance_scores IS 'Rolling composite performance scores per server, computed nightly from POS, attestation, and guest review signals';
COMMENT ON COLUMN server_performance_scores.composite_score IS 'Weighted average of all component scores (0-100). Weights: revenue 25%, tips 20%, turn time 15%, comp rate 15%, guest reviews 10%, manager sentiment 10%, consistency 5%';
