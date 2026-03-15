-- ============================================================================
-- Fix guest_review_id FK on attestation_signals to point to reviews_raw
-- instead of guest_reviews (reviews_raw is the actual table with Widewail data)
-- ============================================================================

-- Drop the incorrect FK constraint
ALTER TABLE attestation_signals
  DROP CONSTRAINT IF EXISTS attestation_signals_guest_review_id_fkey;

-- Re-add pointing to reviews_raw
ALTER TABLE attestation_signals
  ADD CONSTRAINT attestation_signals_guest_review_id_fkey
  FOREIGN KEY (guest_review_id) REFERENCES reviews_raw(id) ON DELETE SET NULL;
