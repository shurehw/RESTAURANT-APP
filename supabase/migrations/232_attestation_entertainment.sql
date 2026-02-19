-- 232: Add entertainment attestation columns
-- Entertainment tags + notes for nightly attestation step

ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS entertainment_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS entertainment_notes TEXT;
