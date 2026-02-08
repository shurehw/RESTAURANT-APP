-- ============================================================================
-- ETL SYNC CRON JOBS
-- Schedules TipSee data synchronization via Supabase Edge Function
-- Runs every 15 minutes during service hours (11am-11pm PT)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to trigger ETL sync edge function
CREATE OR REPLACE FUNCTION trigger_etl_sync(p_action TEXT DEFAULT 'today')
RETURNS void AS $$
DECLARE
  v_project_ref TEXT;
  v_service_role_key TEXT;
  v_url TEXT;
BEGIN
  -- Build edge function URL
  -- Format: https://<project-ref>.supabase.co/functions/v1/etl-sync
  v_project_ref := current_setting('app.settings.supabase_project_ref', true);

  IF v_project_ref IS NULL THEN
    -- Fallback: try to extract from supabase URL if set
    RAISE NOTICE 'Supabase project ref not configured. Set via: ALTER DATABASE postgres SET app.settings.supabase_project_ref = ''your-project-ref'';';
    RETURN;
  END IF;

  v_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/etl-sync?action=' || p_action;

  -- Get service role key for auth
  v_service_role_key := current_setting('app.settings.supabase_service_role_key', true);

  IF v_service_role_key IS NULL THEN
    RAISE NOTICE 'Service role key not configured. Set via: ALTER DATABASE postgres SET app.settings.supabase_service_role_key = ''your-key'';';
    RETURN;
  END IF;

  -- Call edge function via pg_net
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := '{}'::jsonb
  );

  RAISE NOTICE 'ETL sync triggered: %', p_action;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if we're in service hours (11am-11pm PT)
CREATE OR REPLACE FUNCTION is_service_hours()
RETURNS BOOLEAN AS $$
DECLARE
  v_pt_hour INTEGER;
BEGIN
  -- Get current hour in Pacific Time
  v_pt_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Los_Angeles'));
  RETURN v_pt_hour >= 11 AND v_pt_hour < 23;
END;
$$ LANGUAGE plpgsql;

-- Wrapper function for cron that checks service hours
CREATE OR REPLACE FUNCTION cron_etl_sync_today()
RETURNS void AS $$
BEGIN
  IF is_service_hours() THEN
    PERFORM trigger_etl_sync('today');
  ELSE
    RAISE NOTICE 'Skipping ETL sync - outside service hours';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule ETL sync every 15 minutes (will check service hours internally)
SELECT cron.schedule(
  'etl-sync-15min',
  '*/15 * * * *',  -- Every 15 minutes, function checks if in service hours
  $$SELECT cron_etl_sync_today()$$
);

-- Schedule yesterday's final sync at 6am PT (2pm UTC in winter, 1pm UTC in summer)
-- This catches any late transactions from the previous night
SELECT cron.schedule(
  'etl-sync-yesterday-final',
  '0 14 * * *',  -- 2pm UTC = 6am PT (winter) / 7am PT (summer)
  $$SELECT trigger_etl_sync('yesterday')$$
);

-- Function to manually backfill a date range
CREATE OR REPLACE FUNCTION etl_backfill(start_date DATE, end_date DATE, p_venue_id UUID DEFAULT NULL)
RETURNS void AS $$
DECLARE
  v_project_ref TEXT;
  v_service_role_key TEXT;
  v_url TEXT;
  v_current DATE;
BEGIN
  v_project_ref := current_setting('app.settings.supabase_project_ref', true);
  v_service_role_key := current_setting('app.settings.supabase_service_role_key', true);

  IF v_project_ref IS NULL OR v_service_role_key IS NULL THEN
    RAISE EXCEPTION 'Supabase configuration not set. See migration comments for setup.';
  END IF;

  v_current := start_date;
  WHILE v_current <= end_date LOOP
    v_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/etl-sync?date=' || v_current::text;

    IF p_venue_id IS NOT NULL THEN
      v_url := v_url || '&venue_id=' || p_venue_id::text;
    END IF;

    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := '{}'::jsonb
    );

    RAISE NOTICE 'Triggered backfill for %', v_current;
    v_current := v_current + INTERVAL '1 day';

    -- Small delay to avoid overwhelming the edge function
    PERFORM pg_sleep(0.5);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION trigger_etl_sync IS 'Trigger TipSee ETL sync edge function';
COMMENT ON FUNCTION cron_etl_sync_today IS 'Cron wrapper that checks service hours before syncing';
COMMENT ON FUNCTION etl_backfill IS 'Backfill historical data for a date range';
COMMENT ON FUNCTION is_service_hours IS 'Check if current time is within service hours (11am-11pm PT)';

-- ============================================================================
-- CONFIGURATION INSTRUCTIONS
-- ============================================================================
-- After deployment, you need to configure the database settings:
--
-- 1. Get your Supabase project ref (from project URL: https://<ref>.supabase.co)
-- 2. Get your service role key from Supabase Dashboard > Settings > API
-- 3. Run these commands in SQL Editor:
--
--    ALTER DATABASE postgres SET app.settings.supabase_project_ref = 'your-project-ref';
--    ALTER DATABASE postgres SET app.settings.supabase_service_role_key = 'your-service-role-key';
--
-- 4. Deploy the edge function:
--    supabase functions deploy etl-sync
--
-- 5. Set edge function secrets:
--    supabase secrets set TIPSEE_DB_HOST=TIPSEE_HOST_REDACTED
--    supabase secrets set TIPSEE_DB_USER=TIPSEE_USERNAME_REDACTED
--    supabase secrets set TIPSEE_DB_PASSWORD=your-password
--
-- 6. Test the sync manually:
--    SELECT trigger_etl_sync('today');
--
-- 7. Check cron job status:
--    SELECT * FROM cron.job;
--    SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- ============================================================================

SELECT 'ETL sync cron jobs configured. See comments for setup instructions.' as status;
