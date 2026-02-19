-- ============================================================================
-- 30-Minute Interval Demand Forecasts
--
-- Distribution-based approach:
--   1. demand_distribution_curves stores historical % of daily covers/revenue
--      per 30-min interval, segmented by venue + day_type
--   2. get_interval_forecasts() joins daily forecasts_with_bias × curves
--      to produce interval-level predictions at query time
-- ============================================================================

-- ============================================================================
-- TABLE: demand_distribution_curves
-- ============================================================================
CREATE TABLE IF NOT EXISTS demand_distribution_curves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Segmentation
  day_type day_type NOT NULL,        -- reuses existing enum: weekday/friday/saturday/sunday/holiday
  interval_start TIME NOT NULL,       -- e.g., '17:00', '17:30', '18:00', ...

  -- Distribution percentages (sum to ~1.0 across all intervals for a venue/day_type)
  pct_of_daily_covers NUMERIC(6,5) NOT NULL DEFAULT 0,   -- e.g., 0.08500 = 8.5%
  pct_of_daily_revenue NUMERIC(6,5) NOT NULL DEFAULT 0,

  -- Absolute averages (useful for display even without a forecast)
  avg_covers NUMERIC(8,2) NOT NULL DEFAULT 0,
  avg_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
  avg_checks NUMERIC(8,2) NOT NULL DEFAULT 0,

  -- Statistical quality
  sample_size INTEGER NOT NULL DEFAULT 0,      -- number of distinct business_dates contributing
  stddev_covers NUMERIC(8,2) DEFAULT 0,

  -- Computation metadata
  lookback_days INTEGER NOT NULL DEFAULT 90,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_distribution_curve UNIQUE(venue_id, day_type, interval_start)
);

CREATE INDEX idx_dist_curves_venue_daytype
  ON demand_distribution_curves(venue_id, day_type);

COMMENT ON TABLE demand_distribution_curves IS
  'Historical demand distribution per 30-min interval, used to break daily forecasts into interval-level predictions';
COMMENT ON COLUMN demand_distribution_curves.pct_of_daily_covers IS
  'Fraction of total daily covers arriving in this 30-min window (sums to ~1.0 per venue/day_type)';
COMMENT ON COLUMN demand_distribution_curves.interval_start IS
  'Start of 30-min interval as TIME, e.g. 17:00, 17:30. Handles midnight crossing naturally.';

-- ============================================================================
-- RLS — same org-venue pattern as hourly_snapshots / location_config
-- ============================================================================
ALTER TABLE demand_distribution_curves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view distribution curves for their venues"
  ON demand_distribution_curves FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

GRANT SELECT ON demand_distribution_curves TO authenticated;

-- ============================================================================
-- FUNCTION: get_interval_forecasts
-- Joins daily forecasts_with_bias × demand_distribution_curves to produce
-- 30-min interval predictions for a venue over a date range.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_interval_forecasts(
  p_venue_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  business_date DATE,
  day_type TEXT,
  interval_start TIME,
  covers_predicted INTEGER,
  revenue_predicted NUMERIC(10,2),
  pct_of_daily NUMERIC(6,5),
  daily_total_covers INTEGER,
  daily_total_revenue NUMERIC(10,2),
  sample_size INTEGER
) AS $$
  SELECT
    f.business_date,
    f.day_type::text,
    c.interval_start,
    ROUND(f.covers_predicted * c.pct_of_daily_covers)::integer AS covers_predicted,
    ROUND(f.revenue_predicted * c.pct_of_daily_revenue, 2) AS revenue_predicted,
    c.pct_of_daily_covers AS pct_of_daily,
    f.covers_predicted::integer AS daily_total_covers,
    f.revenue_predicted AS daily_total_revenue,
    c.sample_size
  FROM forecasts_with_bias f
  JOIN demand_distribution_curves c
    ON c.venue_id = f.venue_id
    AND c.day_type = f.day_type::day_type
  WHERE f.venue_id = p_venue_id
    AND f.business_date BETWEEN p_start_date AND p_end_date
    AND f.covers_predicted > 0
  ORDER BY f.business_date, c.interval_start;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_interval_forecasts IS
  'Distributes daily bias-corrected forecasts across 30-min intervals using historical demand curves';

SELECT 'Created demand_distribution_curves table and get_interval_forecasts function' as status;
