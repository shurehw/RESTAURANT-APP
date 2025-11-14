/**
 * Migration 059: Materialized View Refresh Cron Jobs
 * Purpose: Schedule automatic refresh of materialized views
 * Keeps dashboards and reports up-to-date without manual intervention
 */

-- ============================================================================
-- REFRESH FUNCTIONS
-- ============================================================================

-- Labor efficiency hourly refresh (every 15 minutes during business hours)
CREATE OR REPLACE FUNCTION refresh_labor_efficiency_hourly()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY labor_efficiency_hourly;
END;
$$ LANGUAGE plpgsql;

-- Labor efficiency daily refresh (every hour)
CREATE OR REPLACE FUNCTION refresh_labor_efficiency_daily()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY labor_efficiency_daily;
END;
$$ LANGUAGE plpgsql;

-- Daily performance refresh (every 30 minutes)
CREATE OR REPLACE FUNCTION refresh_daily_performance()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_performance;
END;
$$ LANGUAGE plpgsql;

-- Vendor performance refresh (every 6 hours)
CREATE OR REPLACE FUNCTION refresh_vendor_performance()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY vendor_performance;
END;
$$ LANGUAGE plpgsql;

-- Monthly savings summary refresh (every hour)
CREATE OR REPLACE FUNCTION refresh_monthly_savings()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_savings_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCHEDULE CRON JOBS
-- ============================================================================

-- Labor efficiency hourly: Refresh every 15 minutes (6am-midnight)
SELECT cron.schedule(
  'refresh-labor-efficiency-hourly',
  '*/15 6-23 * * *', -- Every 15 minutes from 6am to 11:59pm
  $$SELECT refresh_labor_efficiency_hourly();$$
);

-- Labor efficiency daily: Refresh every hour
SELECT cron.schedule(
  'refresh-labor-efficiency-daily',
  '0 * * * *', -- Every hour at minute 0
  $$SELECT refresh_labor_efficiency_daily();$$
);

-- Daily performance: Refresh every 30 minutes
SELECT cron.schedule(
  'refresh-daily-performance',
  '*/30 * * * *', -- Every 30 minutes
  $$SELECT refresh_daily_performance();$$
);

-- Vendor performance: Refresh every 6 hours
SELECT cron.schedule(
  'refresh-vendor-performance',
  '0 */6 * * *', -- Every 6 hours at minute 0
  $$SELECT refresh_vendor_performance();$$
);

-- Monthly savings: Refresh every hour
SELECT cron.schedule(
  'refresh-monthly-savings',
  '0 * * * *', -- Every hour at minute 0
  $$SELECT refresh_monthly_savings();$$
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION refresh_labor_efficiency_hourly IS 'Refreshes labor_efficiency_hourly materialized view';
COMMENT ON FUNCTION refresh_labor_efficiency_daily IS 'Refreshes labor_efficiency_daily materialized view';
COMMENT ON FUNCTION refresh_daily_performance IS 'Refreshes daily_performance materialized view';
COMMENT ON FUNCTION refresh_vendor_performance IS 'Refreshes vendor_performance materialized view';
COMMENT ON FUNCTION refresh_monthly_savings IS 'Refreshes monthly_savings_summary materialized view';
