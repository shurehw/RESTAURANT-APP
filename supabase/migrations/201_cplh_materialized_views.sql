-- Migration 201: CPLH Materialized Views
-- Purpose: Create materialized views for historical CPLH analysis and service quality metrics
-- Date: 2026-02-05

-- =====================================================
-- MATERIALIZED VIEW 1: CPLH by Position and Shift
-- =====================================================
-- Historical covers per labor hour by position, shift type, and day of week
-- Used to calculate data-driven CPLH targets

CREATE MATERIALIZED VIEW IF NOT EXISTS cplh_by_position_shift AS
SELECT
  sa.venue_id,
  p.id as position_id,
  p.name as position_name,
  p.category as position_category,

  -- Date and shift information
  sa.business_date,
  EXTRACT(DOW FROM sa.business_date)::INTEGER as day_of_week,
  sa.shift_type,

  -- Aggregated labor metrics
  COUNT(DISTINCT sa.id) as shift_count,
  COUNT(DISTINCT sa.employee_id) as employee_count,
  SUM(sa.scheduled_hours) as total_labor_hours,
  SUM(sa.shift_cost) as total_labor_cost,

  -- Covers served (from actual_shifts_worked or POS data)
  SUM(COALESCE(asw.covers_served, 0)) as total_covers,
  AVG(COALESCE(asw.covers_served, 0)) as avg_covers_per_employee,

  -- CPLH calculation
  CASE
    WHEN SUM(sa.scheduled_hours) > 0 THEN
      SUM(COALESCE(asw.covers_served, 0))::NUMERIC / SUM(sa.scheduled_hours)
    ELSE NULL
  END as covers_per_labor_hour,

  -- Service quality proxies
  AVG(COALESCE(asw.customer_complaints, 0)) as avg_complaints,
  AVG(COALESCE(asw.avg_check, 0)) as avg_check,

  -- Revenue metrics
  SUM(COALESCE(asw.total_compensation, 0)) as total_compensation,

  -- Data quality
  COUNT(*) FILTER (WHERE asw.covers_served IS NOT NULL) as records_with_actual_data,

  -- Last updated
  MAX(sa.updated_at) as last_updated

FROM shift_assignments sa
JOIN positions p ON sa.position_id = p.id
LEFT JOIN actual_shifts_worked asw ON
  asw.employee_id = sa.employee_id AND
  asw.business_date = sa.business_date AND
  asw.shift_type = sa.shift_type

WHERE sa.status IN ('completed', 'confirmed')
  AND sa.business_date IS NOT NULL
  AND sa.shift_type IS NOT NULL
  AND sa.scheduled_hours > 0

GROUP BY
  sa.venue_id,
  p.id,
  p.name,
  p.category,
  sa.business_date,
  EXTRACT(DOW FROM sa.business_date),
  sa.shift_type;

-- Create unique index on materialized view
CREATE UNIQUE INDEX idx_cplh_position_shift_unique
  ON cplh_by_position_shift(venue_id, position_id, business_date, shift_type);

-- Create additional indexes for common queries
CREATE INDEX idx_cplh_position_shift_venue
  ON cplh_by_position_shift(venue_id, business_date DESC);

CREATE INDEX idx_cplh_position_shift_position
  ON cplh_by_position_shift(position_id, shift_type, day_of_week);

CREATE INDEX idx_cplh_position_shift_dow
  ON cplh_by_position_shift(day_of_week, shift_type);

COMMENT ON MATERIALIZED VIEW cplh_by_position_shift IS 'Historical covers per labor hour by position, shift, and day of week for target setting';
COMMENT ON COLUMN cplh_by_position_shift.covers_per_labor_hour IS 'Actual CPLH achieved (covers / labor hours)';
COMMENT ON COLUMN cplh_by_position_shift.records_with_actual_data IS 'Count of records with actual covers data (data quality indicator)';

-- =====================================================
-- MATERIALIZED VIEW 2: Service Quality Metrics
-- =====================================================
-- Daily service quality scores based on staffing ratios

CREATE MATERIALIZED VIEW IF NOT EXISTS service_quality_metrics AS
SELECT
  sa.venue_id,
  sa.business_date,
  sa.shift_type,

  -- Staffing counts by position
  COUNT(DISTINCT sa.id) FILTER (WHERE p.category = 'front_of_house' AND p.name = 'Server') as server_count,
  COUNT(DISTINCT sa.id) FILTER (WHERE p.category = 'front_of_house' AND p.name = 'Busser') as busser_count,
  COUNT(DISTINCT sa.id) FILTER (WHERE p.category = 'front_of_house' AND p.name = 'Food Runner') as runner_count,
  COUNT(DISTINCT sa.id) FILTER (WHERE p.category = 'back_of_house') as boh_count,
  COUNT(DISTINCT sa.id) as total_staff_count,

  -- Total labor hours and cost
  SUM(sa.scheduled_hours) as total_labor_hours,
  SUM(sa.shift_cost) as total_labor_cost,

  -- Covers from actual performance
  SUM(COALESCE(asw.covers_served, dh.covers, 0)) as total_covers,
  AVG(COALESCE(asw.avg_check, dh.avg_check, 0)) as avg_check,

  -- Revenue
  SUM(COALESCE(asw.covers_served, dh.covers, 0)) *
  AVG(COALESCE(asw.avg_check, dh.avg_check, 0)) as estimated_revenue,

  -- Staffing ratios
  CASE
    WHEN COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Server') > 0 THEN
      SUM(COALESCE(asw.covers_served, dh.covers, 0))::NUMERIC /
      COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Server')
    ELSE NULL
  END as covers_per_server,

  CASE
    WHEN COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Server') > 0 THEN
      COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Busser')::NUMERIC /
      COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Server')::NUMERIC
    ELSE NULL
  END as busser_to_server_ratio,

  CASE
    WHEN COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Server') > 0 THEN
      COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Food Runner')::NUMERIC /
      COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Server')::NUMERIC
    ELSE NULL
  END as runner_to_server_ratio,

  -- Service quality score (simplified calculation)
  -- Component 1: Server coverage (40%) - ideal is 12 covers per server
  -- Component 2: Support ratios (30%) - ideal busser:server = 0.5
  -- Component 3: Staffing adequacy (30%) - based on total hours vs covers
  CASE
    WHEN COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Server') > 0 AND
         SUM(COALESCE(asw.covers_served, dh.covers, 0)) > 0 THEN
      (
        -- Server coverage score (0-1): higher when covers/server is closer to 12
        LEAST(1.0, 12.0 / NULLIF(
          SUM(COALESCE(asw.covers_served, dh.covers, 0))::NUMERIC /
          COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Server'),
          0
        )) * 0.4 +

        -- Support ratio score (0-1): higher when busser:server ratio >= 0.5
        LEAST(1.0,
          COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Busser')::NUMERIC /
          NULLIF(COUNT(DISTINCT sa.id) FILTER (WHERE p.name = 'Server')::NUMERIC, 0) / 0.5
        ) * 0.3 +

        -- Staffing adequacy score (0-1): based on labor hours per cover
        -- Target: ~0.1 hours per cover for full service
        LEAST(1.0,
          (SUM(sa.scheduled_hours) / NULLIF(SUM(COALESCE(asw.covers_served, dh.covers, 0)), 0)) / 0.1
        ) * 0.3
      )
    ELSE NULL
  END as service_quality_score,

  -- Customer feedback
  SUM(COALESCE(asw.customer_complaints, 0)) as total_complaints,
  AVG(COALESCE(asw.performance_rating, 0)) as avg_employee_performance,

  -- Last updated
  MAX(sa.updated_at) as last_updated

FROM shift_assignments sa
JOIN positions p ON sa.position_id = p.id
LEFT JOIN actual_shifts_worked asw ON
  asw.employee_id = sa.employee_id AND
  asw.business_date = sa.business_date AND
  asw.shift_type = sa.shift_type
LEFT JOIN demand_history dh ON
  dh.venue_id = sa.venue_id AND
  dh.business_date = sa.business_date AND
  dh.shift_type = sa.shift_type

WHERE sa.status IN ('completed', 'confirmed')
  AND sa.business_date IS NOT NULL
  AND sa.shift_type IS NOT NULL

GROUP BY
  sa.venue_id,
  sa.business_date,
  sa.shift_type;

-- Create unique index
CREATE UNIQUE INDEX idx_service_quality_unique
  ON service_quality_metrics(venue_id, business_date, shift_type);

-- Create additional indexes
CREATE INDEX idx_service_quality_venue_date
  ON service_quality_metrics(venue_id, business_date DESC);

CREATE INDEX idx_service_quality_score
  ON service_quality_metrics(service_quality_score DESC NULLS LAST);

COMMENT ON MATERIALIZED VIEW service_quality_metrics IS 'Daily service quality scores based on staffing ratios and performance';
COMMENT ON COLUMN service_quality_metrics.covers_per_server IS 'Average covers handled per server (quality indicator)';
COMMENT ON COLUMN service_quality_metrics.service_quality_score IS 'Composite quality score (0-1) based on server coverage, support ratios, and staffing adequacy';

-- =====================================================
-- REFRESH FUNCTIONS
-- =====================================================

-- Function to refresh CPLH materialized view
CREATE OR REPLACE FUNCTION refresh_cplh_by_position_shift()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY cplh_by_position_shift;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_cplh_by_position_shift IS 'Refresh CPLH materialized view (use CONCURRENTLY for non-blocking refresh)';

-- Function to refresh service quality materialized view
CREATE OR REPLACE FUNCTION refresh_service_quality_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY service_quality_metrics;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_service_quality_metrics IS 'Refresh service quality metrics materialized view';

-- Function to refresh all labor optimization materialized views
CREATE OR REPLACE FUNCTION refresh_labor_optimization_views()
RETURNS void AS $$
BEGIN
  PERFORM refresh_cplh_by_position_shift();
  PERFORM refresh_service_quality_metrics();

  RAISE NOTICE 'All labor optimization materialized views refreshed successfully';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_labor_optimization_views IS 'Refresh all labor optimization materialized views in one call';

-- =====================================================
-- SCHEDULED REFRESH (using pg_cron if available)
-- =====================================================

-- Note: This requires pg_cron extension
-- If pg_cron is not available, create a manual cron job or scheduled task

DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule hourly refresh during business hours (8 AM - 11 PM)
    PERFORM cron.schedule(
      'refresh_labor_optimization_views',
      '0 8-23 * * *',  -- Every hour from 8 AM to 11 PM
      $$SELECT refresh_labor_optimization_views()$$
    );

    RAISE NOTICE 'Scheduled hourly refresh of labor optimization views (8 AM - 11 PM)';
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Please manually schedule view refreshes.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule automatic view refresh: %. Please manually schedule view refreshes.', SQLERRM;
END;
$$;

-- =====================================================
-- ANALYTICS HELPER FUNCTIONS
-- =====================================================

-- Function to calculate CPLH percentiles for target setting
CREATE OR REPLACE FUNCTION calculate_cplh_percentiles(
  p_venue_id UUID,
  p_position_id UUID,
  p_shift_type TEXT DEFAULT NULL,
  p_day_of_week INTEGER DEFAULT NULL,
  p_lookback_days INTEGER DEFAULT 180
)
RETURNS TABLE (
  position_name TEXT,
  shift_type TEXT,
  day_of_week INTEGER,
  sample_size BIGINT,
  p25_cplh NUMERIC,
  p50_cplh NUMERIC,
  p75_cplh NUMERIC,
  p90_cplh NUMERIC,
  avg_cplh NUMERIC,
  min_cplh NUMERIC,
  max_cplh NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.position_name,
    c.shift_type,
    c.day_of_week,
    COUNT(*) as sample_size,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY c.covers_per_labor_hour) as p25_cplh,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY c.covers_per_labor_hour) as p50_cplh,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY c.covers_per_labor_hour) as p75_cplh,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY c.covers_per_labor_hour) as p90_cplh,
    AVG(c.covers_per_labor_hour) as avg_cplh,
    MIN(c.covers_per_labor_hour) as min_cplh,
    MAX(c.covers_per_labor_hour) as max_cplh
  FROM cplh_by_position_shift c
  WHERE c.venue_id = p_venue_id
    AND c.position_id = p_position_id
    AND (p_shift_type IS NULL OR c.shift_type = p_shift_type)
    AND (p_day_of_week IS NULL OR c.day_of_week = p_day_of_week)
    AND c.business_date >= CURRENT_DATE - p_lookback_days
    AND c.covers_per_labor_hour IS NOT NULL
    AND c.covers_per_labor_hour > 0
  GROUP BY c.position_name, c.shift_type, c.day_of_week
  HAVING COUNT(*) >= 5  -- Minimum 5 data points for statistical validity
  ORDER BY c.shift_type, c.day_of_week;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_cplh_percentiles IS 'Calculate CPLH percentiles for setting data-driven targets (p25=min, p50=target, p75=optimal, p90=max)';

-- Function to get service quality trend
CREATE OR REPLACE FUNCTION get_service_quality_trend(
  p_venue_id UUID,
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  business_date DATE,
  shift_type TEXT,
  service_quality_score NUMERIC,
  covers_per_server NUMERIC,
  busser_to_server_ratio NUMERIC,
  total_covers NUMERIC,
  total_staff_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sqm.business_date,
    sqm.shift_type,
    sqm.service_quality_score,
    sqm.covers_per_server,
    sqm.busser_to_server_ratio,
    sqm.total_covers,
    sqm.total_staff_count
  FROM service_quality_metrics sqm
  WHERE sqm.venue_id = p_venue_id
    AND sqm.business_date >= CURRENT_DATE - p_days_back
  ORDER BY sqm.business_date DESC, sqm.shift_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_service_quality_trend IS 'Get service quality trend over last N days';

-- =====================================================
-- INITIAL REFRESH
-- =====================================================

-- Perform initial refresh of materialized views
SELECT refresh_labor_optimization_views();
