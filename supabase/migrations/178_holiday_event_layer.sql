-- ============================================================================
-- HOLIDAY EVENT LAYER
-- Separate from day-type bias - treats holidays as distinct demand regimes
-- ============================================================================

-- Venue classification for holiday behavior
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'venue_class') THEN
    CREATE TYPE venue_class AS ENUM (
      'high_end_nightlife',  -- Delilah, Bird Streets (NYE 2-3x, Black Friday collapses)
      'steady_social',       -- Nice Guy, Poppy (holidays ~normal)
      'casual_dining'        -- Keys (moderate holiday swings)
    );
  END IF;
END$$;

-- Holiday event codes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'holiday_code') THEN
    CREATE TYPE holiday_code AS ENUM (
      'NYE',           -- New Years Eve (forced attendance event)
      'NYD',           -- New Years Day (post-event hangover)
      'BLACK_FRIDAY',  -- Shopping diversion
      'THANKSGIVING',  -- Family dining
      'CHRISTMAS',     -- Closed or minimal
      'JULY_4TH',      -- Event-dependent
      'LABOR_DAY',     -- Weekend extension
      'MEMORIAL_DAY',  -- Weekend extension
      'MLK_DAY',       -- Monday holiday
      'PRESIDENTS_DAY',-- Monday holiday
      'VALENTINES'     -- High-demand dining
    );
  END IF;
END$$;

-- Add venue_class to venues table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venues' AND column_name = 'venue_class'
  ) THEN
    ALTER TABLE venues ADD COLUMN venue_class venue_class;
  END IF;
END$$;

-- Holiday adjustments table
CREATE TABLE IF NOT EXISTS holiday_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What holiday and venue class this applies to
  holiday_code holiday_code NOT NULL,
  venue_class venue_class NOT NULL,

  -- Adjustment (additive covers offset)
  covers_offset INTEGER NOT NULL DEFAULT 0,

  -- Guardrails
  max_uplift_pct NUMERIC(5,2) DEFAULT 300, -- Cap at 3x normal
  min_floor INTEGER DEFAULT 0,             -- Never go below 0

  -- Metadata
  confidence TEXT CHECK (confidence IN ('observed', 'inferred', 'manual')) DEFAULT 'observed',
  notes TEXT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- One adjustment per holiday × venue_class
  UNIQUE(holiday_code, venue_class)
);

-- Holiday calendar lookup (maps dates to holiday codes)
CREATE TABLE IF NOT EXISTS holiday_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  holiday_code holiday_code NOT NULL,
  year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM holiday_date)) STORED,

  UNIQUE(holiday_date)
);

-- Classify existing venues based on backtest analysis
UPDATE venues SET venue_class = 'high_end_nightlife' WHERE name IN ('Delilah LA', 'Delilah Miami', 'Bird Streets Club');
UPDATE venues SET venue_class = 'steady_social' WHERE name IN ('Nice Guy LA', 'Poppy');
UPDATE venues SET venue_class = 'casual_dining' WHERE name IN ('Keys Los Angeles');

-- Populate holiday calendar (2025-2026)
INSERT INTO holiday_calendar (holiday_date, holiday_code) VALUES
  -- 2025
  ('2025-01-01', 'NYD'),
  ('2025-01-20', 'MLK_DAY'),
  ('2025-02-14', 'VALENTINES'),
  ('2025-02-17', 'PRESIDENTS_DAY'),
  ('2025-05-26', 'MEMORIAL_DAY'),
  ('2025-07-04', 'JULY_4TH'),
  ('2025-09-01', 'LABOR_DAY'),
  ('2025-11-27', 'THANKSGIVING'),
  ('2025-11-28', 'BLACK_FRIDAY'),
  ('2025-12-25', 'CHRISTMAS'),
  ('2025-12-31', 'NYE'),
  -- 2026
  ('2026-01-01', 'NYD'),
  ('2026-01-19', 'MLK_DAY'),
  ('2026-02-14', 'VALENTINES'),
  ('2026-02-16', 'PRESIDENTS_DAY'),
  ('2026-05-25', 'MEMORIAL_DAY'),
  ('2026-07-04', 'JULY_4TH'),
  ('2026-09-07', 'LABOR_DAY'),
  ('2026-11-26', 'THANKSGIVING'),
  ('2026-11-27', 'BLACK_FRIDAY'),
  ('2026-12-25', 'CHRISTMAS'),
  ('2026-12-31', 'NYE')
ON CONFLICT DO NOTHING;

-- Seed holiday adjustments based on backtest analysis
-- Only apply to venue classes where data shows significant deviation
INSERT INTO holiday_adjustments (holiday_code, venue_class, covers_offset, max_uplift_pct, confidence, notes) VALUES
  -- NYE: Forced attendance event (high_end_nightlife explodes)
  ('NYE', 'high_end_nightlife', 300, 350, 'observed', 'Miami +536, LA +269, Bird Streets +150 from backtest'),
  ('NYE', 'steady_social', 60, 150, 'observed', 'Nice Guy +123, Poppy ~0 - moderate uplift'),
  ('NYE', 'casual_dining', 10, 120, 'observed', 'Keys +11 - minimal change'),

  -- Black Friday: Shopping diversion (nightlife collapses)
  ('BLACK_FRIDAY', 'high_end_nightlife', -100, 100, 'observed', 'Miami -177, Bird Streets -98 from backtest'),
  ('BLACK_FRIDAY', 'steady_social', -20, 100, 'observed', 'Nice Guy -35, Poppy +2 - slight dip'),
  ('BLACK_FRIDAY', 'casual_dining', 0, 100, 'inferred', 'No significant change expected'),

  -- New Years Day: Post-event hangover
  ('NYD', 'high_end_nightlife', -50, 100, 'observed', 'Bird Streets predicted 144, actual 15 - collapse'),
  ('NYD', 'steady_social', 0, 100, 'observed', 'Nice Guy, Keys almost perfect'),
  ('NYD', 'casual_dining', 0, 100, 'observed', 'Keys -2 - no change needed'),

  -- MLK Day: Monday holiday (minimal impact)
  ('MLK_DAY', 'high_end_nightlife', -30, 100, 'observed', 'Bird Streets -48'),
  ('MLK_DAY', 'steady_social', 0, 100, 'observed', 'Nice Guy -2, Poppy -25 mixed'),
  ('MLK_DAY', 'casual_dining', 0, 100, 'inferred', 'No data')
ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_holiday_calendar_date ON holiday_calendar(holiday_date);
CREATE INDEX IF NOT EXISTS idx_holiday_adjustments_lookup ON holiday_adjustments(holiday_code, venue_class);
CREATE INDEX IF NOT EXISTS idx_venues_class ON venues(venue_class);

-- Update forecasts_with_bias view to include holiday layer
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

  -- Apply bias correction: day_type_offset + holiday_adjustment
  f.covers_predicted + COALESCE(
    -- First: day-type specific offset
    (b.day_type_offsets->>f.day_type::text)::integer,
    -- Fall back to general offset
    b.covers_offset,
    0
  ) + COALESCE(
    -- Second: holiday event adjustment (if applicable)
    CASE
      WHEN hc.holiday_code IS NOT NULL AND v.venue_class IS NOT NULL
      THEN ha.covers_offset
      ELSE 0
    END,
    0
  ) as covers_predicted,

  f.revenue_predicted + COALESCE(b.revenue_offset, 0) as revenue_predicted,

  -- Confidence intervals adjusted (day-type only, not holiday)
  f.covers_lower + COALESCE(b.covers_offset, 0) as covers_lower,
  f.covers_upper + COALESCE(b.covers_offset, 0) as covers_upper,

  -- Flags for debugging
  CASE WHEN b.id IS NOT NULL THEN true ELSE false END as bias_corrected,
  b.reason as bias_reason,
  hc.holiday_code as holiday_code,
  ha.covers_offset as holiday_adjustment,
  v.venue_class

FROM demand_forecasts f
LEFT JOIN venues v ON v.id = f.venue_id
LEFT JOIN forecast_bias_adjustments b ON
  b.venue_id = f.venue_id
  AND b.effective_from <= f.business_date
  AND (b.effective_to IS NULL OR b.effective_to >= f.business_date)
LEFT JOIN holiday_calendar hc ON hc.holiday_date = f.business_date
LEFT JOIN holiday_adjustments ha ON
  ha.holiday_code = hc.holiday_code
  AND ha.venue_class = v.venue_class;

-- RLS
ALTER TABLE holiday_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view holiday adjustments"
  ON holiday_adjustments FOR SELECT USING (true);

CREATE POLICY "Anyone can view holiday calendar"
  ON holiday_calendar FOR SELECT USING (true);

-- Grant access
GRANT SELECT ON holiday_adjustments TO authenticated;
GRANT SELECT ON holiday_calendar TO authenticated;
GRANT SELECT ON forecasts_with_bias TO authenticated;

SELECT 'Holiday event layer created with venue classification and calendar' as status;
