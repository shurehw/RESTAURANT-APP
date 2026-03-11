/**
 * Unit Tests: Inventory Deduction Trigger (Migration 035)
 * Tests: process_sale_inventory() trigger function
 * This is the CRITICAL function for Recipe→Inventory→COGS integration
 *
 * pos_sales columns: id, venue_id, sale_date(DATE), pos_sku, item_name,
 *                    quantity, gross_sales, net_sales, recipe_id, cogs
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
  SELECT quantity_on_hand INTO v_initial_qty
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000001';

  -- Expected deduction: 0.5 lb per serving × 1 serving = 0.5 lb
  v_expected_deduction := 0.5;

  INSERT INTO pos_sales (id, venue_id, sale_date, pos_sku, item_name, quantity, gross_sales, net_sales, recipe_id)
  VALUES ('00000000-0000-0000-0009-000000000001',
          '00000000-0000-0000-0001-000000000001',
          CURRENT_DATE, 'TEST-T01', 'Grilled Chicken', 1, 28.00, 28.00,
          '00000000-0000-0000-0004-000000000001');

  SELECT quantity_on_hand INTO v_final_qty
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000001';

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

  INSERT INTO pos_sales (id, venue_id, sale_date, pos_sku, item_name, quantity, gross_sales, net_sales, recipe_id)
  VALUES ('00000000-0000-0000-0009-000000000002',
          '00000000-0000-0000-0001-000000000001',
          CURRENT_DATE, 'TEST-T02', 'Grilled Chicken', 1, 28.00, 28.00,
          '00000000-0000-0000-0004-000000000001');

  SELECT cogs INTO v_cogs
  FROM pos_sales
  WHERE id = '00000000-0000-0000-0009-000000000002';

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

  SELECT quantity_on_hand INTO v_initial_qty
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000001';

  -- Expected deduction: 0.5 lb per serving × 3 = 1.5 lb
  v_expected_deduction := 0.5 * v_sale_quantity;

  INSERT INTO pos_sales (id, venue_id, sale_date, pos_sku, item_name, quantity, gross_sales, net_sales, recipe_id)
  VALUES ('00000000-0000-0000-0009-000000000003',
          '00000000-0000-0000-0001-000000000001',
          CURRENT_DATE, 'TEST-T03', 'Grilled Chicken', v_sale_quantity, 84.00, 84.00,
          '00000000-0000-0000-0004-000000000001');

  SELECT quantity_on_hand INTO v_final_qty
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000001';

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
  INSERT INTO pos_sales (id, venue_id, sale_date, pos_sku, item_name, quantity, gross_sales, net_sales, recipe_id)
  VALUES ('00000000-0000-0000-0009-000000000004',
          '00000000-0000-0000-0001-000000000001',
          CURRENT_DATE, 'TEST-T04', 'Grilled Chicken', 1, 28.00, 28.00,
          '00000000-0000-0000-0004-000000000001');

  SELECT COUNT(*), MIN(quantity) INTO v_transaction_count, v_transaction_qty
  FROM inventory_transactions
  WHERE reference_type = 'pos_sale'
    AND reference_id   = '00000000-0000-0000-0009-000000000004'
    AND transaction_type = 'usage';

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
  v_initial_chicken  NUMERIC;
  v_initial_oil      NUMERIC;
  v_initial_tomatoes NUMERIC;
  v_final_chicken    NUMERIC;
  v_final_oil        NUMERIC;
  v_final_tomatoes   NUMERIC;
BEGIN
  SELECT quantity_on_hand INTO v_initial_chicken
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000001';

  SELECT quantity_on_hand INTO v_initial_oil
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000002';

  SELECT quantity_on_hand INTO v_initial_tomatoes
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000003';

  INSERT INTO pos_sales (id, venue_id, sale_date, pos_sku, item_name, quantity, gross_sales, net_sales, recipe_id)
  VALUES ('00000000-0000-0000-0009-000000000005',
          '00000000-0000-0000-0001-000000000001',
          CURRENT_DATE, 'TEST-T05', 'Complex Recipe', 1, 32.00, 32.00,
          '00000000-0000-0000-0004-000000000003');

  SELECT quantity_on_hand INTO v_final_chicken
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000001';

  SELECT quantity_on_hand INTO v_final_oil
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000002';

  SELECT quantity_on_hand INTO v_final_tomatoes
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000003';

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
  SELECT quantity_on_hand INTO v_initial_qty
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000001';

  INSERT INTO pos_sales (id, venue_id, sale_date, pos_sku, item_name, quantity, gross_sales, net_sales, recipe_id)
  VALUES ('00000000-0000-0000-0009-000000000006',
          '00000000-0000-0000-0001-000000000001',
          CURRENT_DATE, 'TEST-T06', 'Unknown Item', 1, 28.00, 28.00, NULL);

  SELECT quantity_on_hand INTO v_final_qty
  FROM inventory_balances
  WHERE venue_id = '00000000-0000-0000-0001-000000000001'
    AND item_id  = '00000000-0000-0000-0003-000000000001';

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
  -- Expected: (2.0 × $5.50) + (0.1 × $15.00) + (1.5 × $2.00) = $15.50
  v_expected_cogs := 15.50;

  INSERT INTO pos_sales (id, venue_id, sale_date, pos_sku, item_name, quantity, gross_sales, net_sales, recipe_id)
  VALUES ('00000000-0000-0000-0009-000000000007',
          '00000000-0000-0000-0001-000000000001',
          CURRENT_DATE, 'TEST-T07', 'Complex Recipe', 1, 32.00, 32.00,
          '00000000-0000-0000-0004-000000000003');

  SELECT cogs INTO v_cogs
  FROM pos_sales
  WHERE id = '00000000-0000-0000-0009-000000000007';

  IF ABS(v_cogs - v_expected_cogs) > 0.01 THEN
    RAISE EXCEPTION 'Multi-component COGS incorrect: expected %, got %', v_expected_cogs, v_cogs;
  END IF;

  RAISE NOTICE 'PASS: COGS reflects total cost of multiple components';
END $$;

-- Test 8: Trigger handles missing inventory balance gracefully
DO $$
DECLARE
  v_new_recipe_id UUID;
  v_new_item_id   UUID;
  v_cogs          NUMERIC;
BEGIN
  INSERT INTO items (id, organization_id, sku, name, category, base_uom, is_active)
  VALUES ('00000000-0000-0000-0003-000000009999',
          '00000000-0000-0000-0000-000000000001',
          'GHOST-999', 'Ghost Item', 'food', 'ea', true)
  RETURNING id INTO v_new_item_id;

  INSERT INTO recipes (id, name, yield_qty, yield_uom)
  VALUES ('00000000-0000-0000-0004-000000009999', 'Ghost Recipe', 1, 'ea')
  RETURNING id INTO v_new_recipe_id;

  INSERT INTO recipe_components (recipe_id, item_id, quantity, unit)
  VALUES (v_new_recipe_id, v_new_item_id, 1.0, 'ea');

  -- Should not fail even with no inventory balance
  INSERT INTO pos_sales (id, venue_id, sale_date, pos_sku, item_name, quantity, gross_sales, net_sales, recipe_id)
  VALUES ('00000000-0000-0000-0009-000000000008',
          '00000000-0000-0000-0001-000000000001',
          CURRENT_DATE, 'TEST-T08', 'Ghost Recipe', 1, 10.00, 10.00,
          v_new_recipe_id);

  SELECT cogs INTO v_cogs
  FROM pos_sales
  WHERE id = '00000000-0000-0000-0009-000000000008';

  RAISE NOTICE 'PASS: Trigger handles missing inventory balance gracefully (COGS: %)', v_cogs;
END $$;

-- Test 9: Update recipe_id triggers recalculation
DO $$
DECLARE
  v_initial_cogs NUMERIC;
  v_updated_cogs NUMERIC;
BEGIN
  INSERT INTO pos_sales (id, venue_id, sale_date, pos_sku, item_name, quantity, gross_sales, net_sales, recipe_id)
  VALUES ('00000000-0000-0000-0009-000000000009',
          '00000000-0000-0000-0001-000000000001',
          CURRENT_DATE, 'TEST-T09', 'Grilled Chicken', 1, 28.00, 28.00, NULL);

  SELECT cogs INTO v_initial_cogs
  FROM pos_sales
  WHERE id = '00000000-0000-0000-0009-000000000009';

  UPDATE pos_sales
  SET recipe_id = '00000000-0000-0000-0004-000000000001'
  WHERE id = '00000000-0000-0000-0009-000000000009';

  SELECT cogs INTO v_updated_cogs
  FROM pos_sales
  WHERE id = '00000000-0000-0000-0009-000000000009';

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
