-- ============================================================================
-- LABOR SETTINGS: Move hardcoded values to database
-- Enables full configurability and eliminates magic numbers
-- ============================================================================

-- Add labor-specific settings columns
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS market_tier_low_multiplier numeric(4,2) DEFAULT 0.95,
ADD COLUMN IF NOT EXISTS market_tier_mid_multiplier numeric(4,2) DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS market_tier_high_multiplier numeric(4,2) DEFAULT 1.10,
ADD COLUMN IF NOT EXISTS tipped_min_wage_floor_pct numeric(4,2) DEFAULT 0.60,
ADD COLUMN IF NOT EXISTS default_min_wage_city numeric(5,2) DEFAULT 15.00,
ADD COLUMN IF NOT EXISTS default_tip_credit numeric(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS default_market_tier text DEFAULT 'MID' CHECK (default_market_tier IN ('LOW', 'MID', 'HIGH'));

COMMENT ON COLUMN proforma_settings.market_tier_low_multiplier IS 'Multiplier for LOW market tier (typically 0.95)';
COMMENT ON COLUMN proforma_settings.market_tier_mid_multiplier IS 'Multiplier for MID market tier (typically 1.00)';
COMMENT ON COLUMN proforma_settings.market_tier_high_multiplier IS 'Multiplier for HIGH market tier (typically 1.10)';
COMMENT ON COLUMN proforma_settings.tipped_min_wage_floor_pct IS 'Minimum wage floor for tipped positions as % of min wage (typically 0.60 = 60%)';
COMMENT ON COLUMN proforma_settings.default_min_wage_city IS 'Default city minimum wage for new scenarios';
COMMENT ON COLUMN proforma_settings.default_tip_credit IS 'Default tip credit for new scenarios';
COMMENT ON COLUMN proforma_settings.default_market_tier IS 'Default market tier for new scenarios';

-- Drop existing function and recreate with new signature
DROP FUNCTION IF EXISTS calculate_position_hourly_rate(numeric, numeric, text, numeric, boolean);

-- Create wage calculation function that reads from settings
CREATE OR REPLACE FUNCTION calculate_position_hourly_rate(
  p_min_wage numeric,
  p_tip_credit numeric,
  p_market_tier text,
  p_wage_multiplier numeric,
  p_is_tipped boolean,
  p_tenant_id uuid DEFAULT NULL
) RETURNS numeric AS $$
DECLARE
  v_tier_multiplier numeric;
  v_tipped_cash_wage numeric;
  v_base_rate numeric;
  v_tipped_floor_pct numeric;
  v_settings record;
BEGIN
  -- Fetch settings for this tenant (or use defaults if not found)
  SELECT
    COALESCE(market_tier_low_multiplier, 0.95) as low_mult,
    COALESCE(market_tier_mid_multiplier, 1.00) as mid_mult,
    COALESCE(market_tier_high_multiplier, 1.10) as high_mult,
    COALESCE(tipped_min_wage_floor_pct, 0.60) as floor_pct
  INTO v_settings
  FROM proforma_settings
  WHERE tenant_id = p_tenant_id OR p_tenant_id IS NULL
  LIMIT 1;

  -- If no settings found, use hardcoded defaults as fallback
  IF v_settings IS NULL THEN
    v_settings := ROW(0.95, 1.00, 1.10, 0.60);
  END IF;

  -- Market tier multiplier from settings
  v_tier_multiplier := CASE p_market_tier
    WHEN 'LOW' THEN v_settings.low_mult
    WHEN 'HIGH' THEN v_settings.high_mult
    ELSE v_settings.mid_mult
  END;

  -- For tipped positions: calculate cash wage with floor from settings
  IF p_is_tipped THEN
    v_tipped_cash_wage := GREATEST(
      p_min_wage - COALESCE(p_tip_credit, 0),
      p_min_wage * v_settings.floor_pct
    );
    v_base_rate := v_tipped_cash_wage * p_wage_multiplier;
  ELSE
    -- Non-tipped: simple multiplier formula
    v_base_rate := p_min_wage * p_wage_multiplier;
  END IF;

  -- Apply market tier and round
  RETURN ROUND(v_base_rate * v_tier_multiplier, 2);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_position_hourly_rate IS 'FP&A-grade wage calculator: reads multipliers from settings table for full configurability';

-- ============================================================================
-- CITY WAGE PRESETS TABLE
-- Move hardcoded city presets to database for user management
-- ============================================================================

CREATE TABLE IF NOT EXISTS proforma_city_wage_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  city_name text NOT NULL,
  state_code text NOT NULL,
  min_wage numeric(5,2) NOT NULL,
  tip_credit numeric(5,2) NOT NULL DEFAULT 0.00,
  market_tier text NOT NULL DEFAULT 'MID' CHECK (market_tier IN ('LOW', 'MID', 'HIGH')),
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, city_name, state_code)
);

CREATE INDEX idx_city_presets_tenant ON proforma_city_wage_presets(tenant_id);
CREATE INDEX idx_city_presets_state ON proforma_city_wage_presets(state_code);

COMMENT ON TABLE proforma_city_wage_presets IS 'User-manageable city wage presets for quick scenario setup';

-- Seed with common city presets (can be customized by users)
INSERT INTO proforma_city_wage_presets (tenant_id, city_name, state_code, min_wage, tip_credit, market_tier)
VALUES
  (NULL, 'New York', 'NY', 16.00, 5.35, 'HIGH'),
  (NULL, 'Los Angeles', 'CA', 16.78, 0.00, 'HIGH'),
  (NULL, 'San Francisco', 'CA', 18.07, 0.00, 'HIGH'),
  (NULL, 'Chicago', 'IL', 15.80, 5.60, 'MID'),
  (NULL, 'Austin', 'TX', 7.25, 5.12, 'MID'),
  (NULL, 'Denver', 'CO', 18.29, 3.02, 'MID'),
  (NULL, 'Seattle', 'WA', 19.97, 0.00, 'HIGH'),
  (NULL, 'Miami', 'FL', 12.00, 3.02, 'MID'),
  (NULL, 'Atlanta', 'GA', 7.25, 5.12, 'LOW'),
  (NULL, 'Nashville', 'TN', 7.25, 5.12, 'MID')
ON CONFLICT (tenant_id, city_name, state_code) DO NOTHING;

-- ============================================================================
-- WAGE CALCULATION BREAKDOWN FUNCTION
-- For math transparency: returns step-by-step calculation details
-- ============================================================================

CREATE OR REPLACE FUNCTION get_wage_calculation_breakdown(
  p_min_wage numeric,
  p_tip_credit numeric,
  p_market_tier text,
  p_wage_multiplier numeric,
  p_is_tipped boolean,
  p_tenant_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_settings record;
  v_tier_multiplier numeric;
  v_tipped_cash_wage numeric;
  v_base_rate numeric;
  v_final_rate numeric;
  v_breakdown jsonb;
BEGIN
  -- Fetch settings
  SELECT
    COALESCE(market_tier_low_multiplier, 0.95) as low_mult,
    COALESCE(market_tier_mid_multiplier, 1.00) as mid_mult,
    COALESCE(market_tier_high_multiplier, 1.10) as high_mult,
    COALESCE(tipped_min_wage_floor_pct, 0.60) as floor_pct
  INTO v_settings
  FROM proforma_settings
  WHERE tenant_id = p_tenant_id OR p_tenant_id IS NULL
  LIMIT 1;

  IF v_settings IS NULL THEN
    v_settings := ROW(0.95, 1.00, 1.10, 0.60);
  END IF;

  -- Calculate tier multiplier
  v_tier_multiplier := CASE p_market_tier
    WHEN 'LOW' THEN v_settings.low_mult
    WHEN 'HIGH' THEN v_settings.high_mult
    ELSE v_settings.mid_mult
  END;

  -- Build breakdown
  IF p_is_tipped THEN
    v_tipped_cash_wage := GREATEST(
      p_min_wage - COALESCE(p_tip_credit, 0),
      p_min_wage * v_settings.floor_pct
    );
    v_base_rate := v_tipped_cash_wage * p_wage_multiplier;
    v_final_rate := ROUND(v_base_rate * v_tier_multiplier, 2);

    v_breakdown := jsonb_build_object(
      'is_tipped', true,
      'min_wage', p_min_wage,
      'tip_credit', COALESCE(p_tip_credit, 0),
      'tipped_floor_pct', v_settings.floor_pct,
      'tipped_cash_wage', ROUND(v_tipped_cash_wage, 2),
      'position_multiplier', p_wage_multiplier,
      'base_rate', ROUND(v_base_rate, 2),
      'market_tier', p_market_tier,
      'tier_multiplier', v_tier_multiplier,
      'final_rate', v_final_rate,
      'calculation_steps', jsonb_build_array(
        jsonb_build_object('step', 1, 'description', 'Calculate tipped cash wage', 'formula', 'max(min_wage - tip_credit, min_wage × floor_pct)', 'value', ROUND(v_tipped_cash_wage, 2)),
        jsonb_build_object('step', 2, 'description', 'Apply position skill multiplier', 'formula', 'tipped_cash_wage × position_multiplier', 'value', ROUND(v_base_rate, 2)),
        jsonb_build_object('step', 3, 'description', 'Apply market tier multiplier', 'formula', 'base_rate × tier_multiplier', 'value', v_final_rate)
      )
    );
  ELSE
    v_base_rate := p_min_wage * p_wage_multiplier;
    v_final_rate := ROUND(v_base_rate * v_tier_multiplier, 2);

    v_breakdown := jsonb_build_object(
      'is_tipped', false,
      'min_wage', p_min_wage,
      'position_multiplier', p_wage_multiplier,
      'base_rate', ROUND(v_base_rate, 2),
      'market_tier', p_market_tier,
      'tier_multiplier', v_tier_multiplier,
      'final_rate', v_final_rate,
      'calculation_steps', jsonb_build_array(
        jsonb_build_object('step', 1, 'description', 'Apply position skill multiplier', 'formula', 'min_wage × position_multiplier', 'value', ROUND(v_base_rate, 2)),
        jsonb_build_object('step', 2, 'description', 'Apply market tier multiplier', 'formula', 'base_rate × tier_multiplier', 'value', v_final_rate)
      )
    );
  END IF;

  RETURN v_breakdown;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_wage_calculation_breakdown IS 'Returns detailed step-by-step wage calculation for transparency UI';
