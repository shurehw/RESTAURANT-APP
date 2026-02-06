-- ============================================================================
-- FORECAST BIAS ADJUSTMENTS
-- Venue-specific bias correction layer for demand forecasts
-- Based on backtest analysis showing systematic under-forecasting
-- ============================================================================

-- Bias adjustment table
CREATE TABLE IF NOT EXISTS forecast_bias_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Bias offsets (add to raw forecast)
  covers_offset INTEGER NOT NULL DEFAULT 0,
  revenue_offset NUMERIC(10,2) DEFAULT 0,

  -- Day-type specific overrides (optional, JSON for flexibility)
  -- Keys: weekday, friday, saturday, sunday, holiday
  day_type_offsets JSONB DEFAULT '{}',

  -- Metadata
  reason TEXT, -- Why this bias exists
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE, -- NULL = still active

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by TEXT,

  -- Ensure one active adjustment per venue
  UNIQUE(venue_id, effective_from)
);

-- Index for lookups
CREATE INDEX idx_forecast_bias_venue ON forecast_bias_adjustments(venue_id, effective_from DESC);

-- RLS
ALTER TABLE forecast_bias_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bias adjustments"
  ON forecast_bias_adjustments FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_forecast_bias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_forecast_bias_updated_at
  BEFORE UPDATE ON forecast_bias_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION update_forecast_bias_updated_at();

-- Insert initial bias corrections based on backtest analysis
-- These are TEMPORARY corrections until model is improved
INSERT INTO forecast_bias_adjustments (venue_id, covers_offset, reason, created_by)
SELECT
  v.id,
  CASE v.name
    WHEN 'Delilah Miami' THEN 12
    WHEN 'Nice Guy LA' THEN 6
    WHEN 'Keys Los Angeles' THEN 4
    WHEN 'Bird Streets Club' THEN 6
    WHEN 'Delilah LA' THEN 3
    WHEN 'Poppy' THEN 3
    ELSE 0
  END as covers_offset,
  'Initial bias correction based on Feb 2026 backtest analysis. Systematic under-forecasting detected.',
  'system'
FROM venues v
WHERE v.name IN ('Delilah Miami', 'Nice Guy LA', 'Keys Los Angeles', 'Bird Streets Club', 'Delilah LA', 'Poppy')
ON CONFLICT DO NOTHING;

-- Grant access
GRANT SELECT ON forecast_bias_adjustments TO authenticated;

SELECT 'Forecast bias adjustments table created with initial corrections' as status;
