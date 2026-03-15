-- ============================================================================
-- Allow null attestation_id on attestation_signals
-- Review-sourced signals (guest_review_mention) don't originate from attestations
-- ============================================================================

ALTER TABLE attestation_signals
  ALTER COLUMN attestation_id DROP NOT NULL;
