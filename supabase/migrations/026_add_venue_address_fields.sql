-- Add address and contact fields to venues table

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN venues.location IS 'Location nickname (e.g., "West Hollywood")';
COMMENT ON COLUMN venues.address IS 'Street address';
COMMENT ON COLUMN venues.city IS 'City';
COMMENT ON COLUMN venues.state IS 'State/Province';
COMMENT ON COLUMN venues.zip_code IS 'ZIP/Postal code';
COMMENT ON COLUMN venues.phone IS 'Phone number';
