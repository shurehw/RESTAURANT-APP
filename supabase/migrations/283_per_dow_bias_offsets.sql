-- ============================================================================
-- Switch bias offsets from day_type (5 buckets) to per-DOW (7 buckets)
--
-- Problem: day_type groups Mon-Thu as "weekday", so a Monday promo (+100 covers)
-- gets diluted by Tue/Wed/Thu. Each DOW needs its own correction.
--
-- Changes:
--   1. Helper function dow_name() for date → DOW key
--   2. Recreate forecasts_with_bias to look up by DOW name
--   3. Update refresh_forecast_bias_adjustments() to compute per-DOW
--   4. Exclude anomaly days from bias computation
--   5. Expire old day_type-based offsets and compute fresh per-DOW offsets
-- ============================================================================

-- 1. Helper: date → dow key name
CREATE OR REPLACE FUNCTION dow_name(d DATE) RETURNS TEXT AS $$
  SELECT CASE EXTRACT(ISODOW FROM d)
    WHEN 1 THEN 'monday'
    WHEN 2 THEN 'tuesday'
    WHEN 3 THEN 'wednesday'
    WHEN 4 THEN 'thursday'
    WHEN 5 THEN 'friday'
    WHEN 6 THEN 'saturday'
    WHEN 7 THEN 'sunday'
  END;
$$ LANGUAGE sql IMMUTABLE;

-- 2. Recreate view with per-DOW offset lookup
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
    COALESCE(f.day_type, get_day_type(f.business_date)) as day_type,
    f.covers_predicted as covers_raw,
    f.revenue_predicted as revenue_raw,
    f.food_revenue_predicted as food_revenue_raw,
    f.bev_revenue_predicted as bev_revenue_raw,
    f.model_version,

    -- Holidays override closed-weekday logic
    CASE WHEN hc.holiday_code IS NOT NULL THEN false
         WHEN lc.closed_weekdays IS NOT NULL
              AND (EXTRACT(ISODOW FROM f.business_date)::integer - 1) = ANY(lc.closed_weekdays)
         THEN true
         ELSE false
    END as is_closed_day,

    -- Historical accuracy as confidence
    COALESCE(fas.within_10pct, 0) as confidence_pct,
    COALESCE(fas.mape, 100) as historical_mape,
    COALESCE(fas.sample_size, 0) as accuracy_sample_size,

    -- Per-DOW offset: look up by dow name (monday, tuesday, etc.)
    -- Falls back to day_type key for backward compat with old rows
    -- Skip on holidays (they have their own adjustment)
    CASE WHEN hc.holiday_code IS NOT NULL THEN 0
      ELSE COALESCE(
        (b.day_type_offsets->>dow_name(f.business_date))::integer,
        (b.day_type_offsets->>COALESCE(f.day_type, get_day_type(f.business_date))::text)::integer,
        b.covers_offset,
        0
      )
    END as day_type_offset,

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

  FROM latest_forecasts f
  LEFT JOIN venues v ON v.id = f.venue_id
  LEFT JOIN location_config lc ON lc.venue_id = f.venue_id AND lc.is_active = true
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
    AND pb.day_type = COALESCE(f.day_type, get_day_type(f.business_date))::text
  LEFT JOIN forecast_accuracy_stats fas ON
    fas.venue_id = f.venue_id
    AND fas.day_type = COALESCE(f.day_type, get_day_type(f.business_date))::text
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
  covers_raw, revenue_raw, food_revenue_raw, bev_revenue_raw, model_version,
  is_closed_day,

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

  -- Final prediction: (raw × pacing) + offsets
  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0
    ELSE GREATEST(0, ROUND(
      covers_raw * pacing_multiplier + day_type_offset + holiday_offset
    ))::integer
  END as covers_predicted,

  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0
    ELSE revenue_adjusted
  END as revenue_predicted,

  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0
    ELSE food_revenue_raw
  END as food_revenue_predicted,

  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0
    ELSE bev_revenue_raw
  END as bev_revenue_predicted,

  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0 ELSE covers_lower END as covers_lower,
  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0 ELSE covers_upper END as covers_upper,

  -- Metadata
  bias_corrected,
  bias_reason,
  holiday_code,
  holiday_adjustment,
  venue_class
FROM base;

GRANT SELECT ON forecasts_with_bias TO authenticated;

-- 3. Update bias refresh to compute per-DOW offsets + exclude anomalies
CREATE OR REPLACE FUNCTION refresh_forecast_bias_adjustments(
  p_lookback_days INTEGER DEFAULT 60,
  p_min_covers INTEGER DEFAULT 10
) RETURNS void AS $$
BEGIN
  -- Expire old biases
  UPDATE forecast_bias_adjustments
  SET effective_to = CURRENT_DATE - 1
  WHERE effective_to IS NULL;

  -- Insert fresh per-DOW bias corrections
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
      dow_name(f.business_date) as dow,
      f.covers_predicted - vdf.covers_count as signed_error
    FROM latest_per_date f
    JOIN venue_day_facts vdf ON
      vdf.venue_id = f.venue_id
      AND vdf.business_date = f.business_date
    -- Exclude closed days
    LEFT JOIN location_config lc ON lc.venue_id = f.venue_id AND lc.is_active = true
    WHERE vdf.covers_count >= p_min_covers
      AND NOT (
        lc.closed_weekdays IS NOT NULL
        AND (EXTRACT(ISODOW FROM f.business_date)::integer - 1) = ANY(lc.closed_weekdays)
      )
      -- Exclude holidays
      AND NOT EXISTS (SELECT 1 FROM holiday_calendar hc WHERE hc.holiday_date = f.business_date)
      -- Exclude anomaly days (buyouts, private events, etc.)
      AND NOT EXISTS (
        SELECT 1 FROM venue_day_anomalies vda
        WHERE vda.venue_id = f.venue_id
          AND vda.business_date = f.business_date
          AND vda.resolved_at IS NULL
      )
  ),
  venue_dow_bias AS (
    SELECT
      venue_id,
      dow,
      -ROUND(AVG(signed_error))::integer as correction
    FROM paired
    GROUP BY venue_id, dow
    HAVING COUNT(*) >= 3
  ),
  venue_offsets AS (
    SELECT
      venue_id,
      jsonb_object_agg(dow, correction) as day_type_offsets,
      COALESCE(
        ROUND(AVG(correction) FILTER (WHERE dow IN ('monday','tuesday','wednesday','thursday')))::integer,
        0
      ) as covers_offset
    FROM venue_dow_bias
    GROUP BY venue_id
  )
  INSERT INTO forecast_bias_adjustments (venue_id, covers_offset, day_type_offsets, reason, effective_from, created_by)
  SELECT
    vo.venue_id,
    vo.covers_offset,
    vo.day_type_offsets,
    'Auto-refreshed per-DOW bias (excl. anomalies, closed, holidays, ' || CURRENT_DATE || ')',
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

-- 4. Run the refresh now
SELECT refresh_forecast_bias_adjustments(60, 10);

SELECT 'Per-DOW bias offsets deployed' as status;
