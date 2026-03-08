-- ============================================================================
-- MIGRATION 285: Add 'channel' recommendation type
-- ============================================================================
-- Extends pacing_recommendations to support channel allocation suggestions.
-- Channel recommendations are advisory (manual action in SR admin) until
-- the access_rules API write scope is provisioned.
-- ============================================================================

-- Drop and recreate the check constraint to include 'channel'
ALTER TABLE pacing_recommendations
  DROP CONSTRAINT IF EXISTS pacing_recommendations_rec_type_check;

ALTER TABLE pacing_recommendations
  ADD CONSTRAINT pacing_recommendations_rec_type_check
  CHECK (rec_type IN ('covers', 'pacing', 'turn_time', 'channel'));

SELECT 'Added channel rec_type to pacing_recommendations' AS status;
