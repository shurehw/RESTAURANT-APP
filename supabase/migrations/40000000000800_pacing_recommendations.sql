-- ============================================================================
-- MIGRATION 1008: Pacing Recommendations (AI Optimization Agent)
-- ============================================================================
-- Stores AI-generated pacing recommendations per venue/date.
-- Lifecycle: pending → accepted/dismissed/expired → applied
-- Pattern: enforcement violation_events audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS pacing_recommendations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id            UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date       DATE NOT NULL,

  -- Recommendation
  rec_type            TEXT NOT NULL CHECK (rec_type IN ('covers', 'pacing', 'turn_time')),
  slot_label          TEXT,                           -- e.g., "7:00 PM" (null for global)
  current_value       JSONB NOT NULL DEFAULT '{}',    -- What's set now
  recommended_value   JSONB NOT NULL DEFAULT '{}',    -- What AI recommends
  reasoning           TEXT NOT NULL,                  -- AI explanation
  expected_impact     JSONB DEFAULT '{}',             -- { extra_covers, revenue_delta }
  confidence          TEXT NOT NULL DEFAULT 'medium'
                      CHECK (confidence IN ('high', 'medium', 'low')),

  -- Lifecycle
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'dismissed', 'expired', 'applied')),
  decided_by          UUID,
  decided_at          TIMESTAMPTZ,

  -- Tracking
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome             JSONB                           -- Post-application results
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pacing_recs_venue_date
  ON pacing_recommendations(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_pacing_recs_status
  ON pacing_recommendations(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pacing_recs_org
  ON pacing_recommendations(org_id);

-- RLS
ALTER TABLE pacing_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to pacing_recommendations"
  ON pacing_recommendations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view pacing_recommendations"
  ON pacing_recommendations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.organization_id = pacing_recommendations.org_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON pacing_recommendations TO authenticated;
GRANT ALL ON pacing_recommendations TO service_role;

SELECT 'Pacing recommendations table created' AS status;
