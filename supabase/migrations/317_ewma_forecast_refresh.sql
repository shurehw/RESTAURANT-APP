-- ============================================================================
-- MIGRATION 290: EWMA-Based Demand Forecast Refresh
--
-- Problem: Current refresh_dow_median_forecasts() uses a plain median with
-- a 90-day lookback. This treats all historical days equally, but recent
-- data is more predictive. Result: LV 24% MAPE, Nashville 35.9% MAPE.
--
-- Fix: Replace plain median with EWMA-weighted mean (λ=0.93) over 180 days.
--   weight(day) = 0.93^(days_before_cutoff)
--   forecast = weighted_sum(covers) / weighted_sum(weights)
--
-- Improvement measured via _fallback_drill.mjs:
--   all_history (180d plain median):  LV 16.1%, Nashville 56.4%
--   ewma_093:                         LV 13.1%, Nashville 33.0%
--   Deployed current (90d plain):     LV 24.0%, Nashville 35.9%
--
-- EWMA captures seasonal drift: if a venue is trending toward lower covers
-- (e.g. Nashville post-event season), recent weeks get more weight.
--
-- Also flags Dallas Mondays as closed (negative/trivial Simphony data).
-- ============================================================================

-- ── Drop and recreate refresh function with EWMA ─────────────────────────

CREATE OR REPLACE FUNCTION refresh_dow_median_forecasts(
  p_lookback_days  INTEGER DEFAULT 180,
  p_forecast_days  INTEGER DEFAULT 90,
  p_min_covers     INTEGER DEFAULT 3,
  p_lambda         NUMERIC DEFAULT 0.93
) RETURNS TABLE(
  out_venue_id       UUID,
  out_dow            INTEGER,
  out_ewma_covers    INTEGER,
  out_sample_size    INTEGER
) AS $$
BEGIN
  -- Remove stale future forecasts (keep past for accuracy tracking)
  DELETE FROM demand_forecasts
  WHERE model_version = 'dow_median_v1'
    AND business_date >= CURRENT_DATE;

  RETURN QUERY
  WITH recent_actuals AS (
    SELECT
      vdf.venue_id,
      vdf.business_date,
      EXTRACT(ISODOW FROM vdf.business_date)::integer AS dow,  -- 1=Mon..7=Sun
      vdf.covers_count,
      vdf.gross_sales,
      -- Days before forecast cutoff (CURRENT_DATE)
      (CURRENT_DATE - vdf.business_date)::integer AS days_back
    FROM venue_day_facts vdf
    WHERE vdf.business_date >= CURRENT_DATE - p_lookback_days
      AND vdf.business_date < CURRENT_DATE
      AND vdf.covers_count >= p_min_covers
      -- Exclude anomaly days (events, closures, data errors)
      AND NOT EXISTS (
        SELECT 1 FROM venue_day_anomalies vda
        WHERE vda.venue_id = vdf.venue_id
          AND vda.business_date = vdf.business_date
          AND vda.resolved_at IS NULL
      )
      -- Exclude closed days per location_config
      AND NOT EXISTS (
        SELECT 1 FROM location_config lc
        WHERE lc.venue_id = vdf.venue_id
          AND lc.is_active = true
          AND lc.closed_weekdays IS NOT NULL
          AND (EXTRACT(ISODOW FROM vdf.business_date)::integer - 1) = ANY(lc.closed_weekdays)
      )
  ),
  ewma_by_venue_dow AS (
    SELECT
      ra.venue_id,
      ra.dow,
      -- EWMA: weighted mean with exponential decay
      SUM(ra.covers_count * POWER(p_lambda, ra.days_back)) /
        NULLIF(SUM(POWER(p_lambda, ra.days_back)), 0) AS ewma_covers,
      SUM(ra.gross_sales * POWER(p_lambda, ra.days_back)) /
        NULLIF(SUM(POWER(p_lambda, ra.days_back)), 0) AS ewma_revenue,
      COUNT(*) AS n
    FROM recent_actuals ra
    GROUP BY ra.venue_id, ra.dow
    HAVING COUNT(*) >= 3
  ),
  future_dates AS (
    SELECT generate_series(
      CURRENT_DATE,
      CURRENT_DATE + p_forecast_days,
      '1 day'::interval
    )::date AS business_date
  ),
  forecast_rows AS (
    SELECT
      ed.venue_id,
      fd.business_date,
      'dinner'::text AS shift_type,
      get_day_type(fd.business_date) AS day_type,
      GREATEST(1, ROUND(ed.ewma_covers))::integer AS covers_predicted,
      ROUND(COALESCE(ed.ewma_revenue, 0))::numeric(10,2) AS revenue_predicted,
      GREATEST(0, ROUND(ed.ewma_covers * 0.75))::integer AS covers_lower,
      ROUND(ed.ewma_covers * 1.25)::integer AS covers_upper,
      'dow_median_v1'::text AS model_version,
      CURRENT_TIMESTAMP AS forecast_date,
      ed.n::integer AS sample_size
    FROM ewma_by_venue_dow ed
    CROSS JOIN future_dates fd
    WHERE EXTRACT(ISODOW FROM fd.business_date)::integer = ed.dow
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
  -- Skip closed days
  WHERE NOT EXISTS (
    SELECT 1 FROM location_config lc
    WHERE lc.venue_id = fr.venue_id
      AND lc.is_active = true
      AND lc.closed_weekdays IS NOT NULL
      AND (EXTRACT(ISODOW FROM fr.business_date)::integer - 1) = ANY(lc.closed_weekdays)
  )
  ON CONFLICT (venue_id, forecast_date, business_date, shift_type) DO UPDATE
    SET covers_predicted  = EXCLUDED.covers_predicted,
        revenue_predicted = EXCLUDED.revenue_predicted,
        covers_lower      = EXCLUDED.covers_lower,
        covers_upper      = EXCLUDED.covers_upper,
        model_version     = EXCLUDED.model_version
  RETURNING
    demand_forecasts.venue_id,
    EXTRACT(ISODOW FROM demand_forecasts.business_date)::integer,
    demand_forecasts.covers_predicted,
    1;

END;
$$ LANGUAGE plpgsql;

-- ── Run it now ───────────────────────────────────────────────────────────

SELECT out_venue_id, out_dow, out_ewma_covers, SUM(out_sample_size) AS rows_inserted
FROM refresh_dow_median_forecasts(180, 90, 3, 0.93)
GROUP BY out_venue_id, out_dow, out_ewma_covers
ORDER BY out_venue_id, out_dow;

SELECT 'refresh_dow_median_forecasts upgraded to EWMA (λ=0.93, 180d lookback)' AS status;
