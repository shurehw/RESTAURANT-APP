-- ============================================================================
-- 260: Enforcement Wiring — Escalation + Composite Scores
--
-- Adds escalation tracking to violations and creates enforcement_scores table
-- for nightly composite scoring (manager reliability + venue discipline).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Escalation columns on control_plane_violations
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE control_plane_violations
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recurrence_count INTEGER DEFAULT 0;

-- Index for escalation queries (unresolved violations by age)
CREATE INDEX IF NOT EXISTS idx_violations_escalation
  ON control_plane_violations(org_id, escalation_level, detected_at)
  WHERE resolved_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Enforcement Scores (Manager Reliability + Venue Discipline)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enforcement_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('manager', 'venue')),
  entity_id UUID NOT NULL,
  entity_name TEXT,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  window_days INTEGER NOT NULL DEFAULT 30,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_date DATE NOT NULL,
  UNIQUE(org_id, entity_type, entity_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_scores_entity
  ON enforcement_scores(entity_type, entity_id, business_date DESC);

CREATE INDEX IF NOT EXISTS idx_scores_org
  ON enforcement_scores(org_id, business_date DESC);

-- RLS: owner/admin read via organization_users
ALTER TABLE enforcement_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scores_read_org_users" ON enforcement_scores
  FOR SELECT USING (
    org_id IN (
      SELECT ou.organization_id FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.is_active = TRUE
        AND ou.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "scores_service_all" ON enforcement_scores
  FOR ALL USING (auth.role() = 'service_role');
