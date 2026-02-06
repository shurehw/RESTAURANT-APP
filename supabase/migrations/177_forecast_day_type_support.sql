-- ============================================================================
-- FORECAST DAY-TYPE SUPPORT
-- Add day_type segmentation for better forecast accuracy
-- ============================================================================

-- Day type enum for demand forecasting
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'day_type') THEN
    CREATE TYPE day_type AS ENUM ('weekday', 'friday', 'saturday', 'sunday', 'holiday');
  END IF;
END$$;

-- Add day_type column to demand_forecasts if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'demand_forecasts' AND column_name = 'day_type'
  ) THEN
    ALTER TABLE demand_forecasts ADD COLUMN day_type day_type;
  END IF;
END$$;

-- Function to calculate day_type from a date
CREATE OR REPLACE FUNCTION get_day_type(d DATE)
RETURNS day_type AS $$
DECLARE
  dow INTEGER;
BEGIN
  dow := EXTRACT(DOW FROM d);

  -- Check for US holidays (simplified list)
  -- TODO: Add venue-specific holiday calendar
  IF d IN (
    -- 2025 holidays
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-07-04',
    '2025-09-01', '2025-11-27', '2025-11-28', '2025-12-25', '2025-12-31',
    -- 2026 holidays
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-04',
    '2026-09-07', '2026-11-26', '2026-11-27', '2026-12-25', '2026-12-31'
  ) THEN
    RETURN 'holiday'::day_type;
  END IF;

  CASE dow
    WHEN 0 THEN RETURN 'sunday'::day_type;  -- Sunday
    WHEN 5 THEN RETURN 'friday'::day_type;  -- Friday
    WHEN 6 THEN RETURN 'saturday'::day_type; -- Saturday
    ELSE RETURN 'weekday'::day_type;         -- Mon-Thu
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill day_type for existing forecasts
UPDATE demand_forecasts
SET day_type = get_day_type(business_date)
WHERE day_type IS NULL;

-- Create index for day_type queries
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_day_type
ON demand_forecasts(venue_id, day_type, business_date DESC);

-- View for forecast with bias correction applied
CREATE OR REPLACE VIEW forecasts_with_bias AS
SELECT
  f.id,
  f.venue_id,
  f.business_date,
  f.shift_type,
  f.day_type,
  f.covers_predicted as covers_raw,
  f.revenue_predicted as revenue_raw,
  f.model_version,

  -- Apply bias correction
  f.covers_predicted + COALESCE(
    -- First check day-type specific offset
    (b.day_type_offsets->>f.day_type::text)::integer,
    -- Fall back to general offset
    b.covers_offset,
    0
  ) as covers_predicted,

  f.revenue_predicted + COALESCE(b.revenue_offset, 0) as revenue_predicted,

  -- Confidence intervals adjusted
  f.covers_lower + COALESCE(b.covers_offset, 0) as covers_lower,
  f.covers_upper + COALESCE(b.covers_offset, 0) as covers_upper,

  -- Flag if bias-corrected
  CASE WHEN b.id IS NOT NULL THEN true ELSE false END as bias_corrected,
  b.reason as bias_reason

FROM demand_forecasts f
LEFT JOIN forecast_bias_adjustments b ON
  b.venue_id = f.venue_id
  AND b.effective_from <= f.business_date
  AND (b.effective_to IS NULL OR b.effective_to >= f.business_date);

-- Grant access
GRANT SELECT ON forecasts_with_bias TO authenticated;

SELECT 'Day-type support and bias-corrected view created' as status;
