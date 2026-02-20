-- ============================================================================
-- COACHING FOH/BOH SPLIT
-- Split coaching prompts into separate FOH and BOH sections so each manager
-- can attest their own department. Team focus remains shared.
-- ============================================================================

-- New FOH coaching columns
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS coaching_foh_standout TEXT,
  ADD COLUMN IF NOT EXISTS coaching_foh_development TEXT;

-- New BOH coaching columns
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS coaching_boh_standout TEXT,
  ADD COLUMN IF NOT EXISTS coaching_boh_development TEXT;

-- coaching_team_focus already exists from migration 254

COMMENT ON COLUMN nightly_attestations.coaching_foh_standout IS 'Who stood out on the floor tonight?';
COMMENT ON COLUMN nightly_attestations.coaching_foh_development IS 'Any FOH team members needing attention or development?';
COMMENT ON COLUMN nightly_attestations.coaching_boh_standout IS 'Who stood out in the kitchen tonight?';
COMMENT ON COLUMN nightly_attestations.coaching_boh_development IS 'Any BOH team members needing attention or development?';
