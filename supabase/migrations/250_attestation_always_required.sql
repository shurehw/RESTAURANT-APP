-- ============================================================================
-- 250: Attestation — All modules required + closing narrative
--
-- 1. Add acknowledge booleans for modules that may have nothing to report
-- 2. Add closing_narrative for unified AI summary
-- ============================================================================

-- Acknowledge toggles (comps, incidents, coaching)
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS comp_acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS incidents_acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coaching_acknowledged BOOLEAN DEFAULT FALSE;

-- Unified AI closing narrative (persisted with attestation)
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS closing_narrative TEXT;

COMMENT ON COLUMN nightly_attestations.comp_acknowledged IS
  'Manager acknowledged comp module with nothing to report';
COMMENT ON COLUMN nightly_attestations.incidents_acknowledged IS
  'Manager acknowledged incidents module with nothing to report';
COMMENT ON COLUMN nightly_attestations.coaching_acknowledged IS
  'Manager acknowledged coaching module with nothing to report';
COMMENT ON COLUMN nightly_attestations.closing_narrative IS
  'AI-generated unified closing summary incorporating all manager inputs';
