CREATE OR REPLACE FUNCTION normalize_menu_item_name(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(lower(replace(coalesce(p_value, ''), '&', ' and ')), '[^a-z0-9\s]+', ' ', 'g'),
    '\s+',
    ' ',
    'g'
  )::text
$$;

COMMENT ON FUNCTION normalize_menu_item_name IS
  'Normalizes POS/menu item names for safer recipe mapping joins while item_day_facts lacks a stable external item id.';

CREATE OR REPLACE FUNCTION discover_unmapped_menu_items(p_venue_id UUID)
RETURNS TABLE(menu_item_name TEXT, parent_category TEXT, total_sales NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT
    idf.menu_item_name,
    mode() WITHIN GROUP (ORDER BY idf.parent_category) AS parent_category,
    SUM(idf.net_sales) AS total_sales
  FROM item_day_facts idf
  WHERE idf.venue_id = p_venue_id
    AND idf.business_date >= CURRENT_DATE - INTERVAL '30 days'
    AND NOT EXISTS (
      SELECT 1
      FROM menu_item_recipe_map mirm
      WHERE mirm.venue_id = idf.venue_id
        AND normalize_menu_item_name(mirm.menu_item_name) = normalize_menu_item_name(idf.menu_item_name)
    )
  GROUP BY idf.menu_item_name
  ORDER BY total_sales DESC;
$$;

CREATE OR REPLACE VIEW v_theoretical_usage AS
SELECT
  idf.venue_id,
  idf.business_date AS sale_date,
  idf.menu_item_name,
  idf.parent_category,
  idf.quantity_sold AS items_sold,
  mirm.recipe_id,
  r.name AS recipe_name,
  COALESCE(r.cost_per_unit, 0) AS recipe_cost,
  idf.quantity_sold * COALESCE(r.cost_per_unit, 0) AS theoretical_cost,
  idf.net_sales,
  CASE
    WHEN idf.net_sales > 0
    THEN (idf.quantity_sold * COALESCE(r.cost_per_unit, 0) / idf.net_sales * 100)
    ELSE NULL
  END AS food_cost_pct,
  mirm.confidence AS mapping_confidence
FROM item_day_facts idf
INNER JOIN menu_item_recipe_map mirm
  ON idf.venue_id = mirm.venue_id
  AND normalize_menu_item_name(idf.menu_item_name) = normalize_menu_item_name(mirm.menu_item_name)
LEFT JOIN recipes r
  ON mirm.recipe_id = r.id
WHERE mirm.is_active = true
  AND mirm.recipe_id IS NOT NULL;

CREATE OR REPLACE VIEW v_food_cost_variance AS
WITH theoretical AS (
  SELECT
    idf.venue_id,
    idf.business_date AS sale_date,
    SUM(idf.quantity_sold * COALESCE(r.cost_per_unit, 0)) AS theoretical_cost,
    SUM(idf.net_sales) AS total_sales
  FROM item_day_facts idf
  INNER JOIN menu_item_recipe_map mirm
    ON idf.venue_id = mirm.venue_id
    AND normalize_menu_item_name(idf.menu_item_name) = normalize_menu_item_name(mirm.menu_item_name)
  LEFT JOIN recipes r
    ON mirm.recipe_id = r.id
  WHERE mirm.is_active = true
    AND mirm.recipe_id IS NOT NULL
  GROUP BY idf.venue_id, idf.business_date
),
actual AS (
  SELECT
    i.venue_id,
    i.invoice_date::date AS sale_date,
    SUM(il.line_total) AS actual_cost
  FROM invoices i
  JOIN invoice_lines il
    ON i.id = il.invoice_id
  WHERE i.status = 'approved'
    AND il.item_id IS NOT NULL
    AND COALESCE(il.is_ignored, false) = false
    AND COALESCE(il.is_preopening, false) = false
  GROUP BY i.venue_id, i.invoice_date::date
)
SELECT
  COALESCE(t.venue_id, a.venue_id) AS venue_id,
  COALESCE(t.sale_date, a.sale_date) AS date,
  t.theoretical_cost,
  a.actual_cost,
  t.total_sales,
  CASE
    WHEN t.total_sales > 0 THEN (t.theoretical_cost / t.total_sales * 100)
    ELSE NULL
  END AS theoretical_food_cost_pct,
  CASE
    WHEN t.total_sales > 0 THEN (a.actual_cost / t.total_sales * 100)
    ELSE NULL
  END AS actual_food_cost_pct,
  (a.actual_cost - t.theoretical_cost) AS variance_dollars,
  CASE
    WHEN t.theoretical_cost > 0
    THEN ((a.actual_cost - t.theoretical_cost) / t.theoretical_cost * 100)
    ELSE NULL
  END AS variance_pct
FROM theoretical t
FULL OUTER JOIN actual a
  ON t.venue_id = a.venue_id
  AND t.sale_date = a.sale_date;

CREATE OR REPLACE VIEW v_food_cost_variance_by_category AS
WITH theoretical AS (
  SELECT
    idf.venue_id,
    idf.business_date AS sale_date,
    COALESCE(r.item_category, 'food') AS category,
    SUM(idf.quantity_sold * COALESCE(r.cost_per_unit, 0)) AS theoretical_cost,
    SUM(idf.net_sales) AS total_sales
  FROM item_day_facts idf
  INNER JOIN menu_item_recipe_map mirm
    ON idf.venue_id = mirm.venue_id
    AND normalize_menu_item_name(idf.menu_item_name) = normalize_menu_item_name(mirm.menu_item_name)
  LEFT JOIN recipes r
    ON mirm.recipe_id = r.id
  WHERE mirm.is_active = true
    AND mirm.recipe_id IS NOT NULL
  GROUP BY idf.venue_id, idf.business_date, r.item_category
),
actual AS (
  SELECT
    i.venue_id,
    i.invoice_date::date AS sale_date,
    COALESCE(it.category, 'food') AS category,
    SUM(il.line_total) AS actual_cost
  FROM invoices i
  JOIN invoice_lines il
    ON i.id = il.invoice_id
  LEFT JOIN items it
    ON il.item_id = it.id
  WHERE i.status = 'approved'
    AND il.item_id IS NOT NULL
    AND COALESCE(il.is_ignored, false) = false
    AND COALESCE(il.is_preopening, false) = false
  GROUP BY i.venue_id, i.invoice_date::date, it.category
)
SELECT
  COALESCE(t.venue_id, a.venue_id) AS venue_id,
  COALESCE(t.sale_date, a.sale_date) AS date,
  COALESCE(t.category, a.category) AS category,
  t.theoretical_cost,
  a.actual_cost,
  t.total_sales,
  CASE
    WHEN t.total_sales > 0 THEN (t.theoretical_cost / t.total_sales * 100)
    ELSE NULL
  END AS theoretical_food_cost_pct,
  CASE
    WHEN t.total_sales > 0 THEN (a.actual_cost / t.total_sales * 100)
    ELSE NULL
  END AS actual_food_cost_pct,
  (a.actual_cost - t.theoretical_cost) AS variance_dollars,
  CASE
    WHEN t.theoretical_cost > 0 THEN ((a.actual_cost - t.theoretical_cost) / t.theoretical_cost * 100)
    ELSE NULL
  END AS variance_pct
FROM theoretical t
FULL OUTER JOIN actual a
  ON t.venue_id = a.venue_id
  AND t.sale_date = a.sale_date
  AND t.category = a.category;

CREATE OR REPLACE VIEW v_menu_item_mapping_coverage AS
SELECT
  idf.venue_id,
  COUNT(DISTINCT normalize_menu_item_name(idf.menu_item_name)) AS total_items,
  COUNT(DISTINCT CASE WHEN mirm.recipe_id IS NOT NULL THEN normalize_menu_item_name(idf.menu_item_name) END) AS mapped_items,
  COUNT(DISTINCT CASE WHEN mirm.recipe_id IS NULL OR mirm.id IS NULL THEN normalize_menu_item_name(idf.menu_item_name) END) AS unmapped_items,
  CASE
    WHEN COUNT(DISTINCT normalize_menu_item_name(idf.menu_item_name)) > 0
    THEN ROUND(
      COUNT(DISTINCT CASE WHEN mirm.recipe_id IS NOT NULL THEN normalize_menu_item_name(idf.menu_item_name) END)::NUMERIC
      / COUNT(DISTINCT normalize_menu_item_name(idf.menu_item_name)) * 100,
      1
    )
    ELSE 0
  END AS coverage_pct,
  COALESCE(SUM(CASE WHEN mirm.recipe_id IS NOT NULL THEN idf.net_sales ELSE 0 END), 0) AS mapped_sales,
  COALESCE(SUM(idf.net_sales), 0) AS total_sales,
  CASE
    WHEN SUM(idf.net_sales) > 0
    THEN ROUND(
      SUM(CASE WHEN mirm.recipe_id IS NOT NULL THEN idf.net_sales ELSE 0 END)
      / SUM(idf.net_sales) * 100,
      1
    )
    ELSE 0
  END AS sales_coverage_pct
FROM item_day_facts idf
LEFT JOIN menu_item_recipe_map mirm
  ON idf.venue_id = mirm.venue_id
  AND normalize_menu_item_name(idf.menu_item_name) = normalize_menu_item_name(mirm.menu_item_name)
  AND mirm.is_active = true
WHERE idf.business_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY idf.venue_id;
