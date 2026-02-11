-- ============================================================================
-- SALES PACE — Live Service Monitoring
-- Captures intra-day sales snapshots every 5 minutes from TipSee POS
-- and compares against forecasts + SDLW for real-time pace tracking.
--
-- Architecture: External scheduler → /api/sales/poll → TipSee query →
-- store snapshot → dashboard compares against forecast + SDLW.
-- ============================================================================

-- ============================================================================
-- 1. SALES SNAPSHOTS — Intra-day running totals captured every 5 min
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,

  -- Running totals at this point in service
  gross_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  food_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  beverage_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  checks_count INT NOT NULL DEFAULT 0,
  covers_count INT NOT NULL DEFAULT 0,
  comps_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  voids_total NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Derived columns
  avg_check NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN checks_count > 0 THEN gross_sales / checks_count ELSE NULL END
  ) STORED,
  bev_pct NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN gross_sales > 0 THEN beverage_sales / gross_sales * 100 ELSE NULL END
  ) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_sales_snapshot UNIQUE (venue_id, business_date, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_sales_snapshots_venue_date
  ON sales_snapshots(venue_id, business_date, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_snapshots_latest
  ON sales_snapshots(venue_id, snapshot_at DESC);

-- ============================================================================
-- 2. SALES PACE SETTINGS — Per-venue polling config and thresholds
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_pace_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Polling configuration
  polling_interval_seconds INT NOT NULL DEFAULT 300,
  service_start_hour INT NOT NULL DEFAULT 11,
  service_end_hour INT NOT NULL DEFAULT 3,

  -- Comparison targets
  use_forecast BOOLEAN NOT NULL DEFAULT TRUE,
  use_sdlw BOOLEAN NOT NULL DEFAULT TRUE,

  -- Alert thresholds (% below target to trigger)
  pace_warning_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  pace_critical_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_sales_pace_settings_venue UNIQUE (venue_id)
);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE sales_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_pace_settings ENABLE ROW LEVEL SECURITY;

-- Users can view snapshots for their org's venues
CREATE POLICY "Users can view sales snapshots for their venues"
  ON sales_snapshots FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Users can view pace settings for their org's venues
CREATE POLICY "Users can view sales pace settings for their venues"
  ON sales_pace_settings FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Org admins can manage pace settings
CREATE POLICY "Org admins can manage sales pace settings"
  ON sales_pace_settings FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        AND ou.role IN ('admin', 'owner')
    )
  );

-- Service role full access (for polling service)
CREATE POLICY "Service role full access sales_snapshots"
  ON sales_snapshots FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access sales_pace_settings"
  ON sales_pace_settings FOR ALL TO service_role USING (true);

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON TABLE sales_snapshots IS 'Intra-day running sales totals captured every 5 minutes from TipSee POS during service hours.';
COMMENT ON TABLE sales_pace_settings IS 'Per-venue sales pace monitoring config: polling interval, service hours, forecast comparison thresholds.';
