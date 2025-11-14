/**
 * Migration 056: Idempotency Cleanup Cron Job
 * Purpose: Automatically delete expired idempotency keys
 * Runs every hour to keep the table clean
 */

-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM http_idempotency
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cron job to run every hour
SELECT cron.schedule(
  'cleanup-idempotency-keys',
  '0 * * * *', -- Every hour at minute 0
  $$SELECT cleanup_expired_idempotency_keys();$$
);

COMMENT ON FUNCTION cleanup_expired_idempotency_keys IS 'Deletes expired idempotency keys to prevent table bloat';
