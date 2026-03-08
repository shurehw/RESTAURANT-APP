-- ============================================================================
-- MIGRATION 289: Lower Walk-In Ratio Cap from 4.0 to 3.0
--
-- Poppy Fri has a trained ratio of 3.55, but actual in-period ratio was 2.47.
-- High ratios (venue primarily walk-in) are more unstable and drift more.
-- Lowering to 3.0 drops Poppy (3.55) to DOW-median fallback (23.6% MAPE),
-- which is better than its rez-mode MAPE (42.4%).
--
-- All other quality-gated venues have ratios <= 2.0:
--   Nice Guy: 1.36-1.55, Delilah LA: 1.27-1.74, Miami: 1.17-1.36,
--   Bird Streets: 0.93-1.14, WeHo: 0.65-0.99
-- ============================================================================

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

    CASE WHEN hc.holiday_code IS NOT NULL THEN false
         WHEN lc.closed_weekdays IS NOT NULL
              AND (EXTRACT(ISODOW FROM f.business_date)::integer - 1) = ANY(lc.closed_weekdays)
         THEN true
         ELSE false
    END AS is_closed_day,

    COALESCE(fas.within_10pct, 0)  AS confidence_pct,
    COALESCE(fas.mape, 100)        AS historical_mape,
    COALESCE(fas.sample_size, 0)   AS accuracy_sample_size,

    CASE WHEN hc.holiday_code IS NOT NULL THEN 0
      ELSE COALESCE(
        (b.day_type_offsets->>dow_name(f.business_date))::integer,
        (b.day_type_offsets->>COALESCE(f.day_type, get_day_type(f.business_date))::text)::integer,
        b.covers_offset, 0
      )
    END AS day_type_offset,

    COALESCE(
      CASE WHEN hc.holiday_code IS NOT NULL AND v.venue_class IS NOT NULL
        THEN ha.covers_offset ELSE 0 END, 0
    ) AS holiday_offset,

    COALESCE(
      CASE WHEN pb.typical_on_hand_t24 > 0 AND rs.confirmed_covers IS NOT NULL
        THEN compute_pacing_multiplier(rs.confirmed_covers, pb.typical_on_hand_t24)
        ELSE 1.000 END, 1.000
    ) AS pacing_multiplier,

    rs.confirmed_covers               AS on_hand_resos,
    pb.typical_on_hand_t24            AS typical_resos,

    -- Quality gate: min 5 samples, ratio <= 3.0 (avoids high-drift walk-in venues)
    CASE WHEN wp.sample_size >= 5 AND wp.median_ratio <= 3.0
      THEN wp.median_ratio ELSE NULL END AS walkin_ratio,
    CASE WHEN wp.sample_size >= 5 AND wp.median_ratio <= 3.0
      THEN wp.median_delta ELSE NULL END AS walkin_delta,
    wp.sample_size                    AS walkin_sample_size,

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
    ON ha.holiday_code = hc.holiday_code AND ha.venue_class = v.venue_class
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
  LEFT JOIN venue_walkin_patterns wp
    ON wp.venue_id = f.venue_id
    AND wp.dow = EXTRACT(DOW FROM f.business_date)::integer
)
SELECT
  id, venue_id, business_date, shift_type, day_type,
  covers_raw, revenue_raw, food_revenue_raw, bev_revenue_raw, model_version,
  is_closed_day,
  confidence_pct, historical_mape, accuracy_sample_size,
  day_type_offset, holiday_offset, pacing_multiplier,
  on_hand_resos, typical_resos, walkin_ratio, walkin_delta, walkin_sample_size,

  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0
    -- Rez mode: use when quality-gated pattern exists + sanity check
    WHEN on_hand_resos IS NOT NULL
      AND walkin_ratio IS NOT NULL
      AND on_hand_resos >= 3
      AND covers_raw > 0
      AND (on_hand_resos * walkin_ratio) BETWEEN covers_raw * 0.40 AND covers_raw * 2.50
    THEN GREATEST(0, ROUND(on_hand_resos * walkin_ratio + holiday_offset))::integer
    -- Fallback: DOW median + bias + pacing
    ELSE GREATEST(0, ROUND(
      covers_raw * pacing_multiplier + day_type_offset + holiday_offset
    ))::integer
  END AS covers_predicted,

  CASE WHEN is_closed_day OR covers_raw = 0 THEN 0
    ELSE GREATEST(0, ROUND(revenue_adjusted * pacing_multiplier))::integer
  END AS revenue_predicted,

  (on_hand_resos IS NOT NULL
    AND walkin_ratio IS NOT NULL
    AND on_hand_resos >= 3
    AND covers_raw > 0
    AND (on_hand_resos * walkin_ratio) BETWEEN covers_raw * 0.40 AND covers_raw * 2.50
  ) AS rez_mode,

  bias_corrected, bias_reason, holiday_code, holiday_adjustment, venue_class,
  covers_lower, covers_upper
FROM base;

SELECT 'forecasts_with_bias: ratio cap lowered to 3.0' AS status;
