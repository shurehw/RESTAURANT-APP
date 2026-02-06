-- ============================================================================
-- LABOR DAY FACTS
-- Daily labor metrics synced from TipSee punches table (7Shifts data)
-- Follows same ETL pattern as venue_day_facts
-- ============================================================================

CREATE TABLE IF NOT EXISTS labor_day_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- Hours
  total_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  ot_hours NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Cost
  labor_cost NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Counts
  punch_count INTEGER NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,

  -- Derived metrics (computed from labor + sales)
  net_sales NUMERIC(14,2) DEFAULT 0,           -- snapshot of net sales at sync time
  covers INTEGER DEFAULT 0,                     -- snapshot of covers at sync time
  labor_pct NUMERIC(6,2) GENERATED ALWAYS AS (
    CASE WHEN net_sales > 0 THEN (labor_cost / net_sales) * 100 ELSE 0 END
  ) STORED,
  splh NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN total_hours > 0 THEN net_sales / total_hours ELSE 0 END
  ) STORED,
  covers_per_labor_hour NUMERIC(6,2) GENERATED ALWAYS AS (
    CASE WHEN total_hours > 0 THEN covers / total_hours ELSE NULL END
  ) STORED,

  -- Sync metadata
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  etl_run_id UUID REFERENCES etl_runs(id),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_labor_day_facts_date
  ON labor_day_facts(business_date DESC);
CREATE INDEX IF NOT EXISTS idx_labor_day_facts_venue_date
  ON labor_day_facts(venue_id, business_date DESC);

-- RLS
ALTER TABLE labor_day_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view labor facts for their venues"
  ON labor_day_facts FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

-- Service role can upsert (ETL)
CREATE POLICY "Service role can manage labor facts"
  ON labor_day_facts FOR ALL
  USING (auth.role() = 'service_role');

-- Grant
GRANT SELECT ON labor_day_facts TO authenticated;

-- Updated_at trigger
CREATE TRIGGER set_labor_day_facts_updated_at
  BEFORE UPDATE ON labor_day_facts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

SELECT 'labor_day_facts table created' as status;
