-- ============================================================================
-- OPERATOR ATTESTATION & INCIDENT CAPTURE
-- Flight-debrief-style nightly attestation system for managers
-- Requires: 050 (current_user_venue_ids), 175 (manager_actions)
-- ============================================================================

-- ============================================================================
-- 1. ATTESTATION THRESHOLDS (per-venue configurable triggers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS attestation_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Revenue triggers
  revenue_variance_pct NUMERIC(5,2) DEFAULT 5.0,    -- % deviation from forecast
  high_comp_amount NUMERIC(10,2) DEFAULT 100.0,      -- single comp $ threshold
  comp_pct_threshold NUMERIC(5,2) DEFAULT 3.0,       -- comp % of net revenue

  -- Labor triggers
  labor_variance_pct NUMERIC(5,2) DEFAULT 5.0,       -- labor cost % deviation
  overtime_hours_threshold NUMERIC(6,2) DEFAULT 2.0,  -- OT hours trigger

  -- Incident triggers
  walkout_count_threshold INTEGER DEFAULT 1,          -- # walkouts to trigger

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_attestation_thresholds_venue UNIQUE(venue_id)
);

-- ============================================================================
-- 2. NIGHTLY ATTESTATIONS (one per venue per business date)
-- ============================================================================

CREATE TABLE IF NOT EXISTS nightly_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- Submission
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'amended')),

  -- Revenue attestation
  revenue_confirmed BOOLEAN,
  revenue_variance_reason TEXT CHECK (
    revenue_variance_reason IS NULL OR revenue_variance_reason IN (
      'weather', 'private_event', 'local_event', 'holiday',
      'competition', 'staffing_shortage', 'marketing_promo',
      'construction_nearby', 'pos_error', 'early_close'
    )
  ),
  revenue_notes TEXT,

  -- Labor attestation
  labor_confirmed BOOLEAN,
  labor_variance_reason TEXT CHECK (
    labor_variance_reason IS NULL OR labor_variance_reason IN (
      'call_out', 'event_staffing', 'training_shift', 'early_cut',
      'overtime_approved', 'new_hire_overlap', 'weather_slow',
      'scheduling_error', 'pos_error'
    )
  ),
  labor_notes TEXT,

  -- Lock / amendment
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id),
  amendment_reason TEXT,
  amended_at TIMESTAMPTZ,
  amended_by UUID REFERENCES auth.users(id),

  -- Snapshot of trigger results at submission time
  triggers_snapshot JSONB DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_attestation_venue_date UNIQUE(venue_id, business_date)
);

-- ============================================================================
-- 3. COMP RESOLUTIONS (individual comp sign-off per check)
-- ============================================================================

CREATE TABLE IF NOT EXISTS comp_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id UUID NOT NULL REFERENCES nightly_attestations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- Check reference
  check_id TEXT,                    -- POS check number
  check_amount NUMERIC(10,2),      -- original check total
  comp_amount NUMERIC(10,2),       -- comp amount
  comp_reason_pos TEXT,             -- reason from POS (raw)
  employee_name TEXT,               -- server/manager who applied comp

  -- Resolution
  resolution_code TEXT NOT NULL CHECK (resolution_code IN (
    'legitimate_guest_recovery', 'manager_approved_promo',
    'employee_meal', 'vip_courtesy', 'kitchen_error',
    'service_failure', 'policy_violation', 'needs_investigation',
    'training_required'
  )),
  resolution_notes TEXT,
  approved_by TEXT,                  -- manager name who approved
  requires_follow_up BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 4. NIGHTLY INCIDENTS (structured incident log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS nightly_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id UUID NOT NULL REFERENCES nightly_attestations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  incident_type TEXT NOT NULL CHECK (incident_type IN (
    'guest_complaint', 'equipment_failure', 'staff_issue',
    'safety', 'inventory_shortage', 'walkout',
    'theft_fraud', 'health_code'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN (
    'low', 'medium', 'high', 'critical'
  )),

  description TEXT NOT NULL,
  resolution TEXT,
  resolved BOOLEAN DEFAULT false,
  staff_involved TEXT[] DEFAULT '{}',
  follow_up_required BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 5. COACHING ACTIONS (recognition + correction queue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS coaching_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id UUID NOT NULL REFERENCES nightly_attestations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  employee_name TEXT NOT NULL,
  coaching_type TEXT NOT NULL CHECK (coaching_type IN (
    'recognition', 'correction', 'training', 'follow_up'
  )),
  reason TEXT NOT NULL,
  action_taken TEXT,
  follow_up_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'completed', 'escalated'
  )),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 6. ALTER manager_actions — link to attestations
-- ============================================================================

-- Add attestation_id FK (nullable — existing rows have no attestation)
ALTER TABLE manager_actions
  ADD COLUMN IF NOT EXISTS attestation_id UUID REFERENCES nightly_attestations(id) ON DELETE SET NULL;

-- Add source_data for structured context from attestation
ALTER TABLE manager_actions
  ADD COLUMN IF NOT EXISTS source_data JSONB DEFAULT '{}';

-- Index for looking up actions by attestation
CREATE INDEX IF NOT EXISTS idx_manager_actions_attestation
  ON manager_actions(attestation_id) WHERE attestation_id IS NOT NULL;

-- ============================================================================
-- 7. INDEXES
-- ============================================================================

CREATE INDEX idx_attestations_venue_date ON nightly_attestations(venue_id, business_date DESC);
CREATE INDEX idx_attestations_status ON nightly_attestations(status);
CREATE INDEX idx_attestations_submitted ON nightly_attestations(submitted_at DESC) WHERE submitted_at IS NOT NULL;

CREATE INDEX idx_comp_resolutions_attestation ON comp_resolutions(attestation_id);
CREATE INDEX idx_comp_resolutions_venue_date ON comp_resolutions(venue_id, business_date DESC);
CREATE INDEX idx_comp_resolutions_follow_up ON comp_resolutions(requires_follow_up) WHERE requires_follow_up = true;

CREATE INDEX idx_incidents_attestation ON nightly_incidents(attestation_id);
CREATE INDEX idx_incidents_venue_date ON nightly_incidents(venue_id, business_date DESC);
CREATE INDEX idx_incidents_severity ON nightly_incidents(severity) WHERE severity IN ('high', 'critical');

CREATE INDEX idx_coaching_attestation ON coaching_actions(attestation_id);
CREATE INDEX idx_coaching_venue_date ON coaching_actions(venue_id, business_date DESC);
CREATE INDEX idx_coaching_status ON coaching_actions(status) WHERE status = 'pending';
CREATE INDEX idx_coaching_follow_up ON coaching_actions(follow_up_date) WHERE follow_up_date IS NOT NULL;

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

-- --- attestation_thresholds ---
ALTER TABLE attestation_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view thresholds for their venues"
  ON attestation_thresholds FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

-- Only admins/managers can modify thresholds
CREATE POLICY "Managers can manage thresholds for their venues"
  ON attestation_thresholds FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

-- --- nightly_attestations ---
ALTER TABLE nightly_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attestations for their venues"
  ON nightly_attestations FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can create attestations for their venues"
  ON nightly_attestations FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Managers can update attestations for their venues"
  ON nightly_attestations FOR UPDATE
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

-- --- comp_resolutions ---
ALTER TABLE comp_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comp resolutions for their venues"
  ON comp_resolutions FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can create comp resolutions for their venues"
  ON comp_resolutions FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Managers can update comp resolutions for their venues"
  ON comp_resolutions FOR UPDATE
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

-- --- nightly_incidents ---
ALTER TABLE nightly_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view incidents for their venues"
  ON nightly_incidents FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can create incidents for their venues"
  ON nightly_incidents FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Managers can update incidents for their venues"
  ON nightly_incidents FOR UPDATE
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

-- --- coaching_actions ---
ALTER TABLE coaching_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view coaching actions for their venues"
  ON coaching_actions FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can create coaching actions for their venues"
  ON coaching_actions FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Managers can update coaching actions for their venues"
  ON coaching_actions FOR UPDATE
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

-- ============================================================================
-- 9. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_attestation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_attestation_thresholds_updated_at
  BEFORE UPDATE ON attestation_thresholds
  FOR EACH ROW EXECUTE FUNCTION update_attestation_updated_at();

CREATE TRIGGER trigger_nightly_attestations_updated_at
  BEFORE UPDATE ON nightly_attestations
  FOR EACH ROW EXECUTE FUNCTION update_attestation_updated_at();

CREATE TRIGGER trigger_comp_resolutions_updated_at
  BEFORE UPDATE ON comp_resolutions
  FOR EACH ROW EXECUTE FUNCTION update_attestation_updated_at();

CREATE TRIGGER trigger_nightly_incidents_updated_at
  BEFORE UPDATE ON nightly_incidents
  FOR EACH ROW EXECUTE FUNCTION update_attestation_updated_at();

CREATE TRIGGER trigger_coaching_actions_updated_at
  BEFORE UPDATE ON coaching_actions
  FOR EACH ROW EXECUTE FUNCTION update_attestation_updated_at();

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON attestation_thresholds TO authenticated;
GRANT SELECT, INSERT, UPDATE ON nightly_attestations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON comp_resolutions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON nightly_incidents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON coaching_actions TO authenticated;

-- ============================================================================
-- 11. VIEWS
-- ============================================================================

-- Pending attestations (drafts not yet submitted)
CREATE OR REPLACE VIEW pending_attestations AS
SELECT
  na.*,
  v.name as venue_name,
  (SELECT count(*) FROM comp_resolutions cr WHERE cr.attestation_id = na.id) as comp_resolution_count,
  (SELECT count(*) FROM nightly_incidents ni WHERE ni.attestation_id = na.id) as incident_count,
  (SELECT count(*) FROM coaching_actions ca WHERE ca.attestation_id = na.id) as coaching_count
FROM nightly_attestations na
JOIN venues v ON v.id = na.venue_id
WHERE na.status = 'draft'
ORDER BY na.business_date DESC;

GRANT SELECT ON pending_attestations TO authenticated;

-- Follow-up items across all attestation children
CREATE OR REPLACE VIEW attestation_follow_ups AS
SELECT
  'comp_resolution' as item_type,
  cr.id as item_id,
  cr.venue_id,
  cr.business_date,
  cr.attestation_id,
  cr.employee_name as subject,
  cr.resolution_code as category,
  cr.resolution_notes as notes,
  cr.created_at
FROM comp_resolutions cr
WHERE cr.requires_follow_up = true

UNION ALL

SELECT
  'incident' as item_type,
  ni.id as item_id,
  ni.venue_id,
  ni.business_date,
  ni.attestation_id,
  ni.incident_type as subject,
  ni.severity as category,
  ni.description as notes,
  ni.created_at
FROM nightly_incidents ni
WHERE ni.follow_up_required = true AND ni.resolved = false

UNION ALL

SELECT
  'coaching' as item_type,
  ca.id as item_id,
  ca.venue_id,
  ca.business_date,
  ca.attestation_id,
  ca.employee_name as subject,
  ca.coaching_type as category,
  ca.reason as notes,
  ca.created_at
FROM coaching_actions ca
WHERE ca.status = 'pending'

ORDER BY created_at DESC;

GRANT SELECT ON attestation_follow_ups TO authenticated;

SELECT 'Operator attestation tables created successfully' as status;
