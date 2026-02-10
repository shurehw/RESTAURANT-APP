-- =====================================================
-- P0: FEEDBACK SPINE (OpsOS Closed-Loop Control System)
-- =====================================================
-- This migration creates the backbone for unified feedback objects,
-- enabling the full operational loop: detect → feedback → attest → verify
--
-- Tables:
--   - signals: Raw detector outputs (replaces fragmented exceptions)
--   - feedback_objects: Unified feedback entity (the spine)
--   - feedback_object_signals: Link table
--   - standards: Generalized thresholds/targets (replaces domain-specific configs)
--
-- Enforcement principle: Rules are always on. Rails are fixed. Calibration is allowed. Escape is not.
-- =====================================================

-- =====================================================
-- ENUMS
-- =====================================================

-- Domain classification for signals and feedback
CREATE TYPE feedback_domain AS ENUM (
  'revenue',      -- Comps, voids, discounts, sales anomalies
  'labor',        -- CPLH, overtime, scheduling violations
  'procurement',  -- Invoice issues, price spikes, duplicate vendors
  'service',      -- Reviews, wait times, table turn anomalies
  'compliance'    -- Policy violations, missing attestations
);

-- Signal sources (how was it detected)
CREATE TYPE signal_source AS ENUM (
  'rule',   -- Hard-coded business rule
  'model',  -- Statistical/ML model
  'ai'      -- LLM-based analysis
);

-- Severity levels (impact-based classification)
CREATE TYPE feedback_severity AS ENUM (
  'info',      -- FYI, no action required
  'warning',   -- Needs attention, not blocking
  'critical'   -- Blocking, must be resolved
);

-- Required action types (what must the manager do?)
CREATE TYPE required_action AS ENUM (
  'acknowledge',  -- Just need to know it happened
  'explain',      -- Provide context/justification
  'correct',      -- Fix the underlying issue
  'resolve'       -- Take corrective action and verify
);

-- Feedback object lifecycle states
CREATE TYPE feedback_status AS ENUM (
  'open',          -- Newly created, not yet seen
  'acknowledged',  -- Manager has seen it
  'in_progress',   -- Being worked on
  'resolved',      -- Completed successfully
  'suppressed',    -- System-suppressed (noise)
  'escalated',     -- Sent to higher authority
  'expired'        -- Window closed, no longer actionable
);

-- Owner roles (who is responsible?)
CREATE TYPE owner_role AS ENUM (
  'venue_manager',
  'gm',            -- General Manager
  'agm',           -- Assistant General Manager
  'corporate',
  'purchasing',
  'system'         -- System-generated, no owner
);

-- =====================================================
-- TABLE: signals
-- =====================================================
-- Raw detector outputs. Every exception, anomaly, or violation
-- becomes a signal. Signals are then classified and may become
-- feedback objects.

CREATE TABLE signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE, -- NULL = org-wide
  business_date date NOT NULL,

  -- Classification
  domain feedback_domain NOT NULL,
  signal_type text NOT NULL, -- e.g., 'comp_unapproved_reason', 'cplh_over_target', 'price_spike'
  source signal_source NOT NULL DEFAULT 'rule',
  severity feedback_severity NOT NULL DEFAULT 'warning',
  confidence numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1), -- 0.0 to 1.0

  -- Impact
  impact_value numeric(12,2), -- Dollar amount or time value
  impact_unit text, -- 'usd', 'hours', 'minutes', 'percent'

  -- Entity reference (what triggered this signal?)
  entity_type text, -- 'check', 'comp', 'server', 'invoice', 'item', 'shift'
  entity_id text,   -- UUID or external ID

  -- Signal details (detector-specific payload)
  payload jsonb NOT NULL DEFAULT '{}',

  -- Deduplication (prevent same signal from multiple runs)
  dedupe_key text NOT NULL,

  -- Audit
  detected_at timestamptz NOT NULL DEFAULT now(),
  detected_run_id uuid, -- Link to nightly run/job ID
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE (org_id, venue_id, business_date, dedupe_key)
);

-- Indexes for common queries
CREATE INDEX idx_signals_org_venue_date ON signals(org_id, venue_id, business_date);
CREATE INDEX idx_signals_domain_severity ON signals(domain, severity);
CREATE INDEX idx_signals_entity ON signals(entity_type, entity_id);
CREATE INDEX idx_signals_detected_at ON signals(detected_at DESC);

-- RLS policies
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view signals for their org"
  ON signals FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_users
    WHERE user_id = auth.uid() AND is_active = TRUE
  ));

CREATE POLICY "System can insert signals"
  ON signals FOR INSERT
  WITH CHECK (true); -- System service role only

COMMENT ON TABLE signals IS 'Raw detector outputs from all monitoring systems. Unified exception/anomaly storage.';

-- =====================================================
-- TABLE: standards
-- =====================================================
-- Generalized thresholds and targets. Replaces domain-specific
-- config tables (comp_settings, labor_targets, etc.)

CREATE TABLE standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE, -- NULL = org-wide default

  -- Classification
  domain feedback_domain NOT NULL,
  standard_key text NOT NULL, -- e.g., 'cplh_target', 'high_value_comp_threshold', 'price_spike_pct'

  -- Value (flexible schema)
  value jsonb NOT NULL, -- Could be number, string, object, array
  bounds jsonb, -- Optional min/max for numeric values

  -- Version control (immutable rows)
  version int NOT NULL DEFAULT 1,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date, -- NULL = current
  superseded_by uuid REFERENCES standards(id),

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),

  -- Constraints
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Indexes
CREATE INDEX idx_standards_org_venue ON standards(org_id, venue_id);
CREATE INDEX idx_standards_domain_key ON standards(domain, standard_key);
CREATE INDEX idx_standards_effective ON standards(effective_from, effective_to);

-- Unique constraint: one active standard per org/venue/domain/key
CREATE UNIQUE INDEX idx_standards_active
  ON standards(org_id, COALESCE(venue_id, '00000000-0000-0000-0000-000000000000'::uuid), domain, standard_key)
  WHERE effective_to IS NULL;

-- RLS policies
ALTER TABLE standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view standards for their org"
  ON standards FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_users
    WHERE user_id = auth.uid() AND is_active = TRUE
  ));

CREATE POLICY "Admins can manage standards"
  ON standards FOR ALL
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('admin', 'owner')
    )
  );

COMMENT ON TABLE standards IS 'Org/venue-specific thresholds and targets. Tunable rails within fixed operating standards.';

-- =====================================================
-- TABLE: feedback_objects
-- =====================================================
-- The spine of the OpsOS control system. Every actionable
-- item becomes a feedback object with an owner, deadline,
-- and required response type.

CREATE TABLE feedback_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date date NOT NULL,

  -- Classification
  domain feedback_domain NOT NULL,

  -- Content
  title text NOT NULL, -- Short description (e.g., "High comp activity on 2/9")
  message text NOT NULL, -- Plain-language explanation

  -- Action requirements
  required_action required_action NOT NULL DEFAULT 'acknowledge',
  severity feedback_severity NOT NULL DEFAULT 'warning',
  confidence numeric(3,2), -- Inherited from signals or set manually

  -- Ownership
  owner_role owner_role NOT NULL DEFAULT 'venue_manager',
  assigned_to uuid REFERENCES auth.users(id), -- Optional specific user

  -- Deadlines
  due_at timestamptz, -- When this must be addressed

  -- State
  status feedback_status NOT NULL DEFAULT 'open',

  -- Resolution
  resolution_summary text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),

  -- Suppression (system-level noise reduction)
  suppressed_reason text,
  suppressed_at timestamptz,

  -- Escalation
  escalated_to_role owner_role,
  escalated_at timestamptz,
  escalated_reason text,

  -- Verification (for closed-loop tracking)
  verification_spec jsonb, -- Expected outcome contract
  -- Example: { "metric": "cplh", "operator": "<=", "target": 3.4, "window_days": 7 }

  -- Audit
  source_run_id uuid, -- Which nightly job created this?
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL) OR
    (status != 'resolved')
  ),
  CHECK (
    (status = 'suppressed' AND suppressed_reason IS NOT NULL) OR
    (status != 'suppressed')
  ),
  CHECK (
    (status = 'escalated' AND escalated_to_role IS NOT NULL) OR
    (status != 'escalated')
  )
);

-- Indexes
CREATE INDEX idx_feedback_org_venue_date ON feedback_objects(org_id, venue_id, business_date);
CREATE INDEX idx_feedback_status ON feedback_objects(status) WHERE status IN ('open', 'acknowledged', 'in_progress', 'escalated');
CREATE INDEX idx_feedback_severity ON feedback_objects(severity);
CREATE INDEX idx_feedback_domain ON feedback_objects(domain);
CREATE INDEX idx_feedback_owner ON feedback_objects(owner_role, assigned_to);
CREATE INDEX idx_feedback_due ON feedback_objects(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX idx_feedback_created ON feedback_objects(created_at DESC);

-- Auto-update timestamp
CREATE TRIGGER update_feedback_objects_updated_at
  BEFORE UPDATE ON feedback_objects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE feedback_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view feedback for their org/venue"
  ON feedback_objects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = feedback_objects.org_id
        AND ou.is_active = TRUE
        AND (
          ou.venue_ids IS NULL -- Access to all venues
          OR feedback_objects.venue_id = ANY(ou.venue_ids) -- Access to specific venues
          OR feedback_objects.venue_id IS NULL -- Org-wide feedback
        )
    )
  );

CREATE POLICY "Managers can update assigned feedback"
  ON feedback_objects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = feedback_objects.org_id
        AND ou.is_active = TRUE
        AND ou.role IN ('admin', 'owner', 'manager')
        AND (
          ou.venue_ids IS NULL -- Access to all venues
          OR feedback_objects.venue_id = ANY(ou.venue_ids) -- Access to specific venues
        )
    )
  );

CREATE POLICY "System can insert feedback"
  ON feedback_objects FOR INSERT
  WITH CHECK (true); -- System service role only

COMMENT ON TABLE feedback_objects IS 'Unified actionable feedback. The spine of the OpsOS closed-loop control system.';

-- =====================================================
-- TABLE: feedback_object_signals
-- =====================================================
-- Link table connecting feedback objects to their source signals.
-- Enables traceability and drill-down from feedback to raw data.

CREATE TABLE feedback_object_signals (
  feedback_object_id uuid NOT NULL REFERENCES feedback_objects(id) ON DELETE CASCADE,
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,

  -- Optional metadata
  signal_role text, -- e.g., 'primary', 'supporting', 'context'

  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (feedback_object_id, signal_id)
);

-- Indexes
CREATE INDEX idx_feedback_signals_feedback ON feedback_object_signals(feedback_object_id);
CREATE INDEX idx_feedback_signals_signal ON feedback_object_signals(signal_id);

-- RLS policies (inherit from feedback_objects)
ALTER TABLE feedback_object_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view links for their feedback"
  ON feedback_object_signals FOR SELECT
  USING (
    feedback_object_id IN (
      SELECT id FROM feedback_objects
      WHERE org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

COMMENT ON TABLE feedback_object_signals IS 'Links feedback objects to their source signals for traceability.';

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get active standard for a given org/venue/domain/key
CREATE OR REPLACE FUNCTION get_active_standard(
  p_org_id uuid,
  p_venue_id uuid,
  p_domain feedback_domain,
  p_standard_key text,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  -- Try venue-specific first, fall back to org-wide
  SELECT value
  FROM standards
  WHERE org_id = p_org_id
    AND (venue_id = p_venue_id OR venue_id IS NULL)
    AND domain = p_domain
    AND standard_key = p_standard_key
    AND effective_from <= p_date
    AND (effective_to IS NULL OR effective_to > p_date)
  ORDER BY venue_id NULLS LAST -- Prefer venue-specific over org-wide
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_active_standard IS 'Fetch active standard value with venue → org fallback';

-- Check if attestation can be submitted (gating function for P1)
CREATE OR REPLACE FUNCTION can_submit_attestation(
  p_org_id uuid,
  p_venue_id uuid,
  p_business_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- Attestation is blocked if there are open critical feedback items
  -- that require more than just acknowledgment
  SELECT NOT EXISTS (
    SELECT 1
    FROM feedback_objects
    WHERE org_id = p_org_id
      AND venue_id = p_venue_id
      AND business_date = p_business_date
      AND severity = 'critical'
      AND status IN ('open', 'in_progress')
      AND required_action != 'acknowledge'
  );
$$;

COMMENT ON FUNCTION can_submit_attestation IS 'Enforcement gate: blocks attestation if critical feedback is unresolved';

-- Generate feedback inbox query (for P1 UI)
CREATE OR REPLACE FUNCTION get_feedback_inbox(
  p_org_id uuid,
  p_venue_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  business_date date,
  domain feedback_domain,
  title text,
  severity feedback_severity,
  required_action required_action,
  status feedback_status,
  due_at timestamptz,
  signal_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    fo.id,
    fo.business_date,
    fo.domain,
    fo.title,
    fo.severity,
    fo.required_action,
    fo.status,
    fo.due_at,
    COUNT(fos.signal_id) as signal_count
  FROM feedback_objects fo
  LEFT JOIN feedback_object_signals fos ON fos.feedback_object_id = fo.id
  WHERE fo.org_id = p_org_id
    AND (p_venue_id IS NULL OR fo.venue_id = p_venue_id)
    AND fo.status IN ('open', 'acknowledged', 'in_progress', 'escalated')
  GROUP BY fo.id
  ORDER BY
    CASE fo.severity
      WHEN 'critical' THEN 1
      WHEN 'warning' THEN 2
      WHEN 'info' THEN 3
    END,
    fo.due_at ASC NULLS LAST,
    fo.created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_feedback_inbox IS 'Fetch active feedback items sorted by severity and deadline';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next steps (P1-P4):
-- - P1: feedback_views, attestation_feedback, gating triggers
-- - P2: preshift_briefings, preshift_instructions
-- - P3: feedback_outcomes, verification evaluator
-- - P4: accounting_exports, handoff enforcement
-- =====================================================
