-- ============================================================================
-- Scheduling Agent (Pre-Service + Mid-Service)
-- ============================================================================
-- Adds configurable thresholds for real-time staffing adjustments and
-- extends realtime_adjustments with an approval workflow.
-- Pre-service: forecast + reservations vs scheduled shifts → call-offs/call-ins
-- Mid-service: live covers vs forecast → early cuts/call-ins/OT risk
-- The rules are always on. Calibration is allowed. Escape is not.
-- ============================================================================

-- Per-venue thresholds for the mid-service monitoring agent
CREATE TABLE IF NOT EXISTS mid_service_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Demand variance triggers (% deviation from forecast)
  cut_trigger_pct NUMERIC(5,2) NOT NULL DEFAULT -15.0,
  callin_trigger_pct NUMERIC(5,2) NOT NULL DEFAULT 20.0,

  -- SPLH guardrails
  target_splh NUMERIC(8,2) NOT NULL DEFAULT 45.0,
  min_splh NUMERIC(8,2) NOT NULL DEFAULT 30.0,
  max_splh NUMERIC(8,2) NOT NULL DEFAULT 80.0,

  -- Staffing minimums (enforced floor — cannot go below these)
  min_foh_count INTEGER NOT NULL DEFAULT 3 CHECK (min_foh_count >= 2),
  min_boh_count INTEGER NOT NULL DEFAULT 2 CHECK (min_boh_count >= 1),

  -- OT risk thresholds
  ot_warning_hours NUMERIC(4,2) NOT NULL DEFAULT 7.0,
  weekly_ot_warning_hours NUMERIC(5,2) NOT NULL DEFAULT 35.0,

  -- Close protection window (minutes before close — cannot cut closers)
  close_window_minutes INTEGER NOT NULL DEFAULT 90 CHECK (close_window_minutes >= 60),

  -- Remaining demand floor for cuts (only cut if less than this % of demand remains)
  remaining_demand_cut_pct NUMERIC(4,3) NOT NULL DEFAULT 0.150,

  -- Feature toggle
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_mid_service_thresholds_venue UNIQUE(venue_id),
  CONSTRAINT valid_splh_range CHECK (min_splh < target_splh AND target_splh < max_splh),
  CONSTRAINT valid_cut_trigger CHECK (cut_trigger_pct < 0),
  CONSTRAINT valid_callin_trigger CHECK (callin_trigger_pct > 0)
);

ALTER TABLE mid_service_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on mid_service_thresholds"
  ON mid_service_thresholds FOR ALL
  USING (true) WITH CHECK (true);

-- Extend realtime_adjustments with approval workflow
ALTER TABLE realtime_adjustments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS monitoring_snapshot_id UUID REFERENCES shift_monitoring(id);

CREATE INDEX IF NOT EXISTS idx_realtime_status
  ON realtime_adjustments(venue_id, business_date, status);

-- Add current_splh and remaining_demand_pct to shift_monitoring for richer snapshots
ALTER TABLE shift_monitoring
  ADD COLUMN IF NOT EXISTS current_splh NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS remaining_demand_pct NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS current_labor_hours NUMERIC(10,2);

-- Extend action_type to include pre-service 'call_off'
ALTER TABLE realtime_adjustments
  DROP CONSTRAINT IF EXISTS realtime_adjustments_action_type_check;
ALTER TABLE realtime_adjustments
  ADD CONSTRAINT realtime_adjustments_action_type_check
    CHECK (action_type IN ('early_cut', 'call_in', 'extend_shift', 'call_off'));

-- Add pre-service monitoring type to shift_monitoring
ALTER TABLE shift_monitoring
  DROP CONSTRAINT IF EXISTS shift_monitoring_recommended_action_check;
ALTER TABLE shift_monitoring
  ADD CONSTRAINT shift_monitoring_recommended_action_check
    CHECK (recommended_action IN ('none', 'cut_staff', 'call_in_staff', 'approaching_ot', 'call_off'));

-- Pre-service window config (hours before service to start monitoring)
ALTER TABLE mid_service_thresholds
  ADD COLUMN IF NOT EXISTS pre_service_window_hours INTEGER NOT NULL DEFAULT 6 CHECK (pre_service_window_hours >= 2);
