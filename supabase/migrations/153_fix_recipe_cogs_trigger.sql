-- ============================================================================
-- FIX RECIPE COGS TRIGGER
-- Update process_sale_inventory() to use recipe_items instead of recipe_components
-- Also handle sub-recipes recursively
-- ============================================================================

-- Ensure pos_sales has recipe_id and cogs columns (from migration 033)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_sales') THEN
    ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
    ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cogs NUMERIC(12,4);
    DROP TRIGGER IF EXISTS process_sale_inventory_trigger ON pos_sales;
    DROP TRIGGER IF EXISTS process_sale_inventory_update_trigger ON pos_sales;
    RAISE NOTICE 'pos_sales table prepared';
  ELSE
    RAISE NOTICE 'pos_sales table does not exist - skipping setup';
  END IF;
END $$;

SELECT 'Step 1: pos_sales setup complete' as status;

-- Updated function to use recipe_items with sub-recipe expansion
CREATE OR REPLACE FUNCTION process_sale_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_component_record RECORD;
  v_recipe_cost NUMERIC := 0;
  v_component_cost NUMERIC := 0;
  v_deduction_qty NUMERIC;
BEGIN
  -- Only process if recipe_id is set
  IF NEW.recipe_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Loop through all recipe ingredients (using v_recipe_costs view for sub-recipe expansion)
  FOR v_component_record IN
    SELECT
      vrc.item_id,
      vrc.total_qty as component_qty,
      vrc.uom,
      COALESCE(ib.last_cost, vrc.unit_cost, 0) as last_cost,
      ib.quantity_on_hand,
      i.name as item_name,
      i.base_uom
    FROM v_recipe_costs vrc
    JOIN items i ON vrc.item_id = i.id
    LEFT JOIN inventory_balances ib ON vrc.item_id = ib.item_id
      AND ib.venue_id = NEW.venue_id
    WHERE vrc.recipe_id = NEW.recipe_id
  LOOP
    -- Calculate deduction quantity (component qty * sale quantity)
    v_deduction_qty := v_component_record.component_qty * COALESCE(NEW.quantity, 1);

    -- Calculate component cost
    v_component_cost := v_deduction_qty * COALESCE(v_component_record.last_cost, 0);
    v_recipe_cost := v_recipe_cost + v_component_cost;

    -- Insert negative inventory transaction (usage)
    INSERT INTO inventory_transactions (
      venue_id,
      item_id,
      transaction_type,
      quantity,
      unit_cost,
      reference_type,
      reference_id,
      notes,
      created_at
    ) VALUES (
      NEW.venue_id,
      v_component_record.item_id,
      'usage',
      -v_deduction_qty,
      v_component_record.last_cost,
      'pos_sale',
      NEW.id,
      'Auto-deducted from sale: ' || COALESCE(NEW.item_name, 'Unknown Item'),
      NOW()
    );

    -- Update inventory balance
    UPDATE inventory_balances
    SET
      quantity_on_hand = quantity_on_hand - v_deduction_qty,
      last_updated_at = NOW()
    WHERE item_id = v_component_record.item_id
      AND venue_id = NEW.venue_id;

    -- Insert inventory balance if doesn't exist (defensive)
    INSERT INTO inventory_balances (
      venue_id,
      item_id,
      quantity_on_hand,
      unit_of_measure,
      last_cost,
      created_at,
      last_updated_at
    )
    SELECT
      NEW.venue_id,
      v_component_record.item_id,
      -v_deduction_qty,
      COALESCE(v_component_record.base_uom, 'EA'),
      v_component_record.last_cost,
      NOW(),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM inventory_balances
      WHERE venue_id = NEW.venue_id
        AND item_id = v_component_record.item_id
    );

  END LOOP;

  -- Update the sale record with calculated COGS
  UPDATE pos_sales
  SET cogs = v_recipe_cost
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers on pos_sales (only if recipe_id column exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pos_sales' AND column_name = 'recipe_id'
  ) THEN
    DROP TRIGGER IF EXISTS process_sale_inventory_trigger ON pos_sales;
    CREATE TRIGGER process_sale_inventory_trigger
      AFTER INSERT ON pos_sales
      FOR EACH ROW
      WHEN (NEW.recipe_id IS NOT NULL)
      EXECUTE FUNCTION process_sale_inventory();

    DROP TRIGGER IF EXISTS process_sale_inventory_update_trigger ON pos_sales;
    CREATE TRIGGER process_sale_inventory_update_trigger
      AFTER UPDATE OF recipe_id ON pos_sales
      FOR EACH ROW
      WHEN (NEW.recipe_id IS NOT NULL AND (OLD.recipe_id IS NULL OR OLD.recipe_id != NEW.recipe_id))
      EXECUTE FUNCTION process_sale_inventory();
    
    RAISE NOTICE 'Created triggers on pos_sales';
  ELSE
    RAISE NOTICE 'pos_sales.recipe_id column does not exist - skipping triggers. Run migration 033_pos_schema_extensions.sql first.';
  END IF;
END $$;

COMMENT ON FUNCTION process_sale_inventory IS 'Automatically deduct inventory and calculate COGS when POS sale with recipe_id is recorded. Uses recipe_items with sub-recipe expansion via v_recipe_costs view.';

SELECT 'Recipe COGS trigger updated to use recipe_items' as status;
