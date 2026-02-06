-- ============================================================================
-- PACING MULTIPLIER IN FORECAST VIEW
-- Adds pacing layer to forecasts_with_bias:
--   final = (base + day_type_offset + holiday_offset) * pacing_multiplier
-- ============================================================================

-- Drop and recreate (column order changed from previous definition)
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
    f.confidence_level,

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

    -- Layer 3: Pacing multiplier (only for upcoming dates with snapshot data)
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
  -- Get latest reservation snapshot for this venue/date (closest to T-24)
  LEFT JOIN LATERAL (
    SELECT rs2.confirmed_covers, rs2.hours_to_service
    FROM reservation_snapshots rs2
    WHERE rs2.venue_id = f.venue_id
      AND rs2.business_date = f.business_date
      AND rs2.hours_to_service BETWEEN 20 AND 28  -- T-24 window
    ORDER BY rs2.snapshot_at DESC
    LIMIT 1
  ) rs ON true
)
SELECT
  id, venue_id, business_date, shift_type, day_type,
  covers_raw, revenue_raw, model_version, confidence_level,

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

-- Ensure grants
GRANT SELECT ON forecasts_with_bias TO authenticated;

SELECT 'forecasts_with_bias updated with 4-layer pipeline (base + day_type + holiday) * pacing' as status;
