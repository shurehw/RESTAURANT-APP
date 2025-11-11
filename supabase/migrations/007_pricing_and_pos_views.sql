-- ============================================================================
-- Add Menu Pricing and POS Integration - Views Only
-- Run this AFTER 006_pricing_and_pos_tables.sql
-- ============================================================================

-- Drop existing views if they exist
DROP VIEW IF EXISTS v_food_cost_variance;
DROP VIEW IF EXISTS v_theoretical_usage;

-- 1. Create theoretical usage view
CREATE VIEW v_theoretical_usage AS
SELECT
  ps.venue_id,
  ps.sale_date,
  ps.pos_sku,
  ps.item_name,
  ps.quantity as items_sold,
  pi.recipe_id,
  r.name as recipe_name,
  COALESCE(r.cost_per_unit, 0) as recipe_cost,
  ps.quantity * COALESCE(r.cost_per_unit, 0) as theoretical_cost,
  ps.net_sales,
  CASE
    WHEN ps.net_sales > 0 THEN (ps.quantity * COALESCE(r.cost_per_unit, 0) / ps.net_sales * 100)
    ELSE NULL
  END as food_cost_pct
FROM pos_sales ps
INNER JOIN pos_items pi ON ps.venue_id = pi.venue_id AND ps.pos_sku = pi.pos_sku
LEFT JOIN recipes r ON pi.recipe_id = r.id
WHERE pi.is_mapped = true AND pi.is_active = true;

COMMENT ON VIEW v_theoretical_usage IS 'Calculates theoretical food usage based on POS sales × recipe costs';

-- 2. Create variance summary view
CREATE VIEW v_food_cost_variance AS
WITH theoretical AS (
  SELECT
    ps.venue_id,
    ps.sale_date,
    SUM(ps.quantity * COALESCE(r.cost_per_unit, 0)) as theoretical_cost,
    SUM(ps.net_sales) as total_sales
  FROM pos_sales ps
  INNER JOIN pos_items pi ON ps.venue_id = pi.venue_id AND ps.pos_sku = pi.pos_sku
  LEFT JOIN recipes r ON pi.recipe_id = r.id
  WHERE pi.is_mapped = true AND pi.is_active = true
  GROUP BY ps.venue_id, ps.sale_date
),
actual AS (
  SELECT
    i.venue_id,
    i.invoice_date::date as sale_date,
    SUM(i.total_amount) as actual_cost
  FROM invoices i
  WHERE i.status = 'approved'
  GROUP BY i.venue_id, i.invoice_date::date
)
SELECT
  COALESCE(t.venue_id, a.venue_id) as venue_id,
  COALESCE(t.sale_date, a.sale_date) as date,
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
FULL OUTER JOIN actual a ON t.venue_id = a.venue_id AND t.sale_date = a.sale_date;

COMMENT ON VIEW v_food_cost_variance IS 'Daily variance report: theoretical vs actual food cost';
