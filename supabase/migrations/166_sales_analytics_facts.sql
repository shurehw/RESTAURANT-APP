-- ============================================================================
-- SALES ANALYTICS FACT TABLES
-- Stores aggregated POS data from TipSee for fast reporting and YoY analysis
-- ============================================================================

-- ============================================================================
-- 1. VENUE-TIPSEE MAPPING (link our venues to TipSee location_uuid)
-- ============================================================================

CREATE TABLE IF NOT EXISTS venue_tipsee_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tipsee_location_uuid UUID NOT NULL,
  tipsee_location_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id),
  UNIQUE(tipsee_location_uuid)
);

CREATE INDEX IF NOT EXISTS idx_venue_tipsee_venue ON venue_tipsee_mapping(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_tipsee_location ON venue_tipsee_mapping(tipsee_location_uuid);

COMMENT ON TABLE venue_tipsee_mapping IS 'Maps internal venues to TipSee POS location UUIDs';

-- ============================================================================
-- 2. ETL RUNS (track data extraction jobs)
-- ============================================================================

CREATE TYPE etl_status AS ENUM ('running', 'success', 'failed', 'partial');

CREATE TABLE IF NOT EXISTS etl_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'tipsee',
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  business_date DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status etl_status NOT NULL DEFAULT 'running',
  rows_extracted INTEGER DEFAULT 0,
  rows_loaded INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_etl_runs_venue_date ON etl_runs(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_etl_runs_started ON etl_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_etl_runs_status ON etl_runs(status) WHERE status IN ('running', 'failed');

COMMENT ON TABLE etl_runs IS 'Tracks ETL job executions for audit and debugging';

-- ============================================================================
-- 3. SOURCE DAY SNAPSHOT (audit trail - proves what we extracted)
-- ============================================================================

CREATE TABLE IF NOT EXISTS source_day_snapshot (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'tipsee',

  -- Source totals at extraction time (for reconciliation)
  source_gross_sales NUMERIC(14,2),
  source_net_sales NUMERIC(14,2),
  source_total_checks INTEGER,
  source_total_covers INTEGER,
  source_total_tax NUMERIC(14,2),
  source_total_comps NUMERIC(14,2),
  source_total_voids NUMERIC(14,2),

  -- Hash of key values for change detection
  raw_hash TEXT,

  -- Extraction metadata
  etl_run_id UUID REFERENCES etl_runs(id) ON DELETE SET NULL,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(venue_id, business_date, source_system)
);

CREATE INDEX IF NOT EXISTS idx_source_snapshot_venue_date ON source_day_snapshot(venue_id, business_date DESC);

COMMENT ON TABLE source_day_snapshot IS 'Immutable record of source data at extraction time for audit';

-- ============================================================================
-- 4. VENUE DAY FACTS (primary analytics table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS venue_day_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- Revenue metrics (in cents for precision, display in dollars)
  gross_sales NUMERIC(14,2) NOT NULL DEFAULT 0,        -- revenue_total from TipSee
  net_sales NUMERIC(14,2) NOT NULL DEFAULT 0,          -- sub_total (before tax)
  food_sales NUMERIC(14,2) DEFAULT 0,
  beverage_sales NUMERIC(14,2) DEFAULT 0,
  wine_sales NUMERIC(14,2) DEFAULT 0,
  liquor_sales NUMERIC(14,2) DEFAULT 0,
  beer_sales NUMERIC(14,2) DEFAULT 0,
  other_sales NUMERIC(14,2) DEFAULT 0,

  -- Adjustments
  discounts_total NUMERIC(14,2) DEFAULT 0,
  comps_total NUMERIC(14,2) DEFAULT 0,
  voids_total NUMERIC(14,2) DEFAULT 0,
  refunds_total NUMERIC(14,2) DEFAULT 0,

  -- Service charges and taxes
  service_charges_total NUMERIC(14,2) DEFAULT 0,
  taxes_total NUMERIC(14,2) DEFAULT 0,
  tips_total NUMERIC(14,2) DEFAULT 0,

  -- Volume metrics
  checks_count INTEGER NOT NULL DEFAULT 0,
  covers_count INTEGER NOT NULL DEFAULT 0,
  items_sold INTEGER DEFAULT 0,

  -- Derived metrics (stored for query efficiency)
  avg_check NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN checks_count > 0 THEN gross_sales / checks_count ELSE 0 END
  ) STORED,
  avg_cover NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN covers_count > 0 THEN gross_sales / covers_count ELSE 0 END
  ) STORED,
  beverage_pct NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN gross_sales > 0 THEN (beverage_sales / gross_sales) * 100 ELSE 0 END
  ) STORED,

  -- Data quality flags
  is_complete BOOLEAN DEFAULT true,       -- false if day is still open
  has_variance BOOLEAN DEFAULT false,     -- true if doesn't match source
  variance_amount NUMERIC(14,2) DEFAULT 0,

  -- Metadata
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  etl_run_id UUID REFERENCES etl_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_venue_day_facts_date ON venue_day_facts(business_date DESC);
CREATE INDEX IF NOT EXISTS idx_venue_day_facts_venue_date ON venue_day_facts(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_venue_day_facts_venue_year ON venue_day_facts(venue_id, EXTRACT(YEAR FROM business_date));
CREATE INDEX IF NOT EXISTS idx_venue_day_facts_dow ON venue_day_facts(venue_id, EXTRACT(DOW FROM business_date), business_date DESC);

COMMENT ON TABLE venue_day_facts IS 'Daily venue performance metrics - primary reporting table';

-- ============================================================================
-- 5. DAYPART DAY FACTS (brunch/dinner/late night breakdown)
-- ============================================================================

CREATE TYPE daypart_type AS ENUM ('brunch', 'lunch', 'dinner', 'late_night', 'all_day');

CREATE TABLE IF NOT EXISTS daypart_day_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  daypart daypart_type NOT NULL,

  -- Metrics
  gross_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  checks_count INTEGER NOT NULL DEFAULT 0,
  covers_count INTEGER NOT NULL DEFAULT 0,
  comps_total NUMERIC(14,2) DEFAULT 0,

  -- Derived
  avg_check NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN checks_count > 0 THEN gross_sales / checks_count ELSE 0 END
  ) STORED,

  -- Metadata
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  etl_run_id UUID REFERENCES etl_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date, daypart)
);

CREATE INDEX IF NOT EXISTS idx_daypart_facts_venue_date ON daypart_day_facts(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_daypart_facts_daypart ON daypart_day_facts(venue_id, daypart, business_date DESC);

COMMENT ON TABLE daypart_day_facts IS 'Daily metrics broken down by daypart (brunch/dinner/late)';

-- ============================================================================
-- 6. CATEGORY DAY FACTS (Food/Bev/Wine breakdown)
-- ============================================================================

CREATE TABLE IF NOT EXISTS category_day_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- Category from TipSee parent_category
  category TEXT NOT NULL,

  -- Metrics
  gross_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity_sold INTEGER DEFAULT 0,
  comps_total NUMERIC(14,2) DEFAULT 0,
  voids_total NUMERIC(14,2) DEFAULT 0,

  -- Metadata
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  etl_run_id UUID REFERENCES etl_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date, category)
);

CREATE INDEX IF NOT EXISTS idx_category_facts_venue_date ON category_day_facts(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_category_facts_category ON category_day_facts(venue_id, category, business_date DESC);

COMMENT ON TABLE category_day_facts IS 'Daily sales by menu category';

-- ============================================================================
-- 7. SERVER DAY FACTS (staff performance metrics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS server_day_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- Server info (from TipSee)
  employee_name TEXT NOT NULL,
  employee_role TEXT,

  -- Performance metrics
  gross_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  checks_count INTEGER NOT NULL DEFAULT 0,
  covers_count INTEGER NOT NULL DEFAULT 0,
  tips_total NUMERIC(14,2) DEFAULT 0,
  comps_total NUMERIC(14,2) DEFAULT 0,
  avg_turn_mins NUMERIC(8,2) DEFAULT 0,

  -- Derived
  avg_check NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN checks_count > 0 THEN gross_sales / checks_count ELSE 0 END
  ) STORED,
  avg_per_cover NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN covers_count > 0 THEN gross_sales / covers_count ELSE 0 END
  ) STORED,

  -- Metadata
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  etl_run_id UUID REFERENCES etl_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date, employee_name)
);

CREATE INDEX IF NOT EXISTS idx_server_facts_venue_date ON server_day_facts(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_server_facts_employee ON server_day_facts(employee_name, business_date DESC);

COMMENT ON TABLE server_day_facts IS 'Daily server performance metrics';

-- ============================================================================
-- 8. ITEM DAY FACTS (menu item performance - optional, high volume)
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_day_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- Item info (from TipSee)
  menu_item_name TEXT NOT NULL,
  parent_category TEXT,
  category TEXT,

  -- Metrics
  quantity_sold NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  comps_total NUMERIC(14,2) DEFAULT 0,
  voids_total NUMERIC(14,2) DEFAULT 0,

  -- Metadata
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  etl_run_id UUID REFERENCES etl_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date, menu_item_name)
);

CREATE INDEX IF NOT EXISTS idx_item_facts_venue_date ON item_day_facts(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_item_facts_item ON item_day_facts(menu_item_name, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_item_facts_category ON item_day_facts(parent_category, business_date DESC);

COMMENT ON TABLE item_day_facts IS 'Daily menu item sales - for top/bottom seller analysis';

-- ============================================================================
-- 9. UPDATE TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_fact_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venue_day_facts_updated_at ON venue_day_facts;
CREATE TRIGGER venue_day_facts_updated_at
  BEFORE UPDATE ON venue_day_facts
  FOR EACH ROW
  EXECUTE FUNCTION update_fact_timestamp();

-- ============================================================================
-- 10. RLS POLICIES
-- ============================================================================

ALTER TABLE venue_tipsee_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE etl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_day_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_day_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daypart_day_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_day_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_day_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_day_facts ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's venue IDs
CREATE OR REPLACE FUNCTION get_user_venue_ids()
RETURNS SETOF UUID AS $$
  SELECT v.id
  FROM venues v
  JOIN organization_users ou ON ou.organization_id = v.organization_id
  WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- venue_tipsee_mapping policies
CREATE POLICY "Users can view tipsee mappings for their venues"
  ON venue_tipsee_mapping FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

CREATE POLICY "Admins can manage tipsee mappings"
  ON venue_tipsee_mapping FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.is_active = TRUE
        AND ou.role IN ('admin', 'owner')
        AND v.id = venue_tipsee_mapping.venue_id
    )
  );

-- etl_runs policies
CREATE POLICY "Users can view etl runs for their venues"
  ON etl_runs FOR SELECT
  USING (venue_id IS NULL OR venue_id IN (SELECT get_user_venue_ids()));

-- source_day_snapshot policies
CREATE POLICY "Users can view snapshots for their venues"
  ON source_day_snapshot FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

-- venue_day_facts policies
CREATE POLICY "Users can view facts for their venues"
  ON venue_day_facts FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

-- daypart_day_facts policies
CREATE POLICY "Users can view daypart facts for their venues"
  ON daypart_day_facts FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

-- category_day_facts policies
CREATE POLICY "Users can view category facts for their venues"
  ON category_day_facts FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

-- server_day_facts policies
CREATE POLICY "Users can view server facts for their venues"
  ON server_day_facts FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

-- item_day_facts policies
CREATE POLICY "Users can view item facts for their venues"
  ON item_day_facts FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

-- ============================================================================
-- 11. SEED TIPSEE MAPPINGS FOR KNOWN VENUES
-- ============================================================================

-- Insert mappings for known H.wood Group venues
-- These UUIDs come from TipSee's location_uuid field
DO $$
DECLARE
  v_org_id UUID;
  v_tng_id UUID;
  v_delilah_la_id UUID;
  v_delilah_miami_id UUID;
  v_delilah_dallas_id UUID;
BEGIN
  -- Get H.wood organization
  SELECT id INTO v_org_id FROM organizations WHERE slug = 'hwood' OR name ILIKE '%h.wood%' LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    -- Get or create venue IDs
    SELECT id INTO v_tng_id FROM venues WHERE name ILIKE '%nice guy%' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_delilah_la_id FROM venues WHERE name ILIKE '%delilah%' AND name ILIKE '%la%' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_delilah_miami_id FROM venues WHERE name ILIKE '%delilah%' AND name ILIKE '%miami%' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_delilah_dallas_id FROM venues WHERE name ILIKE '%delilah%' AND name ILIKE '%dallas%' AND organization_id = v_org_id LIMIT 1;

    -- Insert mappings (skip if venue not found)
    IF v_tng_id IS NOT NULL THEN
      INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)
      VALUES (v_tng_id, 'aeb1790a-1ce9-4d6c-b1bc-7ef618294dc4', 'The Nice Guy')
      ON CONFLICT (venue_id) DO UPDATE SET
        tipsee_location_uuid = EXCLUDED.tipsee_location_uuid,
        tipsee_location_name = EXCLUDED.tipsee_location_name;
    END IF;

    -- Add more mappings as we discover TipSee location UUIDs
    -- IF v_delilah_la_id IS NOT NULL THEN
    --   INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)
    --   VALUES (v_delilah_la_id, 'UUID-HERE', 'Delilah LA')
    --   ON CONFLICT (venue_id) DO NOTHING;
    -- END IF;
  END IF;
END $$;

SELECT 'Sales analytics fact tables created successfully' as status;
