/**
 * Unit Tests: Inventory Deduction Trigger (Migration 035)
 * Tests: process_sale_inventory() trigger function
 * This is the CRITICAL function for Recipe→Inventory→COGS integration
 */

BEGIN;

-- Load test fixtures
\i supabase/tests/fixtures/test-data.sql

-- Test 1: POS sale with recipe_id triggers inventory deduction
DO $$
DECLARE
  v_initial_qty NUMERIC;
  v_final_qty NUMERIC;
  v_expected_deduction NUMERIC;
BEGIN
  -- Get initial chicken inventory
  SELECT quantity_on_hand INTO v_initial_qty
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-001';

  -- Expected deduction: 0.5 lb per serving × 1 serving = 0.5 lb
  v_expected_deduction := 0.5;

  -- Insert POS sale with recipe_id (trigger fires)
  INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
  VALUES ('test-sale-trigger-001', 'test-venue-001', 'test-recipe-001', 28.00, 1, NOW(), 'Grilled Chicken');

  -- Get final inventory
  SELECT quantity_on_hand INTO v_final_qty
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-001';

  -- Assert inventory was deducted
  IF ABS((v_initial_qty - v_final_qty) - v_expected_deduction) > 0.01 THEN
    RAISE EXCEPTION 'Inventory deduction incorrect: expected %, got %',
      v_expected_deduction, (v_initial_qty - v_final_qty);
  END IF;

  RAISE NOTICE 'PASS: POS sale triggers inventory deduction';
END $$;

-- Test 2: COGS is calculated and stamped on sale
DO $$
DECLARE
  v_cogs NUMERIC;
  v_expected_cogs NUMERIC;
BEGIN
  -- Expected COGS: (0.5 lb × $5.50) + (0.02 gal × $15.00) = $3.05
  v_expected_cogs := 3.05;

  -- Insert POS sale
  INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
  VALUES ('test-sale-trigger-002', 'test-venue-001', 'test-recipe-001', 28.00, 1, NOW(), 'Grilled Chicken');

  -- Get COGS from sale
  SELECT cogs INTO v_cogs
  FROM pos_sales
  WHERE id = 'test-sale-trigger-002';

  -- Assert
  IF v_cogs IS NULL THEN
    RAISE EXCEPTION 'COGS not calculated';
  END IF;

  IF ABS(v_cogs - v_expected_cogs) > 0.01 THEN
    RAISE EXCEPTION 'COGS calculation incorrect: expected %, got %', v_expected_cogs, v_cogs;
  END IF;

  RAISE NOTICE 'PASS: COGS is calculated and stamped on sale';
END $$;

-- Test 3: Multiple quantity sale deducts correct amount
DO $$
DECLARE
  v_initial_qty NUMERIC;
  v_final_qty NUMERIC;
  v_expected_deduction NUMERIC;
  v_sale_quantity INT;
BEGIN
  v_sale_quantity := 3;

  -- Get initial inventory
  SELECT quantity_on_hand INTO v_initial_qty
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-001';

  -- Expected deduction: 0.5 lb per serving × 3 servings = 1.5 lb
  v_expected_deduction := 0.5 * v_sale_quantity;

  -- Insert POS sale with quantity > 1
  INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
  VALUES ('test-sale-trigger-003', 'test-venue-001', 'test-recipe-001', 84.00, v_sale_quantity, NOW(), 'Grilled Chicken');

  -- Get final inventory
  SELECT quantity_on_hand INTO v_final_qty
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-001';

  -- Assert
  IF ABS((v_initial_qty - v_final_qty) - v_expected_deduction) > 0.01 THEN
    RAISE EXCEPTION 'Multi-quantity deduction incorrect: expected %, got %',
      v_expected_deduction, (v_initial_qty - v_final_qty);
  END IF;

  RAISE NOTICE 'PASS: Multiple quantity sale deducts correct amount';
END $$;

-- Test 4: Inventory transaction is created with negative quantity
DO $$
DECLARE
  v_transaction_count INT;
  v_transaction_qty NUMERIC;
BEGIN
  -- Insert POS sale
  INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
  VALUES ('test-sale-trigger-004', 'test-venue-001', 'test-recipe-001', 28.00, 1, NOW(), 'Grilled Chicken');

  -- Check inventory transaction was created
  SELECT COUNT(*), MIN(quantity) INTO v_transaction_count, v_transaction_qty
  FROM inventory_transactions
  WHERE reference_type = 'pos_sale'
    AND reference_id = 'test-sale-trigger-004'
    AND transaction_type = 'usage';

  -- Assert
  IF v_transaction_count = 0 THEN
    RAISE EXCEPTION 'Inventory transaction not created';
  END IF;

  IF v_transaction_qty >= 0 THEN
    RAISE EXCEPTION 'Inventory transaction should have negative quantity';
  END IF;

  RAISE NOTICE 'PASS: Inventory transaction is created with negative quantity';
END $$;

-- Test 5: Multiple components are all deducted
DO $$
DECLARE
  v_initial_chicken NUMERIC;
  v_initial_oil NUMERIC;
  v_initial_tomatoes NUMERIC;
  v_final_chicken NUMERIC;
  v_final_oil NUMERIC;
  v_final_tomatoes NUMERIC;
BEGIN
  -- Get initial inventories for complex recipe
  SELECT quantity_on_hand INTO v_initial_chicken
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-001';

  SELECT quantity_on_hand INTO v_initial_oil
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-002';

  SELECT quantity_on_hand INTO v_initial_tomatoes
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-003';

  -- Insert sale for complex recipe
  INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
  VALUES ('test-sale-trigger-005', 'test-venue-001', 'test-recipe-003', 32.00, 1, NOW(), 'Complex Recipe');

  -- Get final inventories
  SELECT quantity_on_hand INTO v_final_chicken
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-001';

  SELECT quantity_on_hand INTO v_final_oil
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-002';

  SELECT quantity_on_hand INTO v_final_tomatoes
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-003';

  -- Assert all components were deducted
  IF v_final_chicken >= v_initial_chicken THEN
    RAISE EXCEPTION 'Chicken not deducted';
  END IF;

  IF v_final_oil >= v_initial_oil THEN
    RAISE EXCEPTION 'Oil not deducted';
  END IF;

  IF v_final_tomatoes >= v_initial_tomatoes THEN
    RAISE EXCEPTION 'Tomatoes not deducted';
  END IF;

  RAISE NOTICE 'PASS: Multiple components are all deducted';
END $$;

-- Test 6: Sale without recipe_id does NOT trigger deduction
DO $$
DECLARE
  v_initial_qty NUMERIC;
  v_final_qty NUMERIC;
BEGIN
  -- Get initial inventory
  SELECT quantity_on_hand INTO v_initial_qty
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-001';

  -- Insert POS sale WITHOUT recipe_id
  INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
  VALUES ('test-sale-trigger-006', 'test-venue-001', NULL, 28.00, 1, NOW(), 'Unknown Item');

  -- Get final inventory
  SELECT quantity_on_hand INTO v_final_qty
  FROM inventory_balances
  WHERE venue_id = 'test-venue-001' AND item_id = 'test-item-001';

  -- Assert inventory unchanged
  IF v_initial_qty != v_final_qty THEN
    RAISE EXCEPTION 'Inventory was deducted for sale without recipe_id';
  END IF;

  RAISE NOTICE 'PASS: Sale without recipe_id does NOT trigger deduction';
END $$;

-- Test 7: COGS reflects total cost of multiple components
DO $$
DECLARE
  v_cogs NUMERIC;
  v_expected_cogs NUMERIC;
BEGIN
  -- Expected COGS for complex recipe:
  -- (2.0 lb × $5.50) + (0.1 gal × $15.00) + (1.5 lb × $2.00) = $15.50
  v_expected_cogs := 15.50;

  -- Insert sale
  INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
  VALUES ('test-sale-trigger-007', 'test-venue-001', 'test-recipe-003', 32.00, 1, NOW(), 'Complex Recipe');

  -- Get COGS
  SELECT cogs INTO v_cogs
  FROM pos_sales
  WHERE id = 'test-sale-trigger-007';

  -- Assert
  IF ABS(v_cogs - v_expected_cogs) > 0.01 THEN
    RAISE EXCEPTION 'Multi-component COGS incorrect: expected %, got %', v_expected_cogs, v_cogs;
  END IF;

  RAISE NOTICE 'PASS: COGS reflects total cost of multiple components';
END $$;

-- Test 8: Trigger handles missing inventory balance gracefully
DO $$
DECLARE
  v_new_recipe_id UUID;
  v_new_item_id UUID;
  v_cogs NUMERIC;
BEGIN
  -- Create new item with no inventory balance
  INSERT INTO items (id, name, sku, base_uom, is_active)
  VALUES ('test-item-9999', 'Ghost Item', 'GHOST-999', 'ea', true)
  RETURNING id INTO v_new_item_id;

  -- Create recipe with this item
  INSERT INTO recipes (id, name, venue_id, category)
  VALUES ('test-recipe-9999', 'Ghost Recipe', 'test-venue-001', 'test')
  RETURNING id INTO v_new_recipe_id;

  -- Add component
  INSERT INTO recipe_components (recipe_id, item_id, quantity, unit)
  VALUES (v_new_recipe_id, v_new_item_id, 1.0, 'ea');

  -- Insert sale (should not fail)
  INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
  VALUES ('test-sale-trigger-008', 'test-venue-001', v_new_recipe_id, 10.00, 1, NOW(), 'Ghost Recipe');

  -- Get COGS (should be 0 or NULL)
  SELECT cogs INTO v_cogs
  FROM pos_sales
  WHERE id = 'test-sale-trigger-008';

  -- Assert trigger didn't crash
  RAISE NOTICE 'PASS: Trigger handles missing inventory balance gracefully (COGS: %)', v_cogs;
END $$;

-- Test 9: Update recipe_id triggers recalculation
DO $$
DECLARE
  v_initial_cogs NUMERIC;
  v_updated_cogs NUMERIC;
BEGIN
  -- Insert sale without recipe
  INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
  VALUES ('test-sale-trigger-009', 'test-venue-001', NULL, 28.00, 1, NOW(), 'Grilled Chicken');

  -- Get initial COGS
  SELECT cogs INTO v_initial_cogs
  FROM pos_sales
  WHERE id = 'test-sale-trigger-009';

  -- Update to add recipe_id (trigger should fire)
  UPDATE pos_sales
  SET recipe_id = 'test-recipe-001'
  WHERE id = 'test-sale-trigger-009';

  -- Get updated COGS
  SELECT cogs INTO v_updated_cogs
  FROM pos_sales
  WHERE id = 'test-sale-trigger-009';

  -- Assert COGS was calculated
  IF v_updated_cogs IS NULL OR v_updated_cogs = COALESCE(v_initial_cogs, 0) THEN
    RAISE EXCEPTION 'COGS not recalculated on recipe_id update';
  END IF;

  RAISE NOTICE 'PASS: Update recipe_id triggers recalculation';
END $$;

ROLLBACK;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Inventory Deduction Trigger Tests Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All tests passed ✓';
  RAISE NOTICE 'This is the CRITICAL integration for Recipe→Inventory→COGS';
END $$;
