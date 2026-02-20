-- 251: Add Guest module fields to nightly_attestations
-- Captures VIP/notable guest information during attestation

ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS guest_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS guest_notes TEXT,
  ADD COLUMN IF NOT EXISTS guest_acknowledged BOOLEAN DEFAULT FALSE;
