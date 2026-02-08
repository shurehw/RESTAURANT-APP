-- ============================================================================
-- PACING BASELINES
-- Stores typical reservation pace by venue/day_type for T-24 pacing multiplier
-- ============================================================================

-- Pacing baselines (computed weekly from historical data)
CREATE TABLE IF NOT EXISTS pacing_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  day_type TEXT NOT NULL CHECK (day_type IN ('weekday', 'friday', 'saturday', 'sunday', 'holiday')),

  -- T-24 baseline (median confirmed covers at 24 hours before service)
  typical_on_hand_t24 INTEGER NOT NULL DEFAULT 0,
  typical_on_hand_t48 INTEGER DEFAULT 0,  -- Optional for earlier pacing
  typical_on_hand_t12 INTEGER DEFAULT 0,  -- Optional for late pacing

  -- Cancel/no-show rate at each checkpoint
  cancel_rate_t24 NUMERIC(4,3) DEFAULT 0.05,  -- e.g., 5% typically cancel after T-24

  -- Sample stats
  sample_size INTEGER NOT NULL DEFAULT 0,
  sample_start_date DATE,
  sample_end_date DATE,

  -- Computed
  last_computed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(venue_id, day_type)
);

-- Reservation snapshots (for computing baselines and real-time pacing)
CREATE TABLE IF NOT EXISTS reservation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  snapshot_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  -- Reservation counts at snapshot time
  confirmed_covers INTEGER NOT NULL DEFAULT 0,
  pending_covers INTEGER DEFAULT 0,
  waitlist_covers INTEGER DEFAULT 0,
  total_on_books INTEGER GENERATED ALWAYS AS (confirmed_covers + COALESCE(pending_covers, 0)) STORED,

  -- Time context
  hours_to_service NUMERIC(5,1) NOT NULL,  -- e.g., 24.0 for T-24

  -- Outcome (filled in after service)
  actual_covers INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pacing_baselines_lookup
  ON pacing_baselines(venue_id, day_type);
CREATE INDEX IF NOT EXISTS idx_reservation_snapshots_venue_date
  ON reservation_snapshots(venue_id, business_date);
CREATE INDEX IF NOT EXISTS idx_reservation_snapshots_hours
  ON reservation_snapshots(hours_to_service);
CREATE INDEX IF NOT EXISTS idx_reservation_snapshots_for_baseline
  ON reservation_snapshots(venue_id, hours_to_service, business_date DESC);

-- RLS
ALTER TABLE pacing_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pacing baselines for their venues"
  ON pacing_baselines FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

CREATE POLICY "Users can view reservation snapshots for their venues"
  ON reservation_snapshots FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

-- Function to compute pacing multiplier
CREATE OR REPLACE FUNCTION compute_pacing_multiplier(
  p_on_hand INTEGER,
  p_typical INTEGER
) RETURNS NUMERIC(4,3) AS $$
DECLARE
  pace NUMERIC;
  multiplier NUMERIC;
BEGIN
  -- Avoid division by zero
  IF p_typical IS NULL OR p_typical <= 0 THEN
    RETURN 1.000;
  END IF;

  pace := p_on_hand::NUMERIC / p_typical::NUMERIC;

  -- Deadband: 0.90 to 1.10 = no change
  IF pace >= 0.90 AND pace <= 1.10 THEN
    RETURN 1.000;
  END IF;

  -- Below pace: decrease slowly, floor at 0.85
  IF pace < 0.90 THEN
    multiplier := 1.000 - 0.5 * (0.90 - pace);
    RETURN GREATEST(0.850, multiplier);
  END IF;

  -- Above pace: increase, cap at 1.25
  multiplier := 1.000 + 0.6 * (pace - 1.10);
  RETURN LEAST(1.250, multiplier);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to compute baselines from snapshots (run weekly)
CREATE OR REPLACE FUNCTION refresh_pacing_baselines(
  p_lookback_days INTEGER DEFAULT 90
) RETURNS TABLE(venue_id UUID, day_type TEXT, typical_t24 INTEGER, sample_size INTEGER) AS $$
BEGIN
  RETURN QUERY
  WITH snapshot_stats AS (
    SELECT
      rs.venue_id,
      get_day_type(rs.business_date) as day_type,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rs.confirmed_covers) as median_t24,
      COUNT(*) as n
    FROM reservation_snapshots rs
    WHERE rs.hours_to_service BETWEEN 23 AND 25  -- T-24 window
      AND rs.business_date >= CURRENT_DATE - p_lookback_days
    GROUP BY rs.venue_id, get_day_type(rs.business_date)
  )
  INSERT INTO pacing_baselines (venue_id, day_type, typical_on_hand_t24, sample_size, last_computed_at, sample_start_date, sample_end_date)
  SELECT
    ss.venue_id,
    ss.day_type,
    ROUND(ss.median_t24)::INTEGER,
    ss.n::INTEGER,
    now(),
    CURRENT_DATE - p_lookback_days,
    CURRENT_DATE
  FROM snapshot_stats ss
  ON CONFLICT (venue_id, day_type) DO UPDATE SET
    typical_on_hand_t24 = EXCLUDED.typical_on_hand_t24,
    sample_size = EXCLUDED.sample_size,
    last_computed_at = EXCLUDED.last_computed_at,
    sample_start_date = EXCLUDED.sample_start_date,
    sample_end_date = EXCLUDED.sample_end_date
  RETURNING pacing_baselines.venue_id, pacing_baselines.day_type, pacing_baselines.typical_on_hand_t24 as typical_t24, pacing_baselines.sample_size;
END;
$$ LANGUAGE plpgsql;

-- Grant access
GRANT SELECT ON pacing_baselines TO authenticated;
GRANT SELECT, INSERT ON reservation_snapshots TO authenticated;

SELECT 'Pacing baselines and multiplier function created' as status;
