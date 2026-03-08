-- ============================================================================
-- 281: Nightly Report Subscribers + Log
-- ============================================================================
-- Tracks who receives nightly report emails and logs each send run.
-- Venue scope logic:
--   'auto'     → inherits from organization_users.venue_ids
--                 (NULL = consolidated, specific = per-venue)
--   'all'      → always consolidated (all venues in one email)
--   'selected' → specific venues from venue_ids column
-- ============================================================================

-- ── Subscribers ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nightly_report_subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  venue_scope   TEXT NOT NULL DEFAULT 'auto'
                  CHECK (venue_scope IN ('all', 'selected', 'auto')),
  venue_ids     UUID[],
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),

  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_nightly_subscribers_org
  ON nightly_report_subscribers(org_id);

CREATE INDEX idx_nightly_subscribers_active
  ON nightly_report_subscribers(org_id, is_active)
  WHERE is_active = TRUE;

-- Enable moddatetime extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

-- Auto-update updated_at
CREATE TRIGGER set_nightly_report_subscribers_updated_at
  BEFORE UPDATE ON nightly_report_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- RLS
ALTER TABLE nightly_report_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
  ON nightly_report_subscribers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "org_members_can_view"
  ON nightly_report_subscribers
  FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT organization_id FROM organization_users
    WHERE user_id = auth.uid() AND is_active = TRUE
  ));

CREATE POLICY "admins_can_manage"
  ON nightly_report_subscribers
  FOR ALL TO authenticated
  USING (org_id IN (
    SELECT organization_id FROM organization_users
    WHERE user_id = auth.uid() AND is_active = TRUE AND role IN ('owner', 'admin')
  ))
  WITH CHECK (org_id IN (
    SELECT organization_id FROM organization_users
    WHERE user_id = auth.uid() AND is_active = TRUE AND role IN ('owner', 'admin')
  ));

-- ── Report Log ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nightly_report_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  business_date     DATE NOT NULL,
  subscribers_sent  INTEGER NOT NULL DEFAULT 0,
  subscribers_failed INTEGER NOT NULL DEFAULT 0,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  total_duration_ms INTEGER,
  error_message     TEXT,
  details           JSONB DEFAULT '{}'
);

ALTER TABLE nightly_report_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_nightly_log"
  ON nightly_report_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_nightly_report_log_date
  ON nightly_report_log(business_date DESC);
