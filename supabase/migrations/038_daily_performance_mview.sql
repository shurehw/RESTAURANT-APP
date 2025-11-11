/**
 * Migration 038: Daily Performance Materialized View
 * Purpose: Real-time daily P&L (sales, COGS, labor, prime cost)
 * Refresh: Every 15 minutes during service (11am-11pm)
 */

-- Daily Performance: Complete P&L by venue and business date
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_performance AS
SELECT
  v.id as venue_id,
  v.name as venue_name,
  DATE(ps.sale_timestamp) as business_date,

  -- Sales Metrics
  COUNT(DISTINCT ps.id) as transaction_count,
  SUM(ps.amount) as gross_sales,
  AVG(ps.amount) as avg_ticket,

  -- COGS Metrics
  SUM(COALESCE(ps.cogs, 0)) as total_cogs,
  CASE
    WHEN SUM(ps.amount) > 0 THEN
      (SUM(COALESCE(ps.cogs, 0)) / SUM(ps.amount)) * 100
    ELSE NULL
  END as cogs_pct,

  -- Labor Metrics (from daily view)
  COALESCE(led.labor_cost, 0) as labor_cost,
  COALESCE(led.total_labor_hours, 0) as labor_hours,
  CASE
    WHEN SUM(ps.amount) > 0 THEN
      (COALESCE(led.labor_cost, 0) / SUM(ps.amount)) * 100
    ELSE NULL
  END as labor_pct,

  -- Prime Cost
  (SUM(COALESCE(ps.cogs, 0)) + COALESCE(led.labor_cost, 0)) as prime_cost,
  CASE
    WHEN SUM(ps.amount) > 0 THEN
      ((SUM(COALESCE(ps.cogs, 0)) + COALESCE(led.labor_cost, 0)) / SUM(ps.amount)) * 100
    ELSE NULL
  END as prime_cost_pct,

  -- Gross Profit
  (SUM(ps.amount) - SUM(COALESCE(ps.cogs, 0)) - COALESCE(led.labor_cost, 0)) as gross_profit,
  CASE
    WHEN SUM(ps.amount) > 0 THEN
      ((SUM(ps.amount) - SUM(COALESCE(ps.cogs, 0)) - COALESCE(led.labor_cost, 0)) / SUM(ps.amount)) * 100
    ELSE NULL
  END as gross_profit_pct,

  -- Employee Metrics
  COALESCE(led.employee_count, 0) as employee_count,
  COALESCE(led.shift_count, 0) as shift_count,

  -- SPLH
  CASE
    WHEN COALESCE(led.total_labor_hours, 0) > 0 THEN
      SUM(ps.amount) / led.total_labor_hours
    ELSE NULL
  END as sales_per_labor_hour,

  MAX(ps.sale_timestamp) as last_sale_at,
  NOW() as last_refreshed_at

FROM venues v
LEFT JOIN pos_sales ps ON ps.venue_id = v.id
LEFT JOIN labor_efficiency_daily led ON led.venue_id = v.id
  AND led.business_date = DATE(ps.sale_timestamp)
WHERE v.is_active = true
  AND ps.sale_timestamp >= CURRENT_DATE - INTERVAL '90 days' -- Keep 90 days
GROUP BY
  v.id,
  v.name,
  DATE(ps.sale_timestamp),
  led.labor_cost,
  led.total_labor_hours,
  led.employee_count,
  led.shift_count;

-- Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_performance_unique
  ON daily_performance(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_daily_performance_business_date
  ON daily_performance(business_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_performance_venue_id
  ON daily_performance(venue_id);

CREATE INDEX IF NOT EXISTS idx_daily_performance_prime_cost_pct
  ON daily_performance(prime_cost_pct DESC NULLS LAST)
  WHERE prime_cost_pct IS NOT NULL;

-- Function to refresh daily performance
CREATE OR REPLACE FUNCTION refresh_daily_performance()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_performance;
END;
$$ LANGUAGE plpgsql;

-- View: Recent Performance (last 7 days, real-time, no cache)
CREATE OR REPLACE VIEW recent_performance AS
SELECT
  v.id as venue_id,
  v.name as venue_name,
  DATE(ps.sale_timestamp) as business_date,
  COUNT(DISTINCT ps.id) as transaction_count,
  SUM(ps.amount) as gross_sales,
  AVG(ps.amount) as avg_ticket,
  SUM(COALESCE(ps.cogs, 0)) as total_cogs,
  CASE
    WHEN SUM(ps.amount) > 0 THEN
      (SUM(COALESCE(ps.cogs, 0)) / SUM(ps.amount)) * 100
    ELSE NULL
  END as cogs_pct,
  COALESCE(led.labor_cost, 0) as labor_cost,
  COALESCE(led.total_labor_hours, 0) as labor_hours,
  CASE
    WHEN SUM(ps.amount) > 0 THEN
      (COALESCE(led.labor_cost, 0) / SUM(ps.amount)) * 100
    ELSE NULL
  END as labor_pct,
  (SUM(COALESCE(ps.cogs, 0)) + COALESCE(led.labor_cost, 0)) as prime_cost,
  CASE
    WHEN SUM(ps.amount) > 0 THEN
      ((SUM(COALESCE(ps.cogs, 0)) + COALESCE(led.labor_cost, 0)) / SUM(ps.amount)) * 100
    ELSE NULL
  END as prime_cost_pct,
  NOW() as calculated_at
FROM venues v
LEFT JOIN pos_sales ps ON ps.venue_id = v.id
  AND ps.sale_timestamp >= CURRENT_DATE - INTERVAL '7 days'
LEFT JOIN labor_efficiency_daily led ON led.venue_id = v.id
  AND led.business_date = DATE(ps.sale_timestamp)
WHERE v.is_active = true
GROUP BY
  v.id,
  v.name,
  DATE(ps.sale_timestamp),
  led.labor_cost,
  led.total_labor_hours
ORDER BY business_date DESC, venue_name;

COMMENT ON MATERIALIZED VIEW daily_performance IS 'Daily P&L with sales, COGS, labor, prime cost. Refreshed every 15min during service.';
COMMENT ON VIEW recent_performance IS 'Real-time performance data for last 7 days (no caching)';
COMMENT ON FUNCTION refresh_daily_performance IS 'Refresh daily performance materialized view';
