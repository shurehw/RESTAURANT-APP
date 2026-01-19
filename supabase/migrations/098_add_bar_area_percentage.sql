-- Add bar area percentage to auto-calculate bar zone sqft
-- Similar to how bar_seats works as a percentage, bar_area_pct calculates bar zone area

-- ============================================================================
-- 1. ADD BAR_AREA_PCT TO PROFORMA_PROJECTS
-- ============================================================================

DO $$
BEGIN
  -- Add bar_area_pct if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'bar_area_pct'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN bar_area_pct numeric(5,2) CHECK (bar_area_pct >= 0 AND bar_area_pct <= 100);
  END IF;
END $$;

COMMENT ON COLUMN proforma_projects.bar_area_pct IS
  'Percentage of total square footage allocated to bar zone (0-100).
   Used to auto-calculate bar_zone_area_sqft for standing bar capacity.
   Example: If total_sf=3000 and bar_area_pct=15, then bar zone = 450 sqft.';

-- ============================================================================
-- 2. CREATE FUNCTION TO CALCULATE BAR ZONE AREA FROM PROJECT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_bar_zone_area_from_project(p_scenario_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_sf int;
  v_bar_area_pct numeric;
  v_bar_zone_area numeric;
BEGIN
  -- Get project's total_sf and bar_area_pct via scenario
  SELECT p.total_sf, p.bar_area_pct
  INTO v_total_sf, v_bar_area_pct
  FROM proforma_scenarios s
  JOIN proforma_projects p ON p.id = s.project_id
  WHERE s.id = p_scenario_id;

  -- Calculate bar zone area
  IF v_total_sf IS NOT NULL AND v_bar_area_pct IS NOT NULL THEN
    v_bar_zone_area := (v_total_sf * v_bar_area_pct / 100.0);
    RETURN v_bar_zone_area;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION get_bar_zone_area_from_project IS
  'Calculates bar zone area from project total_sf × bar_area_pct.
   Used as fallback when bar_zone_area_sqft is not manually set on center.';

-- ============================================================================
-- 3. UPDATE AUTO-CALCULATE TRIGGER TO USE PROJECT BAR_AREA_PCT
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_calculate_standing_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_bar_zone_area numeric;
  v_bar_linear_feet numeric;
  v_bar_depth numeric;
  v_nsa numeric;
  v_capacity int;
  v_scenario_id uuid;
BEGIN
  -- Only auto-calculate if standing_capacity is null
  IF NEW.standing_capacity IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get bar zone area from center (priority 1)
  SELECT bar_zone_area_sqft, bar_zone_depth_ft, scenario_id
  INTO v_bar_zone_area, v_bar_depth, v_scenario_id
  FROM proforma_revenue_centers
  WHERE id = NEW.revenue_center_id;

  -- If no zone area on center, try to get from project bar_area_pct (priority 2)
  IF v_bar_zone_area IS NULL AND v_scenario_id IS NOT NULL THEN
    v_bar_zone_area := get_bar_zone_area_from_project(v_scenario_id);
  END IF;

  -- If still no zone area but we have depth, estimate from linear feet (priority 3)
  IF v_bar_zone_area IS NULL AND v_bar_depth IS NOT NULL THEN
    SELECT c.seats * 2.0 -- rough estimate: 2 ft per seat for bar linear feet
    INTO v_bar_linear_feet
    FROM proforma_revenue_centers c
    WHERE c.id = NEW.revenue_center_id;

    v_bar_zone_area := v_bar_linear_feet * v_bar_depth;
  END IF;

  -- Calculate NSA if we have inputs
  IF v_bar_zone_area IS NOT NULL AND NEW.standing_factor IS NOT NULL THEN
    NEW.net_standing_area_sqft := v_bar_zone_area * NEW.standing_factor;
  END IF;

  -- Calculate capacity if we have NSA and density
  IF NEW.net_standing_area_sqft IS NOT NULL AND NEW.sqft_per_person IS NOT NULL THEN
    NEW.calculated_standing_capacity := floor(NEW.net_standing_area_sqft / NEW.sqft_per_person);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_calculate_standing_capacity IS
  'Auto-calculates standing bar capacity using cascading priority:
   1. bar_zone_area_sqft from revenue center (manual override)
   2. project total_sf × bar_area_pct (auto-calculated from project settings)
   3. estimated from linear feet × depth (fallback)
   Then: NSA = zone_area × standing_factor, capacity = NSA / sqft_per_person';

-- Re-create trigger (no change needed, just ensuring it uses updated function)
DROP TRIGGER IF EXISTS auto_calculate_standing_capacity_trigger ON proforma_center_service_participation;
CREATE TRIGGER auto_calculate_standing_capacity_trigger
  BEFORE INSERT OR UPDATE ON proforma_center_service_participation
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_standing_capacity();
