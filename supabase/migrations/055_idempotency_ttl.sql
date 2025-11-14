/**
 * Migration 055: Add TTL to HTTP Idempotency Table
 * Purpose: Prevent indefinite growth of idempotency cache
 * Adds expires_at column and index for efficient cleanup
 */

-- Add expires_at column (24 hour TTL by default)
ALTER TABLE http_idempotency
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours');

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_http_idempotency_expires_at
  ON http_idempotency(expires_at) WHERE expires_at IS NOT NULL;

-- Backfill existing rows (set expiry to 24 hours from created_at)
UPDATE http_idempotency
SET expires_at = created_at + INTERVAL '24 hours'
WHERE expires_at IS NULL AND created_at IS NOT NULL;

-- Set default for created_at if not exists
ALTER TABLE http_idempotency
ALTER COLUMN created_at SET DEFAULT NOW();

COMMENT ON COLUMN http_idempotency.expires_at IS 'TTL for idempotency cache, automatically cleaned up by cron job';
