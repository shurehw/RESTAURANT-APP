-- ============================================================================
-- RECIPE IMPROVEMENTS: Labor Rate Setting + Cost Recalculation
-- ============================================================================

-- 1. Add labor_rate_per_hour to venues table
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS labor_rate_per_hour NUMERIC(8,2) DEFAULT 15.00;

COMMENT ON COLUMN venues.labor_rate_per_hour IS 'Hourly labor rate for recipe cost calculations (default $15/hr)';

SELECT 'Step 1: Added labor_rate_per_hour to venues' as status;

-- 2. Add venue_id to recipes table if missing (for multi-tenancy)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id);

-- Also add other columns that may be missing
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS recipe_type TEXT DEFAULT 'prepared_item',
  ADD COLUMN IF NOT EXISTS item_category TEXT DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS menu_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pos_sku TEXT,
  ADD COLUMN IF NOT EXISTS food_cost_target NUMERIC(5,2) DEFAULT 28,
  ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS created_by UUID;

SELECT 'Step 2: Added missing columns to recipes' as status;

-- 3. Function to recalculate a single recipe's cost
CREATE OR REPLACE FUNCTION recalculate_recipe_cost(p_recipe_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_ingredient_cost NUMERIC := 0;
  v_labor_cost NUMERIC := 0;
  v_labor_minutes INT := 0;
  v_labor_rate NUMERIC := 15.00;
  v_yield_qty NUMERIC := 1;
  v_cost_per_unit NUMERIC := 0;
  v_venue_id UUID;
BEGIN
  -- Get recipe details
  SELECT 
    r.labor_minutes,
    r.yield_qty,
    r.venue_id
  INTO v_labor_minutes, v_yield_qty, v_venue_id
  FROM recipes r
  WHERE r.id = p_recipe_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Get venue labor rate if venue_id exists
  IF v_venue_id IS NOT NULL THEN
    SELECT COALESCE(v.labor_rate_per_hour, 15.00)
    INTO v_labor_rate
    FROM venues v
    WHERE v.id = v_venue_id;
  END IF;

  -- Calculate ingredient cost from v_recipe_costs view (if view exists)
  BEGIN
    SELECT COALESCE(SUM(line_cost), 0)
    INTO v_ingredient_cost
    FROM v_recipe_costs
    WHERE recipe_id = p_recipe_id;
  EXCEPTION WHEN undefined_table THEN
    v_ingredient_cost := 0;
  END;

  -- Calculate labor cost
  v_labor_cost := (COALESCE(v_labor_minutes, 0)::NUMERIC / 60.0) * v_labor_rate;

  -- Calculate cost per unit
  IF COALESCE(v_yield_qty, 1) > 0 THEN
    v_cost_per_unit := (v_ingredient_cost + v_labor_cost) / v_yield_qty;
  ELSE
    v_cost_per_unit := v_ingredient_cost + v_labor_cost;
  END IF;

  -- Update the recipe
  UPDATE recipes
  SET cost_per_unit = v_cost_per_unit,
      updated_at = NOW()
  WHERE id = p_recipe_id;

  RETURN v_cost_per_unit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_recipe_cost IS 'Recalculate and update cost_per_unit for a single recipe';

SELECT 'Step 3: Created recalculate_recipe_cost function' as status;

-- 4. Function to recalculate all recipes that use a specific item
CREATE OR REPLACE FUNCTION recalculate_recipes_using_item(p_item_id UUID)
RETURNS INT AS $$
DECLARE
  v_recipe_id UUID;
  v_count INT := 0;
BEGIN
  -- Find all recipes using this item (direct or via sub-recipe)
  FOR v_recipe_id IN
    SELECT DISTINCT recipe_id
    FROM v_recipe_costs
    WHERE item_id = p_item_id
  LOOP
    PERFORM recalculate_recipe_cost(v_recipe_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_recipes_using_item IS 'Recalculate costs for all recipes using a specific item';

SELECT 'Step 4: Created recalculate_recipes_using_item function' as status;

-- 5. Trigger to auto-recalculate when item_cost_history changes
CREATE OR REPLACE FUNCTION trigger_recalc_on_cost_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate all recipes using this item
  PERFORM recalculate_recipes_using_item(NEW.item_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on item_cost_history (only if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_cost_history') THEN
    DROP TRIGGER IF EXISTS recalc_recipes_on_cost_change ON item_cost_history;
    CREATE TRIGGER recalc_recipes_on_cost_change
      AFTER INSERT ON item_cost_history
      FOR EACH ROW
      EXECUTE FUNCTION trigger_recalc_on_cost_change();
    RAISE NOTICE 'Created trigger on item_cost_history';
  ELSE
    RAISE NOTICE 'item_cost_history table does not exist - skipping trigger';
  END IF;
END $$;

SELECT 'Step 5: item_cost_history trigger setup complete' as status;

-- 6. Trigger to recalculate when recipe_items change
CREATE OR REPLACE FUNCTION trigger_recalc_on_recipe_item_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_recipe_cost(OLD.recipe_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_recipe_cost(NEW.recipe_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on recipe_items (only if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_items') THEN
    DROP TRIGGER IF EXISTS recalc_recipe_on_item_change ON recipe_items;
    CREATE TRIGGER recalc_recipe_on_item_change
      AFTER INSERT OR UPDATE OR DELETE ON recipe_items
      FOR EACH ROW
      EXECUTE FUNCTION trigger_recalc_on_recipe_item_change();
    RAISE NOTICE 'Created trigger on recipe_items';
  ELSE
    RAISE NOTICE 'recipe_items table does not exist - skipping trigger';
  END IF;
END $$;

SELECT 'Step 6: recipe_items trigger setup complete' as status;

-- 7. One-time recalculation of all active recipes (if recipes table exists)
DO $$
DECLARE
  v_recipe_id UUID;
  v_count INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipes') THEN
    FOR v_recipe_id IN
      SELECT id FROM recipes WHERE is_active = true
    LOOP
      PERFORM recalculate_recipe_cost(v_recipe_id);
      v_count := v_count + 1;
    END LOOP;
    RAISE NOTICE 'Recalculated % recipes', v_count;
  ELSE
    RAISE NOTICE 'recipes table does not exist - skipping recalculation';
  END IF;
END $$;

SELECT 'Recipe cost improvements complete!' as status;
