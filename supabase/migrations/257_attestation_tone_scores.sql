-- ============================================================================
-- 257: Attestation Ownership Scores — AI-scored operational command metrics
--
-- NOT tone. NOT writing quality. Operational ownership measurement.
--
-- Scored on every attestation submission alongside signal extraction.
-- Measures whether the manager is operating like an owner or clocking in.
--
-- Dimensions:
--   narrative_depth (0-10) — concrete numbers, cause/effect, decisions described
--   ownership       (0-10) — "I adjusted" vs "we were busy"; corrective actions taken
--   variance_awareness (0-10) — references forecast, SDLW, pacing, identifies deviation
--   signal_density  (0-10) — named employees, menu items, table refs per 100 words
--
-- Flags (boolean):
--   avoidance_flag — vague language masking a bad night ("overall good", "smooth night")
--   corrective_action_flag — manager describes actions they took to fix problems
--   variance_reference_flag — explicitly references forecast/SDLW/benchmark data
--   blame_shift_flag — deflects to external factors without acknowledging management levers
-- ============================================================================

ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS ownership_scores JSONB;

COMMENT ON COLUMN nightly_attestations.ownership_scores IS 'AI-scored operational ownership: narrative_depth, ownership, variance_awareness, signal_density (0-10) + boolean flags + overall_command_score + rationale';

-- Index for querying (find low-ownership attestations, avoidance patterns)
CREATE INDEX IF NOT EXISTS idx_attestations_ownership ON nightly_attestations
  USING gin(ownership_scores) WHERE ownership_scores IS NOT NULL;

-- Drop the old tone column if it exists (never deployed)
ALTER TABLE nightly_attestations
  DROP COLUMN IF EXISTS tone_scores;
