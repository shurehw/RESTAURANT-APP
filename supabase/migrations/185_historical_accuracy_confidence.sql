-- ============================================================================
-- HISTORICAL ACCURACY AS CONFIDENCE
-- Replaces model-based confidence_level with actual accuracy per venue/day_type
-- Refreshed weekly from venue_day_facts vs demand_forecasts
-- ============================================================================

-- Precomputed accuracy stats per venue/day_type
CREATE TABLE IF NOT EXISTS forecast_accuracy_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  day_type TEXT NOT NULL CHECK (day_type IN ('weekday', 'friday', 'saturday', 'sunday', 'holiday')),

  -- Accuracy metrics (from bias-corrected forecasts)
  mape NUMERIC(6,2) NOT NULL DEFAULT 0,          -- Mean Absolute Percentage Error
  within_10pct NUMERIC(5,2) NOT NULL DEFAULT 0,   -- % of forecasts within 10% of actual
  within_20pct NUMERIC(5,2) NOT NULL DEFAULT 0,   -- % of forecasts within 20% of actual
  avg_bias NUMERIC(8,2) DEFAULT 0,                 -- Average signed error (pred - actual)

  -- Sample info
  sample_size INTEGER NOT NULL DEFAULT 0,
  sample_start_date DATE,
  sample_end_date DATE,
  last_computed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(venue_id, day_type)
);

CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_stats_lookup
  ON forecast_accuracy_stats(venue_id, day_type);

-- RLS
ALTER TABLE forecast_accuracy_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accuracy stats for their venues"
  ON forecast_accuracy_stats FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

GRANT SELECT ON forecast_accuracy_stats TO authenticated;

-- ============================================================================
-- Refresh function: computes accuracy from forecasts_with_bias vs actuals
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_forecast_accuracy_stats(
  p_lookback_days INTEGER DEFAULT 90
) RETURNS TABLE(out_venue_id UUID, out_day_type TEXT, out_mape NUMERIC, out_within_10 NUMERIC, out_sample_n INTEGER) AS $$
BEGIN
  RETURN QUERY
  WITH paired AS (
    SELECT
      f.venue_id,
      f.day_type::text as day_type,
      f.covers_predicted as predicted,
      vdf.covers_count as actual,
      CASE WHEN vdf.covers_count > 0
        THEN ABS(f.covers_predicted - vdf.covers_count)::numeric / vdf.covers_count * 100
        ELSE 0
      END as pct_error
    FROM demand_forecasts f
    JOIN venue_day_facts vdf ON
      vdf.venue_id = f.venue_id
      AND vdf.business_date = f.business_date
    WHERE vdf.covers_count > 0
      AND f.business_date >= CURRENT_DATE - p_lookback_days
      AND f.business_date < CURRENT_DATE
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

-- Seed initial data
SELECT * FROM refresh_forecast_accuracy_stats(90);

-- Add to weekly cron (Sunday 5:45am, after decay and pacing refresh)
SELECT cron.schedule(
  'refresh-forecast-accuracy-stats-weekly',
  '45 5 * * 0',
  $$SELECT * FROM refresh_forecast_accuracy_stats(90)$$
);

-- ============================================================================
-- Update forecasts_with_bias to use historical accuracy instead of model confidence
-- ============================================================================
DROP VIEW IF EXISTS forecasts_with_bias;
CREATE VIEW forecasts_with_bias AS
WITH base AS (
  SELECT
    f.id,
    f.venue_id,
    f.business_date,
    f.shift_type,
    f.day_type,
    f.covers_predicted as covers_raw,
    f.revenue_predicted as revenue_raw,
    f.model_version,

    -- Historical accuracy as confidence (replaces model confidence_level)
    COALESCE(fas.within_10pct, 0) as confidence_pct,
    COALESCE(fas.mape, 100) as historical_mape,
    COALESCE(fas.sample_size, 0) as accuracy_sample_size,

    -- Layer 1: Day-type offset
    COALESCE(
      (b.day_type_offsets->>f.day_type::text)::integer,
      b.covers_offset,
      0
    ) as day_type_offset,

    -- Layer 2: Holiday offset
    COALESCE(
      CASE
        WHEN hc.holiday_code IS NOT NULL AND v.venue_class IS NOT NULL
        THEN ha.covers_offset
        ELSE 0
      END,
      0
    ) as holiday_offset,

    -- Layer 3: Pacing multiplier
    COALESCE(
      CASE
        WHEN pb.typical_on_hand_t24 > 0 AND rs.confirmed_covers IS NOT NULL
        THEN compute_pacing_multiplier(rs.confirmed_covers, pb.typical_on_hand_t24)
        ELSE 1.000
      END,
      1.000
    ) as pacing_multiplier,

    -- Pacing context
    rs.confirmed_covers as on_hand_resos,
    pb.typical_on_hand_t24 as typical_resos,

    -- Metadata
    b.id IS NOT NULL as bias_corrected,
    b.reason as bias_reason,
    hc.holiday_code as holiday_code,
    ha.covers_offset as holiday_adjustment,
    v.venue_class,
    f.revenue_predicted + COALESCE(b.revenue_offset, 0) as revenue_adjusted,
    f.covers_lower + COALESCE(b.covers_offset, 0) as covers_lower,
    f.covers_upper + COALESCE(b.covers_offset, 0) as covers_upper

  FROM demand_forecasts f
  LEFT JOIN venues v ON v.id = f.venue_id
  LEFT JOIN forecast_bias_adjustments b ON
    b.venue_id = f.venue_id
    AND b.effective_from <= f.business_date
    AND (b.effective_to IS NULL OR b.effective_to >= f.business_date)
  LEFT JOIN holiday_calendar hc ON hc.holiday_date = f.business_date
  LEFT JOIN holiday_adjustments ha ON
    ha.holiday_code = hc.holiday_code
    AND ha.venue_class = v.venue_class
  LEFT JOIN pacing_baselines pb ON
    pb.venue_id = f.venue_id
    AND pb.day_type = f.day_type::text
  LEFT JOIN forecast_accuracy_stats fas ON
    fas.venue_id = f.venue_id
    AND fas.day_type = f.day_type::text
  LEFT JOIN LATERAL (
    SELECT rs2.confirmed_covers, rs2.hours_to_service
    FROM reservation_snapshots rs2
    WHERE rs2.venue_id = f.venue_id
      AND rs2.business_date = f.business_date
      AND rs2.hours_to_service BETWEEN 20 AND 28
    ORDER BY rs2.snapshot_at DESC
    LIMIT 1
  ) rs ON true
)
SELECT
  id, venue_id, business_date, shift_type, day_type,
  covers_raw, revenue_raw, model_version,

  -- Historical accuracy as confidence
  confidence_pct,
  historical_mape,
  accuracy_sample_size,

  -- Layer outputs
  day_type_offset,
  holiday_offset,
  pacing_multiplier,
  on_hand_resos,
  typical_resos,

  -- Final 4-layer prediction
  GREATEST(0, ROUND(
    (covers_raw + day_type_offset + holiday_offset) * pacing_multiplier
  ))::integer as covers_predicted,

  revenue_adjusted as revenue_predicted,
  covers_lower,
  covers_upper,

  -- Metadata
  bias_corrected,
  bias_reason,
  holiday_code,
  holiday_adjustment,
  venue_class
FROM base;

GRANT SELECT ON forecasts_with_bias TO authenticated;

SELECT 'Historical accuracy confidence created and view updated' as status;
