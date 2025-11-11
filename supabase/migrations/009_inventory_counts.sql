-- ============================================================================
-- Inventory Count System
-- Physical inventory tracking for variance analysis
-- ============================================================================

-- 1. Drop and recreate tables for clean slate
DROP TABLE IF EXISTS inventory_count_lines CASCADE;
DROP TABLE IF EXISTS inventory_counts CASCADE;

-- 2. Create inventory count header table
CREATE TABLE inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  count_date DATE NOT NULL,
  count_type TEXT NOT NULL CHECK (count_type IN ('full', 'partial', 'spot_check')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'approved')),
  counted_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,

  CONSTRAINT uq_count_date UNIQUE(venue_id, count_date)
);

COMMENT ON TABLE inventory_counts IS 'Physical inventory count sessions';
COMMENT ON COLUMN inventory_counts.count_type IS 'full = end of month, partial = category/area, spot_check = random validation';

CREATE INDEX IF NOT EXISTS idx_counts_venue_date ON inventory_counts(venue_id, count_date DESC);
CREATE INDEX IF NOT EXISTS idx_counts_status ON inventory_counts(venue_id, status);

-- 3. Create inventory count lines table
CREATE TABLE inventory_count_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity_counted NUMERIC(10,3) NOT NULL,
  unit_of_measure TEXT NOT NULL,
  unit_cost NUMERIC(12,4), -- cost at time of count
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (quantity_counted * unit_cost) STORED,
  notes TEXT,
  counted_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_count_item UNIQUE(count_id, item_id)
);

COMMENT ON TABLE inventory_count_lines IS 'Individual item counts within an inventory session';

CREATE INDEX IF NOT EXISTS idx_count_lines_count ON inventory_count_lines(count_id);
CREATE INDEX IF NOT EXISTS idx_count_lines_item ON inventory_count_lines(item_id);

-- 4. Create beginning inventory tracking
-- This stores the ending inventory from previous count as beginning inventory for next period
CREATE TABLE IF NOT EXISTS inventory_period_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  beginning_inventory NUMERIC(12,2) NOT NULL,
  ending_inventory NUMERIC(12,2) NOT NULL,
  purchases NUMERIC(12,2) NOT NULL, -- sum of approved invoices in period
  theoretical_usage NUMERIC(12,2), -- from POS sales × recipe costs
  actual_usage NUMERIC(12,2) GENERATED ALWAYS AS (beginning_inventory + purchases - ending_inventory) STORED,
  variance_dollars NUMERIC(12,2) GENERATED ALWAYS AS ((beginning_inventory + purchases - ending_inventory) - theoretical_usage) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_period_snapshot UNIQUE(venue_id, period_start, period_end)
);

COMMENT ON TABLE inventory_period_snapshots IS 'Period-over-period inventory analysis';
COMMENT ON COLUMN inventory_period_snapshots.actual_usage IS 'Beginning + Purchases - Ending = Actual Usage';
COMMENT ON COLUMN inventory_period_snapshots.variance_dollars IS 'Actual Usage - Theoretical Usage = Variance';

CREATE INDEX IF NOT EXISTS idx_snapshots_venue_period ON inventory_period_snapshots(venue_id, period_end DESC);

-- 5. Create view for current on-hand inventory
CREATE OR REPLACE VIEW v_current_inventory AS
WITH latest_counts AS (
  SELECT DISTINCT ON (ic.venue_id, icl.item_id)
    ic.venue_id,
    icl.item_id,
    icl.quantity_counted,
    icl.unit_of_measure,
    icl.unit_cost,
    icl.line_total,
    ic.count_date
  FROM inventory_count_lines icl
  JOIN inventory_counts ic ON icl.count_id = ic.id
  WHERE ic.status = 'approved'
  ORDER BY ic.venue_id, icl.item_id, ic.count_date DESC
)
SELECT
  lc.venue_id,
  lc.item_id,
  i.name as item_name,
  i.sku,
  i.category,
  i.subcategory,
  lc.quantity_counted as quantity_on_hand,
  lc.unit_of_measure,
  lc.unit_cost,
  lc.line_total as extended_value,
  lc.count_date as last_counted,
  -- Calculate days since last count
  CURRENT_DATE - lc.count_date as days_since_count
FROM latest_counts lc
JOIN items i ON lc.item_id = i.id
WHERE i.is_active = true;

COMMENT ON VIEW v_current_inventory IS 'Current on-hand inventory from most recent approved counts';

-- 6. Create theoretical vs actual usage view
CREATE OR REPLACE VIEW v_inventory_variance AS
WITH period_theoretical AS (
  SELECT
    ps.venue_id,
    DATE_TRUNC('month', ps.sale_date)::date as period_start,
    (DATE_TRUNC('month', ps.sale_date) + INTERVAL '1 month - 1 day')::date as period_end,
    SUM(ps.quantity * COALESCE(r.cost_per_unit, 0)) as theoretical_cost
  FROM pos_sales ps
  INNER JOIN pos_items pi ON ps.venue_id = pi.venue_id AND ps.pos_sku = pi.pos_sku
  LEFT JOIN recipes r ON pi.recipe_id = r.id
  WHERE pi.is_mapped = true
  GROUP BY ps.venue_id, DATE_TRUNC('month', ps.sale_date)
),
period_purchases AS (
  SELECT
    i.venue_id,
    DATE_TRUNC('month', i.invoice_date)::date as period_start,
    (DATE_TRUNC('month', i.invoice_date) + INTERVAL '1 month - 1 day')::date as period_end,
    SUM(i.total_amount) as purchases
  FROM invoices i
  WHERE i.status = 'approved'
  GROUP BY i.venue_id, DATE_TRUNC('month', i.invoice_date)
)
SELECT
  ips.venue_id,
  ips.period_start,
  ips.period_end,
  ips.beginning_inventory,
  pp.purchases,
  ips.ending_inventory,
  ips.actual_usage,
  pt.theoretical_cost as theoretical_usage,
  ips.variance_dollars,
  CASE
    WHEN pt.theoretical_cost > 0 THEN (ips.variance_dollars / pt.theoretical_cost * 100)
    ELSE NULL
  END as variance_pct
FROM inventory_period_snapshots ips
LEFT JOIN period_purchases pp ON ips.venue_id = pp.venue_id
  AND ips.period_start = pp.period_start
LEFT JOIN period_theoretical pt ON ips.venue_id = pt.venue_id
  AND ips.period_start = pt.period_start;

COMMENT ON VIEW v_inventory_variance IS 'Monthly inventory variance: Beginning + Purchases - Ending vs Theoretical';

-- 7. Enable RLS
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_period_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_counts_select ON inventory_counts FOR SELECT USING (true);
CREATE POLICY inventory_counts_all ON inventory_counts FOR ALL USING (true);
CREATE POLICY inventory_count_lines_select ON inventory_count_lines FOR SELECT USING (true);
CREATE POLICY inventory_count_lines_all ON inventory_count_lines FOR ALL USING (true);
CREATE POLICY inventory_period_snapshots_select ON inventory_period_snapshots FOR SELECT USING (true);
CREATE POLICY inventory_period_snapshots_all ON inventory_period_snapshots FOR ALL USING (true);
