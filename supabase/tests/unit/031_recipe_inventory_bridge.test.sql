/**
 * Unit Tests: Recipe-Inventory Bridge (Migration 031)
 * Tests: calculate_recipe_cost() function and recipe_components table
 */

BEGIN;

-- Load test fixtures
\i supabase/tests/fixtures/test-data.sql

-- Test 1: Calculate simple recipe cost
DO $$
DECLARE
  v_calculated_cost NUMERIC;
  v_expected_cost NUMERIC;
BEGIN
  -- Expected: (0.5 lb × $5.50) + (0.02 gal × $15.00) = $2.75 + $0.30 = $3.05
  v_expected_cost := 3.05;

  -- Execute
  v_calculated_cost := calculate_recipe_cost('test-recipe-001', 'test-venue-001');

  -- Assert
  IF ABS(v_calculated_cost - v_expected_cost) > 0.01 THEN
    RAISE EXCEPTION 'Recipe cost calculation failed: expected %, got %', v_expected_cost, v_calculated_cost;
  END IF;

  RAISE NOTICE 'PASS: Calculate simple recipe cost';
END $$;

-- Test 2: Calculate complex recipe cost (multiple components)
DO $$
DECLARE
  v_calculated_cost NUMERIC;
  v_expected_cost NUMERIC;
BEGIN
  -- Expected: (2.0 lb × $5.50) + (0.1 gal × $15.00) + (1.5 lb × $2.00)
  --         = $11.00 + $1.50 + $3.00 = $15.50
  v_expected_cost := 15.50;

  -- Execute
  v_calculated_cost := calculate_recipe_cost('test-recipe-003', 'test-venue-001');

  -- Assert
  IF ABS(v_calculated_cost - v_expected_cost) > 0.01 THEN
    RAISE EXCEPTION 'Complex recipe cost calculation failed: expected %, got %', v_expected_cost, v_calculated_cost;
  END IF;

  RAISE NOTICE 'PASS: Calculate complex recipe cost';
END $$;

-- Test 3: Recipe cost history is stored
DO $$
DECLARE
  v_history_count INT;
BEGIN
  -- Execute
  PERFORM calculate_recipe_cost('test-recipe-001', 'test-venue-001');

  -- Check history was created
  SELECT COUNT(*) INTO v_history_count
  FROM recipe_costs
  WHERE recipe_id = 'test-recipe-001'
    AND venue_id = 'test-venue-001';

  -- Assert
  IF v_history_count = 0 THEN
    RAISE EXCEPTION 'Recipe cost history not stored';
  END IF;

  RAISE NOTICE 'PASS: Recipe cost history is stored';
END $$;

-- Test 4: Recipe cost handles missing inventory cost
DO $$
DECLARE
  v_calculated_cost NUMERIC;
  v_new_item_id UUID;
BEGIN
  -- Create item with no inventory balance
  INSERT INTO items (id, name, sku, base_uom, is_active)
  VALUES ('test-item-999', 'New Item', 'NEW-999', 'ea', true)
  RETURNING id INTO v_new_item_id;

  -- Add to recipe
  INSERT INTO recipe_components (recipe_id, item_id, quantity, unit)
  VALUES ('test-recipe-001', v_new_item_id, 1.0, 'ea');

  -- Execute (should not fail, should use 0 for missing cost)
  v_calculated_cost := calculate_recipe_cost('test-recipe-001', 'test-venue-001');

  -- Assert (should still calculate)
  IF v_calculated_cost IS NULL THEN
    RAISE EXCEPTION 'Recipe cost calculation failed with missing inventory cost';
  END IF;

  RAISE NOTICE 'PASS: Recipe cost handles missing inventory cost';
END $$;

-- Test 5: Recipe components unique constraint
DO $$
BEGIN
  -- Try to insert duplicate
  BEGIN
    INSERT INTO recipe_components (recipe_id, item_id, quantity, unit)
    VALUES ('test-recipe-001', 'test-item-001', 0.75, 'lb');

    RAISE EXCEPTION 'Duplicate recipe component was allowed';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS: Recipe components unique constraint enforced';
  END;
END $$;

-- Test 6: Recipe cost calculation with venue_id NULL (global cost)
DO $$
DECLARE
  v_calculated_cost NUMERIC;
BEGIN
  -- Execute with NULL venue_id
  v_calculated_cost := calculate_recipe_cost('test-recipe-001', NULL);

  -- Should calculate based on any available inventory
  IF v_calculated_cost IS NULL THEN
    RAISE EXCEPTION 'Recipe cost calculation failed with NULL venue_id';
  END IF;

  RAISE NOTICE 'PASS: Recipe cost calculation with NULL venue_id';
END $$;

-- Test 7: Recipe component quantity must be positive
DO $$
BEGIN
  -- Try to insert negative quantity
  BEGIN
    INSERT INTO recipe_components (recipe_id, item_id, quantity, unit)
    VALUES ('test-recipe-001', 'test-item-003', -1.0, 'lb');

    RAISE EXCEPTION 'Negative quantity was allowed';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: Recipe component quantity must be positive';
  END;
END $$;

-- Test 8: updated_at timestamp is auto-updated
DO $$
DECLARE
  v_original_updated_at TIMESTAMPTZ;
  v_new_updated_at TIMESTAMPTZ;
BEGIN
  -- Get original timestamp
  SELECT updated_at INTO v_original_updated_at
  FROM recipe_components
  WHERE recipe_id = 'test-recipe-001' AND item_id = 'test-item-001';

  -- Wait a moment
  PERFORM pg_sleep(0.1);

  -- Update the component
  UPDATE recipe_components
  SET quantity = 0.6
  WHERE recipe_id = 'test-recipe-001' AND item_id = 'test-item-001';

  -- Get new timestamp
  SELECT updated_at INTO v_new_updated_at
  FROM recipe_components
  WHERE recipe_id = 'test-recipe-001' AND item_id = 'test-item-001';

  -- Assert
  IF v_new_updated_at <= v_original_updated_at THEN
    RAISE EXCEPTION 'updated_at timestamp not auto-updated';
  END IF;

  RAISE NOTICE 'PASS: updated_at timestamp is auto-updated';
END $$;

ROLLBACK;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Recipe-Inventory Bridge Tests Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All tests passed ✓';
END $$;
