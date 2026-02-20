-- ============================================================================
-- 254: Attestation — Structured Prompts for Comps, Labor, Coaching, Guest
-- Adds focused prompt columns for each module. Same pattern as revenue (253).
-- Structured prompts replace single-textarea input with multi-prompt signal
-- extraction. Legacy columns (comp_notes, labor_foh_notes, etc.) are kept
-- for backward compatibility with existing attestations.
-- ============================================================================

-- Comps — 3 structured prompts
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS comp_driver TEXT,
  ADD COLUMN IF NOT EXISTS comp_pattern TEXT,
  ADD COLUMN IF NOT EXISTS comp_compliance TEXT;

COMMENT ON COLUMN nightly_attestations.comp_driver IS 'What drove comp activity tonight?';
COMMENT ON COLUMN nightly_attestations.comp_pattern IS 'Any patterns in how comps were used across servers or categories?';
COMMENT ON COLUMN nightly_attestations.comp_compliance IS 'Were comps appropriately managed tonight? Any concerns?';

-- Labor — 4 structured prompts
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS labor_foh_coverage TEXT,
  ADD COLUMN IF NOT EXISTS labor_boh_performance TEXT,
  ADD COLUMN IF NOT EXISTS labor_decision TEXT,
  ADD COLUMN IF NOT EXISTS labor_change TEXT;

COMMENT ON COLUMN nightly_attestations.labor_foh_coverage IS 'How was floor coverage and service pacing tonight?';
COMMENT ON COLUMN nightly_attestations.labor_boh_performance IS 'How was kitchen staffing and line performance?';
COMMENT ON COLUMN nightly_attestations.labor_decision IS 'What staffing decisions did you make tonight?';
COMMENT ON COLUMN nightly_attestations.labor_change IS 'What would you change about tonight''s labor plan?';

-- Coaching — 3 structured prompts
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS coaching_standout TEXT,
  ADD COLUMN IF NOT EXISTS coaching_development TEXT,
  ADD COLUMN IF NOT EXISTS coaching_team_focus TEXT;

COMMENT ON COLUMN nightly_attestations.coaching_standout IS 'Who stood out positively tonight and why?';
COMMENT ON COLUMN nightly_attestations.coaching_development IS 'Who needs attention or development and what for?';
COMMENT ON COLUMN nightly_attestations.coaching_team_focus IS 'What is one team-wide improvement to focus on?';

-- Guest — 3 structured prompts
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS guest_vip_notable TEXT,
  ADD COLUMN IF NOT EXISTS guest_experience TEXT,
  ADD COLUMN IF NOT EXISTS guest_opportunity TEXT;

COMMENT ON COLUMN nightly_attestations.guest_vip_notable IS 'Any VIPs, celebrities, or notable guests tonight?';
COMMENT ON COLUMN nightly_attestations.guest_experience IS 'How was the overall guest experience quality?';
COMMENT ON COLUMN nightly_attestations.guest_opportunity IS 'Any relationship-building moments or missed opportunities?';
