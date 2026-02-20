-- ============================================================================
-- 258: Operator Intelligence — internal signals visible only to owner/director
--
-- NOT shared with managers. This is the operator watching their operation.
--
-- Intelligence types:
--   unfulfilled_commitment — manager promised X, hasn't followed through
--   employee_pattern       — same employee flagged negatively 2+ times in 14d
--   ownership_alert        — low command score or avoidance flag detected
--
-- Visibility: owner and admin roles ONLY via organization_users RLS.
-- Writes happen server-side (service_role) after signal extraction.
-- ============================================================================

CREATE TABLE IF NOT EXISTS operator_intelligence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  venue_id        UUID NOT NULL REFERENCES venues(id),
  business_date   DATE NOT NULL,

  -- Classification
  intelligence_type TEXT NOT NULL CHECK (intelligence_type IN (
    'unfulfilled_commitment',
    'employee_pattern',
    'ownership_alert'
  )),
  severity        TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),

  -- Details
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  recommended_action TEXT,

  -- Who is this about (the manager being observed)
  subject_manager_id   UUID REFERENCES auth.users(id),
  subject_manager_name TEXT,
  related_employees    TEXT[] DEFAULT '{}',

  -- Source linking
  attestation_id  UUID REFERENCES nightly_attestations(id),
  signal_id       UUID,  -- soft ref to attestation_signals.id
  source_data     JSONB DEFAULT '{}',

  -- Lifecycle
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',       -- needs attention
    'acknowledged', -- operator saw it
    'resolved',     -- addressed
    'dismissed'     -- not actionable
  )),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolution_note TEXT,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oi_org_status ON operator_intelligence(org_id, status)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_oi_venue_date ON operator_intelligence(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_oi_type ON operator_intelligence(intelligence_type);
CREATE INDEX IF NOT EXISTS idx_oi_subject ON operator_intelligence(subject_manager_id)
  WHERE subject_manager_id IS NOT NULL;

-- ============================================================================
-- RLS: STRICT — owner and admin only
-- ============================================================================

ALTER TABLE operator_intelligence ENABLE ROW LEVEL SECURITY;

-- Reads: only org owners and admins
CREATE POLICY "oi_read_owner_admin" ON operator_intelligence
  FOR SELECT USING (
    org_id IN (
      SELECT ou.organization_id
      FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.is_active = TRUE
        AND ou.role IN ('owner', 'admin')
    )
  );

-- Writes: service role only (signal pipeline runs server-side)
CREATE POLICY "oi_service_all" ON operator_intelligence
  FOR ALL USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE operator_intelligence IS 'Internal operator signals — NOT visible to managers. Owner/admin only.';
COMMENT ON COLUMN operator_intelligence.subject_manager_id IS 'The manager being observed (NOT the viewer)';
COMMENT ON COLUMN operator_intelligence.intelligence_type IS 'unfulfilled_commitment | employee_pattern | ownership_alert';
