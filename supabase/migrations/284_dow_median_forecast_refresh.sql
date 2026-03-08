-- ============================================================================
-- Refresh demand forecasts using rolling DOW median from recent actuals.
--
-- The Prophet model is stale. A simple DOW median from the last 90 days
-- outperforms it (29.4% vs 37.1% MAPE raw). This function:
--   1. Computes median covers + revenue per venue + DOW from recent actuals
--   2. Excludes anomaly days (buyouts, private events)
--   3. Upserts into demand_forecasts for the next 90 days
--   4. Can be called weekly to stay fresh
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_dow_median_forecasts(
  p_lookback_days INTEGER DEFAULT 90,
  p_forecast_days INTEGER DEFAULT 90,
  p_min_covers INTEGER DEFAULT 3
) RETURNS TABLE(out_venue_id UUID, out_dow INTEGER, out_median_covers INTEGER, out_median_revenue NUMERIC, out_sample_size INTEGER) AS $$
BEGIN
  -- Clean up: expire old dow_median forecasts for future dates
  -- (keep historical ones for accuracy tracking)
  DELETE FROM demand_forecasts
  WHERE model_version = 'dow_median_v1'
    AND business_date >= CURRENT_DATE;

  RETURN QUERY
  WITH recent_actuals AS (
    SELECT
      vdf.venue_id,
      vdf.business_date,
      EXTRACT(ISODOW FROM vdf.business_date)::integer as dow, -- 1=Mon..7=Sun
      vdf.covers_count,
      vdf.gross_sales
    FROM venue_day_facts vdf
    WHERE vdf.business_date >= CURRENT_DATE - p_lookback_days
      AND vdf.business_date < CURRENT_DATE
      AND vdf.covers_count >= p_min_covers
      -- Exclude anomaly days
      AND NOT EXISTS (
        SELECT 1 FROM venue_day_anomalies vda
        WHERE vda.venue_id = vdf.venue_id
          AND vda.business_date = vdf.business_date
          AND vda.resolved_at IS NULL
      )
      -- Exclude closed days
      AND NOT EXISTS (
        SELECT 1 FROM location_config lc
        WHERE lc.venue_id = vdf.venue_id
          AND lc.is_active = true
          AND lc.closed_weekdays IS NOT NULL
          AND (EXTRACT(ISODOW FROM vdf.business_date)::integer - 1) = ANY(lc.closed_weekdays)
      )
  ),
  dow_medians AS (
    SELECT
      ra.venue_id,
      ra.dow,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ra.covers_count) as median_covers,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ra.gross_sales) as median_revenue,
      COUNT(*) as n
    FROM recent_actuals ra
    GROUP BY ra.venue_id, ra.dow
    HAVING COUNT(*) >= 3  -- Need at least 3 samples
  ),
  future_dates AS (
    SELECT generate_series(
      CURRENT_DATE,
      CURRENT_DATE + p_forecast_days,
      '1 day'::interval
    )::date as business_date
  ),
  forecast_rows AS (
    SELECT
      dm.venue_id,
      fd.business_date,
      'dinner'::text as shift_type,
      get_day_type(fd.business_date) as day_type,
      ROUND(dm.median_covers)::integer as covers_predicted,
      ROUND(dm.median_revenue)::numeric(10,2) as revenue_predicted,
      -- Confidence bounds: ±25% of median
      GREATEST(0, ROUND(dm.median_covers * 0.75))::integer as covers_lower,
      ROUND(dm.median_covers * 1.25)::integer as covers_upper,
      'dow_median_v1'::text as model_version,
      CURRENT_TIMESTAMP as forecast_date
    FROM dow_medians dm
    CROSS JOIN future_dates fd
    WHERE EXTRACT(ISODOW FROM fd.business_date)::integer = dm.dow
  )
  INSERT INTO demand_forecasts (
    venue_id, business_date, shift_type, day_type,
    covers_predicted, revenue_predicted,
    covers_lower, covers_upper,
    model_version, forecast_date
  )
  SELECT
    fr.venue_id, fr.business_date, fr.shift_type, fr.day_type,
    fr.covers_predicted, fr.revenue_predicted,
    fr.covers_lower, fr.covers_upper,
    fr.model_version, fr.forecast_date
  FROM forecast_rows fr
  -- Skip closed days (check location_config)
  WHERE NOT EXISTS (
    SELECT 1 FROM location_config lc
    WHERE lc.venue_id = fr.venue_id
      AND lc.is_active = true
      AND lc.closed_weekdays IS NOT NULL
      AND (EXTRACT(ISODOW FROM fr.business_date)::integer - 1) = ANY(lc.closed_weekdays)
  )
  RETURNING
    demand_forecasts.venue_id,
    EXTRACT(ISODOW FROM demand_forecasts.business_date)::integer,
    demand_forecasts.covers_predicted,
    demand_forecasts.revenue_predicted,
    1;

END;
$$ LANGUAGE plpgsql;

-- Run it now
SELECT out_venue_id, out_dow, out_median_covers, out_median_revenue, SUM(out_sample_size) as rows_inserted
FROM refresh_dow_median_forecasts(90, 90, 3)
GROUP BY out_venue_id, out_dow, out_median_covers, out_median_revenue
ORDER BY out_venue_id, out_dow;
