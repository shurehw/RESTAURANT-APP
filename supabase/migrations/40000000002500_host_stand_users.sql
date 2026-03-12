-- ============================================================================
-- MIGRATION 2500: Host Stand Users
-- ============================================================================
-- Links auth.users to specific venues for host stand iPad access.
-- Pattern: 076_vendor_portal.sql (vendor_users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS host_stand_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL DEFAULT '',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_host_stand_users_user
  ON host_stand_users(user_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_host_stand_users_venue
  ON host_stand_users(venue_id) WHERE is_active;

ALTER TABLE host_stand_users ENABLE ROW LEVEL SECURITY;

-- Host stand users can view their own mapping
CREATE POLICY "Host stand users can view own mapping"
  ON host_stand_users FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role full access (admin provisioning)
CREATE POLICY "Service role has full access to host_stand_users"
  ON host_stand_users FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON host_stand_users TO authenticated;
GRANT ALL ON host_stand_users TO service_role;

SELECT 'Host stand users table created' AS status;
