-- ============================================================================
-- ATTESTATION DASHBOARD ROLLUPS
-- Adds precomputed fields to nightly_attestations for fast compliance queries
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTION: Generate date series for grid
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_date_series(start_date DATE, end_date DATE)
RETURNS TABLE(date DATE)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT generate_series(start_date, end_date, interval '1 day')::date AS date;
$$;

COMMENT ON FUNCTION generate_date_series IS
  'Generates a series of dates between start_date and end_date (inclusive).
   Used by attestation dashboard to build venue x date grid.';

-- ============================================================================
-- ROLLUP COLUMNS
-- ============================================================================

-- Add rollup columns to nightly_attestations
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS has_violations BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS critical_incident_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comp_violation_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_escalation BOOLEAN DEFAULT false;

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_attestations_dashboard_status
  ON nightly_attestations(status, business_date DESC, venue_id)
  WHERE status IN ('draft', 'submitted');

CREATE INDEX IF NOT EXISTS idx_attestations_violations
  ON nightly_attestations(has_violations, business_date DESC)
  WHERE has_violations = true;

CREATE INDEX IF NOT EXISTS idx_attestations_escalation
  ON nightly_attestations(requires_escalation, business_date DESC)
  WHERE requires_escalation = true;

-- Add resolution tracking to comp_resolutions (if not exists)
ALTER TABLE comp_resolutions
  ADD COLUMN IF NOT EXISTS is_policy_violation BOOLEAN DEFAULT false;

-- Add escalation flag to incidents (if not exists)
ALTER TABLE nightly_incidents
  ADD COLUMN IF NOT EXISTS requires_escalation BOOLEAN DEFAULT false;

-- ============================================================================
-- HELPER FUNCTION: Recompute attestation rollups
-- Called after submit to update precomputed counts
-- ============================================================================

CREATE OR REPLACE FUNCTION recompute_attestation_rollups(p_attestation_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_comp_violations INT;
  v_critical_incidents INT;
  v_total_violations INT;
  v_needs_escalation BOOLEAN;
BEGIN
  -- Count comp policy violations
  SELECT COUNT(*)
  INTO v_comp_violations
  FROM comp_resolutions
  WHERE attestation_id = p_attestation_id
    AND (is_policy_violation = true OR requires_follow_up = true);

  -- Count critical incidents
  SELECT COUNT(*)
  INTO v_critical_incidents
  FROM nightly_incidents
  WHERE attestation_id = p_attestation_id
    AND severity IN ('high', 'critical');

  -- Total violations (comps + critical incidents + variances)
  v_total_violations := v_comp_violations + v_critical_incidents;

  -- Check if escalation needed
  v_needs_escalation := (v_critical_incidents > 0 OR v_comp_violations > 0);

  -- Update attestation
  UPDATE nightly_attestations
  SET
    comp_violation_count = v_comp_violations,
    critical_incident_count = v_critical_incidents,
    violation_count = v_total_violations,
    has_violations = (v_total_violations > 0),
    requires_escalation = v_needs_escalation,
    updated_at = NOW()
  WHERE id = p_attestation_id;
END;
$$;

COMMENT ON FUNCTION recompute_attestation_rollups IS
  'Recomputes precomputed rollup fields for attestation dashboard queries.
   Call this after submitting an attestation or updating child records.';

-- ============================================================================
-- TRIGGER: Auto-recompute on comp resolution changes
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_recompute_attestation_rollups()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- On INSERT/UPDATE/DELETE of comp_resolutions or incidents,
  -- recompute the parent attestation's rollups
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM recompute_attestation_rollups(NEW.attestation_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recompute_attestation_rollups(OLD.attestation_id);
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_comp_resolutions_recompute ON comp_resolutions;
CREATE TRIGGER trg_comp_resolutions_recompute
  AFTER INSERT OR UPDATE OR DELETE ON comp_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recompute_attestation_rollups();

DROP TRIGGER IF EXISTS trg_incidents_recompute ON nightly_incidents;
CREATE TRIGGER trg_incidents_recompute
  AFTER INSERT OR UPDATE OR DELETE ON nightly_incidents
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recompute_attestation_rollups();

-- ============================================================================
-- BACKFILL: Compute rollups for existing attestations
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM nightly_attestations WHERE status = 'submitted'
  LOOP
    PERFORM recompute_attestation_rollups(r.id);
  END LOOP;
END;
$$;
