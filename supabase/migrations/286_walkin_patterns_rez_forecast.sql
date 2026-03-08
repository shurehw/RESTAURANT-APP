-- ============================================================================
-- MIGRATION 286: Walk-In Patterns + Reservation-Based Forecasting
--
-- Problem: Static DOW-median forecast MAPE is 26-37%.
-- With T-24 reservation snapshot data, we can achieve 6-15% MAPE.
--
-- Strategy (rez_plus_walkin):
--   When we have confirmed covers at T-24:
--     predicted = confirmed_covers × median_walk_in_ratio (per venue/DOW)
--   Otherwise:
--     predicted = dow_median × pacing + bias (existing logic)
--
-- This migration:
--   1. Creates venue_walkin_patterns table (median ratio per venue/DOW)
--   2. Creates refresh_walkin_patterns() function
--   3. Updates forecasts_with_bias view to use rez-based prediction when available
--   4. Seeds initial patterns from historical data
-- ============================================================================

-- ── 1. Walk-in patterns table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venue_walkin_patterns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  dow           INTEGER NOT NULL CHECK (dow BETWEEN 0 AND 6),  -- 0=Sun, 6=Sat
  median_ratio  NUMERIC(6,4) NOT NULL,   -- actual / confirmed (e.g. 1.35 = 35% walk-in uplift)
  median_delta  INTEGER NOT NULL,        -- actual - confirmed (absolute walk-in count)
  sample_size   INTEGER NOT NULL DEFAULT 0,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (venue_id, dow)
);

CREATE INDEX IF NOT EXISTS venue_walkin_patterns_venue_dow
  ON venue_walkin_patterns(venue_id, dow);

-- ── 2. Refresh function ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_walkin_patterns(
  p_min_samples INTEGER DEFAULT 3
)
RETURNS TABLE (
  out_venue_id  UUID,
  out_dow       INTEGER,
  out_ratio     NUMERIC,
  out_delta     INTEGER,
  out_n         INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM venue_walkin_patterns;

  INSERT INTO venue_walkin_patterns (venue_id, dow, median_ratio, median_delta, sample_size, computed_at)
  SELECT
    vdf.venue_id,
    EXTRACT(DOW FROM vdf.business_date)::integer                                            AS dow,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vdf.covers_count::float / rs.confirmed_covers)  AS median_ratio,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (vdf.covers_count - rs.confirmed_covers)::float)::integer AS median_delta,
    COUNT(*)::integer                                                                        AS sample_size,
    now()
  FROM venue_day_facts vdf
  JOIN LATERAL (
    SELECT rs2.confirmed_covers
    FROM   reservation_snapshots rs2
    WHERE  rs2.venue_id = vdf.venue_id
      AND  rs2.business_date = vdf.business_date
      AND  rs2.hours_to_service BETWEEN 20 AND 28
    ORDER  BY rs2.snapshot_at DESC
    LIMIT  1
  ) rs ON rs.confirmed_covers >= 3
  -- Exclude anomaly days from ratio training
  WHERE vdf.covers_count > 2
    AND NOT EXISTS (
      SELECT 1 FROM venue_day_anomalies vda
      WHERE  vda.venue_id = vdf.venue_id
        AND  vda.business_date = vdf.business_date
        AND  vda.resolved_at IS NULL
    )
  GROUP  BY vdf.venue_id, EXTRACT(DOW FROM vdf.business_date)
  HAVING COUNT(*) >= p_min_samples;

  RETURN QUERY
  SELECT venue_id, dow, median_ratio, median_delta, sample_size
  FROM   venue_walkin_patterns
  ORDER  BY venue_id, dow;
END;
$$;

-- ── 3. Recreate forecasts_with_bias view with rez-based prediction ────────

DROP VIEW IF EXISTS forecasts_with_bias;
CREATE VIEW forecasts_with_bias AS
WITH latest_forecasts AS (
  SELECT DISTINCT ON (venue_id, business_date, shift_type)
    *
  FROM demand_forecasts
  ORDER BY venue_id, business_date, shift_type, forecast_date DESC
),
base AS (
  SELECT
    f.id,
    f.venue_id,
    f.business_date,
    f.shift_type,
    COALESCE(f.day_type, get_day_type(f.business_date)) AS day_type,
    f.covers_predicted                 AS covers_raw,
    f.revenue_predicted                AS revenue_raw,
    f.food_revenue_predicted           AS food_revenue_raw,
    f.bev_revenue_predicted            AS bev_revenue_raw,
    f.model_version,

    -- Closed-day detection (holiday override)
    CASE WHEN hc.holiday_code IS NOT NULL THEN false
         WHEN lc.closed_weekdays IS NOT NULL
              AND (EXTRACT(ISODOW FROM f.business_date)::integer - 1) = ANY(lc.closed_weekdays)
         THEN true
         ELSE false
    END AS is_closed_day,

    -- Historical accuracy metadata
    COALESCE(fas.within_10pct, 0)  AS confidence_pct,
    COALESCE(fas.mape, 100)        AS historical_mape,
    COALESCE(fas.sample_size, 0)   AS accuracy_sample_size,

    -- Per-DOW offset (Layer 1 of old pipeline — kept for fallback)
    CASE WHEN hc.holiday_code IS NOT NULL THEN 0
      ELSE COALESCE(
        (b.day_type_offsets->>dow_name(f.business_date))::integer,
        (b.day_type_offsets->>COALESCE(f.day_type, get_day_type(f.business_date))::text)::integer,
        b.covers_offset,
        0
      )
    END AS day_type_offset,

    -- Holiday offset
    COALESCE(
      CASE
        WHEN hc.holiday_code IS NOT NULL AND v.venue_class IS NOT NULL
        THEN ha.covers_offset
        ELSE 0
      END,
      0
    ) AS holiday_offset,

    -- Legacy pacing multiplier (kept for venues without walkin pattern data)
    COALESCE(
      CASE
        WHEN pb.typical_on_hand_t24 > 0 AND rs.confirmed_covers IS NOT NULL
        THEN compute_pacing_multiplier(rs.confirmed_covers, pb.typical_on_hand_t24)
        ELSE 1.000
      END,
      1.000
    ) AS pacing_multiplier,

    -- Reservation data for rez-based prediction
    rs.confirmed_covers               AS on_hand_resos,
    pb.typical_on_hand_t24            AS typical_resos,
    wp.median_ratio                   AS walkin_ratio,
    wp.median_delta                   AS walkin_delta,
    wp.sample_size                    AS walkin_sample_size,

    -- Metadata
    b.id IS NOT NULL                  AS bias_corrected,
    b.reason                          AS bias_reason,
    hc.holiday_code                   AS holiday_code,
    ha.covers_offset                  AS holiday_adjustment,
    v.venue_class,
    f.revenue_predicted + COALESCE(b.revenue_offset, 0) AS revenue_adjusted,
    f.covers_lower  + COALESCE(b.covers_offset, 0) AS covers_lower,
    f.covers_upper  + COALESCE(b.covers_offset, 0) AS covers_upper

  FROM latest_forecasts f
  LEFT JOIN venues v ON v.id = f.venue_id
  LEFT JOIN location_config lc
    ON lc.venue_id = f.venue_id AND lc.is_active = true
  LEFT JOIN forecast_bias_adjustments b
    ON b.venue_id = f.venue_id
    AND b.effective_from <= f.business_date
    AND (b.effective_to IS NULL OR b.effective_to >= f.business_date)
  LEFT JOIN holiday_calendar hc ON hc.holiday_date = f.business_date
  LEFT JOIN holiday_adjustments ha
    ON ha.holiday_code = hc.holiday_code
    AND ha.venue_class = v.venue_class
  LEFT JOIN pacing_baselines pb
    ON pb.venue_id = f.venue_id
    AND pb.day_type = COALESCE(f.day_type, get_day_type(f.business_date))::text
  LEFT JOIN forecast_accuracy_stats fas
    ON fas.venue_id = f.venue_id
    AND fas.day_type = COALESCE(f.day_type, get_day_type(f.business_date))::text
  LEFT JOIN LATERAL (
    SELECT rs2.confirmed_covers, rs2.hours_to_service
    FROM   reservation_snapshots rs2
    WHERE  rs2.venue_id = f.venue_id
      AND  rs2.business_date = f.business_date
      AND  rs2.hours_to_service BETWEEN 20 AND 28
    ORDER  BY rs2.snapshot_at DESC
    LIMIT  1
  ) rs ON true
  -- Walk-in pattern for this venue/DOW (used when T-24 rez available)
  LEFT JOIN venue_walkin_patterns wp
    ON wp.venue_id = f.venue_id
    AND wp.dow = EXTRACT(DOW FROM f.business_date)::integer
)
SELECT
  id, venue_id, business_date, shift_type, day_type,
  covers_raw, revenue_raw, food_revenue_raw, bev_revenue_raw, model_version,
  is_closed_day,

  -- Accuracy metadata
  confidence_pct,
  historical_mape,
  accuracy_sample_size,

  -- Layer outputs (for debugging)
  day_type_offset,
  holiday_offset,
  pacing_multiplier,
  on_hand_resos,
  typical_resos,
  walkin_ratio,
  walkin_delta,
  walkin_sample_size,

  -- Final prediction:
  --   Priority 1: reservation-based (T-24 confirmed × walk-in ratio) + holiday
  --   Priority 2: DOW-median × pacing + bias + holiday (existing pipeline)
  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0

    -- Rez-based: use when we have T-24 snapshot AND trained walk-in pattern
    WHEN on_hand_resos IS NOT NULL
      AND walkin_ratio IS NOT NULL
      AND on_hand_resos >= 3
    THEN GREATEST(0, ROUND(on_hand_resos * walkin_ratio + holiday_offset))::integer

    -- Fallback: DOW median with pacing + bias
    ELSE GREATEST(0, ROUND(
      covers_raw * pacing_multiplier + day_type_offset + holiday_offset
    ))::integer
  END AS covers_predicted,

  -- Revenue follows same priority
  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0
    ELSE GREATEST(0, ROUND(revenue_adjusted * pacing_multiplier))::integer
  END AS revenue_predicted,

  -- Confidence flags
  on_hand_resos IS NOT NULL AND walkin_ratio IS NOT NULL AS rez_mode,
  bias_corrected,
  bias_reason,
  holiday_code,
  holiday_adjustment,
  venue_class,
  covers_lower,
  covers_upper
FROM base;

-- ── 4. Seed initial walk-in patterns ─────────────────────────────────────

SELECT *
FROM refresh_walkin_patterns(p_min_samples => 3);

SELECT
  'venue_walkin_patterns seeded' AS status,
  COUNT(*) AS pattern_count
FROM venue_walkin_patterns;
