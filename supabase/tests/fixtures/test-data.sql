/**
 * Test Data Fixtures
 * Purpose: Reusable test data for intelligence layer testing
 */

-- Test Organization
INSERT INTO organizations (id, name, created_at) VALUES
  ('test-org-001', 'Test Organization', NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Venues
INSERT INTO venues (id, name, organization_id, is_active, created_at) VALUES
  ('test-venue-001', 'Test Venue 1', 'test-org-001', true, NOW()),
  ('test-venue-002', 'Test Venue 2', 'test-org-001', true, NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Vendors
INSERT INTO vendors (id, name, category, is_active, created_at) VALUES
  ('test-vendor-001', 'Test Food Vendor', 'food', true, NOW()),
  ('test-vendor-002', 'Test Beverage Vendor', 'beverage', true, NOW()),
  ('test-vendor-003', 'Unreliable Vendor', 'food', true, NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Items
INSERT INTO items (id, name, sku, category, base_uom, is_active, created_at) VALUES
  ('test-item-001', 'Chicken Breast', 'CHKN-BRST-001', 'protein', 'lb', true, NOW()),
  ('test-item-002', 'Olive Oil', 'OIL-OLIVE-001', 'pantry', 'gal', true, NOW()),
  ('test-item-003', 'Tomatoes', 'VEG-TOM-001', 'produce', 'lb', true, NOW()),
  ('test-item-004', 'Vodka', 'LIQ-VODKA-001', 'liquor', 'bottle', true, NOW()),
  ('test-item-005', 'Expensive Item', 'TEST-EXP-001', 'protein', 'lb', true, NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Recipes
INSERT INTO recipes (id, name, venue_id, category, yield_quantity, yield_unit, created_at) VALUES
  ('test-recipe-001', 'Grilled Chicken', 'test-venue-001', 'entree', 1, 'serving', NOW()),
  ('test-recipe-002', 'Vodka Martini', 'test-venue-001', 'cocktail', 1, 'drink', NOW()),
  ('test-recipe-003', 'Complex Recipe', 'test-venue-001', 'entree', 4, 'serving', NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Recipe Components
INSERT INTO recipe_components (recipe_id, item_id, quantity, unit, created_at) VALUES
  -- Grilled Chicken (simple)
  ('test-recipe-001', 'test-item-001', 0.5, 'lb', NOW()),
  ('test-recipe-001', 'test-item-002', 0.02, 'gal', NOW()),

  -- Vodka Martini
  ('test-recipe-002', 'test-item-004', 0.08, 'bottle', NOW()),

  -- Complex Recipe (multiple components)
  ('test-recipe-003', 'test-item-001', 2.0, 'lb', NOW()),
  ('test-recipe-003', 'test-item-002', 0.1, 'gal', NOW()),
  ('test-recipe-003', 'test-item-003', 1.5, 'lb', NOW())
ON CONFLICT (recipe_id, item_id) DO NOTHING;

-- Test Inventory Balances
INSERT INTO inventory_balances (venue_id, item_id, quantity_on_hand, last_cost, created_at, updated_at) VALUES
  ('test-venue-001', 'test-item-001', 100.0, 5.50, NOW(), NOW()),
  ('test-venue-001', 'test-item-002', 20.0, 15.00, NOW(), NOW()),
  ('test-venue-001', 'test-item-003', 50.0, 2.00, NOW(), NOW()),
  ('test-venue-001', 'test-item-004', 30.0, 25.00, NOW(), NOW()),
  ('test-venue-001', 'test-item-005', 10.0, 50.00, NOW(), NOW())
ON CONFLICT (venue_id, item_id) DO UPDATE SET
  quantity_on_hand = EXCLUDED.quantity_on_hand,
  last_cost = EXCLUDED.last_cost,
  updated_at = NOW();

-- Test Item Pars
INSERT INTO item_pars (venue_id, item_id, par_level, reorder_point, reorder_quantity, created_at) VALUES
  ('test-venue-001', 'test-item-001', 100, 50, 100, NOW()),
  ('test-venue-001', 'test-item-002', 25, 15, 20, NOW()),
  ('test-venue-001', 'test-item-003', 75, 40, 50, NOW()),
  ('test-venue-001', 'test-item-004', 50, 25, 30, NOW()),
  ('test-venue-001', 'test-item-005', 20, 10, 15, NOW())
ON CONFLICT (venue_id, item_id) DO UPDATE SET
  par_level = EXCLUDED.par_level,
  reorder_point = EXCLUDED.reorder_point,
  reorder_quantity = EXCLUDED.reorder_quantity;

-- Test Item Cost History (for spike detection)
INSERT INTO item_cost_history (item_id, vendor_id, venue_id, cost, effective_date, source, created_at) VALUES
  -- Normal cost history for chicken
  ('test-item-001', 'test-vendor-001', 'test-venue-001', 5.00, NOW() - INTERVAL '90 days', 'manual', NOW()),
  ('test-item-001', 'test-vendor-001', 'test-venue-001', 5.25, NOW() - INTERVAL '60 days', 'manual', NOW()),
  ('test-item-001', 'test-vendor-001', 'test-venue-001', 5.10, NOW() - INTERVAL '30 days', 'manual', NOW()),
  ('test-item-001', 'test-vendor-001', 'test-venue-001', 5.50, NOW() - INTERVAL '7 days', 'manual', NOW()),
  ('test-item-001', 'test-vendor-001', 'test-venue-001', 5.40, NOW() - INTERVAL '1 day', 'manual', NOW()),

  -- Normal cost history for expensive item (for spike detection test)
  ('test-item-005', 'test-vendor-001', 'test-venue-001', 48.00, NOW() - INTERVAL '90 days', 'manual', NOW()),
  ('test-item-005', 'test-vendor-001', 'test-venue-001', 49.00, NOW() - INTERVAL '60 days', 'manual', NOW()),
  ('test-item-005', 'test-vendor-001', 'test-venue-001', 51.00, NOW() - INTERVAL '30 days', 'manual', NOW()),
  ('test-item-005', 'test-vendor-001', 'test-venue-001', 50.00, NOW() - INTERVAL '7 days', 'manual', NOW()),
  ('test-item-005', 'test-vendor-001', 'test-venue-001', 49.50, NOW() - INTERVAL '1 day', 'manual', NOW())
ON CONFLICT DO NOTHING;

-- Test Positions (for labor)
INSERT INTO positions (id, name, hourly_rate, created_at) VALUES
  ('test-pos-001', 'Line Cook', 18.00, NOW()),
  ('test-pos-002', 'Server', 15.00, NOW()),
  ('test-pos-003', 'Bartender', 16.00, NOW()),
  ('test-pos-004', 'Manager', 25.00, NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Users (for shift assignments)
INSERT INTO auth.users (id, email, created_at) VALUES
  ('test-user-001', 'cook1@test.com', NOW()),
  ('test-user-002', 'server1@test.com', NOW()),
  ('test-user-003', 'bartender1@test.com', NOW()),
  ('test-user-004', 'manager1@test.com', NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Shift Assignments
INSERT INTO shift_assignments (id, venue_id, user_id, position_id, shift_start, shift_end, created_at) VALUES
  -- Today's shifts for testing
  ('test-shift-001', 'test-venue-001', 'test-user-001', 'test-pos-001',
    CURRENT_DATE + INTERVAL '11 hours', CURRENT_DATE + INTERVAL '19 hours', NOW()),
  ('test-shift-002', 'test-venue-001', 'test-user-002', 'test-pos-002',
    CURRENT_DATE + INTERVAL '17 hours', CURRENT_DATE + INTERVAL '23 hours', NOW()),
  ('test-shift-003', 'test-venue-001', 'test-user-003', 'test-pos-003',
    CURRENT_DATE + INTERVAL '18 hours', CURRENT_DATE + INTERVAL '2 hours', NOW()),

  -- Yesterday's shifts for historical testing
  ('test-shift-004', 'test-venue-001', 'test-user-001', 'test-pos-001',
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '11 hours',
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '19 hours', NOW()),
  ('test-shift-005', 'test-venue-001', 'test-user-002', 'test-pos-002',
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '17 hours',
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '23 hours', NOW())
ON CONFLICT (id) DO NOTHING;

-- Test POS Sales (without recipe_id for now)
INSERT INTO pos_sales (id, venue_id, amount, sale_timestamp, item_name, quantity, created_at) VALUES
  -- Today's sales
  ('test-sale-001', 'test-venue-001', 28.00, CURRENT_DATE + INTERVAL '12 hours', 'Grilled Chicken', 1, NOW()),
  ('test-sale-002', 'test-venue-001', 15.00, CURRENT_DATE + INTERVAL '12 hours 30 minutes', 'Vodka Martini', 1, NOW()),
  ('test-sale-003', 'test-venue-001', 32.00, CURRENT_DATE + INTERVAL '13 hours', 'Grilled Chicken', 1, NOW()),

  -- Yesterday's sales
  ('test-sale-004', 'test-venue-001', 28.00, CURRENT_DATE - INTERVAL '1 day' + INTERVAL '12 hours', 'Grilled Chicken', 1, NOW()),
  ('test-sale-005', 'test-venue-001', 28.00, CURRENT_DATE - INTERVAL '1 day' + INTERVAL '13 hours', 'Grilled Chicken', 1, NOW()),
  ('test-sale-006', 'test-venue-001', 15.00, CURRENT_DATE - INTERVAL '1 day' + INTERVAL '19 hours', 'Vodka Martini', 2, NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Daily Budgets
INSERT INTO daily_budgets (venue_id, business_date, sales_budget, labor_budget, cogs_budget_pct, prime_cost_budget_pct, created_at) VALUES
  ('test-venue-001', CURRENT_DATE, 1000.00, 250.00, 30.00, 60.00, NOW()),
  ('test-venue-001', CURRENT_DATE - INTERVAL '1 day', 1000.00, 250.00, 30.00, 60.00, NOW()),
  ('test-venue-001', CURRENT_DATE + INTERVAL '1 day', 1200.00, 280.00, 30.00, 60.00, NOW())
ON CONFLICT (venue_id, business_date) DO UPDATE SET
  sales_budget = EXCLUDED.sales_budget,
  labor_budget = EXCLUDED.labor_budget,
  cogs_budget_pct = EXCLUDED.cogs_budget_pct,
  prime_cost_budget_pct = EXCLUDED.prime_cost_budget_pct;

-- Test Purchase Orders (for vendor performance)
INSERT INTO purchase_orders (id, venue_id, vendor_id, order_date, delivery_date, status, total_amount, created_at) VALUES
  ('test-po-001', 'test-venue-001', 'test-vendor-001', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '29 days', 'completed', 500.00, NOW()),
  ('test-po-002', 'test-venue-001', 'test-vendor-001', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '59 days', 'completed', 750.00, NOW()),
  ('test-po-003', 'test-venue-001', 'test-vendor-002', CURRENT_DATE - INTERVAL '45 days', CURRENT_DATE - INTERVAL '44 days', 'completed', 300.00, NOW()),
  ('test-po-004', 'test-venue-001', 'test-vendor-003', CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE - INTERVAL '19 days', 'pending', 400.00, NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Receipts
INSERT INTO receipts (id, venue_id, purchase_order_id, vendor_id, received_at, status, created_at) VALUES
  ('test-receipt-001', 'test-venue-001', 'test-po-001', 'test-vendor-001', CURRENT_DATE - INTERVAL '29 days', 'completed', NOW()),
  ('test-receipt-002', 'test-venue-001', 'test-po-002', 'test-vendor-001', CURRENT_DATE - INTERVAL '59 days', 'completed', NOW()),
  ('test-receipt-003', 'test-venue-001', 'test-po-003', 'test-vendor-002', CURRENT_DATE - INTERVAL '44 days', 'completed', NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Receipt Lines (for cost spike detection)
INSERT INTO receipt_lines (receipt_id, item_id, quantity, unit_cost, created_at) VALUES
  ('test-receipt-001', 'test-item-001', 50, 5.50, NOW()),
  ('test-receipt-002', 'test-item-001', 75, 5.40, NOW()),
  ('test-receipt-003', 'test-item-002', 10, 15.00, NOW())
ON CONFLICT DO NOTHING;

-- Test Exception Rules (already seeded in migration, but ensure they exist)
-- No additional rules needed for basic testing

COMMENT ON TABLE organizations IS 'Test fixture data loaded successfully';
