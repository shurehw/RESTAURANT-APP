-- Advanced Time Clock Features
-- Early clock-in prevention, geofence auto-logout, break tracking, PIN management

-- ============================================================================
-- UPDATE TIME PUNCHES TABLE
-- ============================================================================

-- Add break tracking fields
ALTER TABLE time_punches
  ADD COLUMN IF NOT EXISTS is_auto_logout BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_logout_reason TEXT,
  ADD COLUMN IF NOT EXISTS prevented_reason TEXT; -- Why clock-in was prevented

COMMENT ON COLUMN time_punches.is_auto_logout IS 'True if clocked out automatically by system';
COMMENT ON COLUMN time_punches.auto_logout_reason IS 'Reason for auto logout (left_geofence, overtime_prevention)';
COMMENT ON COLUMN time_punches.prevented_reason IS 'Reason clock-in was prevented (too_early, outside_geofence)';

-- ============================================================================
-- EMPLOYEE PIN CODES
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- PIN (hashed for security)
  pin_hash TEXT NOT NULL,

  -- PIN management
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,

  -- History
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,

  CONSTRAINT uq_employee_pin UNIQUE(employee_id, venue_id)
);

CREATE INDEX idx_employee_pins_employee ON employee_pins(employee_id, is_active);
CREATE INDEX idx_employee_pins_venue ON employee_pins(venue_id);

COMMENT ON TABLE employee_pins IS 'Employee PIN codes for kiosk time clock';

-- ============================================================================
-- BREAK TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_punch_id UUID REFERENCES time_punches(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Break details
  break_type TEXT NOT NULL CHECK (break_type IN ('meal', 'rest', 'unpaid')),
  break_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  break_end TIMESTAMPTZ,
  break_duration_minutes NUMERIC(6, 2),

  -- Compliance
  is_compliant BOOLEAN DEFAULT TRUE,
  compliance_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employee_breaks_employee ON employee_breaks(employee_id, break_start DESC);
CREATE INDEX idx_employee_breaks_punch ON employee_breaks(time_punch_id);

COMMENT ON TABLE employee_breaks IS 'Employee break tracking for compliance';

-- ============================================================================
-- SCHEDULE TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Template info
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL CHECK (template_type IN ('weekly', 'seasonal', 'event', 'custom')),

  -- Template data (stores shift assignments)
  template_data JSONB NOT NULL, -- Array of shift objects

  -- Metadata
  created_by UUID REFERENCES employees(id),
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_templates_venue ON schedule_templates(venue_id, is_active);
CREATE INDEX idx_schedule_templates_type ON schedule_templates(template_type);

COMMENT ON TABLE schedule_templates IS 'Reusable schedule templates';

-- ============================================================================
-- TIME CLOCK SETTINGS (per venue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS time_clock_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Clock-in rules
  early_clock_in_minutes INTEGER DEFAULT 15, -- Can't clock in more than X minutes early
  late_clock_out_grace_minutes INTEGER DEFAULT 15,
  auto_clock_out_hours NUMERIC(4, 2) DEFAULT 12.0, -- Auto clock-out after X hours

  -- Break enforcement
  require_meal_break_after_hours NUMERIC(4, 2) DEFAULT 5.0, -- CA: 5 hours
  meal_break_duration_minutes INTEGER DEFAULT 30,
  require_rest_breaks BOOLEAN DEFAULT TRUE,
  rest_break_duration_minutes INTEGER DEFAULT 10,

  -- Overtime prevention
  prevent_overtime_clock_in BOOLEAN DEFAULT FALSE,
  auto_clock_out_before_overtime BOOLEAN DEFAULT FALSE,
  weekly_overtime_threshold NUMERIC(4, 2) DEFAULT 40.0,

  -- Geofencing
  auto_logout_on_geofence_exit BOOLEAN DEFAULT FALSE,
  geofence_check_interval_seconds INTEGER DEFAULT 60, -- Check every 60 seconds

  -- PIN settings
  require_pin BOOLEAN DEFAULT TRUE,
  pin_length INTEGER DEFAULT 4,
  max_failed_attempts INTEGER DEFAULT 3,
  lockout_duration_minutes INTEGER DEFAULT 15,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_time_clock_settings UNIQUE(venue_id)
);

COMMENT ON TABLE time_clock_settings IS 'Time clock configuration per venue';

-- Create default settings for existing venues
INSERT INTO time_clock_settings (venue_id)
SELECT id FROM venues
WHERE id NOT IN (SELECT venue_id FROM time_clock_settings)
ON CONFLICT (venue_id) DO NOTHING;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Check if employee can clock in (early prevention)
CREATE OR REPLACE FUNCTION can_clock_in(p_employee_id UUID, p_venue_id UUID, p_current_time TIMESTAMPTZ)
RETURNS TABLE(allowed BOOLEAN, reason TEXT) AS $$
DECLARE
  settings RECORD;
  next_shift RECORD;
  minutes_until_shift NUMERIC;
  current_week_hours NUMERIC;
BEGIN
  -- Get venue settings
  SELECT * INTO settings FROM time_clock_settings WHERE venue_id = p_venue_id;

  -- Check if employee has upcoming shift
  SELECT * INTO next_shift
  FROM shift_assignments
  WHERE employee_id = p_employee_id
    AND scheduled_start > p_current_time
  ORDER BY scheduled_start ASC
  LIMIT 1;

  -- If no upcoming shift, allow clock-in
  IF next_shift IS NULL THEN
    RETURN QUERY SELECT TRUE, 'No scheduled shift found'::TEXT;
    RETURN;
  END IF;

  -- Calculate minutes until shift
  minutes_until_shift := EXTRACT(EPOCH FROM (next_shift.scheduled_start - p_current_time)) / 60;

  -- Prevent early clock-in
  IF minutes_until_shift > settings.early_clock_in_minutes THEN
    RETURN QUERY SELECT
      FALSE,
      'Cannot clock in more than ' || settings.early_clock_in_minutes || ' minutes early. Your shift starts in ' || ROUND(minutes_until_shift) || ' minutes.'::TEXT;
    RETURN;
  END IF;

  -- Check weekly hours for overtime prevention
  IF settings.prevent_overtime_clock_in THEN
    SELECT COALESCE(SUM(actual_hours), 0) INTO current_week_hours
    FROM shift_assignments
    WHERE employee_id = p_employee_id
      AND scheduled_start >= date_trunc('week', p_current_time)
      AND actual_hours IS NOT NULL;

    IF current_week_hours >= settings.weekly_overtime_threshold THEN
      RETURN QUERY SELECT
        FALSE,
        'Overtime prevention: You have already worked ' || current_week_hours || ' hours this week.'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Allow clock-in
  RETURN QUERY SELECT TRUE, 'Allowed'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Calculate break compliance
CREATE OR REPLACE FUNCTION check_break_compliance(p_employee_id UUID, p_shift_hours NUMERIC)
RETURNS TABLE(compliant BOOLEAN, required_breaks TEXT[]) AS $$
DECLARE
  settings RECORD;
  breaks_taken INTEGER;
  required TEXT[] := '{}';
BEGIN
  -- Get venue settings
  SELECT tcs.* INTO settings
  FROM employees e
  JOIN time_clock_settings tcs ON tcs.venue_id = e.venue_id
  WHERE e.id = p_employee_id;

  -- Check if meal break required
  IF p_shift_hours >= settings.require_meal_break_after_hours THEN
    required := array_append(required, 'meal_break_' || settings.meal_break_duration_minutes || '_min');

    -- Check if taken
    SELECT COUNT(*) INTO breaks_taken
    FROM employee_breaks
    WHERE employee_id = p_employee_id
      AND break_type = 'meal'
      AND break_start >= NOW() - (p_shift_hours || ' hours')::INTERVAL;

    IF breaks_taken = 0 THEN
      RETURN QUERY SELECT FALSE, required;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, required;
END;
$$ LANGUAGE plpgsql;

-- Auto clock-out function (called by cron or app)
CREATE OR REPLACE FUNCTION auto_clock_out_overtime_shifts()
RETURNS TABLE(clocked_out_count INTEGER) AS $$
DECLARE
  punch RECORD;
  hours_worked NUMERIC;
  count INTEGER := 0;
BEGIN
  -- Find all active clock-ins that are approaching overtime
  FOR punch IN
    SELECT
      tp.*,
      tcs.auto_clock_out_hours,
      tcs.auto_clock_out_before_overtime
    FROM time_punches tp
    JOIN employees e ON e.id = tp.employee_id
    JOIN time_clock_settings tcs ON tcs.venue_id = tp.venue_id
    WHERE tp.punch_type = 'clock_in'
      AND tp.punch_time < NOW() - (tcs.auto_clock_out_hours || ' hours')::INTERVAL
      AND NOT EXISTS (
        SELECT 1 FROM time_punches tp2
        WHERE tp2.employee_id = tp.employee_id
          AND tp2.punch_type = 'clock_out'
          AND tp2.punch_time > tp.punch_time
      )
  LOOP
    -- Calculate hours worked
    hours_worked := EXTRACT(EPOCH FROM (NOW() - punch.punch_time)) / 3600;

    -- Auto clock-out
    INSERT INTO time_punches (
      venue_id,
      employee_id,
      punch_type,
      punch_time,
      is_auto_logout,
      auto_logout_reason
    ) VALUES (
      punch.venue_id,
      punch.employee_id,
      'clock_out',
      NOW(),
      TRUE,
      'Auto clocked out after ' || ROUND(hours_worked, 2) || ' hours'
    );

    count := count + 1;
  END LOOP;

  RETURN QUERY SELECT count;
END;
$$ LANGUAGE plpgsql;

-- Generate default 4-digit PIN for employee
CREATE OR REPLACE FUNCTION generate_employee_pin(p_employee_id UUID, p_venue_id UUID)
RETURNS TEXT AS $$
DECLARE
  new_pin TEXT;
  pin_exists BOOLEAN;
BEGIN
  -- Generate random 4-digit PIN
  LOOP
    new_pin := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    -- Check if PIN already exists for this venue
    SELECT EXISTS (
      SELECT 1 FROM employee_pins
      WHERE venue_id = p_venue_id AND pin_hash = new_pin
    ) INTO pin_exists;

    EXIT WHEN NOT pin_exists;
  END LOOP;

  -- Store PIN (in production, use proper hashing like bcrypt)
  INSERT INTO employee_pins (employee_id, venue_id, pin_hash)
  VALUES (p_employee_id, p_venue_id, new_pin)
  ON CONFLICT (employee_id, venue_id) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash, is_active = TRUE, failed_attempts = 0;

  RETURN new_pin;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Generate PINs for all existing employees
DO $$
DECLARE
  emp RECORD;
  generated_pin TEXT;
BEGIN
  FOR emp IN SELECT id, venue_id FROM employees WHERE employment_status = 'active'
  LOOP
    generated_pin := generate_employee_pin(emp.id, emp.venue_id);
    RAISE NOTICE 'Generated PIN % for employee %', generated_pin, emp.id;
  END LOOP;
END $$;
