-- ============================================================================
-- 1. Filter anomaly days from accuracy computation
-- 2. Refresh bias adjustments based on current over/under-prediction
-- ============================================================================

-- ============================================================================
-- FIX: refresh_forecast_accuracy_stats — exclude sub-10 cover anomaly days
-- These are soft closures, private events, or data glitches that destroy MAPE
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_forecast_accuracy_stats(
  p_lookback_days INTEGER DEFAULT 90,
  p_min_covers INTEGER DEFAULT 10
) RETURNS TABLE(out_venue_id UUID, out_day_type TEXT, out_mape NUMERIC, out_within_10 NUMERIC, out_sample_n INTEGER) AS $$
BEGIN
  RETURN QUERY
  WITH latest_per_date AS (
    -- Deduplicate: keep only the most recent forecast_date per venue/business_date/shift_type
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
    WHERE vdf.covers_count >= p_min_covers  -- Filter anomaly days
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

-- Recompute accuracy stats now (with anomaly filter)
SELECT * FROM refresh_forecast_accuracy_stats(90, 10);

-- ============================================================================
-- REFRESH BIAS ADJUSTMENTS
-- Computed from last 60 days of forecast vs actual (≥10 covers)
-- Replaces stale Feb 6 biases with current corrections
-- ============================================================================

-- Expire old biases
UPDATE forecast_bias_adjustments
SET effective_to = CURRENT_DATE - 1
WHERE effective_to IS NULL;

-- Insert fresh bias corrections per venue based on avg signed error
-- (negative bias = under-predicting → positive offset needed)
WITH latest_per_date AS (
  SELECT DISTINCT ON (venue_id, business_date, shift_type)
    venue_id, business_date, shift_type, covers_predicted,
    COALESCE(day_type, get_day_type(business_date)) as day_type
  FROM demand_forecasts
  WHERE business_date >= CURRENT_DATE - 60
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
  WHERE vdf.covers_count >= 10
),
venue_day_bias AS (
  SELECT
    venue_id,
    day_type,
    -ROUND(AVG(signed_error))::integer as correction  -- negate: over-predict → negative offset
  FROM paired
  GROUP BY venue_id, day_type
  HAVING COUNT(*) >= 3  -- need at least 3 data points
),
venue_offsets AS (
  SELECT
    venue_id,
    jsonb_object_agg(day_type, correction) as day_type_offsets,
    -- General covers_offset is the weekday correction (most common)
    COALESCE(MAX(correction) FILTER (WHERE day_type = 'weekday'), 0) as covers_offset
  FROM venue_day_bias
  GROUP BY venue_id
)
INSERT INTO forecast_bias_adjustments (venue_id, covers_offset, day_type_offsets, reason, effective_from, created_by)
SELECT
  vo.venue_id,
  vo.covers_offset,
  vo.day_type_offsets,
  'Auto-refreshed bias correction from 60-day actuals (≥10 covers, ' || CURRENT_DATE || ')',
  CURRENT_DATE,
  'system'
FROM venue_offsets vo
ON CONFLICT (venue_id, effective_from) DO UPDATE SET
  covers_offset = EXCLUDED.covers_offset,
  day_type_offsets = EXCLUDED.day_type_offsets,
  reason = EXCLUDED.reason,
  updated_at = now();

SELECT 'Accuracy stats refreshed (anomaly-filtered) and bias adjustments updated' as status;
