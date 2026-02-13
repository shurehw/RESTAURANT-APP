-- ============================================================================
-- CAMERA-BASED TABLE GREETING DETECTION
-- Measures time from guest seating to first server greeting using
-- UniFi Protect camera snapshots + Claude Vision person detection.
--
-- Architecture: Pull snapshots via Cloud Connector → detect persons via
-- Claude Vision → check overlap with custom-defined polygons (seat zone /
-- approach zone) → correlate events → compute greeting time.
--
-- We own the entire detection pipeline. UniFi provides snapshots only.
-- ============================================================================

-- ============================================================================
-- 1. CAMERA CONFIGS — Per-venue camera registration
-- ============================================================================

CREATE TABLE IF NOT EXISTS camera_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- UniFi Protect identifiers
  camera_id TEXT NOT NULL,
  camera_name TEXT,
  host_id TEXT NOT NULL,

  -- Snapshot dimensions (populated on first successful snapshot)
  snapshot_width INT,
  snapshot_height INT,

  -- Polling state
  last_polled_at TIMESTAMPTZ,
  last_snapshot_hash TEXT,

  -- Service hours (only poll during these hours, venue local time)
  service_start_hour INT NOT NULL DEFAULT 11,
  service_end_hour INT NOT NULL DEFAULT 3,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_camera_config UNIQUE (venue_id, camera_id)
);

CREATE INDEX IF NOT EXISTS idx_camera_configs_venue
  ON camera_configs(venue_id) WHERE is_active = TRUE;

-- ============================================================================
-- 2. TABLE ZONES — Custom polygons mapped to physical tables
-- Polygons are defined in normalized coordinates (0.0-1.0) relative to
-- snapshot dimensions, so they survive resolution changes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS table_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  camera_config_id UUID NOT NULL REFERENCES camera_configs(id) ON DELETE CASCADE,

  -- Physical table identifier (e.g., "T12", "Bar-3", "Patio-7")
  table_name TEXT NOT NULL,

  -- Zone classification: 'seat' (where guests sit) or 'approach' (server path)
  zone_type TEXT NOT NULL CHECK (zone_type IN ('seat', 'approach')),

  -- Polygon vertices as array of [x, y] normalized coords (0.0-1.0)
  -- e.g., [[0.1, 0.2], [0.3, 0.2], [0.3, 0.5], [0.1, 0.5]]
  polygon JSONB NOT NULL,

  -- Human-readable label for the zone (shown in UI/prompts)
  label TEXT,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_table_zone_type UNIQUE (camera_config_id, table_name, zone_type)
);

CREATE INDEX IF NOT EXISTS idx_table_zones_venue
  ON table_zones(venue_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_table_zones_camera
  ON table_zones(camera_config_id, zone_type) WHERE is_active = TRUE;

-- ============================================================================
-- 3. ZONE EVENTS — Our own detection events from snapshot analysis
-- Not UniFi events. We emit these after running person detection on snapshots.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zone_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  camera_config_id UUID NOT NULL REFERENCES camera_configs(id) ON DELETE CASCADE,
  table_zone_id UUID NOT NULL REFERENCES table_zones(id) ON DELETE CASCADE,

  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'seat_zone_occupied',
    'seat_zone_vacated',
    'approach_zone_staff_present',
    'approach_zone_cleared'
  )),

  -- Detection details
  person_count INT NOT NULL DEFAULT 0,
  confidence NUMERIC(4,3),
  detected_at TIMESTAMPTZ NOT NULL,

  -- Snapshot reference (for debugging / audit)
  snapshot_hash TEXT,

  -- Raw Claude Vision response for this zone
  raw_detection JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zone_events_venue_detected
  ON zone_events(venue_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_zone_events_zone_detected
  ON zone_events(table_zone_id, detected_at DESC);

-- ============================================================================
-- 4. GREETING METRICS — Computed seating → greeting times
-- ============================================================================

CREATE TABLE IF NOT EXISTS greeting_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Table identification
  table_name TEXT NOT NULL,
  business_date DATE NOT NULL,

  -- Timing
  seated_at TIMESTAMPTZ NOT NULL,
  greeted_at TIMESTAMPTZ,
  greeting_time_seconds INT,

  -- Event references
  seated_event_id UUID NOT NULL REFERENCES zone_events(id),
  greeted_event_id UUID REFERENCES zone_events(id),

  -- Zone references
  seat_zone_id UUID NOT NULL REFERENCES table_zones(id),
  approach_zone_id UUID REFERENCES table_zones(id),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'greeted', 'expired', 'no_greeting')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_greeting_metrics_venue_date
  ON greeting_metrics(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_greeting_metrics_waiting
  ON greeting_metrics(venue_id, status)
  WHERE status = 'waiting';

-- ============================================================================
-- 5. GREETING SETTINGS — Per-venue thresholds and detection config
-- ============================================================================

CREATE TABLE IF NOT EXISTS greeting_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Greeting time thresholds (seconds)
  target_greeting_seconds INT NOT NULL DEFAULT 30,
  warning_greeting_seconds INT NOT NULL DEFAULT 60,
  critical_greeting_seconds INT NOT NULL DEFAULT 120,

  -- Stop tracking a seating after this many seconds with no greeting
  expire_after_seconds INT NOT NULL DEFAULT 600,

  -- Polling configuration
  polling_interval_seconds INT NOT NULL DEFAULT 5,

  -- Scene change sensitivity: 0.0 (always analyze) to 1.0 (skip unless very different)
  -- Used to skip Claude Vision calls when frame hasn't changed much
  scene_change_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.15,

  -- AI model for vision detection
  vision_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
  vision_max_tokens INT NOT NULL DEFAULT 1024,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_greeting_settings_venue UNIQUE (venue_id)
);

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE camera_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE zone_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE greeting_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE greeting_settings ENABLE ROW LEVEL SECURITY;

-- Users can view data for their org's venues
CREATE POLICY "Users can view camera configs for their venues"
  ON camera_configs FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

CREATE POLICY "Users can view table zones for their venues"
  ON table_zones FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

CREATE POLICY "Users can view zone events for their venues"
  ON zone_events FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

CREATE POLICY "Users can view greeting metrics for their venues"
  ON greeting_metrics FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

CREATE POLICY "Users can view greeting settings for their venues"
  ON greeting_settings FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Org admins can manage settings and configs
CREATE POLICY "Org admins can manage camera configs"
  ON camera_configs FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        AND ou.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Org admins can manage table zones"
  ON table_zones FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        AND ou.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Org admins can manage greeting settings"
  ON greeting_settings FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        AND ou.role IN ('admin', 'owner')
    )
  );

-- Service role has full access (for polling service, event ingestion)
CREATE POLICY "Service role full access camera_configs"
  ON camera_configs FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access table_zones"
  ON table_zones FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access zone_events"
  ON zone_events FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access greeting_metrics"
  ON greeting_metrics FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access greeting_settings"
  ON greeting_settings FOR ALL TO service_role USING (true);

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE camera_configs IS 'Per-venue UniFi Protect camera registration. Snapshots pulled via Cloud Connector.';
COMMENT ON TABLE table_zones IS 'Custom polygon zones mapped to physical tables. Normalized coords (0-1). Seat zones detect guests, approach zones detect staff.';
COMMENT ON TABLE zone_events IS 'Detection events emitted by our own vision pipeline (Claude Vision on snapshots). Not UniFi events.';
COMMENT ON TABLE greeting_metrics IS 'Computed seating-to-greeting times from zone event correlation.';
COMMENT ON TABLE greeting_settings IS 'Per-venue greeting detection thresholds, polling config, and vision model settings.';
