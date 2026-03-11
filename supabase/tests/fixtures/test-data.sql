/**
 * Test Data Fixtures
 * Purpose: Reusable test data for intelligence layer unit testing.
 *
 * Stable UUID map (all within BEGIN/ROLLBACK, safe to re-run):
 *   org-001    00000000-0000-0000-0000-000000000001
 *   venue-001  00000000-0000-0000-0001-000000000001
 *   item-001   00000000-0000-0000-0003-000000000001  (Chicken Breast)
 *   item-002   00000000-0000-0000-0003-000000000002  (Olive Oil)
 *   item-003   00000000-0000-0000-0003-000000000003  (Tomatoes)
 *   item-004   00000000-0000-0000-0003-000000000004  (Vodka)
 *   item-005   00000000-0000-0000-0003-000000000005  (Expensive Item)
 *   recipe-001 00000000-0000-0000-0004-000000000001  (Grilled Chicken)
 *   recipe-002 00000000-0000-0000-0004-000000000002  (Vodka Martini)
 *   recipe-003 00000000-0000-0000-0004-000000000003  (Complex Recipe)
 *   user-001   00000000-0000-0000-0006-000000000001
 *   user-004   00000000-0000-0000-0006-000000000004
 */

-- Test Organization
INSERT INTO organizations (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Test Organization', 'test-org-fixture')
ON CONFLICT (id) DO NOTHING;

-- Test Venue (pos_type required NOT NULL; organization_id FK to organizations)
INSERT INTO venues (id, name, organization_id, pos_type, is_active) VALUES
  ('00000000-0000-0000-0001-000000000001', 'Test Venue 1',
   '00000000-0000-0000-0000-000000000001', 'toast', true)
ON CONFLICT (id) DO NOTHING;

-- Test Items (category must be item_category enum: food/beverage/packaging/supplies)
INSERT INTO items (id, organization_id, sku, name, category, base_uom, is_active) VALUES
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'CHKN-BRST-001', 'Chicken Breast', 'food',     'lb',     true),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000001', 'OIL-OLIVE-001', 'Olive Oil',      'food',     'gal',    true),
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000001', 'VEG-TOM-001',   'Tomatoes',       'food',     'lb',     true),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 'LIQ-VODKA-001', 'Vodka',          'beverage', 'bottle', true),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 'TEST-EXP-001',  'Expensive Item', 'food',     'lb',     true)
ON CONFLICT (id) DO NOTHING;

-- Test Recipes (no venue_id or category on recipes table)
INSERT INTO recipes (id, name, yield_qty, yield_uom) VALUES
  ('00000000-0000-0000-0004-000000000001', 'Grilled Chicken', 1, 'serving'),
  ('00000000-0000-0000-0004-000000000002', 'Vodka Martini',   1, 'drink'),
  ('00000000-0000-0000-0004-000000000003', 'Complex Recipe',  4, 'serving')
ON CONFLICT (id) DO NOTHING;

-- Test Recipe Components
-- Grilled Chicken: 0.5 lb chicken ($5.50) + 0.02 gal olive oil ($15.00) = $3.05
-- Complex Recipe:  2.0 lb chicken + 0.1 gal olive oil + 1.5 lb tomatoes   = $15.50
INSERT INTO recipe_components (recipe_id, item_id, quantity, unit) VALUES
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0003-000000000001', 0.5,  'lb'),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0003-000000000002', 0.02, 'gal'),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0003-000000000004', 0.08, 'bottle'),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0003-000000000001', 2.0,  'lb'),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0003-000000000002', 0.1,  'gal'),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0003-000000000003', 1.5,  'lb')
ON CONFLICT (recipe_id, item_id) DO NOTHING;

-- Inventory Balances (last_cost drives calculate_recipe_cost; unit_of_measure NOT NULL)
INSERT INTO inventory_balances (venue_id, item_id, quantity_on_hand, unit_of_measure, last_cost) VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0003-000000000001', 100.0, 'lb',   5.50),
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0003-000000000002',  20.0, 'gal', 15.00),
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0003-000000000003',  50.0, 'lb',   2.00),
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0003-000000000004',  30.0, 'btl', 25.00),
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0003-000000000005',  10.0, 'lb',  50.00)
ON CONFLICT (venue_id, item_id) DO UPDATE SET
  quantity_on_hand = EXCLUDED.quantity_on_hand,
  unit_of_measure  = EXCLUDED.unit_of_measure,
  last_cost        = EXCLUDED.last_cost;

-- Test Users (needed for acknowledge_alert FK on alerts.acknowledged_by)
INSERT INTO auth.users (id, email, created_at, updated_at, encrypted_password, email_confirmed_at, aud, role) VALUES
  ('00000000-0000-0000-0006-000000000001', 'user001@test.internal', NOW(), NOW(), '', NOW(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0006-000000000004', 'user004@test.internal', NOW(), NOW(), '', NOW(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- Daily Budget for test venue today (required for 032 test 5 unique-constraint check and test 12)
INSERT INTO daily_budgets (venue_id, business_date, sales_budget, labor_budget, cogs_budget_pct, prime_cost_budget_pct) VALUES
  ('00000000-0000-0000-0001-000000000001', CURRENT_DATE, 1000.00, 250.00, 30.00, 60.00)
ON CONFLICT (venue_id, business_date) DO UPDATE SET
  sales_budget          = EXCLUDED.sales_budget,
  labor_budget          = EXCLUDED.labor_budget,
  cogs_budget_pct       = EXCLUDED.cogs_budget_pct,
  prime_cost_budget_pct = EXCLUDED.prime_cost_budget_pct;
