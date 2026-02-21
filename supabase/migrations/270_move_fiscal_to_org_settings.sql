-- Move fiscal calendar settings from proforma_settings to organization_settings
-- Fiscal calendar is an org-wide setting, not specific to pro forma forecasting

-- Add columns to organization_settings
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS fiscal_calendar_type text NOT NULL DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS fiscal_year_start_date date;

-- Add check constraint
ALTER TABLE organization_settings
DROP CONSTRAINT IF EXISTS organization_settings_fiscal_calendar_type_check;

ALTER TABLE organization_settings
ADD CONSTRAINT organization_settings_fiscal_calendar_type_check
CHECK (fiscal_calendar_type IN ('standard', '4-4-5', '4-5-4', '5-4-4'));

-- Copy existing data from proforma_settings to organization_settings
UPDATE organization_settings os
SET
  fiscal_calendar_type = COALESCE(ps.fiscal_calendar_type, 'standard'),
  fiscal_year_start_date = ps.fiscal_year_start_date
FROM proforma_settings ps
WHERE os.organization_id = ps.organization_id
  AND ps.fiscal_calendar_type IS NOT NULL;

-- Remove columns from proforma_settings (they were never the right place)
ALTER TABLE proforma_settings
DROP COLUMN IF EXISTS fiscal_calendar_type,
DROP COLUMN IF EXISTS fiscal_year_start_date;

-- Add comments
COMMENT ON COLUMN organization_settings.fiscal_calendar_type IS 'Fiscal calendar type: standard (calendar), 4-4-5, 4-5-4, or 5-4-4';
COMMENT ON COLUMN organization_settings.fiscal_year_start_date IS 'Start date of the current fiscal year (e.g., 2025-12-29 for FY2026)';
