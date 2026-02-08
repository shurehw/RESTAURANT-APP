-- Add fiscal calendar settings to organization_settings
-- Previously these were on proforma_settings, but fiscal calendar is an org-wide operational setting

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS fiscal_calendar_type TEXT NOT NULL DEFAULT '4-4-5',
  ADD COLUMN IF NOT EXISTS fiscal_year_start_date DATE;

-- Constraint for valid calendar types
DO $$ BEGIN
  ALTER TABLE organization_settings
    ADD CONSTRAINT chk_fiscal_calendar_type
    CHECK (fiscal_calendar_type IN ('standard', '4-4-5', '4-5-4', '5-4-4'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN organization_settings.fiscal_calendar_type IS 'Fiscal calendar pattern: standard (monthly), 4-4-5, 4-5-4, or 5-4-4';
COMMENT ON COLUMN organization_settings.fiscal_year_start_date IS 'First day of the fiscal year (e.g. 2025-12-29 for FY2026). NULL = Jan 1.';
