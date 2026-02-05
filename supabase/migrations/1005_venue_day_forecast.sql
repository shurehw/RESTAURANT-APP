-- ============================================================================
-- VENUE DAY FORECAST TABLE
-- Stores Prophet model predictions for net_sales and covers by venue
-- ============================================================================

-- ============================================================================
-- 1. FORECAST TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS venue_day_forecast (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- Forecast type: 'net_sales' or 'covers'
  forecast_type TEXT NOT NULL CHECK (forecast_type IN ('net_sales', 'covers')),

  -- Prophet predictions
  yhat NUMERIC(14,2) NOT NULL,          -- Point estimate
  yhat_lower NUMERIC(14,2) NOT NULL,    -- Lower bound (default 80% interval)
  yhat_upper NUMERIC(14,2) NOT NULL,    -- Upper bound
  trend NUMERIC(14,2),                  -- Trend component (optional)

  -- Model metadata
  model_version TEXT NOT NULL,          -- e.g., 'prophet_v1_baseline'
  training_days INTEGER,                -- How many days of history used

  -- Timestamps
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint: one forecast per venue/date/type/version
  UNIQUE(venue_id, business_date, forecast_type, model_version)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_forecast_venue_date
  ON venue_day_forecast(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_type
  ON venue_day_forecast(forecast_type, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_generated
  ON venue_day_forecast(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_future
  ON venue_day_forecast(business_date)
  WHERE business_date >= CURRENT_DATE;

COMMENT ON TABLE venue_day_forecast IS
  'Prophet ML model forecasts for net sales and covers by venue';

-- ============================================================================
-- 2. FORECAST ACCURACY TABLE (track model performance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecast_accuracy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Which forecast
  forecast_type TEXT NOT NULL CHECK (forecast_type IN ('net_sales', 'covers')),
  model_version TEXT NOT NULL,

  -- Accuracy metrics (computed weekly)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Error metrics
  mape NUMERIC(6,4),                    -- Mean Absolute Percentage Error
  mae NUMERIC(14,2),                    -- Mean Absolute Error
  rmse NUMERIC(14,2),                   -- Root Mean Square Error
  median_error NUMERIC(14,2),

  -- Coverage (% of actuals within prediction interval)
  interval_coverage NUMERIC(5,2),       -- e.g., 82.5 = 82.5% of actuals in [yhat_lower, yhat_upper]

  -- Sample size
  days_evaluated INTEGER NOT NULL,

  -- Timestamps
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(venue_id, forecast_type, model_version, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_accuracy_venue
  ON forecast_accuracy(venue_id, forecast_type, computed_at DESC);

COMMENT ON TABLE forecast_accuracy IS
  'Weekly tracking of forecast model accuracy vs actuals';

-- ============================================================================
-- 3. VIEW: FORECAST VS ACTUAL
-- ============================================================================

CREATE OR REPLACE VIEW forecast_vs_actual AS
SELECT
  f.venue_id,
  v.name as venue_name,
  f.business_date,
  f.forecast_type,
  f.yhat as predicted,
  f.yhat_lower as predicted_lower,
  f.yhat_upper as predicted_upper,

  -- Actual values from venue_day_facts
  CASE
    WHEN f.forecast_type = 'net_sales' THEN vdf.net_sales
    WHEN f.forecast_type = 'covers' THEN vdf.covers_count::numeric
  END as actual,

  -- Error calculations
  CASE
    WHEN f.forecast_type = 'net_sales' THEN f.yhat - vdf.net_sales
    WHEN f.forecast_type = 'covers' THEN f.yhat - vdf.covers_count::numeric
  END as error,

  CASE
    WHEN f.forecast_type = 'net_sales' AND vdf.net_sales > 0
      THEN ABS(f.yhat - vdf.net_sales) / vdf.net_sales * 100
    WHEN f.forecast_type = 'covers' AND vdf.covers_count > 0
      THEN ABS(f.yhat - vdf.covers_count::numeric) / vdf.covers_count * 100
  END as abs_pct_error,

  -- Was actual within prediction interval?
  CASE
    WHEN f.forecast_type = 'net_sales'
      THEN vdf.net_sales BETWEEN f.yhat_lower AND f.yhat_upper
    WHEN f.forecast_type = 'covers'
      THEN vdf.covers_count::numeric BETWEEN f.yhat_lower AND f.yhat_upper
  END as within_interval,

  f.model_version,
  f.generated_at

FROM venue_day_forecast f
JOIN venues v ON v.id = f.venue_id
LEFT JOIN venue_day_facts vdf
  ON vdf.venue_id = f.venue_id
  AND vdf.business_date = f.business_date
WHERE f.model_version = (
  -- Use latest model version
  SELECT model_version
  FROM venue_day_forecast
  WHERE venue_id = f.venue_id
  ORDER BY generated_at DESC
  LIMIT 1
);

COMMENT ON VIEW forecast_vs_actual IS
  'Compare Prophet forecasts to actual venue performance';

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE venue_day_forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_accuracy ENABLE ROW LEVEL SECURITY;

-- venue_day_forecast policies
CREATE POLICY "Users can view forecasts for their venues"
  ON venue_day_forecast FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

CREATE POLICY "Service role can manage forecasts"
  ON venue_day_forecast FOR ALL
  USING (auth.role() = 'service_role');

-- forecast_accuracy policies
CREATE POLICY "Users can view accuracy for their venues"
  ON forecast_accuracy FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

CREATE POLICY "Service role can manage accuracy"
  ON forecast_accuracy FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 5. FUNCTION: Get forecast for entertainment budgeting
-- ============================================================================

CREATE OR REPLACE FUNCTION get_forecast_for_date(
  p_venue_id UUID,
  p_business_date DATE
)
RETURNS TABLE (
  net_sales_yhat NUMERIC,
  net_sales_lower NUMERIC,
  net_sales_upper NUMERIC,
  covers_yhat NUMERIC,
  covers_lower NUMERIC,
  covers_upper NUMERIC,
  uncertainty_pct NUMERIC,
  budget_basis TEXT
) AS $$
DECLARE
  v_sales RECORD;
  v_covers RECORD;
  v_uncertainty NUMERIC;
BEGIN
  -- Get latest net_sales forecast
  SELECT yhat, yhat_lower, yhat_upper INTO v_sales
  FROM venue_day_forecast
  WHERE venue_id = p_venue_id
    AND business_date = p_business_date
    AND forecast_type = 'net_sales'
  ORDER BY generated_at DESC
  LIMIT 1;

  -- Get latest covers forecast
  SELECT yhat, yhat_lower, yhat_upper INTO v_covers
  FROM venue_day_forecast
  WHERE venue_id = p_venue_id
    AND business_date = p_business_date
    AND forecast_type = 'covers'
  ORDER BY generated_at DESC
  LIMIT 1;

  -- Calculate uncertainty for budget basis decision
  IF v_sales IS NOT NULL AND v_sales.yhat > 0 THEN
    v_uncertainty := (v_sales.yhat_upper - v_sales.yhat_lower) / v_sales.yhat;
  ELSE
    v_uncertainty := 1; -- Max uncertainty if no forecast
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_sales.yhat, 0),
    COALESCE(v_sales.yhat_lower, 0),
    COALESCE(v_sales.yhat_upper, 0),
    COALESCE(v_covers.yhat, 0),
    COALESCE(v_covers.yhat_lower, 0),
    COALESCE(v_covers.yhat_upper, 0),
    ROUND(v_uncertainty * 100, 1),
    CASE
      WHEN v_uncertainty <= 0.20 THEN 'yhat'         -- Use point estimate
      WHEN v_uncertainty <= 0.35 THEN 'yhat_90pct'   -- Use 90% of yhat
      ELSE 'yhat_lower'                              -- Use conservative lower bound
    END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_forecast_for_date IS
  'Get forecast values with budget basis recommendation based on uncertainty';

SELECT 'venue_day_forecast table created successfully' as status;
