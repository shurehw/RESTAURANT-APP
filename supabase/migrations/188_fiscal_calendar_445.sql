-- Set fiscal calendar to 4-4-5 with FY starting Dec 29, 2025
-- This fixes PTD (Period-to-Date) calculations in the nightly report.
-- Previously PTD defaulted to the current calendar week (same as WTD).

-- Disable audit trigger (requires authenticated user which isn't available in migrations)
ALTER TABLE proforma_settings DISABLE TRIGGER audit_proforma_settings;

UPDATE proforma_settings
SET fiscal_calendar_type = '4-4-5',
    fiscal_year_start_date = '2025-12-29'
WHERE fiscal_calendar_type = 'standard'
   OR fiscal_calendar_type IS NULL;

ALTER TABLE proforma_settings ENABLE TRIGGER audit_proforma_settings;
