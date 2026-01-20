-- ============================================================================
-- SCENARIO SENSITIVITY ADJUSTMENTS
-- Enables Upside/Downside scenarios as delta adjustments on Base scenario
-- ============================================================================

-- Add scenario type to scenarios table
ALTER TABLE proforma_scenarios
ADD COLUMN IF NOT EXISTS scenario_type text DEFAULT 'BASE' CHECK (scenario_type IN ('BASE', 'SENSITIVITY'));

COMMENT ON COLUMN proforma_scenarios.scenario_type IS 'BASE = full detailed model, SENSITIVITY = delta adjustments on top of base';

-- Update existing scenarios to be BASE type
UPDATE proforma_scenarios SET scenario_type = 'BASE' WHERE scenario_type IS NULL;

-- Create scenario adjustments table for sensitivity scenarios
CREATE TABLE IF NOT EXISTS proforma_scenario_adjustments (
  scenario_id uuid PRIMARY KEY REFERENCES proforma_scenarios(id) ON DELETE CASCADE,
  base_scenario_id uuid NOT NULL REFERENCES proforma_scenarios(id) ON DELETE RESTRICT,

  -- Revenue adjustments (null = use base value)
  covers_multiplier numeric(5,3),           -- 1.10 = 10% more covers, 0.85 = 15% fewer
  check_avg_offset numeric(8,2),            -- +2.00 = $2 higher check, -3.50 = $3.50 lower
  revenue_multiplier numeric(5,3),          -- Alternative: direct revenue multiplier

  -- COGS adjustments (null = use base %)
  food_cogs_pct_override numeric(5,2),
  bev_cogs_pct_override numeric(5,2),
  other_cogs_pct_override numeric(5,2),

  -- Labor adjustments (null = use base)
  wage_rate_offset numeric(6,2),            -- +1.50 = everyone gets $1.50/hr more
  efficiency_multiplier numeric(5,3),       -- 0.95 = 5% more efficient (less hours needed)

  -- OpEx adjustments (null = use base)
  rent_monthly_override numeric(12,2),
  utilities_multiplier numeric(5,3),        -- 1.20 = 20% higher utilities
  marketing_multiplier numeric(5,3),        -- 1.50 = 50% more marketing spend

  -- General notes/description
  description text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scenario_adjustments_base ON proforma_scenario_adjustments(base_scenario_id);

COMMENT ON TABLE proforma_scenario_adjustments IS 'Delta adjustments for sensitivity scenarios (Upside/Downside) relative to Base';
COMMENT ON COLUMN proforma_scenario_adjustments.covers_multiplier IS 'Multiply base covers by this factor (1.10 = +10%, 0.90 = -10%)';
COMMENT ON COLUMN proforma_scenario_adjustments.check_avg_offset IS 'Add this amount to base check average (+2.00 = $2 higher)';
COMMENT ON COLUMN proforma_scenario_adjustments.efficiency_multiplier IS 'Labor efficiency adjustment (0.95 = need 5% fewer hours, 1.10 = need 10% more)';

-- Enable RLS
ALTER TABLE proforma_scenario_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can view adjustments for their scenarios" ON proforma_scenario_adjustments;
CREATE POLICY "Users can view adjustments for their scenarios"
  ON proforma_scenario_adjustments FOR SELECT
  USING (
    scenario_id IN (
      SELECT s.id FROM proforma_scenarios s
      JOIN proforma_projects p ON p.id = s.project_id
      WHERE p.org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage adjustments for their scenarios" ON proforma_scenario_adjustments;
CREATE POLICY "Users can manage adjustments for their scenarios"
  ON proforma_scenario_adjustments FOR ALL
  USING (
    scenario_id IN (
      SELECT s.id FROM proforma_scenarios s
      JOIN proforma_projects p ON p.id = s.project_id
      WHERE p.org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

-- Helper function to get effective scenario assumptions (base + adjustments)
CREATE OR REPLACE FUNCTION get_effective_scenario_data(p_scenario_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_scenario record;
  v_adjustments record;
  v_base_data jsonb;
  v_result jsonb;
BEGIN
  -- Get scenario info
  SELECT scenario_type INTO v_scenario
  FROM proforma_scenarios
  WHERE id = p_scenario_id;

  IF v_scenario.scenario_type = 'BASE' THEN
    -- For BASE scenarios, return flag indicating to use scenario's own data
    RETURN jsonb_build_object('type', 'BASE', 'scenario_id', p_scenario_id);
  ELSE
    -- For SENSITIVITY scenarios, return base scenario ID + adjustments
    SELECT * INTO v_adjustments
    FROM proforma_scenario_adjustments
    WHERE scenario_id = p_scenario_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SENSITIVITY scenario % has no adjustments record', p_scenario_id;
    END IF;

    RETURN jsonb_build_object(
      'type', 'SENSITIVITY',
      'scenario_id', p_scenario_id,
      'base_scenario_id', v_adjustments.base_scenario_id,
      'adjustments', row_to_json(v_adjustments)
    );
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effective_scenario_data IS 'Returns metadata about whether to use scenario directly (BASE) or apply adjustments (SENSITIVITY)';

-- Trigger to ensure base_scenario_id references a BASE type scenario
CREATE OR REPLACE FUNCTION validate_base_scenario_type()
RETURNS TRIGGER AS $$
DECLARE
  v_base_type text;
BEGIN
  -- Check that base scenario is BASE type
  SELECT scenario_type INTO v_base_type
  FROM proforma_scenarios
  WHERE id = NEW.base_scenario_id;

  IF v_base_type IS NULL THEN
    RAISE EXCEPTION 'Base scenario % does not exist', NEW.base_scenario_id;
  END IF;

  IF v_base_type != 'BASE' THEN
    RAISE EXCEPTION 'Base scenario must be of type BASE, but % is type %', NEW.base_scenario_id, v_base_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_base_scenario_type_trigger ON proforma_scenario_adjustments;
CREATE TRIGGER validate_base_scenario_type_trigger
  BEFORE INSERT OR UPDATE ON proforma_scenario_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION validate_base_scenario_type();

-- Add audit trigger for scenario adjustments
DROP TRIGGER IF EXISTS audit_scenario_adjustments_changes ON proforma_scenario_adjustments;
CREATE TRIGGER audit_scenario_adjustments_changes
  AFTER UPDATE ON proforma_scenario_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION audit_settings_change();
