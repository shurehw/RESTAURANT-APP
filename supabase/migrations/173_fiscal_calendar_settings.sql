-- Add fiscal calendar settings to proforma_settings
-- Supports 4-4-5, 4-5-4, 5-4-4 fiscal calendars

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fiscal_calendar_type text NOT NULL DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS fiscal_year_start_date date;

-- Add check constraint for valid calendar types
ALTER TABLE proforma_settings
DROP CONSTRAINT IF EXISTS proforma_settings_fiscal_calendar_type_check;

ALTER TABLE proforma_settings
ADD CONSTRAINT proforma_settings_fiscal_calendar_type_check
CHECK (fiscal_calendar_type IN ('standard', '4-4-5', '4-5-4', '5-4-4'));

-- Create a helper function to get fiscal period info for a given date
CREATE OR REPLACE FUNCTION get_fiscal_period(
  p_date date,
  p_calendar_type text,
  p_fy_start_date date
)
RETURNS TABLE (
  fiscal_year int,
  fiscal_quarter int,
  fiscal_period int,
  period_start_date date,
  period_end_date date,
  week_in_period int
) AS $$
DECLARE
  v_fy_start date;
  v_days_from_start int;
  v_week_num int;
  v_quarter int;
  v_period_in_quarter int;
  v_period int;
  v_weeks_pattern int[];
  v_cumulative_weeks int;
  v_period_start date;
  v_period_end date;
  v_week_in_period int;
  v_fiscal_year int;
BEGIN
  -- For standard calendar, use calendar weeks
  IF p_calendar_type = 'standard' OR p_fy_start_date IS NULL THEN
    RETURN QUERY
    SELECT
      EXTRACT(YEAR FROM p_date)::int,
      EXTRACT(QUARTER FROM p_date)::int,
      EXTRACT(MONTH FROM p_date)::int,
      date_trunc('week', p_date)::date,
      (date_trunc('week', p_date) + interval '6 days')::date,
      1;
    RETURN;
  END IF;

  -- Determine which fiscal year the date falls into
  v_fy_start := p_fy_start_date;
  v_fiscal_year := EXTRACT(YEAR FROM p_fy_start_date)::int + 1; -- FY is named for the year it ends

  -- If date is before this FY start, go back a year
  IF p_date < v_fy_start THEN
    v_fy_start := v_fy_start - interval '364 days'; -- 52 weeks
    v_fiscal_year := v_fiscal_year - 1;
  END IF;

  -- If date is way past this FY, go forward
  WHILE p_date >= v_fy_start + interval '364 days' LOOP
    v_fy_start := v_fy_start + interval '364 days';
    v_fiscal_year := v_fiscal_year + 1;
  END LOOP;

  -- Calculate days from FY start
  v_days_from_start := p_date - v_fy_start;
  v_week_num := v_days_from_start / 7 + 1; -- 1-based week number

  -- Set weeks pattern based on calendar type
  CASE p_calendar_type
    WHEN '4-4-5' THEN v_weeks_pattern := ARRAY[4, 4, 5];
    WHEN '4-5-4' THEN v_weeks_pattern := ARRAY[4, 5, 4];
    WHEN '5-4-4' THEN v_weeks_pattern := ARRAY[5, 4, 4];
    ELSE v_weeks_pattern := ARRAY[4, 4, 5]; -- default
  END CASE;

  -- Find which period the week falls into
  v_cumulative_weeks := 0;
  v_period := 0;
  v_period_start := v_fy_start;

  FOR v_quarter IN 1..4 LOOP
    FOR v_period_in_quarter IN 1..3 LOOP
      v_period := v_period + 1;
      v_cumulative_weeks := v_cumulative_weeks + v_weeks_pattern[v_period_in_quarter];

      IF v_week_num <= v_cumulative_weeks THEN
        -- Found the period
        v_period_end := v_period_start + (v_weeks_pattern[v_period_in_quarter] * 7 - 1) * interval '1 day';
        v_week_in_period := v_week_num - (v_cumulative_weeks - v_weeks_pattern[v_period_in_quarter]);

        RETURN QUERY
        SELECT
          v_fiscal_year,
          v_quarter,
          v_period,
          v_period_start,
          v_period_end::date,
          v_week_in_period;
        RETURN;
      END IF;

      v_period_start := v_period_start + v_weeks_pattern[v_period_in_quarter] * interval '7 days';
    END LOOP;
  END LOOP;

  -- Fallback (shouldn't reach here)
  RETURN QUERY
  SELECT v_fiscal_year, 4, 12, v_period_start, (v_period_start + interval '34 days')::date, 1;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON COLUMN proforma_settings.fiscal_calendar_type IS 'Fiscal calendar type: standard (calendar), 4-4-5, 4-5-4, or 5-4-4';
COMMENT ON COLUMN proforma_settings.fiscal_year_start_date IS 'Start date of the current fiscal year (e.g., 2025-12-29 for FY2026)';
