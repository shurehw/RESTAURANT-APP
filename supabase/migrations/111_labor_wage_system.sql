-- ============================================================================
-- LABOR WAGE CALCULATION SYSTEM
-- Adds market wage parameters and calculation functions
-- ============================================================================

-- Add market wage parameters to scenarios
ALTER TABLE proforma_scenarios
ADD COLUMN IF NOT EXISTS min_wage_city numeric(5,2) DEFAULT 15.00,
ADD COLUMN IF NOT EXISTS tip_credit numeric(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS market_tier text DEFAULT 'MID' CHECK (market_tier IN ('LOW', 'MID', 'HIGH'));

COMMENT ON COLUMN proforma_scenarios.min_wage_city IS 'Local minimum wage - primary input for rate calculation';
COMMENT ON COLUMN proforma_scenarios.tip_credit IS 'Maximum tip credit allowed (0 if none) - defaults to 0 for safety';
COMMENT ON COLUMN proforma_scenarios.market_tier IS 'Market competitiveness: LOW (0.95x), MID (1.00x), HIGH (1.10x)';

-- Add wage multiplier to position templates
ALTER TABLE proforma_labor_position_templates
ADD COLUMN IF NOT EXISTS wage_multiplier numeric(4,2) DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS is_tipped boolean DEFAULT false;

COMMENT ON COLUMN proforma_labor_position_templates.wage_multiplier IS 'Position skill multiplier: hourly_rate = min_wage × wage_multiplier';
COMMENT ON COLUMN proforma_labor_position_templates.is_tipped IS 'Whether position receives tips (affects cash wage calculation)';

-- Update existing templates with FP&A-grade wage multipliers
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.00, is_tipped = true WHERE position_name IN ('Server', 'Cocktail Server');
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.10, is_tipped = true WHERE position_name = 'Bartender';
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.10, is_tipped = false WHERE position_name IN ('Host', 'Busser');
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.15, is_tipped = false WHERE position_name IN ('Runner', 'Barback', 'Support/Runner');
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.20, is_tipped = false WHERE position_name IN ('Expo', 'Cashier/Counter');
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.05, is_tipped = false WHERE position_name = 'Dishwasher';
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.15, is_tipped = false WHERE position_name IN ('Prep Cook', 'Floor Support');
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.35, is_tipped = false WHERE position_name = 'Line Cook';
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.50, is_tipped = false WHERE position_name = 'Lead Line';
UPDATE proforma_labor_position_templates SET wage_multiplier = 1.40, is_tipped = false WHERE position_name IN ('Pastry', 'Sauté');

-- ============================================================================
-- WAGE CALCULATION FUNCTION (FP&A-Grade)
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_position_hourly_rate(
  p_min_wage numeric,
  p_tip_credit numeric,
  p_market_tier text,
  p_wage_multiplier numeric,
  p_is_tipped boolean
) RETURNS numeric AS $$
DECLARE
  v_tier_multiplier numeric;
  v_tipped_cash_wage numeric;
  v_base_rate numeric;
BEGIN
  -- Market tier multiplier
  v_tier_multiplier := CASE p_market_tier
    WHEN 'LOW' THEN 0.95
    WHEN 'HIGH' THEN 1.10
    ELSE 1.00 -- MID
  END;

  -- For tipped positions: calculate cash wage
  IF p_is_tipped THEN
    -- Tipped cash wage = max(min_wage - tip_credit, min_wage × 0.60)
    -- This ensures we never go below 60% of min wage even with large tip credits
    v_tipped_cash_wage := GREATEST(
      p_min_wage - COALESCE(p_tip_credit, 0),
      p_min_wage * 0.60
    );

    -- Apply position multiplier (Bartender gets 1.10×, Server gets 1.00×)
    v_base_rate := v_tipped_cash_wage * p_wage_multiplier;
  ELSE
    -- Non-tipped: simple multiplier formula
    v_base_rate := p_min_wage * p_wage_multiplier;
  END IF;

  -- Apply market tier
  RETURN ROUND(v_base_rate * v_tier_multiplier, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_position_hourly_rate IS 'FP&A-grade wage calculator: handles tipped vs non-tipped, market tier, and position skill multipliers';
