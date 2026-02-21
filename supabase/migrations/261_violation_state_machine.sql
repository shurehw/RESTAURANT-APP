-- ============================================================================
-- 261: Violation State Machine + Evidence + Events
--
-- Adds:
--   1. Explicit status lifecycle (open → acknowledged → action_submitted → verified → resolved | waived)
--   2. Lifecycle timestamp/actor columns
--   3. Evidence snapshot columns (policy_snapshot, evidence, derived_metrics)
--   4. Dollar impact estimation columns
--   5. Append-only violation_events table (event sourcing)
--   6. Updated get_active_violations RPC with new fields
--   7. Backfill existing data
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. State machine columns on control_plane_violations
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE control_plane_violations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','action_submitted','verified','resolved','waived'));

-- Lifecycle timestamps + actors
ALTER TABLE control_plane_violations
  ADD COLUMN IF NOT EXISTS ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ack_by UUID,
  ADD COLUMN IF NOT EXISTS action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_by UUID,
  ADD COLUMN IF NOT EXISTS action_summary TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID,
  ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS waived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waived_by UUID,
  ADD COLUMN IF NOT EXISTS waiver_reason TEXT;

-- Evidence snapshots (frozen at detection time)
ALTER TABLE control_plane_violations
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS evidence JSONB,
  ADD COLUMN IF NOT EXISTS derived_metrics JSONB;

-- Dollar impact estimation
ALTER TABLE control_plane_violations
  ADD COLUMN IF NOT EXISTS estimated_impact_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS impact_confidence TEXT CHECK (impact_confidence IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS impact_inputs JSONB;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Backfill existing data
-- ────────────────────────────────────────────────────────────────────────────

-- Mark already-resolved violations
UPDATE control_plane_violations
  SET status = 'resolved'
  WHERE resolved_at IS NOT NULL AND status = 'open';

-- Critical violations require verification
UPDATE control_plane_violations
  SET verification_required = TRUE
  WHERE severity = 'critical' AND status = 'open';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Indexes for state machine queries
-- ────────────────────────────────────────────────────────────────────────────

-- Active violations (replaces the old resolved_at IS NULL index for most queries)
CREATE INDEX IF NOT EXISTS idx_violations_status
  ON control_plane_violations(org_id, status, detected_at)
  WHERE status NOT IN ('resolved','waived');

-- Stall detection: acknowledged but no action
CREATE INDEX IF NOT EXISTS idx_violations_stall
  ON control_plane_violations(org_id, status, ack_at)
  WHERE status = 'acknowledged';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Append-only violation_events table
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS violation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id UUID NOT NULL REFERENCES control_plane_violations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created','acknowledged','action_submitted','verified','resolved','waived',
    'escalated','silence_penalty','stall_penalty','reopened'
  )),
  from_status TEXT,
  to_status TEXT,
  actor_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ve_violation
  ON violation_events(violation_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_ve_type
  ON violation_events(event_type, occurred_at DESC);

-- RLS: select via org membership through violations table
ALTER TABLE violation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ve_read_org_users" ON violation_events
  FOR SELECT USING (
    violation_id IN (
      SELECT v.id FROM control_plane_violations v
      WHERE v.org_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid()
          AND ou.is_active = TRUE
      )
    )
  );

-- Service role full access (for cron/escalation inserts)
CREATE POLICY "ve_service_all" ON violation_events
  FOR ALL USING (auth.role() = 'service_role');

-- No UPDATE or DELETE policies for regular users — append-only

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Updated get_active_violations RPC
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_active_violations(p_org_id uuid, p_severity text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  violation_type text,
  severity text,
  title text,
  description text,
  venue_name text,
  business_date date,
  detected_at timestamptz,
  status text,
  ack_at timestamptz,
  action_at timestamptz,
  verification_required boolean,
  estimated_impact_usd numeric,
  action_count bigint,
  block_count bigint,
  event_count bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    v.id,
    v.violation_type,
    v.severity,
    v.title,
    v.description,
    gl.location_name AS venue_name,
    v.business_date,
    v.detected_at,
    v.status,
    v.ack_at,
    v.action_at,
    v.verification_required,
    v.estimated_impact_usd,
    (SELECT count(*) FROM control_plane_actions WHERE violation_id = v.id) AS action_count,
    (SELECT count(*) FROM control_plane_blocks WHERE violation_id = v.id AND active = true) AS block_count,
    (SELECT count(*) FROM violation_events WHERE violation_id = v.id) AS event_count
  FROM control_plane_violations v
  LEFT JOIN general_locations gl ON gl.uuid = v.venue_id
  WHERE v.org_id = p_org_id
    AND v.status NOT IN ('resolved', 'waived')
    AND (p_severity IS NULL OR v.severity = p_severity)
  ORDER BY
    CASE v.severity
      WHEN 'critical' THEN 1
      WHEN 'warning' THEN 2
      WHEN 'info' THEN 3
    END,
    v.detected_at DESC;
$$;
