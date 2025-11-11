/**
 * Migration 042: pg_cron Jobs
 * Purpose: Schedule automated tasks for materialized view refresh
 * Note: Requires pg_cron extension enabled in Supabase
 */

-- Enable pg_cron extension (may require Supabase project settings)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant permissions to execute cron jobs
GRANT USAGE ON SCHEMA cron TO postgres;

-- Job 1: Refresh labor_efficiency views every hour during service (11am-11pm)
SELECT cron.schedule(
  'refresh-labor-efficiency-hourly',
  '0 11-23 * * *', -- Every hour from 11am to 11pm
  $$SELECT refresh_labor_efficiency_views()$$
);

-- Job 2: Refresh daily_performance every 15 minutes during service (11am-11pm)
SELECT cron.schedule(
  'refresh-daily-performance-15min',
  '*/15 11-23 * * *', -- Every 15 minutes from 11am to 11pm
  $$SELECT refresh_daily_performance()$$
);

-- Job 3: Refresh vendor_performance daily at 6am
SELECT cron.schedule(
  'refresh-vendor-performance-daily',
  '0 6 * * *', -- Every day at 6am
  $$SELECT refresh_vendor_performance()$$
);

-- Job 4: Clean up old alerts (acknowledged and older than 90 days)
SELECT cron.schedule(
  'cleanup-old-alerts',
  '0 3 * * 0', -- Every Sunday at 3am
  $$
    DELETE FROM alerts
    WHERE acknowledged = true
      AND acknowledged_at < NOW() - INTERVAL '90 days'
  $$
);

-- Job 5: Clean up old item_cost_history (older than 2 years)
SELECT cron.schedule(
  'cleanup-old-cost-history',
  '0 4 * * 0', -- Every Sunday at 4am
  $$
    DELETE FROM item_cost_history
    WHERE effective_date < NOW() - INTERVAL '2 years'
  $$
);

-- Job 6: Generate daily budget entries for next 7 days (if using template-based budgets)
-- This is a placeholder - actual implementation would depend on budget generation logic
SELECT cron.schedule(
  'generate-future-budgets',
  '0 1 * * *', -- Every day at 1am
  $$
    -- Placeholder for budget generation logic
    -- Would copy from templates or historical averages
    SELECT 1
  $$
);

-- Function to list all active cron jobs
CREATE OR REPLACE FUNCTION list_cron_jobs()
RETURNS TABLE(
  jobid BIGINT,
  schedule TEXT,
  command TEXT,
  nodename TEXT,
  nodeport INT,
  database TEXT,
  username TEXT,
  active BOOLEAN,
  jobname TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.jobid,
    j.schedule,
    j.command,
    j.nodename,
    j.nodeport,
    j.database,
    j.username,
    j.active,
    j.jobname
  FROM cron.job j
  ORDER BY j.jobid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to disable a cron job by name
CREATE OR REPLACE FUNCTION disable_cron_job(job_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  PERFORM cron.unschedule(job_name);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to manually trigger all refresh jobs (useful for testing)
CREATE OR REPLACE FUNCTION trigger_all_refreshes()
RETURNS void AS $$
BEGIN
  PERFORM refresh_labor_efficiency_views();
  PERFORM refresh_daily_performance();
  PERFORM refresh_vendor_performance();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION list_cron_jobs IS 'List all active pg_cron jobs';
COMMENT ON FUNCTION disable_cron_job IS 'Disable a pg_cron job by name';
COMMENT ON FUNCTION trigger_all_refreshes IS 'Manually trigger all materialized view refreshes (for testing)';

-- Log successful migration
DO $$
BEGIN
  RAISE NOTICE 'pg_cron jobs configured successfully';
  RAISE NOTICE 'Use SELECT * FROM cron.job to view all scheduled jobs';
  RAISE NOTICE 'Use SELECT * FROM cron.job_run_details to view job execution history';
END $$;
