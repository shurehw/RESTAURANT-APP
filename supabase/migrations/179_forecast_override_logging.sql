-- ============================================================================
-- FORECAST OVERRIDE LOGGING
-- Captures manager corrections to learn from and promote patterns to model
-- ============================================================================

-- Override reason codes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'override_reason') THEN
    CREATE TYPE override_reason AS ENUM (
      'PRIVATE_EVENT',    -- Buyout or private party
      'PROMO_MARKETING',  -- Marketing push, influencer event
      'WEATHER',          -- Expected weather impact
      'VIP_GROUP',        -- Large VIP reservation
      'BUYOUT',           -- Full or partial buyout
      'LOCAL_EVENT',      -- Concert, sports, convention nearby
      'HOLIDAY_BEHAVIOR', -- Manager knows this holiday is different
      'MANAGER_GUT',      -- Experience-based adjustment
      'OTHER'             -- Catch-all with free text
    );
  END IF;
END$$;

-- Forecast layer outputs (snapshot what each layer contributed)
CREATE TABLE IF NOT EXISTS forecast_layer_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  shift_type TEXT DEFAULT 'dinner',

  -- Layer breakdown
  base_forecast INTEGER NOT NULL,        -- Raw model prediction
  day_type_offset INTEGER DEFAULT 0,     -- From forecast_bias_adjustments
  holiday_offset INTEGER DEFAULT 0,      -- From holiday_adjustments
  pacing_multiplier NUMERIC(4,3) DEFAULT 1.000,
  final_forecast INTEGER NOT NULL,       -- What we showed to manager

  -- Context
  day_type TEXT,
  holiday_code TEXT,
  venue_class TEXT,
  model_version TEXT,

  -- Timing
  forecast_generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  hours_to_service NUMERIC(5,1),         -- How far out this forecast was made

  -- Pacing inputs (if applied)
  on_hand_resos INTEGER,
  typical_on_hand_resos INTEGER,
  pace_ratio NUMERIC(4,3),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(venue_id, business_date, shift_type, forecast_generated_at)
);

-- Manager overrides
CREATE TABLE IF NOT EXISTS forecast_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  shift_type TEXT DEFAULT 'dinner',

  -- What changed
  forecast_pre_override INTEGER NOT NULL,
  forecast_post_override INTEGER NOT NULL,
  delta INTEGER GENERATED ALWAYS AS (forecast_post_override - forecast_pre_override) STORED,

  -- Why
  reason_code override_reason NOT NULL,
  reason_text TEXT,  -- Free text for OTHER or additional context

  -- Who/when
  overridden_by UUID REFERENCES auth.users(id),
  overridden_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Link to layer outputs at time of override
  layer_output_id UUID REFERENCES forecast_layer_outputs(id),

  -- Outcome (filled in next day by job)
  actual_covers INTEGER,
  error_model INTEGER,     -- actual - forecast_pre_override
  error_override INTEGER,  -- actual - forecast_post_override
  manager_value_add INTEGER GENERATED ALWAYS AS (
    CASE WHEN actual_covers IS NOT NULL
      THEN ABS(error_model) - ABS(error_override)
      ELSE NULL
    END
  ) STORED,
  outcome_recorded_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(venue_id, business_date, shift_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_forecast_layer_outputs_lookup
  ON forecast_layer_outputs(venue_id, business_date);
CREATE INDEX IF NOT EXISTS idx_forecast_overrides_venue_date
  ON forecast_overrides(venue_id, business_date);
CREATE INDEX IF NOT EXISTS idx_forecast_overrides_reason
  ON forecast_overrides(reason_code);
CREATE INDEX IF NOT EXISTS idx_forecast_overrides_pending_outcome
  ON forecast_overrides(business_date) WHERE actual_covers IS NULL;

-- RLS
ALTER TABLE forecast_layer_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view forecast outputs for their venues"
  ON forecast_layer_outputs FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

CREATE POLICY "Users can view overrides for their venues"
  ON forecast_overrides FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

CREATE POLICY "Users can insert overrides for their venues"
  ON forecast_overrides FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

-- Grant access
GRANT SELECT, INSERT ON forecast_layer_outputs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON forecast_overrides TO authenticated;

-- View for override analytics
CREATE OR REPLACE VIEW override_analytics AS
SELECT
  o.venue_id,
  v.name as venue_name,
  o.reason_code,
  COUNT(*) as override_count,
  AVG(o.delta) as avg_delta,
  AVG(o.manager_value_add) FILTER (WHERE o.actual_covers IS NOT NULL) as avg_value_add,
  COUNT(*) FILTER (WHERE o.manager_value_add > 0) as times_improved,
  COUNT(*) FILTER (WHERE o.manager_value_add < 0) as times_worsened,
  COUNT(*) FILTER (WHERE o.manager_value_add = 0) as times_neutral
FROM forecast_overrides o
JOIN venues v ON v.id = o.venue_id
WHERE o.actual_covers IS NOT NULL
GROUP BY o.venue_id, v.name, o.reason_code;

GRANT SELECT ON override_analytics TO authenticated;

SELECT 'Forecast override logging created' as status;
