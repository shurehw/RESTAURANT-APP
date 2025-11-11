-- Employees & Positions for Labor Requirements
-- Foundation for data-driven staffing calculations

-- ============================================================================
-- POSITIONS & WAGE RATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('front_of_house', 'back_of_house', 'management', 'support')),

  -- Wage data
  base_hourly_rate NUMERIC(6,2) NOT NULL,
  tipped BOOLEAN DEFAULT FALSE,

  -- Scheduling
  is_schedulable BOOLEAN DEFAULT TRUE,
  requires_certification BOOLEAN DEFAULT FALSE,

  -- Active
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_position_name UNIQUE(venue_id, name)
);

CREATE INDEX idx_positions_venue ON positions(venue_id, is_active);

-- ============================================================================
-- EMPLOYEES
-- ============================================================================

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Basic info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,

  -- Employment
  primary_position_id UUID REFERENCES positions(id),
  hire_date DATE,
  termination_date DATE,
  employment_status TEXT DEFAULT 'active' CHECK (employment_status IN ('active', 'inactive', 'terminated')),

  -- Scheduling
  min_hours_per_week NUMERIC(4,2) DEFAULT 0,
  max_hours_per_week NUMERIC(4,2) DEFAULT 40,
  is_full_time BOOLEAN DEFAULT FALSE,

  -- Availability (JSON: day_of_week -> available hours)
  availability JSONB DEFAULT '{}',

  -- Preferences
  preferred_shifts JSONB DEFAULT '[]',
  cannot_work_with JSONB DEFAULT '[]',

  -- Performance (for ML model)
  performance_rating NUMERIC(3,2) DEFAULT 3.0 CHECK (performance_rating BETWEEN 1.0 AND 5.0),
  covers_per_hour_avg NUMERIC(6,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_venue ON employees(venue_id, employment_status);
CREATE INDEX idx_employees_position ON employees(primary_position_id);

-- ============================================================================
-- EMPLOYEE CERTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  certification_type TEXT NOT NULL,
  certification_number TEXT,
  issue_date DATE,
  expiration_date DATE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_certifications_employee ON employee_certifications(employee_id);

-- ============================================================================
-- ACTUAL SHIFTS WORKED (Historical Data for ML)
-- ============================================================================

CREATE TABLE IF NOT EXISTS actual_shifts_worked (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,

  -- Date/time
  business_date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('breakfast', 'lunch', 'dinner', 'late_night')),

  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,

  -- Hours
  scheduled_hours NUMERIC(4,2),
  actual_hours NUMERIC(4,2),
  overtime_hours NUMERIC(4,2) DEFAULT 0,

  -- Pay
  hourly_rate NUMERIC(6,2) NOT NULL,
  regular_pay NUMERIC(10,2),
  overtime_pay NUMERIC(10,2),
  tips NUMERIC(10,2),
  total_compensation NUMERIC(10,2),

  -- Performance metrics (for ML)
  covers_served INTEGER,
  tables_served INTEGER,
  avg_check NUMERIC(10,2),
  customer_complaints INTEGER DEFAULT 0,

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actual_shifts_venue_date ON actual_shifts_worked(venue_id, business_date DESC);
CREATE INDEX idx_actual_shifts_employee ON actual_shifts_worked(employee_id, business_date DESC);
CREATE INDEX idx_actual_shifts_position ON actual_shifts_worked(position_id, business_date DESC);

-- ============================================================================
-- STAFFING ANALYSIS (ML Model Outputs)
-- ============================================================================

-- Learned staffing patterns from historical data
CREATE TABLE IF NOT EXISTS staffing_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,

  -- Pattern
  shift_type TEXT NOT NULL,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),

  -- Cover ranges and recommended staff
  covers_min INTEGER NOT NULL,
  covers_max INTEGER NOT NULL,
  employees_recommended INTEGER NOT NULL,

  -- Performance metrics
  avg_labor_percentage NUMERIC(5,2),
  confidence_score NUMERIC(4,3),
  sample_size INTEGER,

  -- Calculated from
  analyzed_shifts INTEGER,
  date_range_start DATE,
  date_range_end DATE,

  -- Model version
  model_version TEXT NOT NULL,
  trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staffing_patterns_venue ON staffing_patterns(venue_id, position_id, is_active);
CREATE INDEX idx_staffing_patterns_lookup ON staffing_patterns(venue_id, shift_type, day_of_week, covers_min, covers_max);

-- ============================================================================
-- LABOR % TARGETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS labor_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Targets
  target_labor_percentage NUMERIC(5,2) NOT NULL DEFAULT 27.5,
  min_labor_percentage NUMERIC(5,2) NOT NULL DEFAULT 27.0,
  max_labor_percentage NUMERIC(5,2) NOT NULL DEFAULT 28.0,

  -- By shift type (optional overrides)
  shift_type TEXT CHECK (shift_type IN ('breakfast', 'lunch', 'dinner', 'late_night')),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),

  -- Active date range
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_labor_targets_venue ON labor_targets(venue_id, is_active);

-- ============================================================================
-- UPDATE labor_requirements TABLE
-- ============================================================================

-- Add fields to track ML model usage
ALTER TABLE labor_requirements
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES positions(id),
  ADD COLUMN IF NOT EXISTS staffing_pattern_id UUID REFERENCES staffing_patterns(id),
  ADD COLUMN IF NOT EXISTS labor_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS within_target BOOLEAN,
  ADD COLUMN IF NOT EXISTS calculation_method TEXT DEFAULT 'ml_model' CHECK (calculation_method IN ('ml_model', 'service_standard', 'manual'));

-- Update forecast table to store labor estimates
ALTER TABLE demand_forecasts
  ADD COLUMN IF NOT EXISTS labor_cost_estimate NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS labor_percentage_estimate NUMERIC(5,2);

-- ============================================================================
-- SEED DEFAULT POSITIONS
-- ============================================================================

-- Insert common restaurant positions (will be updated with actual venue data)
INSERT INTO positions (venue_id, name, category, base_hourly_rate, tipped, is_active)
SELECT
  v.id,
  pos.name,
  pos.category,
  pos.rate,
  pos.tipped,
  true
FROM venues v
CROSS JOIN (VALUES
  ('Server', 'front_of_house', 15.00, true),
  ('Bartender', 'front_of_house', 16.00, true),
  ('Busser', 'front_of_house', 14.00, true),
  ('Host', 'front_of_house', 14.00, false),
  ('Food Runner', 'front_of_house', 14.00, true),
  ('Line Cook', 'back_of_house', 18.00, false),
  ('Prep Cook', 'back_of_house', 16.00, false),
  ('Dishwasher', 'back_of_house', 15.00, false),
  ('Sous Chef', 'back_of_house', 22.00, false),
  ('Executive Chef', 'back_of_house', 28.00, false),
  ('General Manager', 'management', 25.00, false),
  ('Assistant Manager', 'management', 20.00, false),
  ('Shift Manager', 'management', 18.00, false)
) AS pos(name, category, rate, tipped)
WHERE v.is_active = true
ON CONFLICT (venue_id, name) DO NOTHING;

-- Insert default labor targets (27.5% standard)
INSERT INTO labor_targets (venue_id, target_labor_percentage, min_labor_percentage, max_labor_percentage, is_active)
SELECT
  id,
  27.5,
  27.0,
  28.0,
  true
FROM venues
WHERE is_active = true
ON CONFLICT DO NOTHING;
