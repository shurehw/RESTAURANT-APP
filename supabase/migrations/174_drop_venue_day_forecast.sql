-- ============================================================================
-- DROP VENUE_DAY_FORECAST TABLE
-- Consolidating to demand_forecasts table only
-- ============================================================================

-- Drop dependent objects first
DROP VIEW IF EXISTS forecast_vs_actual CASCADE;
DROP FUNCTION IF EXISTS get_forecast_for_date(UUID, DATE) CASCADE;

-- Drop the tables
DROP TABLE IF EXISTS forecast_accuracy CASCADE;
DROP TABLE IF EXISTS venue_day_forecast CASCADE;

-- Note: demand_forecasts table (from 012_labor_forecasting_system.sql) is now
-- the sole forecast table with all fields:
--   - covers_predicted, covers_lower, covers_upper
--   - revenue_predicted
--   - reservation_covers_predicted, walkin_covers_predicted
--   - weather_forecast (JSONB)
--   - confidence_level, model_version, model_accuracy
--   - events (JSONB)

SELECT 'Dropped venue_day_forecast - using demand_forecasts only' as status;
