/**
 * Migration 037: Labor Efficiency Materialized View
 * Purpose: Hourly labor metrics (SPLH, labor cost %)
 * Refresh: Hourly during service (11am-11pm via pg_cron)
 */

-- Labor Efficiency Hourly: Aggregated labor metrics by hour
CREATE MATERIALIZED VIEW IF NOT EXISTS labor_efficiency_hourly AS
SELECT
  DATE_TRUNC('hour', sa.shift_start)::TIMESTAMPTZ as hour,
  sa.venue_id,
  v.name as venue_name,
  COUNT(DISTINCT sa.id) as shift_count,
  SUM(
    EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600
  ) as total_labor_hours,
  SUM(
    (EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) * p.hourly_rate
  ) as labor_cost,
  COALESCE(SUM(ps.amount), 0) as revenue,
  CASE
    WHEN SUM(ps.amount) > 0 THEN
      (SUM((EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) * p.hourly_rate) / SUM(ps.amount)) * 100
    ELSE NULL
  END as labor_cost_pct,
  CASE
    WHEN SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) > 0 THEN
      SUM(ps.amount) / SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600)
    ELSE NULL
  END as sales_per_labor_hour,
  COUNT(DISTINCT ps.id) as transaction_count,
  MAX(sa.updated_at) as last_updated
FROM shift_assignments sa
JOIN venues v ON sa.venue_id = v.id
JOIN positions p ON sa.position_id = p.id
LEFT JOIN pos_sales ps ON ps.venue_id = sa.venue_id
  AND ps.sale_timestamp >= DATE_TRUNC('hour', sa.shift_start)
  AND ps.sale_timestamp < DATE_TRUNC('hour', sa.shift_start) + INTERVAL '1 hour'
WHERE sa.shift_start IS NOT NULL
  AND sa.shift_end IS NOT NULL
  AND sa.shift_end > sa.shift_start
GROUP BY DATE_TRUNC('hour', sa.shift_start), sa.venue_id, v.name;

-- Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_labor_efficiency_hourly_unique
  ON labor_efficiency_hourly(venue_id, hour);

CREATE INDEX IF NOT EXISTS idx_labor_efficiency_hourly_hour
  ON labor_efficiency_hourly(hour DESC);

CREATE INDEX IF NOT EXISTS idx_labor_efficiency_hourly_venue_id
  ON labor_efficiency_hourly(venue_id);

-- Labor Efficiency Daily: Aggregated daily labor metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS labor_efficiency_daily AS
SELECT
  sa.venue_id,
  v.name as venue_name,
  DATE(sa.shift_start) as business_date,
  COUNT(DISTINCT sa.id) as shift_count,
  COUNT(DISTINCT sa.user_id) as employee_count,
  SUM(
    EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600
  ) as total_labor_hours,
  SUM(
    (EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) * p.hourly_rate
  ) as labor_cost,
  AVG(p.hourly_rate) as avg_hourly_rate,
  COALESCE(SUM(ps.amount), 0) as revenue,
  CASE
    WHEN SUM(ps.amount) > 0 THEN
      (SUM((EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) * p.hourly_rate) / SUM(ps.amount)) * 100
    ELSE NULL
  END as labor_cost_pct,
  CASE
    WHEN SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) > 0 THEN
      SUM(ps.amount) / SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600)
    ELSE NULL
  END as sales_per_labor_hour,
  COUNT(DISTINCT ps.id) as transaction_count,
  MAX(sa.updated_at) as last_updated
FROM shift_assignments sa
JOIN venues v ON sa.venue_id = v.id
JOIN positions p ON sa.position_id = p.id
LEFT JOIN pos_sales ps ON ps.venue_id = sa.venue_id
  AND DATE(ps.sale_timestamp) = DATE(sa.shift_start)
WHERE sa.shift_start IS NOT NULL
  AND sa.shift_end IS NOT NULL
  AND sa.shift_end > sa.shift_start
GROUP BY sa.venue_id, v.name, DATE(sa.shift_start);

-- Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_labor_efficiency_daily_unique
  ON labor_efficiency_daily(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_labor_efficiency_daily_business_date
  ON labor_efficiency_daily(business_date DESC);

CREATE INDEX IF NOT EXISTS idx_labor_efficiency_daily_venue_id
  ON labor_efficiency_daily(venue_id);

-- Function to refresh labor efficiency views
CREATE OR REPLACE FUNCTION refresh_labor_efficiency_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY labor_efficiency_hourly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY labor_efficiency_daily;
END;
$$ LANGUAGE plpgsql;

COMMENT ON MATERIALIZED VIEW labor_efficiency_hourly IS 'Hourly labor metrics: hours, cost, SPLH, labor cost %. Refreshed hourly during service.';
COMMENT ON MATERIALIZED VIEW labor_efficiency_daily IS 'Daily labor metrics aggregated from shift assignments and POS sales';
COMMENT ON FUNCTION refresh_labor_efficiency_views IS 'Refresh both hourly and daily labor efficiency materialized views';
