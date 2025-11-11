-- Create idempotency table for duplicate request protection (BUG-007)

CREATE TABLE http_idempotency (
  key TEXT PRIMARY KEY,
  response JSONB NOT NULL,
  status INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup of old keys
CREATE INDEX idx_idempotency_created_at ON http_idempotency(created_at);

-- Auto-cleanup function (delete keys older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM http_idempotency
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (requires pg_cron extension, optional)
-- SELECT cron.schedule('cleanup-idempotency', '0 * * * *', 'SELECT cleanup_old_idempotency_keys()');

COMMENT ON TABLE http_idempotency IS 'Stores idempotency keys for POST requests to prevent duplicate submissions';
