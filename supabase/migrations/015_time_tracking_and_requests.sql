-- Time Tracking & Employee Self-Service
-- Clock in/out with verification, time-off requests, shift swaps

-- ============================================================================
-- TIME TRACKING & CLOCK IN/OUT
-- ============================================================================

-- Time punches (clock in/out records)
CREATE TABLE IF NOT EXISTS time_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,

  -- Punch details
  punch_type TEXT NOT NULL CHECK (punch_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  punch_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  business_date DATE NOT NULL,

  -- Verification data (anti-fraud)
  location_lat NUMERIC(10, 8),
  location_lng NUMERIC(11, 8),
  location_accuracy NUMERIC(6, 2),
  photo_url TEXT,
  device_id TEXT,
  ip_address INET,
  user_agent TEXT,

  -- Geofence validation
  within_geofence BOOLEAN DEFAULT FALSE,
  distance_from_venue NUMERIC(8, 2), -- meters

  -- Manager override
  is_manual_entry BOOLEAN DEFAULT FALSE,
  entered_by UUID REFERENCES employees(id),
  override_reason TEXT,

  -- Flags
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES employees(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_time_punches_employee ON time_punches(employee_id, business_date DESC);
CREATE INDEX idx_time_punches_venue_date ON time_punches(venue_id, business_date DESC);
CREATE INDEX idx_time_punches_shift ON time_punches(shift_assignment_id);
CREATE INDEX idx_time_punches_flagged ON time_punches(is_flagged) WHERE is_flagged = TRUE;

-- Venue geofence settings
CREATE TABLE IF NOT EXISTS venue_geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Location
  center_lat NUMERIC(10, 8) NOT NULL,
  center_lng NUMERIC(11, 8) NOT NULL,
  radius_meters NUMERIC(8, 2) NOT NULL DEFAULT 100, -- 100m radius default

  -- Verification settings
  require_photo BOOLEAN DEFAULT TRUE,
  require_geofence BOOLEAN DEFAULT TRUE,
  allow_early_clock_in_minutes INTEGER DEFAULT 15,
  allow_late_clock_out_minutes INTEGER DEFAULT 15,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_venue_geofence UNIQUE(venue_id)
);

-- Calculated timesheets (aggregated from punches)
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,

  business_date DATE NOT NULL,

  -- Times
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,

  -- Hours
  regular_hours NUMERIC(4, 2),
  overtime_hours NUMERIC(4, 2),
  break_hours NUMERIC(4, 2),
  total_hours NUMERIC(4, 2),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disputed', 'edited')),

  -- Approval
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,

  -- Edits
  edited_by UUID REFERENCES employees(id),
  edited_at TIMESTAMPTZ,
  edit_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_timesheet UNIQUE(employee_id, business_date, shift_assignment_id)
);

CREATE INDEX idx_timesheets_employee ON timesheets(employee_id, business_date DESC);
CREATE INDEX idx_timesheets_venue_date ON timesheets(venue_id, business_date DESC);
CREATE INDEX idx_timesheets_status ON timesheets(status);

-- ============================================================================
-- TIME-OFF REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Request details
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('vacation', 'sick', 'personal', 'unpaid', 'other')),

  -- Partial day
  is_partial_day BOOLEAN DEFAULT FALSE,
  partial_hours NUMERIC(4, 2),

  -- Notes
  reason TEXT,
  notes TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),

  -- Manager response
  reviewed_by UUID REFERENCES employees(id),
  reviewed_at TIMESTAMPTZ,
  manager_notes TEXT,

  -- Conflicting shifts
  affected_shifts JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_time_off_employee ON time_off_requests(employee_id, start_date DESC);
CREATE INDEX idx_time_off_venue_pending ON time_off_requests(venue_id, status) WHERE status = 'pending';
CREATE INDEX idx_time_off_dates ON time_off_requests(start_date, end_date);

-- ============================================================================
-- SHIFT SWAPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Original shift
  original_shift_id UUID NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  requesting_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Swap target
  swap_type TEXT NOT NULL CHECK (swap_type IN ('offer', 'trade', 'cover')),
  target_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  target_shift_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,

  -- Request details
  reason TEXT,
  notes TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'approved', 'denied', 'cancelled')),

  -- Employee acceptance (for trades)
  accepted_by_employee_at TIMESTAMPTZ,

  -- Manager approval
  reviewed_by UUID REFERENCES employees(id),
  reviewed_at TIMESTAMPTZ,
  manager_notes TEXT,

  -- Completion
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shift_swaps_original_shift ON shift_swap_requests(original_shift_id);
CREATE INDEX idx_shift_swaps_requesting ON shift_swap_requests(requesting_employee_id, status);
CREATE INDEX idx_shift_swaps_target ON shift_swap_requests(target_employee_id, status);
CREATE INDEX idx_shift_swaps_pending ON shift_swap_requests(venue_id, status) WHERE status = 'pending';

-- ============================================================================
-- AVAILABILITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Day of week (0 = Sunday, 6 = Saturday)
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),

  -- Availability
  is_available BOOLEAN DEFAULT TRUE,
  start_time TIME,
  end_time TIME,

  -- Preferences
  preferred BOOLEAN DEFAULT FALSE,
  notes TEXT,

  -- Effective dates
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_employee_availability UNIQUE(employee_id, day_of_week, effective_from)
);

CREATE INDEX idx_availability_employee ON employee_availability(employee_id, day_of_week);

-- ============================================================================
-- ATTENDANCE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE CASCADE,

  business_date DATE NOT NULL,

  -- Attendance status
  status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent', 'no_call_no_show', 'called_out')),

  -- Late details
  scheduled_start TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  minutes_late INTEGER,

  -- Notes
  reason TEXT,
  notes TEXT,

  -- Points system (optional)
  points_assessed NUMERIC(3, 1) DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attendance_employee ON attendance_records(employee_id, business_date DESC);
CREATE INDEX idx_attendance_venue_date ON attendance_records(venue_id, business_date DESC);
CREATE INDEX idx_attendance_status ON attendance_records(status);

-- ============================================================================
-- MANAGER LOGBOOK
-- ============================================================================

CREATE TABLE IF NOT EXISTS manager_logbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  business_date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('breakfast', 'lunch', 'dinner', 'late_night', 'all_day')),

  -- Entry
  author_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('shift_notes', 'incident', 'maintenance', 'inventory', 'customer_feedback', 'staff_issue', 'other')),

  title TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Priority
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Follow-up
  requires_follow_up BOOLEAN DEFAULT FALSE,
  followed_up_by UUID REFERENCES employees(id),
  followed_up_at TIMESTAMPTZ,

  -- Visibility
  visible_to_all BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logbook_venue_date ON manager_logbook(venue_id, business_date DESC);
CREATE INDEX idx_logbook_shift ON manager_logbook(shift_type, business_date DESC);
CREATE INDEX idx_logbook_follow_up ON manager_logbook(requires_follow_up) WHERE requires_follow_up = TRUE;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate distance between two GPS coordinates (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 NUMERIC,
  lng1 NUMERIC,
  lat2 NUMERIC,
  lng2 NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  R NUMERIC := 6371000; -- Earth radius in meters
  dLat NUMERIC;
  dLng NUMERIC;
  a NUMERIC;
  c NUMERIC;
BEGIN
  dLat := radians(lat2 - lat1);
  dLng := radians(lng2 - lng1);

  a := sin(dLat/2) * sin(dLat/2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dLng/2) * sin(dLng/2);

  c := 2 * atan2(sqrt(a), sqrt(1-a));

  RETURN R * c; -- Distance in meters
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Auto-flag suspicious punches
CREATE OR REPLACE FUNCTION flag_suspicious_punch()
RETURNS TRIGGER AS $$
DECLARE
  geofence RECORD;
  distance NUMERIC;
BEGIN
  -- Get venue geofence settings
  SELECT * INTO geofence
  FROM venue_geofences
  WHERE venue_id = NEW.venue_id
    AND is_active = TRUE
  LIMIT 1;

  IF geofence IS NOT NULL AND NEW.location_lat IS NOT NULL THEN
    -- Calculate distance from venue
    distance := calculate_distance(
      NEW.location_lat,
      NEW.location_lng,
      geofence.center_lat,
      geofence.center_lng
    );

    NEW.distance_from_venue := distance;
    NEW.within_geofence := distance <= geofence.radius_meters;

    -- Flag if outside geofence and geofence is required
    IF geofence.require_geofence AND NOT NEW.within_geofence THEN
      NEW.is_flagged := TRUE;
      NEW.flag_reason := 'Outside geofence (distance: ' || ROUND(distance) || 'm)';
    END IF;

    -- Flag if photo required but missing
    IF geofence.require_photo AND NEW.photo_url IS NULL THEN
      NEW.is_flagged := TRUE;
      NEW.flag_reason := COALESCE(NEW.flag_reason || '; ', '') || 'Photo required but not provided';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_flag_suspicious_punch
  BEFORE INSERT ON time_punches
  FOR EACH ROW
  EXECUTE FUNCTION flag_suspicious_punch();

-- Comments
COMMENT ON TABLE time_punches IS 'Individual clock in/out events with verification data';
COMMENT ON TABLE timesheets IS 'Aggregated daily timesheets for payroll';
COMMENT ON TABLE time_off_requests IS 'Employee time-off requests (PTO, sick days, etc)';
COMMENT ON TABLE shift_swap_requests IS 'Employee-initiated shift swaps and coverage requests';
COMMENT ON TABLE employee_availability IS 'Employee weekly availability preferences';
COMMENT ON TABLE attendance_records IS 'Daily attendance tracking (late, absent, etc)';
COMMENT ON TABLE manager_logbook IS 'Shift notes and handoff communication';
