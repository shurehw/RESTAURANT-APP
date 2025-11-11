-- AI Labor OS - Complete Forecasting & Optimization System
-- Phase 1: Database Schema

-- ============================================================================
-- DEMAND FORECASTING TABLES
-- ============================================================================

-- Historical covers/revenue data (source of truth for ML model)
CREATE TABLE IF NOT EXISTS demand_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Date/time
  business_date DATE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  shift_type TEXT NOT NULL CHECK (shift_type IN ('breakfast', 'lunch', 'dinner', 'late_night')),
  hour_slot INTEGER CHECK (hour_slot BETWEEN 0 AND 23),

  -- Actual performance
  covers INTEGER NOT NULL,
  revenue NUMERIC(12,2) NOT NULL,
  avg_check NUMERIC(10,2),
  party_size_avg NUMERIC(4,2),

  -- Reservations data
  reservation_count INTEGER DEFAULT 0,
  reservation_covers INTEGER DEFAULT 0,
  walkin_covers INTEGER,

  -- External factors
  weather_temp_high INTEGER,
  weather_temp_low INTEGER,
  weather_precipitation NUMERIC(5,2),
  weather_conditions TEXT,

  -- Events
  has_nearby_event BOOLEAN DEFAULT FALSE,
  event_details JSONB,

  -- Special days
  is_holiday BOOLEAN DEFAULT FALSE,
  is_special_event BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_demand_history UNIQUE(venue_id, business_date, shift_type, hour_slot)
);

CREATE INDEX idx_demand_history_venue_date ON demand_history(venue_id, business_date DESC);
CREATE INDEX idx_demand_history_dow ON demand_history(day_of_week, shift_type);

-- Demand forecasts (ML model outputs)
CREATE TABLE IF NOT EXISTS demand_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Forecast details
  forecast_date DATE NOT NULL,
  business_date DATE NOT NULL,
  shift_type TEXT NOT NULL,

  -- Predictions
  covers_predicted INTEGER NOT NULL,
  covers_lower INTEGER NOT NULL,
  covers_upper INTEGER NOT NULL,
  confidence_level NUMERIC(4,3),

  revenue_predicted NUMERIC(12,2),

  -- Breakdown
  reservation_covers_predicted INTEGER,
  walkin_covers_predicted INTEGER,

  -- Model metadata
  model_version TEXT NOT NULL,
  model_accuracy NUMERIC(4,3),

  -- External factors used
  weather_forecast JSONB,
  events JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_forecast UNIQUE(venue_id, forecast_date, business_date, shift_type)
);

CREATE INDEX idx_forecasts_venue_business_date ON demand_forecasts(venue_id, business_date);
CREATE INDEX idx_forecasts_created ON demand_forecasts(created_at DESC);

-- Forecast accuracy tracking
CREATE TABLE IF NOT EXISTS forecast_accuracy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES demand_forecasts(id) ON DELETE CASCADE,
  demand_history_id UUID NOT NULL REFERENCES demand_history(id) ON DELETE CASCADE,

  predicted_covers INTEGER NOT NULL,
  actual_covers INTEGER NOT NULL,
  error_covers INTEGER,
  error_percentage NUMERIC(6,2),

  within_confidence_interval BOOLEAN,

  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accuracy_forecast ON forecast_accuracy(forecast_id);

-- ============================================================================
-- LABOR REQUIREMENTS & SERVICE STANDARDS
-- ============================================================================

-- Service standards per venue/shift
CREATE TABLE IF NOT EXISTS service_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  position TEXT NOT NULL,

  -- Coverage ratios
  covers_per_employee NUMERIC(6,2),
  ratio_to_position TEXT,  -- e.g., "servers" for bussers
  ratio_multiplier NUMERIC(4,2),

  -- Staffing bounds
  min_on_duty INTEGER DEFAULT 1,
  max_on_duty INTEGER,

  -- Shift configuration
  min_shift_hours NUMERIC(4,2) DEFAULT 4,
  optimal_shift_hours NUMERIC(4,2) DEFAULT 6,

  -- Thresholds
  covers_threshold INTEGER,  -- Only schedule if covers > threshold

  -- Active
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_service_standard UNIQUE(venue_id, position)
);

CREATE INDEX idx_standards_venue ON service_standards(venue_id);

-- Labor requirements outputs (from calculator)
CREATE TABLE IF NOT EXISTS labor_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES demand_forecasts(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  shift_type TEXT NOT NULL,

  -- Staffing by position
  position TEXT NOT NULL,
  employees_needed INTEGER NOT NULL,
  hours_per_employee NUMERIC(4,2) NOT NULL,
  total_hours NUMERIC(6,2) NOT NULL,

  -- Cost
  avg_hourly_rate NUMERIC(6,2),
  total_cost NUMERIC(10,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_requirements_forecast ON labor_requirements(forecast_id);
CREATE INDEX idx_requirements_date ON labor_requirements(venue_id, business_date);

-- ============================================================================
-- SCHEDULING
-- ============================================================================

-- Weekly schedule template
CREATE TABLE IF NOT EXISTS weekly_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'locked')),

  -- Totals
  total_labor_hours NUMERIC(8,2),
  total_labor_cost NUMERIC(12,2),
  projected_revenue NUMERIC(12,2),
  labor_percentage NUMERIC(5,2),
  target_labor_percentage NUMERIC(5,2),

  -- Metadata
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_weekly_schedule UNIQUE(venue_id, week_start_date)
);

CREATE INDEX idx_schedules_venue_week ON weekly_schedules(venue_id, week_start_date DESC);

-- Individual shift assignments
CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES weekly_schedules(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Employee
  employee_id UUID NOT NULL,  -- Will reference 7shifts/external system
  employee_name TEXT,
  position TEXT NOT NULL,

  -- Shift details
  business_date DATE NOT NULL,
  shift_type TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  hours NUMERIC(4,2) NOT NULL,

  -- Pay
  hourly_rate NUMERIC(6,2),
  shift_cost NUMERIC(8,2),

  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'no_show', 'completed')),

  -- Modifications
  is_modified BOOLEAN DEFAULT FALSE,
  modification_reason TEXT,
  modified_at TIMESTAMPTZ,
  modified_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_shift_assignment UNIQUE(schedule_id, employee_id, business_date, start_time)
);

CREATE INDEX idx_assignments_schedule ON shift_assignments(schedule_id);
CREATE INDEX idx_assignments_employee_date ON shift_assignments(employee_id, business_date);
CREATE INDEX idx_assignments_venue_date ON shift_assignments(venue_id, business_date);

-- ============================================================================
-- DAILY FORECAST REVIEW & ADJUSTMENTS
-- ============================================================================

-- Daily forecast review sessions
CREATE TABLE IF NOT EXISTS forecast_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  review_date DATE NOT NULL,
  review_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- What was reviewed
  business_dates_reviewed DATE[] NOT NULL,
  shifts_reviewed TEXT[] NOT NULL,

  -- Summary
  total_adjustments_recommended INTEGER DEFAULT 0,
  total_potential_savings NUMERIC(10,2) DEFAULT 0,

  -- Status
  reviewed_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_review UNIQUE(venue_id, review_date)
);

CREATE INDEX idx_reviews_venue ON forecast_reviews(venue_id, review_date DESC);

-- Recommended adjustments from daily review
CREATE TABLE IF NOT EXISTS schedule_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES forecast_reviews(id) ON DELETE CASCADE,
  shift_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Adjustment type
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('add_shift', 'remove_shift', 'change_hours', 'change_position')),

  -- Timing
  business_date DATE NOT NULL,
  hours_until_shift NUMERIC(6,2),

  -- Forecast variance
  original_forecast_covers INTEGER,
  current_forecast_covers INTEGER,
  variance_percentage NUMERIC(6,2),
  variance_reason TEXT,

  -- Employee details
  employee_id UUID,
  employee_name TEXT,
  position TEXT,

  -- Financial impact
  labor_cost_change NUMERIC(10,2),
  penalty_cost NUMERIC(10,2),
  net_benefit NUMERIC(10,2),

  -- Penalty details
  penalty_type TEXT,  -- 'none', 'predictive_scheduling', 'show_up_pay'
  penalty_hours NUMERIC(4,2),

  -- Decision
  recommended BOOLEAN DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
  decision_reason TEXT,

  -- Execution
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adjustments_review ON schedule_adjustments(review_id);
CREATE INDEX idx_adjustments_status ON schedule_adjustments(status, business_date);
CREATE INDEX idx_adjustments_employee ON schedule_adjustments(employee_id, business_date);

-- ============================================================================
-- REAL-TIME MONITORING
-- ============================================================================

-- Real-time shift monitoring snapshots
CREATE TABLE IF NOT EXISTS shift_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  business_date DATE NOT NULL,
  shift_type TEXT NOT NULL,
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Current state
  current_covers INTEGER NOT NULL,
  current_revenue NUMERIC(10,2) NOT NULL,
  current_staff_count INTEGER NOT NULL,
  current_labor_cost NUMERIC(10,2),

  -- Forecast comparison
  forecasted_covers INTEGER,
  variance_from_forecast NUMERIC(6,2),

  -- Recommendations
  recommended_action TEXT CHECK (recommended_action IN ('none', 'cut_staff', 'call_in_staff', 'approaching_ot')),
  recommended_details JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_monitoring_venue_date ON shift_monitoring(venue_id, business_date, snapshot_time DESC);

-- Real-time adjustment actions (cuts/call-ins during service)
CREATE TABLE IF NOT EXISTS realtime_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  shift_assignment_id UUID REFERENCES shift_assignments(id),

  business_date DATE NOT NULL,
  adjustment_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Action
  action_type TEXT NOT NULL CHECK (action_type IN ('early_cut', 'call_in', 'extend_shift')),

  -- Employee
  employee_id UUID NOT NULL,
  employee_name TEXT,
  position TEXT,

  -- Details
  original_end_time TIME,
  new_end_time TIME,
  hours_change NUMERIC(4,2),

  -- Reason
  reason TEXT NOT NULL,
  covers_at_decision INTEGER,
  forecast_covers INTEGER,

  -- Financial
  cost_savings NUMERIC(8,2),

  -- Execution
  executed_by UUID REFERENCES auth.users(id),
  notified_employee BOOLEAN DEFAULT FALSE,
  employee_response TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_realtime_venue_date ON realtime_adjustments(venue_id, business_date);
CREATE INDEX idx_realtime_employee ON realtime_adjustments(employee_id, business_date);

-- ============================================================================
-- LEARNING & FEEDBACK
-- ============================================================================

-- Manager overrides and feedback
CREATE TABLE IF NOT EXISTS manager_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES auth.users(id),

  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('override', 'adjustment', 'comment')),

  -- Context
  related_forecast_id UUID REFERENCES demand_forecasts(id),
  related_adjustment_id UUID REFERENCES schedule_adjustments(id),
  business_date DATE,

  -- Feedback
  original_recommendation TEXT,
  manager_decision TEXT,
  reason TEXT,

  -- Outcome
  outcome_success BOOLEAN,
  outcome_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_venue ON manager_feedback(venue_id, created_at DESC);
CREATE INDEX idx_feedback_manager ON manager_feedback(manager_id);

-- System performance metrics
CREATE TABLE IF NOT EXISTS system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  metric_date DATE NOT NULL,
  metric_type TEXT NOT NULL,

  -- Values
  value NUMERIC(12,2) NOT NULL,
  target NUMERIC(12,2),
  variance NUMERIC(12,2),

  -- Metadata
  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_metric UNIQUE(venue_id, metric_date, metric_type)
);

CREATE INDEX idx_metrics_venue_date ON system_metrics(venue_id, metric_date DESC);
CREATE INDEX idx_metrics_type ON system_metrics(metric_type, metric_date DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE demand_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_accuracy ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

-- Simple policies (refine based on your auth structure)
CREATE POLICY "Users can read all labor data" ON demand_history FOR SELECT USING (true);
CREATE POLICY "Users can insert demand history" ON demand_history FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read forecasts" ON demand_forecasts FOR SELECT USING (true);
CREATE POLICY "Users can insert forecasts" ON demand_forecasts FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read schedules" ON weekly_schedules FOR SELECT USING (true);
CREATE POLICY "Users can manage schedules" ON weekly_schedules FOR ALL USING (true);

CREATE POLICY "Users can read assignments" ON shift_assignments FOR SELECT USING (true);
CREATE POLICY "Users can manage assignments" ON shift_assignments FOR ALL USING (true);

CREATE POLICY "Users can read adjustments" ON schedule_adjustments FOR SELECT USING (true);
CREATE POLICY "Users can create adjustments" ON schedule_adjustments FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update adjustments" ON schedule_adjustments FOR UPDATE USING (true);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- Weekly schedule summary
CREATE OR REPLACE VIEW v_weekly_schedule_summary AS
SELECT
  ws.id,
  ws.venue_id,
  v.name as venue_name,
  ws.week_start_date,
  ws.week_end_date,
  ws.status,
  ws.total_labor_hours,
  ws.total_labor_cost,
  ws.projected_revenue,
  ws.labor_percentage,
  ws.target_labor_percentage,
  ws.labor_percentage - ws.target_labor_percentage as variance_from_target,
  COUNT(DISTINCT sa.employee_id) as unique_employees,
  COUNT(sa.id) as total_shifts
FROM weekly_schedules ws
INNER JOIN venues v ON v.id = ws.venue_id
LEFT JOIN shift_assignments sa ON sa.schedule_id = ws.id
GROUP BY ws.id, v.name;

-- Daily staffing overview
CREATE OR REPLACE VIEW v_daily_staffing AS
SELECT
  sa.venue_id,
  sa.business_date,
  sa.shift_type,
  sa.position,
  COUNT(*) as employee_count,
  SUM(sa.hours) as total_hours,
  SUM(sa.shift_cost) as total_cost,
  AVG(sa.hourly_rate) as avg_hourly_rate
FROM shift_assignments sa
WHERE sa.status != 'cancelled'
GROUP BY sa.venue_id, sa.business_date, sa.shift_type, sa.position;

-- Forecast vs actual performance
CREATE OR REPLACE VIEW v_forecast_performance AS
SELECT
  df.venue_id,
  df.business_date,
  df.shift_type,
  df.covers_predicted,
  dh.covers as covers_actual,
  df.revenue_predicted,
  dh.revenue as revenue_actual,
  fa.error_percentage as covers_error_pct,
  fa.within_confidence_interval,
  df.confidence_level,
  df.created_at as forecast_created_at
FROM demand_forecasts df
INNER JOIN demand_history dh ON
  dh.venue_id = df.venue_id AND
  dh.business_date = df.business_date AND
  dh.shift_type = df.shift_type
LEFT JOIN forecast_accuracy fa ON fa.forecast_id = df.id;
