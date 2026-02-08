-- Migration 200: Labor Optimization Schema
-- Purpose: Add tables for covers per labor hour (CPLH) optimization, service quality tracking, and margin improvement
-- Date: 2026-02-05

-- =====================================================
-- TABLE 1: Service Quality Standards
-- =====================================================
-- Stores fine dining service constraints and quality requirements

CREATE TABLE IF NOT EXISTS service_quality_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Service tier configuration
  service_tier TEXT NOT NULL DEFAULT 'fine_dining'
    CHECK (service_tier IN ('casual', 'upscale_casual', 'fine_dining', 'michelin')),

  -- Fine dining service constraints
  max_tables_per_server NUMERIC(4,2) NOT NULL DEFAULT 3.5,
  max_covers_per_server NUMERIC(4,2) NOT NULL DEFAULT 12.0,
  min_busser_to_server_ratio NUMERIC(4,2) NOT NULL DEFAULT 0.5,  -- 1 busser per 2 servers
  min_runner_to_server_ratio NUMERIC(4,2) NOT NULL DEFAULT 0.33, -- 1 runner per 3 servers
  min_sommelier_covers_threshold INTEGER DEFAULT 40,             -- Require sommelier above 40 covers

  -- Shift-specific overrides (NULL means applies to all shifts)
  shift_type TEXT CHECK (shift_type IN ('breakfast', 'lunch', 'dinner', 'late_night')),

  -- Quality vs efficiency balance
  quality_priority_weight NUMERIC(3,2) DEFAULT 0.7,  -- 70% quality, 30% cost
  min_service_quality_score NUMERIC(3,2) DEFAULT 0.85, -- Minimum acceptable quality score

  -- Active period
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_service_quality UNIQUE(venue_id, shift_type, effective_from)
);

CREATE INDEX idx_service_quality_venue ON service_quality_standards(venue_id) WHERE is_active = TRUE;
CREATE INDEX idx_service_quality_effective ON service_quality_standards(effective_from, effective_until);

COMMENT ON TABLE service_quality_standards IS 'Fine dining service quality constraints and staffing ratio requirements';
COMMENT ON COLUMN service_quality_standards.max_covers_per_server IS 'Maximum covers a single server should handle to maintain quality';
COMMENT ON COLUMN service_quality_standards.quality_priority_weight IS 'Weight of quality vs cost in optimization (higher = prioritize quality)';

-- =====================================================
-- TABLE 2: Covers Per Labor Hour Targets
-- =====================================================
-- Stores CPLH targets learned from historical data and industry benchmarks

CREATE TABLE IF NOT EXISTS covers_per_labor_hour_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  position_id UUID REFERENCES positions(id),

  -- Targets by shift and day
  shift_type TEXT CHECK (shift_type IN ('breakfast', 'lunch', 'dinner', 'late_night')),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday

  -- CPLH targets (covers per labor hour)
  target_cplh NUMERIC(6,2) NOT NULL,          -- Target covers/labor hour (median historical)
  min_cplh NUMERIC(6,2) NOT NULL,             -- Minimum acceptable (p25)
  optimal_cplh NUMERIC(6,2) NOT NULL,         -- Optimal efficiency (p75)
  max_cplh NUMERIC(6,2) NOT NULL,             -- Maximum before quality risk (p90)

  -- Context - when this target applies
  covers_range_min INTEGER,                    -- Apply when covers >= this
  covers_range_max INTEGER,                    -- Apply when covers <= this

  -- Metadata
  source TEXT CHECK (source IN ('historical', 'benchmark', 'manual', 'hybrid')),
  historical_sample_size INTEGER,              -- Number of shifts analyzed
  benchmark_source TEXT,                       -- e.g., 'NRA Fine Dining 2026'

  -- Active period
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_cplh_target UNIQUE(venue_id, position_id, shift_type, day_of_week, effective_from),
  CONSTRAINT valid_cplh_range CHECK (min_cplh <= target_cplh AND target_cplh <= optimal_cplh AND optimal_cplh <= max_cplh),
  CONSTRAINT valid_covers_range CHECK (covers_range_min IS NULL OR covers_range_max IS NULL OR covers_range_min <= covers_range_max)
);

CREATE INDEX idx_cplh_target_venue_position ON covers_per_labor_hour_targets(venue_id, position_id) WHERE is_active = TRUE;
CREATE INDEX idx_cplh_target_shift ON covers_per_labor_hour_targets(shift_type, day_of_week);

COMMENT ON TABLE covers_per_labor_hour_targets IS 'CPLH targets by position and shift, learned from historical data and industry benchmarks';
COMMENT ON COLUMN covers_per_labor_hour_targets.target_cplh IS 'Median CPLH from historical analysis (p50)';
COMMENT ON COLUMN covers_per_labor_hour_targets.min_cplh IS 'Minimum acceptable CPLH (p25) - below this indicates overstaffing';
COMMENT ON COLUMN covers_per_labor_hour_targets.optimal_cplh IS 'Optimal CPLH target (p75) - high efficiency without quality risk';
COMMENT ON COLUMN covers_per_labor_hour_targets.max_cplh IS 'Maximum CPLH (p90) - above this risks service quality degradation';

-- =====================================================
-- TABLE 3: Labor Optimization Settings
-- =====================================================
-- Configuration for multi-objective optimization

CREATE TABLE IF NOT EXISTS labor_optimization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Optimization objective
  optimization_mode TEXT NOT NULL DEFAULT 'balanced'
    CHECK (optimization_mode IN ('minimize_cost', 'maximize_quality', 'balanced', 'maximize_covers_per_lh')),

  -- Multi-objective weights (must sum to 1.0)
  cost_weight NUMERIC(3,2) DEFAULT 0.4,        -- 40% minimize cost
  quality_weight NUMERIC(3,2) DEFAULT 0.4,     -- 40% maximize quality
  efficiency_weight NUMERIC(3,2) DEFAULT 0.2,  -- 20% maximize covers per labor hour

  -- Margin targets
  target_labor_percentage NUMERIC(5,2) NOT NULL DEFAULT 27.5,
  max_labor_percentage NUMERIC(5,2) NOT NULL DEFAULT 30.0,
  min_labor_percentage NUMERIC(5,2) NOT NULL DEFAULT 25.0,

  -- Margin improvement goals
  monthly_margin_improvement_target NUMERIC(5,2) DEFAULT 0.5,  -- 0.5% monthly improvement

  -- Approval requirements
  require_manager_approval BOOLEAN DEFAULT TRUE,
  auto_optimize_threshold NUMERIC(5,2) DEFAULT 5.0,  -- Auto-apply if savings > 5%

  -- Active
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_optimization_settings UNIQUE(venue_id),
  CONSTRAINT valid_weight_sum CHECK (ABS((cost_weight + quality_weight + efficiency_weight) - 1.0) < 0.01),
  CONSTRAINT valid_labor_range CHECK (min_labor_percentage <= target_labor_percentage AND target_labor_percentage <= max_labor_percentage)
);

CREATE INDEX idx_optimization_settings_venue ON labor_optimization_settings(venue_id) WHERE is_active = TRUE;

COMMENT ON TABLE labor_optimization_settings IS 'Multi-objective optimization configuration and approval settings';
COMMENT ON COLUMN labor_optimization_settings.cost_weight IS 'Weight for cost minimization objective (default 0.4)';
COMMENT ON COLUMN labor_optimization_settings.quality_weight IS 'Weight for service quality maximization objective (default 0.4)';
COMMENT ON COLUMN labor_optimization_settings.efficiency_weight IS 'Weight for CPLH efficiency maximization objective (default 0.2)';
COMMENT ON CONSTRAINT valid_weight_sum ON labor_optimization_settings IS 'Weights must sum to 1.0 (allowing 0.01 rounding tolerance)';

-- =====================================================
-- TABLE 4: Schedule Optimization Results
-- =====================================================
-- Stores optimization metadata for each generated schedule

CREATE TABLE IF NOT EXISTS schedule_optimization_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES weekly_schedules(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Optimization configuration used
  optimization_mode TEXT NOT NULL,
  cost_weight NUMERIC(3,2),
  quality_weight NUMERIC(3,2),
  efficiency_weight NUMERIC(3,2),

  -- Optimization metrics
  total_labor_cost NUMERIC(12,2) NOT NULL,
  total_labor_hours NUMERIC(8,2) NOT NULL,
  projected_covers INTEGER NOT NULL,
  projected_revenue NUMERIC(12,2) NOT NULL,

  -- Covers per labor hour metrics
  overall_cplh NUMERIC(6,2) NOT NULL,           -- Covers per labor hour (entire schedule)
  avg_cplh_by_shift JSONB,                      -- CPLH breakdown by shift type
  cplh_variance_from_target NUMERIC(6,2),       -- How far from target CPLH

  -- Service quality score
  service_quality_score NUMERIC(4,3) NOT NULL,  -- 0.0 to 1.0
  quality_violations JSONB,                      -- Array of violated constraints
  quality_warnings JSONB,                        -- Array of quality warnings

  -- Labor efficiency
  labor_percentage NUMERIC(5,2) NOT NULL,
  labor_percentage_variance NUMERIC(5,2),        -- Variance from target

  -- Margin impact
  estimated_margin_improvement NUMERIC(5,2),     -- Expected margin improvement vs baseline
  cost_savings_vs_baseline NUMERIC(10,2),        -- Dollar savings vs baseline schedule

  -- Optimization solver details
  solver_status TEXT NOT NULL CHECK (solver_status IN ('optimal', 'feasible', 'infeasible', 'unbounded', 'error')),
  solver_time_seconds NUMERIC(6,2),
  constraints_satisfied INTEGER,
  constraints_violated INTEGER,

  -- Alternative scenarios (for comparison)
  alternative_scenarios JSONB,                   -- Store 2-3 alternative optimization results

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_optimization_schedule ON schedule_optimization_results(schedule_id);
CREATE INDEX idx_schedule_optimization_venue ON schedule_optimization_results(venue_id);
CREATE INDEX idx_schedule_optimization_status ON schedule_optimization_results(solver_status);

COMMENT ON TABLE schedule_optimization_results IS 'Metadata from schedule optimization including CPLH, quality scores, and solver results';
COMMENT ON COLUMN schedule_optimization_results.overall_cplh IS 'Total covers divided by total labor hours across entire schedule';
COMMENT ON COLUMN schedule_optimization_results.service_quality_score IS 'Composite quality score (0.0-1.0) based on staffing ratios and standards';
COMMENT ON COLUMN schedule_optimization_results.alternative_scenarios IS 'JSON array of alternative optimization results (min cost, max quality, etc.)';

-- =====================================================
-- TABLE 5: CPLH Actual vs Predicted
-- =====================================================
-- Learning loop: track predicted CPLH from schedule vs actual execution

CREATE TABLE IF NOT EXISTS cplh_actual_vs_predicted (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES weekly_schedules(id),

  business_date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('breakfast', 'lunch', 'dinner', 'late_night')),

  -- Predicted (from schedule optimization)
  predicted_covers INTEGER NOT NULL,
  predicted_labor_hours NUMERIC(6,2) NOT NULL,
  predicted_cplh NUMERIC(6,2) NOT NULL,

  -- Actual (from real performance)
  actual_covers INTEGER,
  actual_labor_hours NUMERIC(6,2),
  actual_cplh NUMERIC(6,2),

  -- Variance analysis
  covers_variance_pct NUMERIC(6,2),
  labor_hours_variance_pct NUMERIC(6,2),
  cplh_variance_pct NUMERIC(6,2),

  -- Service quality actual
  actual_service_quality_score NUMERIC(4,3),
  customer_complaints INTEGER DEFAULT 0,

  -- Learning feedback
  variance_reason TEXT,
  corrective_action TEXT,

  measured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_cplh_actual_predicted UNIQUE(venue_id, business_date, shift_type)
);

CREATE INDEX idx_cplh_actual_venue_date ON cplh_actual_vs_predicted(venue_id, business_date);
CREATE INDEX idx_cplh_actual_schedule ON cplh_actual_vs_predicted(schedule_id);

COMMENT ON TABLE cplh_actual_vs_predicted IS 'Learning loop tracking: predicted vs actual CPLH for continuous improvement';
COMMENT ON COLUMN cplh_actual_vs_predicted.predicted_cplh IS 'CPLH predicted during schedule optimization';
COMMENT ON COLUMN cplh_actual_vs_predicted.actual_cplh IS 'Actual CPLH achieved during shift execution';
COMMENT ON COLUMN cplh_actual_vs_predicted.variance_reason IS 'Explanation for significant variance (e.g., unexpected event, forecast error)';

-- =====================================================
-- TABLE 6: Margin Improvement Tracking
-- =====================================================
-- Track ROI and margin improvement over time

CREATE TABLE IF NOT EXISTS margin_improvement_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  tracking_period_start DATE NOT NULL,
  tracking_period_end DATE NOT NULL,

  -- Baseline metrics (before optimization)
  baseline_labor_percentage NUMERIC(5,2) NOT NULL,
  baseline_cplh NUMERIC(6,2) NOT NULL,
  baseline_labor_cost NUMERIC(12,2) NOT NULL,
  baseline_revenue NUMERIC(12,2) NOT NULL,

  -- Current metrics (with optimization)
  current_labor_percentage NUMERIC(5,2) NOT NULL,
  current_cplh NUMERIC(6,2) NOT NULL,
  current_labor_cost NUMERIC(12,2) NOT NULL,
  current_revenue NUMERIC(12,2) NOT NULL,

  -- Improvement achieved
  labor_pct_improvement NUMERIC(5,2),           -- Percentage points improvement
  cplh_improvement NUMERIC(6,2),                -- CPLH improvement
  cost_savings NUMERIC(12,2),                   -- Dollar savings
  margin_improvement NUMERIC(5,2),              -- Margin improvement

  -- Quality impact
  avg_service_quality_score NUMERIC(4,3),
  quality_score_change NUMERIC(4,3),

  -- ROI
  optimization_time_invested_hours NUMERIC(6,2),
  roi_percentage NUMERIC(8,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_margin_tracking UNIQUE(venue_id, tracking_period_start),
  CONSTRAINT valid_period CHECK (tracking_period_start < tracking_period_end)
);

CREATE INDEX idx_margin_tracking_venue ON margin_improvement_tracking(venue_id);
CREATE INDEX idx_margin_tracking_period ON margin_improvement_tracking(tracking_period_start, tracking_period_end);

COMMENT ON TABLE margin_improvement_tracking IS 'Track margin improvement ROI and quality impact over time';
COMMENT ON COLUMN margin_improvement_tracking.labor_pct_improvement IS 'Labor percentage improvement in points (e.g., 30% to 27.5% = 2.5 point improvement)';
COMMENT ON COLUMN margin_improvement_tracking.roi_percentage IS 'Return on investment from optimization efforts';

-- =====================================================
-- ENHANCE EXISTING TABLES
-- =====================================================

-- Add columns to labor_requirements table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'labor_requirements' AND column_name = 'covers_per_labor_hour') THEN
    ALTER TABLE labor_requirements
      ADD COLUMN covers_per_labor_hour NUMERIC(6,2),
      ADD COLUMN service_quality_score NUMERIC(4,3),
      ADD COLUMN quality_adjusted_cost NUMERIC(10,2),
      ADD COLUMN optimization_priority NUMERIC(3,2) DEFAULT 1.0;
  END IF;
END $$;

COMMENT ON COLUMN labor_requirements.covers_per_labor_hour IS 'Predicted CPLH for this requirement';
COMMENT ON COLUMN labor_requirements.service_quality_score IS 'Quality score (0-1) for this staffing level';
COMMENT ON COLUMN labor_requirements.quality_adjusted_cost IS 'Cost adjusted for quality impact';

-- Add columns to shift_assignments table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_assignments' AND column_name = 'planned_covers') THEN
    ALTER TABLE shift_assignments
      ADD COLUMN planned_covers INTEGER,
      ADD COLUMN planned_cplh NUMERIC(6,2),
      ADD COLUMN service_quality_contribution NUMERIC(4,3);
  END IF;
END $$;

COMMENT ON COLUMN shift_assignments.planned_covers IS 'Forecasted covers for this shift';
COMMENT ON COLUMN shift_assignments.planned_cplh IS 'Planned covers per labor hour for this shift';
COMMENT ON COLUMN shift_assignments.service_quality_contribution IS 'This shift contribution to overall quality score';

-- Add columns to weekly_schedules table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'weekly_schedules' AND column_name = 'overall_cplh') THEN
    ALTER TABLE weekly_schedules
      ADD COLUMN overall_cplh NUMERIC(6,2),
      ADD COLUMN service_quality_score NUMERIC(4,3),
      ADD COLUMN optimization_mode TEXT,
      ADD COLUMN margin_improvement_estimate NUMERIC(5,2);
  END IF;
END $$;

COMMENT ON COLUMN weekly_schedules.overall_cplh IS 'Overall covers per labor hour for the entire week';
COMMENT ON COLUMN weekly_schedules.service_quality_score IS 'Overall service quality score (0-1) for the schedule';
COMMENT ON COLUMN weekly_schedules.optimization_mode IS 'Optimization mode used (balanced, minimize_cost, maximize_quality)';

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get active service quality standards for a venue and shift
CREATE OR REPLACE FUNCTION get_service_quality_standards(
  p_venue_id UUID,
  p_shift_type TEXT DEFAULT NULL,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  max_covers_per_server NUMERIC,
  min_busser_to_server_ratio NUMERIC,
  min_runner_to_server_ratio NUMERIC,
  min_service_quality_score NUMERIC,
  quality_priority_weight NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sqs.max_covers_per_server,
    sqs.min_busser_to_server_ratio,
    sqs.min_runner_to_server_ratio,
    sqs.min_service_quality_score,
    sqs.quality_priority_weight
  FROM service_quality_standards sqs
  WHERE sqs.venue_id = p_venue_id
    AND sqs.is_active = TRUE
    AND sqs.effective_from <= p_as_of_date
    AND (sqs.effective_until IS NULL OR sqs.effective_until >= p_as_of_date)
    AND (p_shift_type IS NULL OR sqs.shift_type = p_shift_type OR sqs.shift_type IS NULL)
  ORDER BY
    CASE WHEN sqs.shift_type = p_shift_type THEN 1 ELSE 2 END,
    sqs.effective_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_service_quality_standards IS 'Get active service quality standards for a venue, with shift-specific overrides';

-- Function to get CPLH targets for a position and shift
CREATE OR REPLACE FUNCTION get_cplh_targets(
  p_venue_id UUID,
  p_position_id UUID,
  p_shift_type TEXT,
  p_day_of_week INTEGER,
  p_covers INTEGER DEFAULT NULL,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  target_cplh NUMERIC,
  min_cplh NUMERIC,
  optimal_cplh NUMERIC,
  max_cplh NUMERIC,
  source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.target_cplh,
    t.min_cplh,
    t.optimal_cplh,
    t.max_cplh,
    t.source
  FROM covers_per_labor_hour_targets t
  WHERE t.venue_id = p_venue_id
    AND (t.position_id = p_position_id OR t.position_id IS NULL)
    AND (t.shift_type = p_shift_type OR t.shift_type IS NULL)
    AND (t.day_of_week = p_day_of_week OR t.day_of_week IS NULL)
    AND t.is_active = TRUE
    AND t.effective_from <= p_as_of_date
    AND (t.effective_until IS NULL OR t.effective_until >= p_as_of_date)
    AND (p_covers IS NULL OR t.covers_range_min IS NULL OR p_covers >= t.covers_range_min)
    AND (p_covers IS NULL OR t.covers_range_max IS NULL OR p_covers <= t.covers_range_max)
  ORDER BY
    CASE WHEN t.position_id = p_position_id THEN 1 ELSE 2 END,
    CASE WHEN t.shift_type = p_shift_type THEN 1 ELSE 2 END,
    CASE WHEN t.day_of_week = p_day_of_week THEN 1 ELSE 2 END,
    t.effective_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_cplh_targets IS 'Get CPLH targets for a position with fallbacks to more general targets';

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all new tables
ALTER TABLE service_quality_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE covers_per_labor_hour_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_optimization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_optimization_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE cplh_actual_vs_predicted ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_improvement_tracking ENABLE ROW LEVEL SECURITY;

-- Policies for service_quality_standards
CREATE POLICY service_quality_standards_select ON service_quality_standards
  FOR SELECT USING (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id))
  );

CREATE POLICY service_quality_standards_insert ON service_quality_standards
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id AND role IN ('admin', 'manager')))
  );

CREATE POLICY service_quality_standards_update ON service_quality_standards
  FOR UPDATE USING (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id AND role IN ('admin', 'manager')))
  );

-- Policies for covers_per_labor_hour_targets
CREATE POLICY cplh_targets_select ON covers_per_labor_hour_targets
  FOR SELECT USING (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id))
  );

CREATE POLICY cplh_targets_insert ON covers_per_labor_hour_targets
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id AND role IN ('admin', 'manager')))
  );

CREATE POLICY cplh_targets_update ON covers_per_labor_hour_targets
  FOR UPDATE USING (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id AND role IN ('admin', 'manager')))
  );

-- Policies for labor_optimization_settings
CREATE POLICY optimization_settings_select ON labor_optimization_settings
  FOR SELECT USING (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id))
  );

CREATE POLICY optimization_settings_insert ON labor_optimization_settings
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id AND role IN ('admin', 'manager')))
  );

CREATE POLICY optimization_settings_update ON labor_optimization_settings
  FOR UPDATE USING (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id AND role IN ('admin', 'manager')))
  );

-- Policies for schedule_optimization_results (read-only for most users)
CREATE POLICY schedule_optimization_results_select ON schedule_optimization_results
  FOR SELECT USING (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id))
  );

CREATE POLICY schedule_optimization_results_insert ON schedule_optimization_results
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id AND role IN ('admin', 'manager')))
  );

-- Policies for cplh_actual_vs_predicted
CREATE POLICY cplh_actual_predicted_select ON cplh_actual_vs_predicted
  FOR SELECT USING (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id))
  );

CREATE POLICY cplh_actual_predicted_insert ON cplh_actual_vs_predicted
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id AND role IN ('admin', 'manager')))
  );

-- Policies for margin_improvement_tracking
CREATE POLICY margin_tracking_select ON margin_improvement_tracking
  FOR SELECT USING (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id))
  );

CREATE POLICY margin_tracking_insert ON margin_improvement_tracking
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT id FROM venues WHERE auth.uid() IN (SELECT user_id FROM user_venue_access WHERE venue_id = venues.id AND role IN ('admin', 'manager')))
  );
