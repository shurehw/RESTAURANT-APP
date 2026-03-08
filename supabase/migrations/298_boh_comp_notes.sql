-- Add BOH kitchen context notes to comp resolutions
ALTER TABLE comp_resolutions ADD COLUMN IF NOT EXISTS boh_notes TEXT;

-- Expand resolution_code CHECK to include pending_foh_resolution sentinel
ALTER TABLE comp_resolutions DROP CONSTRAINT IF EXISTS comp_resolutions_resolution_code_check;
ALTER TABLE comp_resolutions ADD CONSTRAINT comp_resolutions_resolution_code_check
  CHECK (resolution_code IN (
    'legitimate_guest_recovery', 'manager_approved_promo',
    'employee_meal', 'vip_courtesy', 'kitchen_error',
    'service_failure', 'policy_violation', 'needs_investigation',
    'training_required', 'pending_foh_resolution'
  ));

-- Unique index for upsert (BOH creates stub, FOH updates same record)
DELETE FROM comp_resolutions a USING comp_resolutions b
  WHERE a.id > b.id
  AND a.attestation_id = b.attestation_id
  AND a.check_id = b.check_id
  AND a.check_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_resolution_attestation_check
  ON comp_resolutions(attestation_id, check_id) WHERE check_id IS NOT NULL;

-- BOH comps acknowledgment on attestation
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS boh_comps_acknowledged BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN comp_resolutions.boh_notes IS 'Kitchen context notes from BOH manager';
COMMENT ON COLUMN nightly_attestations.boh_comps_acknowledged IS 'Nothing to report — no kitchen context for comps';
