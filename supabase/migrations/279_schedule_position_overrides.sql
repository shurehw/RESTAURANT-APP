-- Admin overrides for scheduling: per-venue, per-position shift timing + CPLH
-- When set, scheduler uses these instead of computed defaults.

CREATE TABLE IF NOT EXISTS schedule_position_overrides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  position_name TEXT NOT NULL,
  shift_start   TIME,
  shift_end     TIME,
  min_shift_hours NUMERIC(4,2) DEFAULT 6.0,
  cplh_override NUMERIC(6,2),
  min_staff     INTEGER DEFAULT 0,
  max_staff     INTEGER,
  bar_guest_pct NUMERIC(4,2) DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, position_name)
);

CREATE INDEX IF NOT EXISTS idx_spo_venue ON schedule_position_overrides(venue_id) WHERE is_active;

ALTER TABLE schedule_position_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view schedule overrides" ON schedule_position_overrides;
CREATE POLICY "Users can view schedule overrides"
  ON schedule_position_overrides FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage schedule overrides" ON schedule_position_overrides;
CREATE POLICY "Users can manage schedule overrides"
  ON schedule_position_overrides FOR ALL USING (true);
