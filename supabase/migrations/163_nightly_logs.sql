-- ============================================================================
-- NIGHTLY LOGS - Manager end-of-day reports with user inputs
-- ============================================================================

-- Enum for music type
DO $$ BEGIN
  CREATE TYPE music_type AS ENUM ('playlist', 'dj', 'live', 'other', 'none');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 1. Nightly Logs table
CREATE TABLE IF NOT EXISTS nightly_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,

  -- Auto-populated from TipSee (but can be manually overridden)
  total_revenue NUMERIC(12,2),
  guest_count INTEGER,
  total_checks INTEGER,
  total_comps NUMERIC(12,2),
  total_voids NUMERIC(12,2),
  total_tax NUMERIC(12,2),

  -- Manual inputs
  table_turns NUMERIC(4,1),

  -- Staff & Labor
  staff_on_shift TEXT,
  labor_notes TEXT,

  -- Music & Entertainment
  music_type music_type DEFAULT 'none',
  music_details TEXT,
  dj_name TEXT,
  live_performer TEXT,

  -- Issues & Notes
  incidents TEXT,
  guest_feedback TEXT,
  manager_notes TEXT,

  -- Weather (can affect business)
  weather_notes TEXT,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint: one log per venue per date
  UNIQUE(venue_id, log_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nightly_logs_venue ON nightly_logs(venue_id);
CREATE INDEX IF NOT EXISTS idx_nightly_logs_date ON nightly_logs(log_date DESC);
CREATE INDEX IF NOT EXISTS idx_nightly_logs_venue_date ON nightly_logs(venue_id, log_date DESC);

-- 2. Nightly Log Notable Items (track specific highlights)
CREATE TABLE IF NOT EXISTS nightly_log_highlights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nightly_log_id UUID NOT NULL REFERENCES nightly_logs(id) ON DELETE CASCADE,
  highlight_type TEXT NOT NULL, -- 'vip_guest', 'large_party', 'complaint', 'compliment', 'incident'
  description TEXT NOT NULL,
  guest_name TEXT,
  table_number TEXT,
  amount NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_highlights_log ON nightly_log_highlights(nightly_log_id);

-- 3. Updated at trigger
CREATE OR REPLACE FUNCTION update_nightly_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nightly_logs_updated_at ON nightly_logs;
CREATE TRIGGER nightly_logs_updated_at
  BEFORE UPDATE ON nightly_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_nightly_log_timestamp();

-- 4. RLS Policies
ALTER TABLE nightly_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nightly_log_highlights ENABLE ROW LEVEL SECURITY;

-- Users can view logs for their organization's venues
CREATE POLICY "Users can view nightly logs for their venues"
  ON nightly_logs FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Users can insert logs for their organization's venues
CREATE POLICY "Users can create nightly logs for their venues"
  ON nightly_logs FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Users can update logs for their organization's venues
CREATE POLICY "Users can update nightly logs for their venues"
  ON nightly_logs FOR UPDATE
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Highlights policies (inherit from parent log)
CREATE POLICY "Users can view highlights for their logs"
  ON nightly_log_highlights FOR SELECT
  USING (
    nightly_log_id IN (
      SELECT nl.id FROM nightly_logs nl
      JOIN venues v ON v.id = nl.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

CREATE POLICY "Users can manage highlights for their logs"
  ON nightly_log_highlights FOR ALL
  USING (
    nightly_log_id IN (
      SELECT nl.id FROM nightly_logs nl
      JOIN venues v ON v.id = nl.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

SELECT 'Nightly logs tables created successfully' as status;
