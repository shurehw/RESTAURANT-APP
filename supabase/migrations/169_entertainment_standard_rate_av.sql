-- ============================================================================
-- ENTERTAINMENT ENHANCEMENTS
-- Add standard_rate column and AV entertainment type
-- ============================================================================

-- 1. Add 'AV' to entertainment_type enum
ALTER TYPE entertainment_type ADD VALUE IF NOT EXISTS 'AV';

-- 2. Add standard_rate column to entertainment_artists
ALTER TABLE entertainment_artists
ADD COLUMN IF NOT EXISTS standard_rate NUMERIC(10,2);

COMMENT ON COLUMN entertainment_artists.standard_rate IS
  'Default rate for this performer (can be overridden per booking)';

SELECT 'Added standard_rate column and AV entertainment type' as status;
