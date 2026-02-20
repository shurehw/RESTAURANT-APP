-- ============================================================================
-- 253: Revenue Attestation — Structured Prompts
-- Replaces single revenue_notes with 6 focused prompts that elicit
-- structured signal for downstream AI extraction.
-- ============================================================================

ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS revenue_driver TEXT,
  ADD COLUMN IF NOT EXISTS revenue_mgmt_impact TEXT,
  ADD COLUMN IF NOT EXISTS revenue_lost_opportunity TEXT,
  ADD COLUMN IF NOT EXISTS revenue_demand_signal TEXT,
  ADD COLUMN IF NOT EXISTS revenue_quality TEXT,
  ADD COLUMN IF NOT EXISTS revenue_action TEXT;

COMMENT ON COLUMN nightly_attestations.revenue_driver IS 'What specifically drove tonight''s revenue outcome?';
COMMENT ON COLUMN nightly_attestations.revenue_mgmt_impact IS 'What did management do that materially impacted revenue?';
COMMENT ON COLUMN nightly_attestations.revenue_lost_opportunity IS 'Where did we lose revenue opportunity?';
COMMENT ON COLUMN nightly_attestations.revenue_demand_signal IS 'Did demand feel stronger or weaker than forecast? Why?';
COMMENT ON COLUMN nightly_attestations.revenue_quality IS 'Was tonight''s revenue quality sustainable?';
COMMENT ON COLUMN nightly_attestations.revenue_action IS 'One specific action for the next comparable shift.';
