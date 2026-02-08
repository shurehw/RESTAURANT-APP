-- ============================================================================
-- VENUE COORDINATES
-- Add lat/lon/timezone to venues for weather integration in forecaster
-- Moves hardcoded VENUE_COORDS out of Python code into DB
-- ============================================================================

ALTER TABLE venues ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Los_Angeles';

-- Populate coordinates for all active venues
-- LA venues (West Hollywood / Hollywood area)
UPDATE venues SET latitude = 34.0901, longitude = -118.3650, timezone = 'America/Los_Angeles'
  WHERE name = 'Delilah LA';

UPDATE venues SET latitude = 34.0770, longitude = -118.3767, timezone = 'America/Los_Angeles'
  WHERE name = 'Nice Guy LA';

UPDATE venues SET latitude = 34.1010, longitude = -118.3340, timezone = 'America/Los_Angeles'
  WHERE name = 'Keys Los Angeles';

UPDATE venues SET latitude = 34.0840, longitude = -118.3770, timezone = 'America/Los_Angeles'
  WHERE name = 'Poppy';

UPDATE venues SET latitude = 34.0900, longitude = -118.3850, timezone = 'America/Los_Angeles'
  WHERE name = 'Bird Streets Club';

UPDATE venues SET latitude = 34.0900, longitude = -118.3800, timezone = 'America/Los_Angeles'
  WHERE name = 'Didi Events';

-- Miami
UPDATE venues SET latitude = 25.7878, longitude = -80.1327, timezone = 'America/New_York'
  WHERE name = 'Delilah Miami';

-- Dallas
UPDATE venues SET latitude = 32.7767, longitude = -96.7970, timezone = 'America/Chicago'
  WHERE name = 'Delilah Dallas';

-- Verify
SELECT name, latitude, longitude, timezone
FROM venues
WHERE is_active = true
ORDER BY name;
