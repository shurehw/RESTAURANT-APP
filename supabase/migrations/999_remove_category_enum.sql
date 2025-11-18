/**
 * Migration: Remove item_category enum constraint
 * Change category field to text for flexibility
 */

-- Drop all dependent views first
DROP VIEW IF EXISTS v_category_performance;
DROP VIEW IF EXISTS v_food_cost_variance_by_category;
DROP VIEW IF EXISTS v_product_weights_status;
DROP VIEW IF EXISTS v_current_inventory;

-- Remove default values that depend on the enum
ALTER TABLE recipes
  ALTER COLUMN item_category DROP DEFAULT;

-- Alter all tables using item_category enum to text
ALTER TABLE items
  ALTER COLUMN category TYPE text;

ALTER TABLE recipes
  ALTER COLUMN item_category TYPE text;

ALTER TABLE pos_items
  ALTER COLUMN item_category TYPE text;

-- Now drop the enum type
DROP TYPE IF EXISTS item_category;

-- Re-add defaults using text values
ALTER TABLE recipes
  ALTER COLUMN item_category SET DEFAULT 'food';

-- Add check constraints to ensure categories are not empty
ALTER TABLE items
  ADD CONSTRAINT category_not_empty CHECK (category IS NOT NULL AND category != '');

ALTER TABLE recipes
  ADD CONSTRAINT item_category_not_empty CHECK (item_category IS NOT NULL AND item_category != '');

ALTER TABLE pos_items
  DROP CONSTRAINT IF EXISTS item_category_not_empty;
-- pos_items.item_category can be NULL (for unmapped items)

-- Update comments
COMMENT ON COLUMN items.category IS 'Item category (free text): Bar Consumables, Beverages, Produce, Dairy, Meat & Seafood, Wine & Spirits, Dry Goods, Packaging, etc.';
COMMENT ON COLUMN recipes.item_category IS 'Recipe category (free text): food, beverage, alcohol, etc.';
COMMENT ON COLUMN pos_items.item_category IS 'Mapped OpsOS category (inherited from recipe)';

-- Recreate v_food_cost_variance_by_category view
CREATE OR REPLACE VIEW v_food_cost_variance_by_category AS
WITH theoretical AS (
  SELECT
    ps.venue_id,
    ps.sale_date,
    COALESCE(r.item_category, 'food') as category,
    SUM(ps.quantity * COALESCE(r.cost_per_unit, 0)) as theoretical_cost,
    SUM(ps.net_sales) as total_sales
  FROM pos_sales ps
  INNER JOIN pos_items pi ON ps.venue_id = pi.venue_id AND ps.pos_sku = pi.pos_sku
  LEFT JOIN recipes r ON pi.recipe_id = r.id
  WHERE pi.is_mapped = true AND pi.is_active = true
  GROUP BY ps.venue_id, ps.sale_date, r.item_category
),
actual AS (
  SELECT
    i.venue_id,
    i.invoice_date::date as sale_date,
    COALESCE(it.category, 'food') as category,
    SUM(il.line_total) as actual_cost
  FROM invoices i
  JOIN invoice_lines il ON i.id = il.invoice_id
  LEFT JOIN items it ON il.item_id = it.id
  WHERE i.status = 'approved'
  GROUP BY i.venue_id, i.invoice_date::date, it.category
)
SELECT
  COALESCE(t.venue_id, a.venue_id) as venue_id,
  COALESCE(t.sale_date, a.sale_date) as date,
  COALESCE(t.category, a.category) as category,
  t.theoretical_cost,
  a.actual_cost,
  t.total_sales,
  CASE
    WHEN t.total_sales > 0 THEN (t.theoretical_cost / t.total_sales * 100)
    ELSE NULL
  END as theoretical_food_cost_pct,
  CASE
    WHEN t.total_sales > 0 THEN (a.actual_cost / t.total_sales * 100)
    ELSE NULL
  END as actual_food_cost_pct,
  (a.actual_cost - t.theoretical_cost) as variance_dollars,
  CASE
    WHEN t.theoretical_cost > 0 THEN ((a.actual_cost - t.theoretical_cost) / t.theoretical_cost * 100)
    ELSE NULL
  END as variance_pct
FROM theoretical t
FULL OUTER JOIN actual a ON t.venue_id = a.venue_id AND t.sale_date = a.sale_date AND t.category = a.category;

COMMENT ON VIEW v_food_cost_variance_by_category IS 'Category-level variance (food vs beverage vs alcohol)';

-- Recreate v_category_performance view
CREATE OR REPLACE VIEW v_category_performance AS
SELECT
  venue_id,
  date,
  category,
  SUM(total_sales) as total_sales,
  SUM(theoretical_cost) as theoretical_cost,
  SUM(actual_cost) as actual_cost,
  CASE
    WHEN SUM(total_sales) > 0 THEN (SUM(theoretical_cost) / SUM(total_sales) * 100)
    ELSE NULL
  END as theoretical_cost_pct,
  CASE
    WHEN SUM(total_sales) > 0 THEN (SUM(actual_cost) / SUM(total_sales) * 100)
    ELSE NULL
  END as actual_cost_pct,
  CASE category
    WHEN 'food' THEN 28.0
    WHEN 'beverage' THEN 20.0
    WHEN 'alcohol' THEN 18.0
    WHEN 'supplies' THEN 100.0
    ELSE 30.0
  END as target_cost_pct
FROM v_food_cost_variance_by_category
GROUP BY venue_id, date, category;

COMMENT ON VIEW v_category_performance IS 'Category performance with industry-standard targets (Food: 28%, Beverage: 20%, Alcohol: 18%)';

-- Recreate v_product_weights_status view
CREATE OR REPLACE VIEW v_product_weights_status AS
SELECT
  pw.*,
  i.name as item_name,
  i.category,
  CASE
    WHEN pw.verified_at IS NOT NULL THEN 'verified'
    WHEN pw.empty_g_source = 'measured' THEN 'measured'
    WHEN pw.empty_g_source = 'seed_list' THEN 'needs_verification'
    ELSE 'missing'
  END as status,
  CASE
    WHEN pw.full_g IS NOT NULL THEN true
    ELSE false
  END as has_full_weight,
  (
    SELECT COUNT(*)
    FROM inventory_scale_readings isr
    WHERE isr.sku_id = pw.sku_id
  ) as reading_count
FROM product_weights pw
INNER JOIN items i ON i.id = pw.sku_id;

-- Recreate v_current_inventory view
CREATE VIEW v_current_inventory AS
SELECT
  ib.id,
  ib.venue_id,
  v.name as venue_name,
  ib.item_id,
  i.sku,
  i.name as item_name,
  i.category,
  ib.quantity_on_hand,
  ib.unit_of_measure,
  ib.last_cost,
  ib.quantity_on_hand * COALESCE(ib.last_cost, 0) as total_value,
  ib.last_received_at,
  ib.last_updated_at
FROM inventory_balances ib
JOIN items i ON ib.item_id = i.id
JOIN venues v ON ib.venue_id = v.id
WHERE ib.quantity_on_hand > 0
ORDER BY v.name, i.category, i.name;

COMMENT ON VIEW v_current_inventory IS 'Current on-hand inventory with values';
