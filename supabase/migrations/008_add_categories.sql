-- ============================================================================
-- Add Category System for Food vs Beverage Tracking
-- ============================================================================

-- 1. Create category enum for top-level classification (if not exists)
DO $$ BEGIN
  CREATE TYPE item_category AS ENUM ('food', 'beverage', 'alcohol', 'supplies', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE item_category IS 'Top-level category: food, beverage, alcohol, supplies, other';

-- 2. Add category to items table
ALTER TABLE items
ADD COLUMN IF NOT EXISTS category item_category DEFAULT 'food',
ADD COLUMN IF NOT EXISTS subcategory TEXT;

COMMENT ON COLUMN items.category IS 'Primary category: food/beverage/alcohol/supplies';
COMMENT ON COLUMN items.subcategory IS 'Detailed subcategory: protein, produce, dairy, beer, wine, spirits, etc.';

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

-- 3. Add category to recipes table
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS item_category item_category DEFAULT 'food';

COMMENT ON COLUMN recipes.item_category IS 'Category for recipe: food vs beverage vs alcohol';

-- Update existing category column comment
COMMENT ON COLUMN recipes.category IS 'Recipe subcategory: appetizer, entree, dessert, cocktail, etc.';

CREATE INDEX IF NOT EXISTS idx_recipes_item_category ON recipes(item_category);

-- 4. Add category to POS items for better reporting
-- Note: pos_category already exists from migration 006, we're just adding item_category
ALTER TABLE pos_items
ADD COLUMN IF NOT EXISTS item_category item_category;

COMMENT ON COLUMN pos_items.item_category IS 'Mapped OpsOS category (food/beverage/alcohol) - inherited from recipe';
COMMENT ON COLUMN pos_items.pos_category IS 'Raw category from POS system (e.g., "Entrees", "Beer", "Cocktails")';

-- 5. Create category-based variance view
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

-- 6. Create summary view for category performance
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
  -- Target ranges by category
  CASE category::text
    WHEN 'food' THEN 28.0
    WHEN 'beverage' THEN 20.0
    WHEN 'alcohol' THEN 18.0
    WHEN 'supplies' THEN 100.0
    ELSE 30.0
  END as target_cost_pct
FROM v_food_cost_variance_by_category
GROUP BY venue_id, date, category;

COMMENT ON VIEW v_category_performance IS 'Category performance with industry-standard targets (Food: 28%, Beverage: 20%, Alcohol: 18%)';
