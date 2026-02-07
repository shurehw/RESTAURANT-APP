-- ============================================================================
-- REVIEW SIGNALS: Raw reviews from TipSee (Widewail) + daily health rollups
-- Sources: GOOGLE, OPEN_TABLE, YELP
-- ============================================================================

-- ============================================================================
-- 1. RAW REVIEW FACTS (narrow, indexable, no PII)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reviews_raw (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_review_id TEXT NOT NULL,              -- Widewail review_id (stable UUID)
  source TEXT NOT NULL CHECK (source IN ('GOOGLE', 'OPEN_TABLE', 'YELP')),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  rating NUMERIC(2,1),                         -- 1.0-5.0
  reviewed_at TIMESTAMPTZ NOT NULL,
  thirdparty_id TEXT,                          -- platform-specific review ID
  thirdparty_url TEXT,                         -- link to review on platform
  tags TEXT[] DEFAULT '{}',                    -- e.g. {Ambiance, Cocktails, Food}
  has_reply BOOLEAN NOT NULL DEFAULT false,
  reply_count INTEGER NOT NULL DEFAULT 0,
  content TEXT,                                -- review text (nullable; can omit if policy says so)
  content_hash TEXT,                           -- sha256 of content for change detection
  tipsee_id INTEGER,                           -- TipSee reviews.id for audit trail
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_reviews_raw_source UNIQUE (source, source_review_id)
);

CREATE INDEX idx_reviews_raw_venue_date ON reviews_raw(venue_id, reviewed_at DESC);
CREATE INDEX idx_reviews_raw_source ON reviews_raw(source, reviewed_at DESC);
CREATE INDEX idx_reviews_raw_ingested ON reviews_raw(ingested_at DESC);
CREATE INDEX idx_reviews_raw_rating ON reviews_raw(venue_id, rating) WHERE rating <= 2;

COMMENT ON TABLE reviews_raw IS 'Raw review facts synced from TipSee (Widewail). No author PII stored.';

-- ============================================================================
-- 2. DAILY HEALTH ROLLUPS (what the app actually queries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS venue_review_signals_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  neg_count INTEGER NOT NULL DEFAULT 0,        -- rating <= 2
  avg_rating NUMERIC(3,2),
  source_mix JSONB NOT NULL DEFAULT '{}',      -- {"GOOGLE": 5, "YELP": 1, "OPEN_TABLE": 2}
  tag_mix JSONB NOT NULL DEFAULT '{}',         -- {"Ambiance": 3, "Food": 2, "Service": 1}
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_review_signals_venue_date UNIQUE (venue_id, date)
);

CREATE INDEX idx_review_signals_venue_date ON venue_review_signals_daily(venue_id, date DESC);
CREATE INDEX idx_review_signals_neg ON venue_review_signals_daily(venue_id, neg_count DESC)
  WHERE neg_count > 0;

COMMENT ON TABLE venue_review_signals_daily IS 'Daily review health rollups per venue. Computed from reviews_raw.';

-- ============================================================================
-- 3. ROLLUP FUNCTION (called after each review sync)
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_review_signals(
  p_venue_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS void AS $$
BEGIN
  INSERT INTO venue_review_signals_daily (venue_id, date, review_count, neg_count, avg_rating, source_mix, tag_mix, computed_at)
  SELECT
    venue_id,
    reviewed_at::date AS date,
    COUNT(*) AS review_count,
    COUNT(*) FILTER (WHERE rating <= 2) AS neg_count,
    ROUND(AVG(rating)::numeric, 2) AS avg_rating,
    jsonb_object_agg_strict(source, src_count) AS source_mix,
    COALESCE(tag_counts.tag_mix, '{}') AS tag_mix,
    now() AS computed_at
  FROM (
    SELECT
      r.venue_id,
      r.reviewed_at,
      r.rating,
      r.source,
      COUNT(*) OVER (PARTITION BY r.venue_id, r.reviewed_at::date, r.source) AS src_count,
      r.id AS review_id
    FROM reviews_raw r
    WHERE r.venue_id = p_venue_id
      AND r.reviewed_at::date BETWEEN p_start_date AND p_end_date
  ) sub
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(tag, tag_cnt) AS tag_mix
    FROM (
      SELECT unnest(tags) AS tag, COUNT(*) AS tag_cnt
      FROM reviews_raw
      WHERE venue_id = p_venue_id
        AND reviewed_at::date = sub.reviewed_at::date
      GROUP BY unnest(tags)
    ) t
  ) tag_counts ON true
  GROUP BY venue_id, reviewed_at::date, tag_counts.tag_mix
  ON CONFLICT (venue_id, date) DO UPDATE SET
    review_count = EXCLUDED.review_count,
    neg_count = EXCLUDED.neg_count,
    avg_rating = EXCLUDED.avg_rating,
    source_mix = EXCLUDED.source_mix,
    tag_mix = EXCLUDED.tag_mix,
    computed_at = EXCLUDED.computed_at;
END;
$$ LANGUAGE plpgsql;

-- Simpler rollup that works without jsonb_object_agg_strict (which may not exist)
-- Replaces above if needed
CREATE OR REPLACE FUNCTION compute_review_signals(
  p_venue_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS void AS $$
DECLARE
  v_date DATE;
BEGIN
  FOR v_date IN
    SELECT DISTINCT reviewed_at::date
    FROM reviews_raw
    WHERE venue_id = p_venue_id
      AND reviewed_at::date BETWEEN p_start_date AND p_end_date
  LOOP
    INSERT INTO venue_review_signals_daily (
      venue_id, date, review_count, neg_count, avg_rating,
      source_mix, tag_mix, computed_at
    )
    SELECT
      p_venue_id,
      v_date,
      COUNT(*),
      COUNT(*) FILTER (WHERE rating <= 2),
      ROUND(AVG(rating)::numeric, 2),
      (
        SELECT jsonb_object_agg(source, cnt)
        FROM (
          SELECT source, COUNT(*) AS cnt
          FROM reviews_raw
          WHERE venue_id = p_venue_id AND reviewed_at::date = v_date
          GROUP BY source
        ) s
      ),
      (
        SELECT COALESCE(jsonb_object_agg(tag, cnt), '{}')
        FROM (
          SELECT unnest(tags) AS tag, COUNT(*) AS cnt
          FROM reviews_raw
          WHERE venue_id = p_venue_id AND reviewed_at::date = v_date
          GROUP BY unnest(tags)
        ) t
      ),
      now()
    FROM reviews_raw
    WHERE venue_id = p_venue_id AND reviewed_at::date = v_date
    ON CONFLICT (venue_id, date) DO UPDATE SET
      review_count = EXCLUDED.review_count,
      neg_count = EXCLUDED.neg_count,
      avg_rating = EXCLUDED.avg_rating,
      source_mix = EXCLUDED.source_mix,
      tag_mix = EXCLUDED.tag_mix,
      computed_at = EXCLUDED.computed_at;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE reviews_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_review_signals_daily ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY reviews_raw_service ON reviews_raw
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY review_signals_service ON venue_review_signals_daily
  FOR ALL USING (true) WITH CHECK (true);

-- Authenticated users: read-only, scoped to their org's venues
CREATE POLICY reviews_raw_read ON reviews_raw
  FOR SELECT TO authenticated
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

CREATE POLICY review_signals_read ON venue_review_signals_daily
  FOR SELECT TO authenticated
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- ============================================================================
-- 5. CRON: REVIEW SYNC (every 6 hours, lightweight incremental)
-- ============================================================================

-- Wrapper function for cron
CREATE OR REPLACE FUNCTION cron_review_sync()
RETURNS void AS $$
BEGIN
  PERFORM trigger_etl_sync('reviews');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cron_review_sync IS 'Trigger incremental review sync from TipSee (Widewail)';

-- Every 6 hours: reviews don't need 15-min granularity
SELECT cron.schedule(
  'review-sync-6h',
  '15 */6 * * *',  -- :15 past every 6th hour (avoids collision with sales ETL)
  $$SELECT cron_review_sync()$$
);
