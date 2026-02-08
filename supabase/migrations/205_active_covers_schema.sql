-- Migration 205: Active Covers Labor Optimization Schema
-- Purpose: Tables for active-covers-based staffing analysis and forecasting
-- Date: 2026-02-07

-- =====================================================
-- TABLE 1: POS Checks (raw check-level data)
-- =====================================================
-- Individual POS checks with open/close times for active covers computation

CREATE TABLE IF NOT EXISTS pos_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- POS source
  pos_type TEXT NOT NULL CHECK (pos_type IN ('toast', 'square', 'csv', 'manual')),
  external_check_id TEXT NOT NULL,

  -- Timing
  business_date DATE NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  close_time TIMESTAMPTZ,

  -- Covers
  guest_count INTEGER NOT NULL DEFAULT 1 CHECK (guest_count >= 1),
  table_name TEXT,

  -- Revenue
  total_amount NUMERIC(10,2),
  subtotal NUMERIC(10,2),
  tip_amount NUMERIC(10,2),
  tax_amount NUMERIC(10,2),

  -- Staff
  server_name TEXT,
  server_external_id TEXT,

  -- Metadata
  raw_data JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_pos_check UNIQUE(venue_id, pos_type, external_check_id)
);

CREATE INDEX idx_pos_checks_venue_date ON pos_checks(venue_id, business_date);
CREATE INDEX idx_pos_checks_open_close ON pos_checks(venue_id, open_time, close_time);
CREATE INDEX idx_pos_checks_business_date ON pos_checks(business_date);

COMMENT ON TABLE pos_checks IS 'Individual POS checks with open/close times for active covers computation';
COMMENT ON COLUMN pos_checks.open_time IS 'When the check was opened (table seated)';
COMMENT ON COLUMN pos_checks.close_time IS 'When the check was closed (table vacated). NULL if still open.';
COMMENT ON COLUMN pos_checks.guest_count IS 'Number of guests on this check (party size)';


-- =====================================================
-- TABLE 2: Location Config
-- =====================================================
-- Per-venue operating parameters for active covers analysis

CREATE TABLE IF NOT EXISTS location_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Operating hours
  open_hour INTEGER NOT NULL DEFAULT 15 CHECK (open_hour BETWEEN 0 AND 23),
  close_hour INTEGER NOT NULL DEFAULT 23 CHECK (close_hour BETWEEN 0 AND 23),
  closed_weekdays INTEGER[] DEFAULT '{0}',  -- 0=Monday (ISO)

  -- Staffing targets
  covers_per_server_target NUMERIC(4,1) NOT NULL DEFAULT 16.0,
  covers_per_bartender_target NUMERIC(4,1) NOT NULL DEFAULT 30.0,
  min_servers INTEGER NOT NULL DEFAULT 2,
  min_bartenders INTEGER NOT NULL DEFAULT 1,

  -- Buffer and thresholds
  buffer_pct NUMERIC(4,2) NOT NULL DEFAULT 0.10,  -- 10% buffer
  peak_days INTEGER[] DEFAULT '{4,5}',             -- Friday=4, Saturday=5 (ISO)
  peak_buffer_pct NUMERIC(4,2) DEFAULT 0.15,       -- 15% buffer on peak days

  -- Average revenue per cover (for cost analysis)
  avg_revenue_per_cover NUMERIC(8,2) DEFAULT 150.00,
  avg_hourly_rate NUMERIC(6,2) DEFAULT 18.00,

  -- POS configuration
  pos_type TEXT CHECK (pos_type IN ('toast', 'square', 'csv')),
  pos_config JSONB,  -- API keys, location IDs, etc.

  -- Average dwell time (minutes) for estimating close_time when missing
  default_dwell_minutes INTEGER DEFAULT 90,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_location_config UNIQUE(venue_id)
);

COMMENT ON TABLE location_config IS 'Per-venue operating parameters for active covers labor analysis';
COMMENT ON COLUMN location_config.covers_per_server_target IS 'Target active covers per server (not total daily)';
COMMENT ON COLUMN location_config.buffer_pct IS 'Default staffing buffer percentage above P75 (e.g., 0.10 = 10%)';
COMMENT ON COLUMN location_config.peak_days IS 'ISO weekday numbers considered peak (0=Mon, 6=Sun)';


-- =====================================================
-- TABLE 3: Hourly Snapshots
-- =====================================================
-- Pre-computed hourly active covers from pos_checks

CREATE TABLE IF NOT EXISTS hourly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  business_date DATE NOT NULL,
  hour_slot INTEGER NOT NULL CHECK (hour_slot BETWEEN 0 AND 23),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Monday (ISO)

  -- Core metrics
  active_covers INTEGER NOT NULL DEFAULT 0,
  active_tables INTEGER NOT NULL DEFAULT 0,
  new_covers INTEGER NOT NULL DEFAULT 0,
  departing_covers INTEGER NOT NULL DEFAULT 0,

  -- Staffing at this hour
  servers_recommended INTEGER,
  bartenders_recommended INTEGER,

  -- Revenue at this hour
  revenue_active NUMERIC(10,2),  -- Revenue from currently-active checks

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_hourly_snapshot UNIQUE(venue_id, business_date, hour_slot)
);

CREATE INDEX idx_hourly_snapshots_venue_date ON hourly_snapshots(venue_id, business_date);
CREATE INDEX idx_hourly_snapshots_dow_hour ON hourly_snapshots(venue_id, day_of_week, hour_slot);

COMMENT ON TABLE hourly_snapshots IS 'Pre-computed hourly active covers derived from pos_checks';
COMMENT ON COLUMN hourly_snapshots.active_covers IS 'Number of guests currently seated at this hour';
COMMENT ON COLUMN hourly_snapshots.new_covers IS 'Number of guests arriving during this hour';
COMMENT ON COLUMN hourly_snapshots.departing_covers IS 'Number of guests leaving during this hour';


-- =====================================================
-- TABLE 4: Staffing Profiles (DOW x Hour statistics)
-- =====================================================
-- Statistical profiles built from historical hourly_snapshots

CREATE TABLE IF NOT EXISTS staffing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Monday (ISO)
  hour_slot INTEGER NOT NULL CHECK (hour_slot BETWEEN 0 AND 23),

  -- Sample size
  sample_count INTEGER NOT NULL DEFAULT 0,
  date_range_start DATE,
  date_range_end DATE,

  -- Active covers percentiles
  avg_active_covers NUMERIC(8,2),
  p50_active_covers NUMERIC(8,2),
  p75_active_covers NUMERIC(8,2),
  p90_active_covers NUMERIC(8,2),
  max_active_covers INTEGER,
  stddev_active_covers NUMERIC(8,2),

  -- New covers percentiles
  avg_new_covers NUMERIC(8,2),
  p75_new_covers NUMERIC(8,2),

  -- Staffing recommendations per scenario
  servers_lean INTEGER,      -- ceil(P50 / covers_per_server)
  servers_buffered INTEGER,  -- ceil(P75 * (1+buffer) / covers_per_server)
  servers_safe INTEGER,      -- ceil(P90 / covers_per_server)

  bartenders_lean INTEGER,
  bartenders_buffered INTEGER,
  bartenders_safe INTEGER,

  -- Profile metadata
  profile_version INTEGER NOT NULL DEFAULT 1,
  built_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_staffing_profile UNIQUE(venue_id, day_of_week, hour_slot, profile_version)
);

CREATE INDEX idx_staffing_profiles_venue_dow ON staffing_profiles(venue_id, day_of_week);

COMMENT ON TABLE staffing_profiles IS 'Statistical DOW x Hour profiles of active covers and staffing recommendations';
COMMENT ON COLUMN staffing_profiles.servers_lean IS 'Lean staffing: ceil(P50 / covers_per_server_target)';
COMMENT ON COLUMN staffing_profiles.servers_buffered IS 'Buffered staffing: ceil(P75 * (1+buffer_pct) / covers_per_server_target)';
COMMENT ON COLUMN staffing_profiles.servers_safe IS 'Safe staffing: ceil(P90 / covers_per_server_target)';


-- =====================================================
-- TABLE 5: Daily Staffing Forecasts
-- =====================================================
-- Generated forecasts with hour-by-hour staffing detail

CREATE TABLE IF NOT EXISTS daily_staffing_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  forecast_date DATE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),

  -- Scenario
  scenario TEXT NOT NULL CHECK (scenario IN ('lean', 'buffered', 'safe')),

  -- Totals
  total_servers INTEGER NOT NULL,
  total_bartenders INTEGER NOT NULL,
  total_labor_hours NUMERIC(8,2),
  estimated_labor_cost NUMERIC(10,2),
  estimated_covers INTEGER,
  estimated_revenue NUMERIC(10,2),

  -- Hour-by-hour detail (JSONB array)
  -- [{hour: 15, active_covers: 45, servers: 3, bartenders: 1}, ...]
  hourly_detail JSONB NOT NULL,

  -- Seasonal adjustments applied
  seasonal_factor NUMERIC(4,2) DEFAULT 1.0,
  seasonal_note TEXT,

  -- Profile version used
  profile_version INTEGER,

  -- Status
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'approved', 'superseded')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_daily_forecast UNIQUE(venue_id, forecast_date, scenario)
);

CREATE INDEX idx_daily_forecasts_venue_date ON daily_staffing_forecasts(venue_id, forecast_date);
CREATE INDEX idx_daily_forecasts_status ON daily_staffing_forecasts(status) WHERE status = 'generated';

COMMENT ON TABLE daily_staffing_forecasts IS 'Generated staffing forecasts with hour-by-hour detail per scenario';
COMMENT ON COLUMN daily_staffing_forecasts.hourly_detail IS 'JSONB array of hour-by-hour staffing: [{hour, active_covers, servers, bartenders}]';


-- =====================================================
-- TABLE 6: Backtest Results
-- =====================================================
-- Historical validation of forecast accuracy

CREATE TABLE IF NOT EXISTS backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  business_date DATE NOT NULL,
  scenario TEXT NOT NULL CHECK (scenario IN ('lean', 'buffered', 'safe')),

  -- Overall metrics
  hours_analyzed INTEGER NOT NULL,
  hours_adequate INTEGER NOT NULL DEFAULT 0,
  hours_understaffed INTEGER NOT NULL DEFAULT 0,
  hours_overstaffed INTEGER NOT NULL DEFAULT 0,
  coverage_pct NUMERIC(5,2),      -- hours_adequate / hours_analyzed * 100
  accuracy_pct NUMERIC(5,2),       -- avg(1 - |actual-rec|/actual) * 100

  -- Cost metrics
  wasted_labor_hours NUMERIC(8,2),  -- Hours overstaffed
  wasted_labor_cost NUMERIC(10,2),
  understaffed_labor_hours NUMERIC(8,2),

  -- Hour-by-hour detail
  -- [{hour, actual_covers, recommended_servers, needed_servers, delta, adequate}]
  hourly_detail JSONB,

  -- Backtest metadata
  profile_version INTEGER,
  backtest_type TEXT DEFAULT 'standard' CHECK (backtest_type IN ('standard', 'rolling')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_backtest_result UNIQUE(venue_id, business_date, scenario, backtest_type)
);

CREATE INDEX idx_backtest_results_venue ON backtest_results(venue_id, business_date);

COMMENT ON TABLE backtest_results IS 'Historical validation: actual vs recommended staffing per hour';
COMMENT ON COLUMN backtest_results.coverage_pct IS 'Percentage of hours with adequate staffing';
COMMENT ON COLUMN backtest_results.accuracy_pct IS 'Average forecast accuracy across hours';


-- =====================================================
-- TABLE 7: Staffing Alerts
-- =====================================================
-- Anomaly detection and operational alerts

CREATE TABLE IF NOT EXISTS staffing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  alert_date DATE NOT NULL,
  hour_slot INTEGER CHECK (hour_slot BETWEEN 0 AND 23),

  -- Alert classification
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'understaffed', 'overstaffed', 'forecast_miss',
    'demand_spike', 'demand_drop', 'no_data'
  )),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),

  -- Detail
  message TEXT NOT NULL,
  actual_covers INTEGER,
  recommended_servers INTEGER,
  actual_servers INTEGER,
  delta INTEGER,  -- positive = overstaffed, negative = understaffed

  -- Resolution
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_staffing_alert UNIQUE(venue_id, alert_date, hour_slot, alert_type)
);

CREATE INDEX idx_staffing_alerts_venue_date ON staffing_alerts(venue_id, alert_date);
CREATE INDEX idx_staffing_alerts_unresolved ON staffing_alerts(venue_id) WHERE is_resolved = FALSE;

COMMENT ON TABLE staffing_alerts IS 'Operational alerts for staffing anomalies and forecast misses';


-- =====================================================
-- TABLE 8: Seasonal Calendar
-- =====================================================
-- Holiday/event uplift factors for forecast adjustments

CREATE TABLE IF NOT EXISTS seasonal_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,  -- NULL = applies to all venues

  event_date DATE NOT NULL,
  event_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'holiday', 'local_event', 'private_event',
    'sports', 'convention', 'seasonal'
  )),

  -- Multiplier (1.0 = no change, 1.25 = +25%, 0.8 = -20%)
  covers_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0 CHECK (covers_multiplier > 0),

  -- Optional hour-specific multipliers
  -- {15: 1.0, 16: 1.1, 17: 1.3, 18: 1.5, ...}
  hourly_multipliers JSONB,

  notes TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,  -- Repeat every year
  recurring_month INTEGER CHECK (recurring_month BETWEEN 1 AND 12),
  recurring_day INTEGER CHECK (recurring_day BETWEEN 1 AND 31),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_seasonal_event UNIQUE(venue_id, event_date, event_name)
);

CREATE INDEX idx_seasonal_calendar_date ON seasonal_calendar(event_date);
CREATE INDEX idx_seasonal_calendar_venue ON seasonal_calendar(venue_id) WHERE venue_id IS NOT NULL;

COMMENT ON TABLE seasonal_calendar IS 'Holiday and event calendar with covers multiplier for forecast adjustments';
COMMENT ON COLUMN seasonal_calendar.covers_multiplier IS '1.0 = normal, 1.25 = +25% expected covers, 0.8 = -20%';


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE pos_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE hourly_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_staffing_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonal_calendar ENABLE ROW LEVEL SECURITY;

-- SELECT policies (any venue member)
CREATE POLICY pos_checks_select ON pos_checks FOR SELECT USING (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE)
);
CREATE POLICY location_config_select ON location_config FOR SELECT USING (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE)
);
CREATE POLICY hourly_snapshots_select ON hourly_snapshots FOR SELECT USING (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE)
);
CREATE POLICY staffing_profiles_select ON staffing_profiles FOR SELECT USING (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE)
);
CREATE POLICY daily_forecasts_select ON daily_staffing_forecasts FOR SELECT USING (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE)
);
CREATE POLICY backtest_results_select ON backtest_results FOR SELECT USING (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE)
);
CREATE POLICY staffing_alerts_select ON staffing_alerts FOR SELECT USING (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE)
);
CREATE POLICY seasonal_calendar_select ON seasonal_calendar FOR SELECT USING (
  venue_id IS NULL OR venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE)
);

-- INSERT/UPDATE policies (admin/manager only)
CREATE POLICY pos_checks_insert ON pos_checks FOR INSERT WITH CHECK (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE AND ou.role IN ('owner', 'admin', 'manager'))
);
CREATE POLICY location_config_manage ON location_config FOR ALL USING (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE AND ou.role IN ('owner', 'admin', 'manager'))
);
CREATE POLICY staffing_alerts_update ON staffing_alerts FOR UPDATE USING (
  venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE AND ou.role IN ('owner', 'admin', 'manager'))
);
CREATE POLICY seasonal_calendar_manage ON seasonal_calendar FOR ALL USING (
  venue_id IS NULL OR venue_id IN (SELECT v.id FROM venues v JOIN organization_users ou ON ou.organization_id = v.organization_id WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE AND ou.role IN ('owner', 'admin'))
);

-- Service role bypass (for Python services running with service_role key)
-- The service_role key bypasses RLS by default in Supabase, no extra policy needed.


-- =====================================================
-- SEED: Default seasonal events (h.wood Group)
-- =====================================================

INSERT INTO seasonal_calendar (venue_id, event_date, event_name, event_type, covers_multiplier, is_recurring, recurring_month, recurring_day, notes) VALUES
  (NULL, '2026-02-14', 'Valentine''s Day', 'holiday', 1.35, TRUE, 2, 14, 'ALL HANDS — typically 30-40% above normal'),
  (NULL, '2026-02-13', 'Valentine''s Eve', 'holiday', 1.25, TRUE, 2, 13, 'Pre-Valentine surge'),
  (NULL, '2026-12-31', 'New Year''s Eve', 'holiday', 1.50, TRUE, 12, 31, 'Biggest night of the year'),
  (NULL, '2026-12-24', 'Christmas Eve', 'holiday', 0.70, TRUE, 12, 24, 'Reduced covers expected'),
  (NULL, '2026-11-26', 'Thanksgiving', 'holiday', 0.50, TRUE, 11, 26, 'Significantly reduced — many venues closed'),
  (NULL, '2026-07-04', 'Independence Day', 'holiday', 1.20, TRUE, 7, 4, 'Moderate boost'),
  (NULL, '2026-03-17', 'St. Patrick''s Day', 'holiday', 1.15, TRUE, 3, 17, 'Bar-heavy increase'),
  (NULL, '2026-05-10', 'Mother''s Day', 'holiday', 1.30, TRUE, 5, 10, 'Heavy brunch + dinner surge')
ON CONFLICT DO NOTHING;
