-- ============================================================================
-- FIX: compute_sales_risk crashes when venue_day_forecast doesn't exist
-- Wrap forecast lookup in exception handler so it degrades gracefully.
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_sales_risk(
  p_venue_id uuid,
  p_date date
)
RETURNS TABLE(risk numeric, confidence numeric, reason text, raw_inputs jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  v_actual numeric;
  v_forecast numeric;
  v_variance numeric;
  v_risk numeric;
BEGIN
  -- Actual net sales from venue_day_facts
  SELECT net_sales INTO v_actual
  FROM venue_day_facts
  WHERE venue_id = p_venue_id AND business_date = p_date;

  -- Forecast from venue_day_forecast (may not exist yet)
  BEGIN
    SELECT yhat INTO v_forecast
    FROM venue_day_forecast
    WHERE venue_id = p_venue_id
      AND business_date = p_date
      AND forecast_type = 'net_sales'
    ORDER BY generated_at DESC
    LIMIT 1;
  EXCEPTION WHEN undefined_table THEN
    v_forecast := NULL;
  END;

  IF v_forecast IS NULL OR v_forecast = 0 THEN
    -- No forecast available — return low-confidence zero risk
    RETURN QUERY SELECT
      0::numeric,
      CASE WHEN v_actual IS NOT NULL THEN 0.3::numeric ELSE 0.1::numeric END,
      CASE
        WHEN v_actual IS NOT NULL THEN format('Actual $%s — no forecast to compare', ROUND(v_actual))
        ELSE 'No sales or forecast data'::text
      END,
      jsonb_build_object('actual', v_actual, 'forecast', v_forecast);
    RETURN;
  END IF;

  v_variance := (v_actual - v_forecast) / v_forecast;

  -- Hits hard on downside, ignores upside
  v_risk := clamp01(GREATEST(0, -v_variance) / 0.20);

  RETURN QUERY SELECT
    ROUND(v_risk, 4),
    CASE WHEN v_actual IS NULL THEN 0.3::numeric ELSE 1.0::numeric END,
    format('Actual $%s vs Forecast $%s (%s%%)',
      ROUND(v_actual), ROUND(v_forecast), ROUND(v_variance * 100, 1)),
    jsonb_build_object('actual', v_actual, 'forecast', v_forecast, 'variance_pct', ROUND(v_variance * 100, 2));
END;
$$;
