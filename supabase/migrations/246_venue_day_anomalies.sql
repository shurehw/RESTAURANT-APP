-- ============================================================================
-- Buyout / Private Event Anomaly Detection
--
-- Problem: A 300-cover venue doing 6 covers on Valentine's Saturday is a
-- private buyout, not a forecast miss. These outliers destroy MAPE stats
-- and contaminate bias correction.
--
-- Solution: Two-pronged approach:
--   1. Auto-detection: flag days where actual < 20% of venue/day_type average
--   2. Manual flagging: operators can mark days as buyouts/private events
--
-- Flagged days are excluded from:
--   - forecast_accuracy_stats computation
--   - forecast_bias_adjustments computation
--   - demand_distribution_curves computation
-- ============================================================================

-- ── Table: venue_day_anomalies ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_day_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- What kind of anomaly
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN (
    'buyout', 'private_event', 'soft_closure', 'data_glitch', 'brunch_service', 'other'
  )),

  -- How it was detected
  detection_method TEXT NOT NULL CHECK (detection_method IN (
    'auto_threshold', 'manual'
  )),

  -- Context
  actual_covers INTEGER,
  expected_covers INTEGER,        -- historical avg for venue/day_type
  ratio NUMERIC(5,4),             -- actual / expected (0.02 = 2%)
  notes TEXT,

  -- Who flagged it
  flagged_by TEXT NOT NULL DEFAULT 'system',  -- 'system' or user UUID
  resolved_at TIMESTAMPTZ,        -- NULL = still flagged, set to un-flag
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(venue_id, business_date)
);

-- Indexes
CREATE INDEX idx_venue_day_anomalies_venue ON venue_day_anomalies(venue_id, business_date DESC);
CREATE INDEX idx_venue_day_anomalies_active ON venue_day_anomalies(venue_id)
  WHERE resolved_at IS NULL;

-- RLS
ALTER TABLE venue_day_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view anomalies for their venues"
  ON venue_day_anomalies FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

CREATE POLICY "Users can manage anomalies for their venues"
  ON venue_day_anomalies FOR ALL
  USING (venue_id IN (SELECT get_user_venue_ids()));

GRANT SELECT, INSERT, UPDATE ON venue_day_anomalies TO authenticated;

-- ── Function: Auto-detect anomaly days ──────────────────────────────────────
-- Scans venue_day_facts for days where actual covers fall far below the
-- historical average for that venue/day_type. These are buyouts, private
-- events, or soft closures that should not contaminate forecast stats.
-- ============================================================================
CREATE OR REPLACE FUNCTION detect_anomaly_days(
  p_lookback_days INTEGER DEFAULT 365,
  p_threshold_pct NUMERIC DEFAULT 0.20  -- flag if actual < 20% of average
) RETURNS TABLE(
  out_venue_id UUID,
  out_business_date DATE,
  out_anomaly_type TEXT,
  out_actual INTEGER,
  out_expected INTEGER,
  out_ratio NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH venue_day_type_avgs AS (
    -- Compute historical averages per venue/day_type, excluding:
    --   - already-flagged anomaly days
    --   - days with 0 covers (closed)
    --   - holidays (they have their own patterns)
    SELECT
      vdf.venue_id,
      get_day_type(vdf.business_date)::text as day_type,
      AVG(vdf.covers_count)::integer as avg_covers,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY vdf.covers_count)::integer as p25_covers,
      COUNT(*) as sample_size
    FROM venue_day_facts vdf
    LEFT JOIN venue_day_anomalies vda ON
      vda.venue_id = vdf.venue_id
      AND vda.business_date = vdf.business_date
      AND vda.resolved_at IS NULL
    LEFT JOIN holiday_calendar hc ON hc.holiday_date = vdf.business_date
    WHERE vdf.business_date >= CURRENT_DATE - p_lookback_days
      AND vdf.covers_count > 0
      AND vda.id IS NULL          -- not already flagged
      AND hc.holiday_date IS NULL -- not a holiday
    GROUP BY vdf.venue_id, get_day_type(vdf.business_date)::text
    HAVING COUNT(*) >= 5  -- need enough data points
  ),
  candidates AS (
    -- Find days where actual is anomalously low
    SELECT
      vdf.venue_id,
      vdf.business_date,
      vdf.covers_count as actual_covers,
      avgs.avg_covers as expected_covers,
      vdf.covers_count::numeric / NULLIF(avgs.avg_covers, 0) as ratio,
      avgs.p25_covers
    FROM venue_day_facts vdf
    JOIN venue_day_type_avgs avgs ON
      avgs.venue_id = vdf.venue_id
      AND avgs.day_type = get_day_type(vdf.business_date)::text
    LEFT JOIN venue_day_anomalies vda ON
      vda.venue_id = vdf.venue_id
      AND vda.business_date = vdf.business_date
    WHERE vdf.business_date >= CURRENT_DATE - p_lookback_days
      AND vdf.covers_count > 0                        -- has some covers (not fully closed)
      AND vda.id IS NULL                              -- not already flagged
      -- NOTE: holidays are NOT excluded here — a buyout on Valentine's Day is still a buyout
      AND vdf.covers_count::numeric / NULLIF(avgs.avg_covers, 0) < p_threshold_pct
  )
  -- Insert and return the flagged days
  INSERT INTO venue_day_anomalies (venue_id, business_date, anomaly_type, detection_method,
    actual_covers, expected_covers, ratio, notes, flagged_by)
  SELECT
    c.venue_id,
    c.business_date,
    -- Heuristic: if covers < 5% of average, likely a buyout; otherwise soft closure
    CASE
      WHEN c.ratio < 0.05 THEN 'buyout'
      WHEN c.ratio < 0.10 THEN 'private_event'
      ELSE 'soft_closure'
    END,
    'auto_threshold',
    c.actual_covers,
    c.expected_covers,
    ROUND(c.ratio, 4),
    'Auto-detected: ' || c.actual_covers || ' covers vs ' || c.expected_covers
      || ' expected (' || ROUND(c.ratio * 100, 1) || '% of avg)',
    'system'
  FROM candidates c
  ON CONFLICT (venue_id, business_date) DO NOTHING
  RETURNING
    venue_day_anomalies.venue_id,
    venue_day_anomalies.business_date,
    venue_day_anomalies.anomaly_type,
    venue_day_anomalies.actual_covers,
    venue_day_anomalies.expected_covers,
    venue_day_anomalies.ratio;
END;
$$ LANGUAGE plpgsql;

-- ── Update: refresh_forecast_accuracy_stats — exclude anomaly days ──────────
CREATE OR REPLACE FUNCTION refresh_forecast_accuracy_stats(
  p_lookback_days INTEGER DEFAULT 90,
  p_min_covers INTEGER DEFAULT 10
) RETURNS TABLE(out_venue_id UUID, out_day_type TEXT, out_mape NUMERIC, out_within_10 NUMERIC, out_sample_n INTEGER) AS $$
BEGIN
  RETURN QUERY
  WITH latest_per_date AS (
    SELECT DISTINCT ON (venue_id, business_date, shift_type)
      venue_id, business_date, shift_type, covers_predicted,
      COALESCE(day_type, get_day_type(business_date)) as day_type
    FROM demand_forecasts
    WHERE business_date >= CURRENT_DATE - p_lookback_days
      AND business_date < CURRENT_DATE
    ORDER BY venue_id, business_date, shift_type, forecast_date DESC
  ),
  paired AS (
    SELECT
      f.venue_id,
      f.day_type::text as day_type,
      f.covers_predicted as predicted,
      vdf.covers_count as actual,
      ABS(f.covers_predicted - vdf.covers_count)::numeric / vdf.covers_count * 100 as pct_error
    FROM latest_per_date f
    JOIN venue_day_facts vdf ON
      vdf.venue_id = f.venue_id
      AND vdf.business_date = f.business_date
    -- Exclude anomaly days (buyouts, private events, etc.)
    LEFT JOIN venue_day_anomalies vda ON
      vda.venue_id = f.venue_id
      AND vda.business_date = f.business_date
      AND vda.resolved_at IS NULL
    WHERE vdf.covers_count >= p_min_covers
      AND vda.id IS NULL  -- not flagged as anomaly
  ),
  stats AS (
    SELECT
      p.venue_id,
      p.day_type,
      AVG(p.pct_error) as avg_mape,
      COUNT(*) FILTER (WHERE p.pct_error <= 10)::numeric / NULLIF(COUNT(*), 0) * 100 as pct_within_10,
      COUNT(*) FILTER (WHERE p.pct_error <= 20)::numeric / NULLIF(COUNT(*), 0) * 100 as pct_within_20,
      AVG(p.predicted - p.actual) as avg_bias,
      COUNT(*) as n
    FROM paired p
    GROUP BY p.venue_id, p.day_type
  )
  INSERT INTO forecast_accuracy_stats (venue_id, day_type, mape, within_10pct, within_20pct, avg_bias, sample_size, sample_start_date, sample_end_date, last_computed_at)
  SELECT
    s.venue_id,
    s.day_type,
    ROUND(s.avg_mape, 2),
    ROUND(s.pct_within_10, 2),
    ROUND(s.pct_within_20, 2),
    ROUND(s.avg_bias, 2),
    s.n::integer,
    CURRENT_DATE - p_lookback_days,
    CURRENT_DATE - 1,
    now()
  FROM stats s
  ON CONFLICT (venue_id, day_type) DO UPDATE SET
    mape = EXCLUDED.mape,
    within_10pct = EXCLUDED.within_10pct,
    within_20pct = EXCLUDED.within_20pct,
    avg_bias = EXCLUDED.avg_bias,
    sample_size = EXCLUDED.sample_size,
    sample_start_date = EXCLUDED.sample_start_date,
    sample_end_date = EXCLUDED.sample_end_date,
    last_computed_at = EXCLUDED.last_computed_at
  RETURNING forecast_accuracy_stats.venue_id, forecast_accuracy_stats.day_type, forecast_accuracy_stats.mape, forecast_accuracy_stats.within_10pct, forecast_accuracy_stats.sample_size;
END;
$$ LANGUAGE plpgsql;

-- ── Update: refresh_forecast_bias_adjustments — exclude anomaly days ────────
CREATE OR REPLACE FUNCTION refresh_forecast_bias_adjustments(
  p_lookback_days INTEGER DEFAULT 60,
  p_min_covers INTEGER DEFAULT 10
) RETURNS void AS $$
BEGIN
  -- Expire old biases
  UPDATE forecast_bias_adjustments
  SET effective_to = CURRENT_DATE - 1
  WHERE effective_to IS NULL;

  -- Insert fresh bias corrections
  WITH latest_per_date AS (
    SELECT DISTINCT ON (venue_id, business_date, shift_type)
      venue_id, business_date, shift_type, covers_predicted,
      COALESCE(day_type, get_day_type(business_date)) as day_type
    FROM demand_forecasts
    WHERE business_date >= CURRENT_DATE - p_lookback_days
      AND business_date < CURRENT_DATE
    ORDER BY venue_id, business_date, shift_type, forecast_date DESC
  ),
  paired AS (
    SELECT
      f.venue_id,
      f.day_type::text as day_type,
      f.covers_predicted - vdf.covers_count as signed_error
    FROM latest_per_date f
    JOIN venue_day_facts vdf ON
      vdf.venue_id = f.venue_id
      AND vdf.business_date = f.business_date
    -- Exclude closed days from bias computation
    LEFT JOIN location_config lc ON lc.venue_id = f.venue_id AND lc.is_active = true
    -- Exclude anomaly days (buyouts, private events, etc.)
    LEFT JOIN venue_day_anomalies vda ON
      vda.venue_id = f.venue_id
      AND vda.business_date = f.business_date
      AND vda.resolved_at IS NULL
    WHERE vdf.covers_count >= p_min_covers
      AND vda.id IS NULL  -- not flagged as anomaly
      AND NOT (
        lc.closed_weekdays IS NOT NULL
        AND (EXTRACT(ISODOW FROM f.business_date)::integer - 1) = ANY(lc.closed_weekdays)
      )
      -- Exclude holidays from day-type bias (they have their own adjustment)
      AND NOT EXISTS (SELECT 1 FROM holiday_calendar hc WHERE hc.holiday_date = f.business_date)
  ),
  venue_day_bias AS (
    SELECT
      venue_id,
      day_type,
      -ROUND(AVG(signed_error))::integer as correction
    FROM paired
    GROUP BY venue_id, day_type
    HAVING COUNT(*) >= 3
  ),
  venue_offsets AS (
    SELECT
      venue_id,
      jsonb_object_agg(day_type, correction) as day_type_offsets,
      COALESCE(MAX(correction) FILTER (WHERE day_type = 'weekday'), 0) as covers_offset
    FROM venue_day_bias
    GROUP BY venue_id
  )
  INSERT INTO forecast_bias_adjustments (venue_id, covers_offset, day_type_offsets, reason, effective_from, created_by)
  SELECT
    vo.venue_id,
    vo.covers_offset,
    vo.day_type_offsets,
    'Auto-refreshed bias (excl. closed days, holidays & anomalies, ' || CURRENT_DATE || ')',
    CURRENT_DATE,
    'system'
  FROM venue_offsets vo
  ON CONFLICT (venue_id, effective_from) DO UPDATE SET
    covers_offset = EXCLUDED.covers_offset,
    day_type_offsets = EXCLUDED.day_type_offsets,
    reason = EXCLUDED.reason,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- ── Run detection now ───────────────────────────────────────────────────────
SELECT * FROM detect_anomaly_days(365, 0.20);

-- Recompute accuracy and bias with anomalies excluded
SELECT * FROM refresh_forecast_accuracy_stats(90, 10);
SELECT refresh_forecast_bias_adjustments(60, 10);

SELECT 'Anomaly detection complete — buyouts/private events flagged and excluded from stats' as status;
