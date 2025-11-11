-- ============================================================================
-- OpsOS Schema: Restaurant Back-Office Platform (Enhanced)
-- Postgres 15+ (Supabase)
-- ============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE pos_type AS ENUM ('toast', 'square');
CREATE TYPE invoice_status AS ENUM ('draft', 'pending_approval', 'approved', 'exported');
CREATE TYPE count_status AS ENUM ('open', 'finalized');
CREATE TYPE item_category AS ENUM ('food', 'beverage', 'packaging', 'supplies');
CREATE TYPE department_type AS ENUM ('kitchen', 'bar', 'packaging');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE alert_type AS ENUM ('cost_spike', 'margin_below_floor', 'margin_above_ceiling', 'missing_mapping', 'variance_high');

-- ============================================================================
-- TABLES: Dimensions & Admin
-- ============================================================================

-- Venues (multi-concept operating units)
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  pos_type pos_type NOT NULL,
  r365_entity_id TEXT, -- external R365 identifier
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE venues IS 'Operating units (Delilah LA, Nice Guy LA).';

-- Departments (scoped to venues)
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name department_type NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, name)
);
COMMENT ON TABLE departments IS 'Venue-scoped departments (Kitchen, Bar, Packaging).';

-- Vendors
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL, -- lowercase, trimmed for alias matching
  contact_email TEXT,
  contact_phone TEXT,
  payment_terms_days INT DEFAULT 30,
  r365_vendor_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT vendors_positive_terms CHECK (payment_terms_days >= 0)
);
CREATE UNIQUE INDEX idx_vendors_normalized ON vendors(normalized_name) WHERE is_active;
CREATE INDEX idx_vendors_r365 ON vendors(r365_vendor_id) WHERE r365_vendor_id IS NOT NULL;
COMMENT ON TABLE vendors IS 'Supplier master with R365 sync keys.';

-- Items (unified SKU catalog)
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category item_category NOT NULL,
  base_uom TEXT NOT NULL, -- ea, lb, oz, case, etc. (lowercase)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Margin intelligence columns
  floor_margin_pct NUMERIC(5,2),
  target_margin_pct NUMERIC(5,2),
  ceiling_margin_pct NUMERIC(5,2),
  CONSTRAINT items_valid_margins CHECK (
    (floor_margin_pct IS NULL OR (floor_margin_pct >= 0 AND floor_margin_pct <= 100)) AND
    (target_margin_pct IS NULL OR (target_margin_pct >= 0 AND target_margin_pct <= 100)) AND
    (ceiling_margin_pct IS NULL OR (ceiling_margin_pct >= 0 AND ceiling_margin_pct <= 100))
  ),
  CONSTRAINT items_margin_order CHECK (
    floor_margin_pct IS NULL OR target_margin_pct IS NULL OR ceiling_margin_pct IS NULL OR
    (floor_margin_pct <= target_margin_pct AND target_margin_pct <= ceiling_margin_pct)
  )
);
CREATE INDEX idx_items_category ON items(category) WHERE is_active;
CREATE INDEX idx_items_sku ON items(sku) WHERE is_active;
COMMENT ON TABLE items IS 'Canonical SKU master: food, beverage, packaging, supplies.';

-- Item Cost History (time-series)
CREATE TABLE item_cost_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL,
  source TEXT, -- 'invoice', 'manual', 'vendor_catalog'
  created_by UUID, -- auth.users(id)
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ich_positive_cost CHECK (unit_cost >= 0)
);
CREATE INDEX idx_ich_item_date ON item_cost_history(item_id, effective_date DESC);
CREATE INDEX idx_ich_effective_date ON item_cost_history(effective_date DESC);
COMMENT ON TABLE item_cost_history IS 'Time-series cost tracking for all items.';

-- Vendor Items (price tiers, MOQs, lead times)
CREATE TABLE vendor_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tier_qty INT NOT NULL DEFAULT 1, -- quantity threshold for this tier
  tier_price NUMERIC(12,4) NOT NULL,
  moq INT DEFAULT 1, -- minimum order quantity
  lead_time_days INT DEFAULT 7,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT vi_positive_tier CHECK (tier_qty > 0 AND tier_price >= 0 AND moq > 0 AND lead_time_days >= 0),
  UNIQUE(vendor_id, item_id, tier_qty)
);
CREATE INDEX idx_vi_vendor_item ON vendor_items(vendor_id, item_id) WHERE is_active;
CREATE INDEX idx_vi_item ON vendor_items(item_id) WHERE is_active;
COMMENT ON TABLE vendor_items IS 'Vendor-specific pricing tiers and terms.';

-- ============================================================================
-- TABLES: AP / Invoices
-- ============================================================================

-- Invoices (AP header)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  venue_id UUID NOT NULL REFERENCES venues(id),
  invoice_number TEXT,
  invoice_date DATE NOT NULL,
  due_date DATE,
  total_amount NUMERIC(12,2),
  status invoice_status DEFAULT 'draft',
  ocr_confidence NUMERIC(3,2), -- 0.00 to 1.00
  storage_path TEXT, -- Supabase Storage path to PDF
  r365_export_batch_id UUID,
  created_by UUID, -- auth.users(id)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT inv_positive_total CHECK (total_amount IS NULL OR total_amount >= 0),
  CONSTRAINT inv_confidence_range CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1))
);
CREATE INDEX idx_invoices_vendor ON invoices(vendor_id);
CREATE INDEX idx_invoices_venue_date ON invoices(venue_id, invoice_date DESC);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_batch ON invoices(r365_export_batch_id) WHERE r365_export_batch_id IS NOT NULL;
COMMENT ON TABLE invoices IS 'Invoice header with OCR metadata and R365 export tracking.';

-- Invoice Lines
CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id), -- NULL if unmapped
  description TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL,
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (qty * unit_cost) STORED,
  gl_code TEXT,
  department_id UUID REFERENCES departments(id), -- for GL allocation
  approved_by UUID, -- references auth.users(id)
  approved_at TIMESTAMPTZ,
  ocr_confidence NUMERIC(3,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT il_positive_qty CHECK (qty > 0 AND unit_cost >= 0),
  CONSTRAINT il_confidence_range CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1))
);
CREATE INDEX idx_il_invoice ON invoice_lines(invoice_id);
CREATE INDEX idx_il_item ON invoice_lines(item_id);
CREATE INDEX idx_il_unmapped ON invoice_lines(invoice_id) WHERE item_id IS NULL;
CREATE INDEX idx_il_department ON invoice_lines(department_id);
COMMENT ON TABLE invoice_lines IS 'Line-level invoice detail with item mapping and GL codes.';

-- AP Approvals (audit trail)
CREATE TABLE ap_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  approver_user_id UUID NOT NULL, -- auth.users(id)
  status approval_status NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ap_invoice ON ap_approvals(invoice_id);
CREATE INDEX idx_ap_status ON ap_approvals(status);
COMMENT ON TABLE ap_approvals IS 'Approval workflow audit trail.';

-- AP Export Batches
CREATE TABLE ap_export_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_date DATE NOT NULL,
  storage_path TEXT NOT NULL, -- CSV file path in Storage
  checksum TEXT, -- MD5 hash
  invoice_count INT DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  exported_by UUID, -- auth.users(id)
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT batch_positive_count CHECK (invoice_count >= 0 AND total_amount >= 0)
);
CREATE INDEX idx_batch_date ON ap_export_batches(batch_date DESC);
COMMENT ON TABLE ap_export_batches IS 'R365 AP export batch metadata.';

-- ============================================================================
-- TABLES: Inventory
-- ============================================================================

-- Inventory Locations
CREATE TABLE inventory_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, name)
);
CREATE INDEX idx_loc_venue ON inventory_locations(venue_id) WHERE is_active;
COMMENT ON TABLE inventory_locations IS 'Storage areas per venue (walk-in, dry, bar cooler).';

-- Inventory Counts (header)
CREATE TABLE inventory_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  count_date DATE NOT NULL,
  counted_by UUID, -- auth.users(id)
  status count_status DEFAULT 'open',
  finalized_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ic_location_date ON inventory_counts(location_id, count_date DESC);
CREATE INDEX idx_ic_status ON inventory_counts(status);
COMMENT ON TABLE inventory_counts IS 'Count sheet header.';

-- Inventory Count Lines
CREATE TABLE inventory_count_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  count_id UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  counted_qty NUMERIC(12,3) NOT NULL,
  expected_qty NUMERIC(12,3),
  variance NUMERIC(12,3) GENERATED ALWAYS AS (counted_qty - COALESCE(expected_qty, 0)) STORED,
  unit_cost NUMERIC(12,4), -- snapshot at count time
  shrink_cost NUMERIC(12,2) GENERATED ALWAYS AS ((COALESCE(expected_qty,0) - counted_qty) * COALESCE(unit_cost,0)) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT icl_positive_counted CHECK (counted_qty >= 0)
);
CREATE INDEX idx_icl_count ON inventory_count_lines(count_id);
CREATE INDEX idx_icl_item ON inventory_count_lines(item_id);
COMMENT ON TABLE inventory_count_lines IS 'Line-level count with expected vs actual and shrink.';

-- ============================================================================
-- TABLES: Recipes / Menu
-- ============================================================================

-- Recipes (header)
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  yield_qty NUMERIC(12,3) NOT NULL DEFAULT 1,
  yield_uom TEXT NOT NULL,
  prep_loss_pct NUMERIC(5,2) DEFAULT 0, -- 0-100
  labor_minutes INT DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT recipes_positive_yield CHECK (yield_qty > 0 AND prep_loss_pct >= 0 AND prep_loss_pct <= 100 AND labor_minutes >= 0)
);
CREATE INDEX idx_recipes_active ON recipes(is_active);
COMMENT ON TABLE recipes IS 'Recipe header with yield, prep loss, and labor.';

-- Recipe Items (BOM)
CREATE TABLE recipe_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  qty NUMERIC(12,3) NOT NULL,
  uom TEXT NOT NULL,
  is_packaging BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ri_positive_qty CHECK (qty > 0)
);
CREATE INDEX idx_ri_recipe ON recipe_items(recipe_id);
CREATE INDEX idx_ri_item ON recipe_items(item_id);
COMMENT ON TABLE recipe_items IS 'BOM lines including packaging components.';

-- Menu Items (POS-synced sellable items)
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  external_id TEXT NOT NULL, -- Toast/Square GUID
  name TEXT NOT NULL,
  price NUMERIC(10,2),
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, external_id),
  CONSTRAINT mi_positive_price CHECK (price IS NULL OR price >= 0)
);
CREATE INDEX idx_mi_venue ON menu_items(venue_id) WHERE is_active;
CREATE INDEX idx_mi_external ON menu_items(external_id);
COMMENT ON TABLE menu_items IS 'POS menu items synced from Toast/Square.';

-- Menu Item Recipes (many-to-many)
CREATE TABLE menu_item_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  portion_multiplier NUMERIC(8,3) DEFAULT 1,
  UNIQUE(menu_item_id, recipe_id),
  CONSTRAINT mir_positive_mult CHECK (portion_multiplier > 0)
);
CREATE INDEX idx_mir_menu ON menu_item_recipes(menu_item_id);
CREATE INDEX idx_mir_recipe ON menu_item_recipes(recipe_id);
COMMENT ON TABLE menu_item_recipes IS 'Links menu items to recipes with portion scaling.';

-- ============================================================================
-- TABLES: POS Facts (canonical)
-- ============================================================================

-- POS Sales (canonical fact table)
CREATE TABLE pos_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  business_date DATE NOT NULL,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  qty NUMERIC(12,3) NOT NULL,
  net_revenue NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ps_positive_qty CHECK (qty >= 0 AND net_revenue >= 0)
);
CREATE INDEX idx_ps_venue_date ON pos_sales(venue_id, business_date DESC);
CREATE INDEX idx_ps_menu_item ON pos_sales(menu_item_id);
COMMENT ON TABLE pos_sales IS 'Canonical daily POS sales grain: venue, date, menu_item, qty, revenue.';

-- POS Menu Map (external POS ID → menu_items)
CREATE TABLE pos_menu_map (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  pos_type pos_type NOT NULL,
  external_item_id TEXT NOT NULL, -- Toast/Square item GUID
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, pos_type, external_item_id)
);
CREATE INDEX idx_pmm_venue_pos ON pos_menu_map(venue_id, pos_type) WHERE is_active;
COMMENT ON TABLE pos_menu_map IS 'Maps external POS item identifiers to canonical menu_items.';

-- ============================================================================
-- TABLES: Budgets & Spend
-- ============================================================================

-- Daily Spend Facts (aggregates)
CREATE TABLE daily_spend_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  department_id UUID REFERENCES departments(id),
  txn_date DATE NOT NULL,
  total_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  source TEXT, -- 'invoice', 'pos', 'manual'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, department_id, txn_date, source),
  CONSTRAINT dsf_positive_spend CHECK (total_spend >= 0)
);
CREATE INDEX idx_dsf_venue_dept_date ON daily_spend_facts(venue_id, department_id, txn_date DESC);
COMMENT ON TABLE daily_spend_facts IS 'Daily spend aggregates for declining budget calc.';

-- Budgets (period budget config)
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  period_start DATE NOT NULL,
  period_days INT NOT NULL DEFAULT 7, -- typically weekly
  initial_budget NUMERIC(12,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, department_id, period_start),
  CONSTRAINT budgets_positive CHECK (initial_budget >= 0 AND period_days > 0)
);
CREATE INDEX idx_budgets_venue_dept ON budgets(venue_id, department_id, period_start DESC);
COMMENT ON TABLE budgets IS 'Period budget per venue/department (typically weekly).';

-- ============================================================================
-- TABLES: Alerts
-- ============================================================================

-- Alert Events
CREATE TABLE alert_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type alert_type NOT NULL,
  severity TEXT DEFAULT 'medium', -- low, medium, high
  entity_type TEXT, -- 'item', 'menu_item', 'invoice_line', etc.
  entity_id UUID,
  message TEXT NOT NULL,
  metadata JSONB, -- flexible payload
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID, -- auth.users(id)
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_alerts_type ON alert_events(alert_type);
CREATE INDEX idx_alerts_unack ON alert_events(created_at DESC) WHERE NOT acknowledged;
CREATE INDEX idx_alerts_entity ON alert_events(entity_type, entity_id);
COMMENT ON TABLE alert_events IS 'System alerts: cost spikes, margin violations, missing mappings.';

-- ============================================================================
-- MATERIALIZED VIEWS
-- ============================================================================

-- v_item_latest_cost: most recent cost per item
CREATE MATERIALIZED VIEW v_item_latest_cost AS
SELECT DISTINCT ON (item_id)
  item_id,
  effective_date,
  unit_cost,
  source
FROM item_cost_history
ORDER BY item_id, effective_date DESC, created_at DESC;

CREATE UNIQUE INDEX idx_vilc_item ON v_item_latest_cost(item_id);
COMMENT ON MATERIALIZED VIEW v_item_latest_cost IS 'Latest unit cost per item (refreshed nightly).';

-- v_recipe_cost_rollup: total cost per recipe (incl. packaging, prep loss)
CREATE MATERIALIZED VIEW v_recipe_cost_rollup AS
SELECT
  r.id AS recipe_id,
  r.name AS recipe_name,
  r.yield_qty,
  r.yield_uom,
  r.prep_loss_pct,
  r.labor_minutes,
  COALESCE(SUM(ri.qty * c.unit_cost), 0) AS raw_cost,
  COALESCE(SUM(ri.qty * c.unit_cost), 0) * (1 + r.prep_loss_pct / 100.0) AS total_cost,
  COALESCE(SUM(ri.qty * c.unit_cost), 0) * (1 + r.prep_loss_pct / 100.0) / NULLIF(r.yield_qty, 0) AS cost_per_unit
FROM recipes r
LEFT JOIN recipe_items ri ON ri.recipe_id = r.id
LEFT JOIN v_item_latest_cost c ON c.item_id = ri.item_id
WHERE r.is_active
GROUP BY r.id, r.name, r.yield_qty, r.yield_uom, r.prep_loss_pct, r.labor_minutes;

CREATE UNIQUE INDEX idx_vrcr_recipe ON v_recipe_cost_rollup(recipe_id);
COMMENT ON MATERIALIZED VIEW v_recipe_cost_rollup IS 'Plate cost rollup including prep loss and packaging.';

-- ============================================================================
-- STANDARD VIEWS
-- ============================================================================

-- v_inventory_expected_vs_actual: variance and shrink per count
CREATE VIEW v_inventory_expected_vs_actual AS
SELECT
  icl.count_id,
  icl.item_id,
  i.sku,
  i.name AS item_name,
  icl.expected_qty,
  icl.counted_qty,
  icl.variance,
  icl.unit_cost,
  icl.shrink_cost,
  ic.count_date,
  loc.name AS location_name
FROM inventory_count_lines icl
JOIN items i ON i.id = icl.item_id
JOIN inventory_counts ic ON ic.id = icl.count_id
JOIN inventory_locations loc ON loc.id = ic.location_id;

COMMENT ON VIEW v_inventory_expected_vs_actual IS 'Inventory variance and shrink detail.';

-- v_declining_budget: daily remaining budget
CREATE VIEW v_declining_budget AS
WITH daily_series AS (
  SELECT
    b.id AS budget_id,
    b.venue_id,
    b.department_id,
    b.period_start,
    b.period_days,
    b.initial_budget,
    generate_series(0, b.period_days - 1) AS day_offset
  FROM budgets b
),
spend_to_date AS (
  SELECT
    ds.budget_id,
    ds.day_offset,
    COALESCE(SUM(dsf.total_spend), 0) AS cumulative_spend
  FROM daily_series ds
  JOIN budgets b ON b.id = ds.budget_id
  LEFT JOIN daily_spend_facts dsf ON
    dsf.venue_id = ds.venue_id
    AND dsf.department_id = ds.department_id
    AND dsf.txn_date >= ds.period_start
    AND dsf.txn_date <= ds.period_start + ds.day_offset
  GROUP BY ds.budget_id, ds.day_offset
)
SELECT
  ds.budget_id,
  ds.venue_id,
  ds.department_id,
  ds.period_start,
  ds.day_offset,
  ds.period_start + ds.day_offset AS txn_date,
  ds.initial_budget,
  COALESCE(s.cumulative_spend, 0) AS cumulative_spend,
  ds.initial_budget - COALESCE(s.cumulative_spend, 0) AS remaining_budget
FROM daily_series ds
LEFT JOIN spend_to_date s ON s.budget_id = ds.budget_id AND s.day_offset = ds.day_offset;

COMMENT ON VIEW v_declining_budget IS 'Daily declining budget series per venue/department/period.';

-- v_cost_spikes: items with recent cost increases > threshold
CREATE VIEW v_cost_spikes AS
WITH recent_costs AS (
  SELECT
    item_id,
    effective_date,
    unit_cost,
    LAG(unit_cost) OVER (PARTITION BY item_id ORDER BY effective_date) AS prev_cost
  FROM item_cost_history
  WHERE effective_date >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT
  rc.item_id,
  i.sku,
  i.name,
  rc.effective_date,
  rc.prev_cost,
  rc.unit_cost AS current_cost,
  CASE
    WHEN rc.prev_cost > 0 THEN ((rc.unit_cost - rc.prev_cost) / rc.prev_cost) * 100
    ELSE 0
  END AS pct_change
FROM recent_costs rc
JOIN items i ON i.id = rc.item_id
WHERE rc.prev_cost IS NOT NULL
  AND rc.prev_cost > 0
  AND ((rc.unit_cost - rc.prev_cost) / rc.prev_cost) > 0.10; -- 10% threshold

COMMENT ON VIEW v_cost_spikes IS 'Items with cost increases >10% in last 30 days.';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) Setup
-- ============================================================================

-- Enable RLS on key tables
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_spend_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (Finance/Owner bypass; Ops/Kitchen venue-scoped)
-- Note: Real implementation requires auth.jwt() → user metadata mapping to roles

-- Invoices: Finance/Owner see all; Ops/Kitchen see own venue
CREATE POLICY invoices_select_policy ON invoices
  FOR SELECT
  USING (
    -- Service role bypass
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
    OR
    -- Finance/Owner see all
    current_setting('request.jwt.claims', true)::jsonb->>'app_role' IN ('owner', 'finance')
    OR
    -- Ops/Kitchen see own venue
    (
      current_setting('request.jwt.claims', true)::jsonb->>'app_role' IN ('ops', 'kitchen')
      AND venue_id::text = current_setting('request.jwt.claims', true)::jsonb->>'venue_id'
    )
  );

-- Similar policies for other tables (detailed policies deferred to app layer)

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * refresh_cost_views: Refreshes materialized views for item costs and recipe rollups.
 */
CREATE OR REPLACE FUNCTION refresh_cost_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_item_latest_cost;
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_recipe_cost_rollup;
  RAISE NOTICE 'Cost views refreshed at %', now();
END;
$$;
COMMENT ON FUNCTION refresh_cost_views IS 'Refreshes MV: v_item_latest_cost, v_recipe_cost_rollup.';

/**
 * raise_cost_spike_alerts: Detects items with cost increases >10% vs recent avg.
 * Inserts alerts into alert_events.
 */
CREATE OR REPLACE FUNCTION raise_cost_spike_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_threshold NUMERIC := 0.10; -- 10%
  v_alert_count INT := 0;
BEGIN
  INSERT INTO alert_events (alert_type, severity, entity_type, entity_id, message, metadata)
  SELECT
    'cost_spike'::alert_type,
    CASE
      WHEN pct_change > 25 THEN 'high'
      WHEN pct_change > 15 THEN 'medium'
      ELSE 'low'
    END,
    'item',
    item_id,
    format('Cost spike: %s (%s) increased %.1f%% from $%.2f to $%.2f',
      name, sku, pct_change, prev_cost, current_cost),
    jsonb_build_object(
      'item_id', item_id,
      'sku', sku,
      'prev_cost', prev_cost,
      'current_cost', current_cost,
      'pct_change', pct_change,
      'effective_date', effective_date
    )
  FROM v_cost_spikes;

  GET DIAGNOSTICS v_alert_count = ROW_COUNT;
  RAISE NOTICE 'Raised % cost spike alerts', v_alert_count;
END;
$$;
COMMENT ON FUNCTION raise_cost_spike_alerts IS 'Detects and logs cost spike alerts from v_cost_spikes.';

-- ============================================================================
-- pg_cron JOBS
-- ============================================================================

-- Nightly refresh of materialized views at 3:05 AM UTC
SELECT cron.schedule(
  'refresh-cost-views-nightly',
  '5 3 * * *',
  $$SELECT refresh_cost_views();$$
);

-- Cost spike alerts at 3:15 AM UTC
SELECT cron.schedule(
  'cost-spike-alerts-nightly',
  '15 3 * * *',
  $$SELECT raise_cost_spike_alerts();$$
);

-- ============================================================================
-- SEED DATA: 2 venues, departments, sample items, vendors, recipes
-- ============================================================================

-- Venues
INSERT INTO venues (id, name, pos_type, r365_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Delilah LA', 'toast', 'R365_DELILAH'),
  ('22222222-2222-2222-2222-222222222222', 'Nice Guy LA', 'square', 'R365_NICEGUY')
ON CONFLICT (id) DO NOTHING;

-- Departments
INSERT INTO departments (venue_id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'kitchen'),
  ('11111111-1111-1111-1111-111111111111', 'bar'),
  ('11111111-1111-1111-1111-111111111111', 'packaging'),
  ('22222222-2222-2222-2222-222222222222', 'kitchen'),
  ('22222222-2222-2222-2222-222222222222', 'bar'),
  ('22222222-2222-2222-2222-222222222222', 'packaging')
ON CONFLICT (venue_id, name) DO NOTHING;

-- Vendors
INSERT INTO vendors (id, name, normalized_name, r365_vendor_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sysco Los Angeles', 'sysco los angeles', 'R365_SYSCO'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vollrath Company, LLC', 'vollrath company llc', 'R365_VOLLRATH'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'US Foods', 'us foods', 'R365_USFOODS')
ON CONFLICT (id) DO NOTHING;

-- Items (food, beverage, packaging)
INSERT INTO items (id, sku, name, category, base_uom, floor_margin_pct, target_margin_pct, ceiling_margin_pct) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'ESPRESSO-001', 'Espresso Beans (lb)', 'beverage', 'lb', 60, 70, 80),
  ('a0000002-0000-0000-0000-000000000002', 'MILK-WHOLE-GAL', 'Whole Milk (gal)', 'beverage', 'gal', 50, 65, 75),
  ('a0000003-0000-0000-0000-000000000003', 'ICE-BAG-10LB', 'Ice Bag 10lb', 'beverage', 'bag', NULL, NULL, NULL),
  ('b0000001-0000-0000-0000-000000000001', 'CUP-PET-16OZ', 'PET Cup 16oz', 'packaging', 'ea', NULL, NULL, NULL),
  ('b0000002-0000-0000-0000-000000000002', 'LID-FLAT-16OZ', 'Flat Lid 16oz', 'packaging', 'ea', NULL, NULL, NULL),
  ('b0000003-0000-0000-0000-000000000003', 'STRAW-PAPER-8IN', 'Paper Straw 8in', 'packaging', 'ea', NULL, NULL, NULL),
  ('a0000004-0000-0000-0000-000000000004', 'PIZZA-DOUGH-14OZ', 'Pizza Dough 14oz', 'food', 'ea', 55, 68, 78),
  ('b0000004-0000-0000-0000-000000000004', 'BOX-PIZZA-12IN', 'Pizza Box 12in SBS', 'packaging', 'ea', NULL, NULL, NULL),
  ('a0000005-0000-0000-0000-000000000005', 'TOMATO-SAUCE-QT', 'Tomato Sauce (qt)', 'food', 'qt', 60, 72, 82),
  ('a0000006-0000-0000-0000-000000000006', 'CHEESE-MOZZ-LB', 'Mozzarella Cheese (lb)', 'food', 'lb', 55, 70, 80)
ON CONFLICT (id) DO NOTHING;

-- Item Cost History
INSERT INTO item_cost_history (item_id, effective_date, unit_cost, source) VALUES
  ('a0000001-0000-0000-0000-000000000001', '2025-01-01', 18.50, 'vendor_catalog'),
  ('a0000002-0000-0000-0000-000000000002', '2025-01-01', 4.25, 'vendor_catalog'),
  ('a0000003-0000-0000-0000-000000000003', '2025-01-01', 2.00, 'vendor_catalog'),
  ('b0000001-0000-0000-0000-000000000001', '2025-01-01', 0.12, 'vendor_catalog'),
  ('b0000002-0000-0000-0000-000000000002', '2025-01-01', 0.08, 'vendor_catalog'),
  ('b0000003-0000-0000-0000-000000000003', '2025-01-01', 0.03, 'vendor_catalog'),
  ('a0000004-0000-0000-0000-000000000004', '2025-01-01', 1.20, 'vendor_catalog'),
  ('b0000004-0000-0000-0000-000000000004', '2025-01-01', 0.45, 'vendor_catalog'),
  ('a0000005-0000-0000-0000-000000000005', '2025-01-01', 3.50, 'vendor_catalog'),
  ('a0000006-0000-0000-0000-000000000006', '2025-01-01', 7.25, 'vendor_catalog')
ON CONFLICT DO NOTHING;

-- Vendor Items (price tiers)
INSERT INTO vendor_items (vendor_id, item_id, tier_qty, tier_price, moq, lead_time_days) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000001-0000-0000-0000-000000000001', 1, 18.50, 5, 3),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000001-0000-0000-0000-000000000001', 10, 17.00, 10, 3),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000002-0000-0000-0000-000000000002', 1, 4.25, 4, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b0000001-0000-0000-0000-000000000001', 1, 0.12, 500, 7),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b0000001-0000-0000-0000-000000000001', 1000, 0.10, 1000, 7),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'a0000004-0000-0000-0000-000000000004', 1, 1.20, 24, 2)
ON CONFLICT (vendor_id, item_id, tier_qty) DO NOTHING;

-- Recipes
INSERT INTO recipes (id, name, yield_qty, yield_uom, prep_loss_pct, labor_minutes) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'Iced Latte 16oz', 1, 'ea', 5, 2),
  ('c0000002-0000-0000-0000-000000000002', 'Margherita Pizza 12in', 1, 'ea', 8, 12)
ON CONFLICT (id) DO NOTHING;

-- Recipe Items (Iced Latte: espresso, milk, ice, cup, lid, straw)
INSERT INTO recipe_items (recipe_id, item_id, qty, uom, is_packaging) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 0.04, 'lb', false),
  ('c0000001-0000-0000-0000-000000000001', 'a0000002-0000-0000-0000-000000000002', 0.09, 'gal', false),
  ('c0000001-0000-0000-0000-000000000001', 'a0000003-0000-0000-0000-000000000003', 0.02, 'bag', false),
  ('c0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 1, 'ea', true),
  ('c0000001-0000-0000-0000-000000000001', 'b0000002-0000-0000-0000-000000000002', 1, 'ea', true),
  ('c0000001-0000-0000-0000-000000000001', 'b0000003-0000-0000-0000-000000000003', 1, 'ea', true)
ON CONFLICT DO NOTHING;

-- Recipe Items (Margherita Pizza: dough, sauce, cheese, box)
INSERT INTO recipe_items (recipe_id, item_id, qty, uom, is_packaging) VALUES
  ('c0000002-0000-0000-0000-000000000002', 'a0000004-0000-0000-0000-000000000004', 1, 'ea', false),
  ('c0000002-0000-0000-0000-000000000002', 'a0000005-0000-0000-0000-000000000005', 0.25, 'qt', false),
  ('c0000002-0000-0000-0000-000000000002', 'a0000006-0000-0000-0000-000000000006', 0.375, 'lb', false),
  ('c0000002-0000-0000-0000-000000000002', 'b0000004-0000-0000-0000-000000000004', 1, 'ea', true)
ON CONFLICT DO NOTHING;

-- Inventory Locations
INSERT INTO inventory_locations (id, venue_id, name) VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Walk-In Cooler'),
  ('d2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Dry Storage'),
  ('d3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Bar Cooler')
ON CONFLICT (id) DO NOTHING;

-- Budgets (sample week starting 2025-11-03)
INSERT INTO budgets (venue_id, department_id, period_start, period_days, initial_budget)
SELECT
  v.id,
  d.id,
  '2025-11-03'::date,
  7,
  CASE d.name
    WHEN 'kitchen' THEN 15000.00
    WHEN 'bar' THEN 8000.00
    WHEN 'packaging' THEN 2000.00
  END
FROM venues v
JOIN departments d ON d.venue_id = v.id
WHERE v.name = 'Delilah LA'
ON CONFLICT (venue_id, department_id, period_start) DO NOTHING;

INSERT INTO budgets (venue_id, department_id, period_start, period_days, initial_budget)
SELECT
  v.id,
  d.id,
  '2025-11-03'::date,
  7,
  CASE d.name
    WHEN 'kitchen' THEN 12000.00
    WHEN 'bar' THEN 6000.00
    WHEN 'packaging' THEN 1500.00
  END
FROM venues v
JOIN departments d ON d.venue_id = v.id
WHERE v.name = 'Nice Guy LA'
ON CONFLICT (venue_id, department_id, period_start) DO NOTHING;

-- Daily Spend Facts (sample data for budget week)
INSERT INTO daily_spend_facts (venue_id, department_id, txn_date, total_spend, source)
SELECT
  v.id,
  d.id,
  txn_date,
  (random() * 2000 + 1000)::NUMERIC(12,2),
  'invoice'
FROM venues v
JOIN departments d ON d.venue_id = v.id
CROSS JOIN generate_series('2025-11-03'::date, '2025-11-07'::date, '1 day'::interval) AS txn_date
WHERE d.name IN ('kitchen', 'bar')
ON CONFLICT (venue_id, department_id, txn_date, source) DO NOTHING;

-- Refresh materialized views
REFRESH MATERIALIZED VIEW v_item_latest_cost;
REFRESH MATERIALIZED VIEW v_recipe_cost_rollup;

-- ============================================================================
-- END SCHEMA
-- ============================================================================
