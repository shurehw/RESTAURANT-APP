-- ============================================================================
-- FIX: forecasts_with_bias — dedup + dark-day enforcement
--
-- Problems fixed:
--   1. Duplicate rows: each forecaster run uses a new forecast_date, so
--      multiple rows accumulate per (venue, business_date, shift_type).
--      Fix: use DISTINCT ON to keep only the latest forecast_date per combo.
--   2. Closed-day forecasts: Prophet sometimes wrote non-zero covers for
--      closed weekdays (stale runs before location_config was seeded).
--      Fix: join location_config and zero out closed weekdays at the view level.
--   3. covers_raw=0 inflation: bias offsets could inflate Prophet zeros.
--      Fix: CASE WHEN guard preserves zeros.
-- ============================================================================

DROP VIEW IF EXISTS forecasts_with_bias;
CREATE VIEW forecasts_with_bias AS
WITH latest_forecasts AS (
  -- Deduplicate: keep only the most recent forecast_date per venue/business_date/shift_type
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
    -- Compute day_type if NULL (legacy rows)
    COALESCE(f.day_type, get_day_type(f.business_date)) as day_type,
    f.covers_predicted as covers_raw,
    f.revenue_predicted as revenue_raw,
    f.model_version,

    -- Is this a closed weekday? (0=Mon in Python/Postgres ISODOW-1)
    CASE WHEN lc.closed_weekdays IS NOT NULL
         AND (EXTRACT(ISODOW FROM f.business_date)::integer - 1) = ANY(lc.closed_weekdays)
    THEN true ELSE false END as is_closed_day,

    -- Historical accuracy as confidence
    COALESCE(fas.within_10pct, 0) as confidence_pct,
    COALESCE(fas.mape, 100) as historical_mape,
    COALESCE(fas.sample_size, 0) as accuracy_sample_size,

    -- Layer 1: Day-type offset
    COALESCE(
      (b.day_type_offsets->>COALESCE(f.day_type, get_day_type(f.business_date))::text)::integer,
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
  covers_raw, revenue_raw, model_version,
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

  -- Final 4-layer prediction: zero if closed day OR Prophet wrote zero
  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0
    ELSE GREATEST(0, ROUND(
      (covers_raw + day_type_offset + holiday_offset) * pacing_multiplier
    ))::integer
  END as covers_predicted,

  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0
    ELSE revenue_adjusted
  END as revenue_predicted,

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

SELECT 'Fixed: dedup + dark-day enforcement in forecasts_with_bias' as status;
