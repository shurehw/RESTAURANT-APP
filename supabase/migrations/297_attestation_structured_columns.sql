-- ============================================================================
-- 297: Attestation — Add all structured prompt columns
-- Consolidates columns from migrations 250, 253, 254, 255, 290 that were
-- not yet applied to production. Uses IF NOT EXISTS for idempotency.
-- ============================================================================

-- From 250: Acknowledge booleans + closing narrative
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS comp_acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS incidents_acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coaching_acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS closing_narrative TEXT;

-- From 253: Revenue structured prompts (6 fields)
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS revenue_driver TEXT,
  ADD COLUMN IF NOT EXISTS revenue_mgmt_impact TEXT,
  ADD COLUMN IF NOT EXISTS revenue_lost_opportunity TEXT,
  ADD COLUMN IF NOT EXISTS revenue_demand_signal TEXT,
  ADD COLUMN IF NOT EXISTS revenue_quality TEXT,
  ADD COLUMN IF NOT EXISTS revenue_action TEXT;

-- From 254: Comp, Labor, Coaching, Guest structured prompts
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS comp_driver TEXT,
  ADD COLUMN IF NOT EXISTS comp_pattern TEXT,
  ADD COLUMN IF NOT EXISTS comp_compliance TEXT,
  ADD COLUMN IF NOT EXISTS comp_notes TEXT,
  ADD COLUMN IF NOT EXISTS labor_foh_coverage TEXT,
  ADD COLUMN IF NOT EXISTS labor_boh_performance TEXT,
  ADD COLUMN IF NOT EXISTS labor_decision TEXT,
  ADD COLUMN IF NOT EXISTS labor_change TEXT,
  ADD COLUMN IF NOT EXISTS coaching_team_focus TEXT,
  ADD COLUMN IF NOT EXISTS coaching_notes TEXT,
  ADD COLUMN IF NOT EXISTS guest_vip_notable TEXT,
  ADD COLUMN IF NOT EXISTS guest_experience TEXT,
  ADD COLUMN IF NOT EXISTS guest_opportunity TEXT;

-- From 255: Coaching FOH/BOH split
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS coaching_foh_standout TEXT,
  ADD COLUMN IF NOT EXISTS coaching_foh_development TEXT,
  ADD COLUMN IF NOT EXISTS coaching_boh_standout TEXT,
  ADD COLUMN IF NOT EXISTS coaching_boh_development TEXT;

-- From 290: FOH/BOH staffing split
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS foh_staffing_decision TEXT,
  ADD COLUMN IF NOT EXISTS boh_staffing_decision TEXT,
  ADD COLUMN IF NOT EXISTS foh_acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boh_acknowledged BOOLEAN DEFAULT FALSE;

-- Incident notes (checked by completionState)
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS incident_notes TEXT;
