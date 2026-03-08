-- Set default value for default_utilization_pct to prevent NULL values
-- This ensures all new participation records get a sensible default

ALTER TABLE proforma_center_service_participation
  ALTER COLUMN default_utilization_pct SET DEFAULT 65.0;

-- Update any existing NULL values to 65.0
UPDATE proforma_center_service_participation
SET default_utilization_pct = 65.0
WHERE default_utilization_pct IS NULL;

COMMENT ON COLUMN proforma_center_service_participation.default_utilization_pct IS
  'Target utilization percentage for this center during this service period (defaults to 65%)';
