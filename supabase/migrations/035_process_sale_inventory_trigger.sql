/**
 * Migration 035: Process Sale Inventory Trigger
 * Purpose: Auto-deduct inventory and calculate COGS when POS sale is recorded
 * This is the core trigger for Recipe→Inventory→COGS integration
 */

-- Function to process inventory deduction and COGS calculation
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

  -- Loop through all recipe components
  FOR v_component_record IN
    SELECT
      rc.item_id,
      rc.quantity as component_qty,
      rc.unit,
      ib.last_cost,
      ib.quantity_on_hand,
      i.name as item_name,
      i.base_uom
    FROM recipe_components rc
    JOIN items i ON rc.item_id = i.id
    LEFT JOIN inventory_balances ib ON rc.item_id = ib.item_id
      AND ib.venue_id = NEW.venue_id
    WHERE rc.recipe_id = NEW.recipe_id
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
      total_cost,
      reference_type,
      reference_id,
      notes,
      transaction_date,
      created_at
    ) VALUES (
      NEW.venue_id,
      v_component_record.item_id,
      'usage',
      -v_deduction_qty,
      v_component_record.last_cost,
      -v_component_cost,
      'pos_sale',
      NEW.id,
      'Auto-deducted from sale: ' || COALESCE(NEW.item_name, 'Unknown Item'),
      COALESCE(NEW.sale_timestamp, NOW()),
      NOW()
    );

    -- Update inventory balance
    UPDATE inventory_balances
    SET
      quantity_on_hand = quantity_on_hand - v_deduction_qty,
      updated_at = NOW()
    WHERE item_id = v_component_record.item_id
      AND venue_id = NEW.venue_id;

    -- Insert inventory balance if doesn't exist (shouldn't happen, but defensive)
    INSERT INTO inventory_balances (
      venue_id,
      item_id,
      quantity_on_hand,
      last_cost,
      created_at,
      updated_at
    )
    SELECT
      NEW.venue_id,
      v_component_record.item_id,
      -v_deduction_qty,
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

-- Create trigger on pos_sales insert
CREATE TRIGGER process_sale_inventory_trigger
  AFTER INSERT ON pos_sales
  FOR EACH ROW
  WHEN (NEW.recipe_id IS NOT NULL)
  EXECUTE FUNCTION process_sale_inventory();

-- Also trigger on update if recipe_id changes
CREATE TRIGGER process_sale_inventory_update_trigger
  AFTER UPDATE OF recipe_id ON pos_sales
  FOR EACH ROW
  WHEN (NEW.recipe_id IS NOT NULL AND (OLD.recipe_id IS NULL OR OLD.recipe_id != NEW.recipe_id))
  EXECUTE FUNCTION process_sale_inventory();

COMMENT ON FUNCTION process_sale_inventory IS 'Automatically deduct inventory and calculate COGS when POS sale with recipe_id is recorded';
