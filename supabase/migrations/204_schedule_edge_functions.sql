-- ================================================================
-- MIGRATION 204: Schedule Edge Functions via pg_cron + pg_net
-- ================================================================
-- Purpose: Automate labor scheduling pipeline using Supabase Edge Functions
-- Created: 2026-02-05
-- Dependencies: pg_cron, pg_net extensions (enabled in Supabase dashboard)
-- ================================================================

-- Enable required extensions (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ================================================================
-- 1. HELPER: HTTP call to invoke Edge Functions
-- ================================================================

-- Helper function to call an Edge Function with service role auth
CREATE OR REPLACE FUNCTION invoke_edge_function(function_name TEXT)
RETURNS void AS $$
DECLARE
  base_url TEXT;
  service_key TEXT;
BEGIN
  -- These are available as Supabase config vars
  base_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);

  -- If settings not available, try from vault
  IF base_url IS NULL THEN
    SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
  END IF;

  IF service_key IS NULL THEN
    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  END IF;

  -- Call the Edge Function via pg_net
  PERFORM net.http_post(
    url := base_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION invoke_edge_function IS 'Invokes a Supabase Edge Function via HTTP using pg_net';

-- ================================================================
-- 2. CRON SCHEDULES
-- ================================================================

-- Daily at 4:00 AM UTC: Generate demand forecasts
SELECT cron.schedule(
  'forecast-generate',
  '0 4 * * *',
  $$SELECT invoke_edge_function('forecast-generate')$$
);

-- Daily at 4:15 AM UTC: Calculate labor requirements (after forecasts)
SELECT cron.schedule(
  'requirements-calculate',
  '15 4 * * *',
  $$SELECT invoke_edge_function('requirements-calculate')$$
);

-- Every Sunday at 5:00 AM UTC: Generate weekly schedules
SELECT cron.schedule(
  'schedule-generate',
  '0 5 * * 0',
  $$SELECT invoke_edge_function('schedule-generate')$$
);

-- 1st of every month at 3:00 AM UTC: Recalculate CPLH targets
SELECT cron.schedule(
  'cplh-update',
  '0 3 1 * *',
  $$SELECT invoke_edge_function('cplh-update')$$
);

-- ================================================================
-- 3. CONVENIENCE: View scheduled jobs
-- ================================================================

CREATE OR REPLACE VIEW automation_cron_jobs AS
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname IN (
  'forecast-generate',
  'requirements-calculate',
  'schedule-generate',
  'cplh-update'
)
ORDER BY jobname;

COMMENT ON VIEW automation_cron_jobs IS 'View of all automation cron jobs and their schedules';

-- ================================================================
-- 4. HELPER: Refresh materialized views (called by cplh-update)
-- ================================================================

CREATE OR REPLACE FUNCTION refresh_cplh_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY cplh_by_position_shift;
  REFRESH MATERIALIZED VIEW CONCURRENTLY service_quality_metrics;
EXCEPTION
  WHEN undefined_table THEN
    -- Views might not exist yet
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION refresh_cplh_views IS 'Refreshes CPLH and service quality materialized views';

-- ================================================================
-- END OF MIGRATION 204
-- ================================================================
