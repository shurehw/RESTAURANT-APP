-- ============================================================================
-- MENU ITEM RECIPE MAP + COGS VIEW REPLACEMENT
-- Bridges live TipSee item_day_facts to recipes for theoretical COGS.
-- Replaces dead pos_sales-based views with live item_day_facts-based views.
-- ============================================================================

-- ============================================================================
-- 1. MAPPING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS menu_item_recipe_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  menu_item_name TEXT NOT NULL,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  confidence TEXT DEFAULT 'auto_discovered'
    CHECK (confidence IN ('manual', 'auto_exact', 'auto_discovered')),
  mapped_by UUID,
  mapped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_menu_item_map UNIQUE(venue_id, menu_item_name)
);

CREATE INDEX idx_mirm_venue_active ON menu_item_recipe_map(venue_id)
  WHERE is_active = true;
CREATE INDEX idx_mirm_recipe ON menu_item_recipe_map(recipe_id)
  WHERE recipe_id IS NOT NULL;
CREATE INDEX idx_mirm_unmapped ON menu_item_recipe_map(venue_id)
  WHERE recipe_id IS NULL AND is_active = true;

-- RLS
ALTER TABLE menu_item_recipe_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view mappings for their venues"
  ON menu_item_recipe_map FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

CREATE POLICY "Admins can manage mappings"
  ON menu_item_recipe_map FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.is_active = TRUE
        AND ou.role IN ('admin', 'owner')
        AND v.id = menu_item_recipe_map.venue_id
    )
  );

-- Service role bypass for ETL and API operations
CREATE POLICY "Service role full access on menu_item_recipe_map"
  ON menu_item_recipe_map FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE menu_item_recipe_map IS
  'Maps POS menu item names (from TipSee/item_day_facts) to recipes for theoretical COGS. '
  'Keyed on (venue_id, menu_item_name) for exact text matching.';

-- ============================================================================
-- 2. DISCOVERY FUNCTION (called by ETL to find new unmapped items)
-- ============================================================================

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
      SELECT 1 FROM menu_item_recipe_map mirm
      WHERE mirm.venue_id = idf.venue_id
        AND mirm.menu_item_name = idf.menu_item_name
    )
  GROUP BY idf.menu_item_name
  ORDER BY total_sales DESC;
$$;

COMMENT ON FUNCTION discover_unmapped_menu_items IS
  'Returns menu items from item_day_facts (last 30 days) that have no mapping row yet.';

-- ============================================================================
-- 3. REPLACE v_theoretical_usage (was: pos_sales + pos_items + recipes)
-- ============================================================================

DROP VIEW IF EXISTS v_theoretical_usage CASCADE;

CREATE VIEW v_theoretical_usage AS
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
  AND idf.menu_item_name = mirm.menu_item_name
LEFT JOIN recipes r ON mirm.recipe_id = r.id
WHERE mirm.is_active = true
  AND mirm.recipe_id IS NOT NULL;

COMMENT ON VIEW v_theoretical_usage IS
  'Theoretical food usage: item_day_facts quantity * recipe cost_per_unit. '
  'Reads live TipSee data via menu_item_recipe_map.';

-- ============================================================================
-- 4. REPLACE v_food_cost_variance (same column names for UI compatibility)
-- ============================================================================

DROP VIEW IF EXISTS v_food_cost_variance CASCADE;

CREATE VIEW v_food_cost_variance AS
WITH theoretical AS (
  SELECT
    idf.venue_id,
    idf.business_date AS sale_date,
    SUM(idf.quantity_sold * COALESCE(r.cost_per_unit, 0)) AS theoretical_cost,
    SUM(idf.net_sales) AS total_sales
  FROM item_day_facts idf
  INNER JOIN menu_item_recipe_map mirm
    ON idf.venue_id = mirm.venue_id
    AND idf.menu_item_name = mirm.menu_item_name
  LEFT JOIN recipes r ON mirm.recipe_id = r.id
  WHERE mirm.is_active = true
    AND mirm.recipe_id IS NOT NULL
  GROUP BY idf.venue_id, idf.business_date
),
actual AS (
  SELECT
    i.venue_id,
    i.invoice_date::date AS sale_date,
    SUM(i.total_amount) AS actual_cost
  FROM invoices i
  WHERE i.status = 'approved'
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

COMMENT ON VIEW v_food_cost_variance IS
  'Daily theoretical vs actual food cost. Theoretical from item_day_facts + recipe costs. '
  'Actual from approved invoices.';

-- ============================================================================
-- 5. REPLACE v_food_cost_variance_by_category
-- ============================================================================

DROP VIEW IF EXISTS v_category_performance CASCADE;
DROP VIEW IF EXISTS v_food_cost_variance_by_category CASCADE;

CREATE VIEW v_food_cost_variance_by_category AS
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
    AND idf.menu_item_name = mirm.menu_item_name
  LEFT JOIN recipes r ON mirm.recipe_id = r.id
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
  JOIN invoice_lines il ON i.id = il.invoice_id
  LEFT JOIN items it ON il.item_id = it.id
  WHERE i.status = 'approved'
  GROUP BY i.venue_id, i.invoice_date::date, it.category
)
SELECT
  COALESCE(t.venue_id, a.venue_id) AS venue_id,
  COALESCE(t.sale_date, a.sale_date) AS date,
  COALESCE(t.category, a.category) AS category,
  t.theoretical_cost,
  a.actual_cost,
  t.total_sales,
  CASE WHEN t.total_sales > 0 THEN (t.theoretical_cost / t.total_sales * 100) ELSE NULL END AS theoretical_food_cost_pct,
  CASE WHEN t.total_sales > 0 THEN (a.actual_cost / t.total_sales * 100) ELSE NULL END AS actual_food_cost_pct,
  (a.actual_cost - t.theoretical_cost) AS variance_dollars,
  CASE WHEN t.theoretical_cost > 0 THEN ((a.actual_cost - t.theoretical_cost) / t.theoretical_cost * 100) ELSE NULL END AS variance_pct
FROM theoretical t
FULL OUTER JOIN actual a
  ON t.venue_id = a.venue_id
  AND t.sale_date = a.sale_date
  AND t.category = a.category;

COMMENT ON VIEW v_food_cost_variance_by_category IS
  'Daily theoretical vs actual food cost by category (food/beverage/etc).';

-- ============================================================================
-- 6. MAPPING COVERAGE VIEW (for admin dashboard + variance report)
-- ============================================================================

CREATE VIEW v_menu_item_mapping_coverage AS
SELECT
  idf.venue_id,
  COUNT(DISTINCT idf.menu_item_name) AS total_items,
  COUNT(DISTINCT CASE WHEN mirm.recipe_id IS NOT NULL THEN idf.menu_item_name END) AS mapped_items,
  COUNT(DISTINCT CASE WHEN mirm.recipe_id IS NULL OR mirm.id IS NULL THEN idf.menu_item_name END) AS unmapped_items,
  CASE
    WHEN COUNT(DISTINCT idf.menu_item_name) > 0
    THEN ROUND(
      COUNT(DISTINCT CASE WHEN mirm.recipe_id IS NOT NULL THEN idf.menu_item_name END)::NUMERIC
      / COUNT(DISTINCT idf.menu_item_name) * 100, 1
    )
    ELSE 0
  END AS coverage_pct,
  COALESCE(SUM(CASE WHEN mirm.recipe_id IS NOT NULL THEN idf.net_sales ELSE 0 END), 0) AS mapped_sales,
  COALESCE(SUM(idf.net_sales), 0) AS total_sales,
  CASE
    WHEN SUM(idf.net_sales) > 0
    THEN ROUND(
      SUM(CASE WHEN mirm.recipe_id IS NOT NULL THEN idf.net_sales ELSE 0 END)
      / SUM(idf.net_sales) * 100, 1
    )
    ELSE 0
  END AS sales_coverage_pct
FROM item_day_facts idf
LEFT JOIN menu_item_recipe_map mirm
  ON idf.venue_id = mirm.venue_id
  AND idf.menu_item_name = mirm.menu_item_name
  AND mirm.is_active = true
WHERE idf.business_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY idf.venue_id;

COMMENT ON VIEW v_menu_item_mapping_coverage IS
  'Per-venue mapping coverage: how many menu items are mapped to recipes, '
  'both by count and by sales dollars (last 30 days).';

-- ============================================================================
-- 7. REPLACE daily_performance MATERIALIZED VIEW
--    Was: pos_sales + labor_efficiency_daily
--    Now: venue_day_facts + item_day_facts/mapping + labor_day_facts
-- ============================================================================

-- Drop dependents first
DROP VIEW IF EXISTS recent_performance CASCADE;
DROP MATERIALIZED VIEW IF EXISTS daily_performance CASCADE;

CREATE MATERIALIZED VIEW daily_performance AS
SELECT
  vdf.venue_id,
  v.name AS venue_name,
  vdf.business_date,

  -- Sales Metrics (from venue_day_facts)
  vdf.checks_count AS transaction_count,
  vdf.gross_sales,
  CASE WHEN vdf.checks_count > 0
    THEN ROUND(vdf.gross_sales / vdf.checks_count, 2)
    ELSE NULL
  END AS avg_ticket,

  -- Theoretical COGS (from item_day_facts + mapping)
  COALESCE(tc.theoretical_cogs, 0) AS total_cogs,
  CASE
    WHEN vdf.gross_sales > 0
    THEN ROUND((COALESCE(tc.theoretical_cogs, 0) / vdf.gross_sales) * 100, 2)
    ELSE NULL
  END AS cogs_pct,

  -- Labor Metrics (from labor_day_facts)
  COALESCE(ldf.labor_cost, 0) AS labor_cost,
  COALESCE(ldf.total_hours, 0) AS labor_hours,
  CASE
    WHEN vdf.gross_sales > 0
    THEN ROUND((COALESCE(ldf.labor_cost, 0) / vdf.gross_sales) * 100, 2)
    ELSE NULL
  END AS labor_pct,

  -- Prime Cost
  (COALESCE(tc.theoretical_cogs, 0) + COALESCE(ldf.labor_cost, 0)) AS prime_cost,
  CASE
    WHEN vdf.gross_sales > 0
    THEN ROUND(((COALESCE(tc.theoretical_cogs, 0) + COALESCE(ldf.labor_cost, 0)) / vdf.gross_sales) * 100, 2)
    ELSE NULL
  END AS prime_cost_pct,

  -- Gross Profit
  (vdf.gross_sales - COALESCE(tc.theoretical_cogs, 0) - COALESCE(ldf.labor_cost, 0)) AS gross_profit,
  CASE
    WHEN vdf.gross_sales > 0
    THEN ROUND(((vdf.gross_sales - COALESCE(tc.theoretical_cogs, 0) - COALESCE(ldf.labor_cost, 0)) / vdf.gross_sales) * 100, 2)
    ELSE NULL
  END AS gross_profit_pct,

  -- Employee Metrics
  COALESCE(ldf.employee_count, 0) AS employee_count,
  COALESCE(ldf.punch_count, 0) AS shift_count,

  -- SPLH
  CASE
    WHEN COALESCE(ldf.total_hours, 0) > 0
    THEN ROUND(vdf.gross_sales / ldf.total_hours, 2)
    ELSE NULL
  END AS sales_per_labor_hour,

  vdf.last_synced_at AS last_sale_at,
  NOW() AS last_refreshed_at

FROM venue_day_facts vdf
JOIN venues v ON v.id = vdf.venue_id AND v.is_active = true
LEFT JOIN labor_day_facts ldf
  ON ldf.venue_id = vdf.venue_id
  AND ldf.business_date = vdf.business_date
LEFT JOIN LATERAL (
  SELECT SUM(idf.quantity_sold * COALESCE(r.cost_per_unit, 0)) AS theoretical_cogs
  FROM item_day_facts idf
  INNER JOIN menu_item_recipe_map mirm
    ON idf.venue_id = mirm.venue_id
    AND idf.menu_item_name = mirm.menu_item_name
  LEFT JOIN recipes r ON mirm.recipe_id = r.id
  WHERE idf.venue_id = vdf.venue_id
    AND idf.business_date = vdf.business_date
    AND mirm.is_active = true
    AND mirm.recipe_id IS NOT NULL
) tc ON true
WHERE vdf.business_date >= CURRENT_DATE - INTERVAL '90 days';

CREATE UNIQUE INDEX idx_daily_performance_unique
  ON daily_performance(venue_id, business_date);
CREATE INDEX idx_daily_performance_business_date
  ON daily_performance(business_date DESC);
CREATE INDEX idx_daily_performance_venue_id
  ON daily_performance(venue_id);
CREATE INDEX idx_daily_performance_prime_cost_pct
  ON daily_performance(prime_cost_pct DESC NULLS LAST)
  WHERE prime_cost_pct IS NOT NULL;

-- Recreate recent_performance view
CREATE OR REPLACE VIEW recent_performance AS
SELECT * FROM daily_performance
WHERE business_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY business_date DESC, venue_name;

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_daily_performance()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_performance;
END;
$$;

COMMENT ON MATERIALIZED VIEW daily_performance IS
  'Daily P&L: sales from venue_day_facts, theoretical COGS from item_day_facts + recipe mapping, '
  'labor from labor_day_facts. Refreshed every 15 min during service.';
COMMENT ON VIEW recent_performance IS
  'Last 7 days of daily_performance for quick access.';
COMMENT ON FUNCTION refresh_daily_performance IS
  'Refresh daily performance materialized view concurrently.';

-- ============================================================================
-- 8. INITIAL POPULATION (seed mapping table from existing item_day_facts)
-- ============================================================================

INSERT INTO menu_item_recipe_map (venue_id, menu_item_name, confidence)
SELECT DISTINCT ON (idf.venue_id, idf.menu_item_name)
  idf.venue_id,
  idf.menu_item_name,
  'auto_discovered'
FROM item_day_facts idf
WHERE idf.business_date >= CURRENT_DATE - INTERVAL '60 days'
  AND idf.menu_item_name IS NOT NULL
  AND idf.menu_item_name != ''
ON CONFLICT (venue_id, menu_item_name) DO NOTHING;

SELECT 'Menu item recipe map created and seeded. Views replaced. MV rebuilt.' AS status;
