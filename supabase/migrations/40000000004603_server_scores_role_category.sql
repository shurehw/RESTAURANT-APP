-- ============================================================================
-- Add role_category to server_performance_scores
-- Scores bartenders vs bartenders, servers vs servers (separate peer groups)
-- ============================================================================

ALTER TABLE server_performance_scores
  ADD COLUMN IF NOT EXISTS role_category TEXT NOT NULL DEFAULT 'server'
    CHECK (role_category IN ('server', 'bartender', 'host', 'other'));

-- Update unique index to include role_category (drop + recreate)
DROP INDEX IF EXISTS idx_server_scores_unique;
CREATE UNIQUE INDEX idx_server_scores_unique
  ON server_performance_scores(venue_id, server_name, business_date, role_category);

-- Index for filtering by role
CREATE INDEX IF NOT EXISTS idx_server_scores_role
  ON server_performance_scores(venue_id, role_category, business_date DESC);

COMMENT ON COLUMN server_performance_scores.role_category IS 'Role group for peer comparison: server, bartender, host, other';
