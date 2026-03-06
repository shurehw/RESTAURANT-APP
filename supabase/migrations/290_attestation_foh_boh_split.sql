-- Split Labor attestation into separate FOH and BOH steps
-- Each department gets its own staffing decision prompt and acknowledge flag

ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS foh_staffing_decision TEXT,
  ADD COLUMN IF NOT EXISTS boh_staffing_decision TEXT,
  ADD COLUMN IF NOT EXISTS foh_acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boh_acknowledged BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN nightly_attestations.foh_staffing_decision IS 'Any FOH staffing adjustments you''d make in hindsight?';
COMMENT ON COLUMN nightly_attestations.boh_staffing_decision IS 'Any BOH staffing adjustments you''d make in hindsight?';
COMMENT ON COLUMN nightly_attestations.foh_acknowledged IS 'Nothing to report — standard FOH staffing';
COMMENT ON COLUMN nightly_attestations.boh_acknowledged IS 'Nothing to report — standard BOH staffing';
