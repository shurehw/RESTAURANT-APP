-- ============================================================================
-- 274: Weekly Share Tokens
--
-- Token-gated access to weekly agenda pages. Allows sharing a specific
-- venue+week report with a GM without requiring app login.
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_share_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT UNIQUE NOT NULL,
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  accessed_count  INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_weekly_share_tokens_token ON weekly_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_weekly_share_tokens_venue_week ON weekly_share_tokens(venue_id, week_start);

COMMENT ON TABLE weekly_share_tokens IS 'Token-gated share links for weekly agenda pages. No login required.';

-- RLS: service role only (all access via getServiceClient)
ALTER TABLE weekly_share_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_share_tokens_service" ON weekly_share_tokens
  FOR ALL USING (true) WITH CHECK (true);
