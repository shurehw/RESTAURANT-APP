-- ============================================================================
-- MIGRATION 279: Tripleseat Event Integration
-- ============================================================================
-- Stores Tripleseat event/booking data to:
-- 1. Auto-flag buyout/private event days as forecast anomalies
-- 2. Provide revenue floor from guaranteed minimums
-- 3. Feed event calendar into forecast model
-- ============================================================================

-- ── Tripleseat API config (org-level, not per-venue) ─────────────────────
CREATE TABLE IF NOT EXISTS tripleseat_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- OAuth 2.0 credentials
  client_id TEXT NOT NULL,
  client_secret_encrypted TEXT NOT NULL,

  -- Webhook verification
  webhook_signing_key TEXT NOT NULL,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT CHECK (last_sync_status IN ('success', 'error', 'partial')),

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tripleseat_org UNIQUE(org_id)
);

ALTER TABLE tripleseat_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on tripleseat_config"
  ON tripleseat_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON tripleseat_config TO service_role;

-- ── Venue-to-Tripleseat site mapping ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tripleseat_venue_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tripleseat_site_id TEXT NOT NULL,
  tripleseat_site_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tripleseat_venue UNIQUE(venue_id),
  CONSTRAINT uq_tripleseat_site UNIQUE(tripleseat_site_id)
);

CREATE INDEX IF NOT EXISTS idx_tripleseat_venue_mapping_site
  ON tripleseat_venue_mapping(tripleseat_site_id) WHERE is_active = true;

ALTER TABLE tripleseat_venue_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on tripleseat_venue_mapping"
  ON tripleseat_venue_mapping FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can view tripleseat_venue_mapping"
  ON tripleseat_venue_mapping FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = tripleseat_venue_mapping.venue_id AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON tripleseat_venue_mapping TO authenticated;
GRANT ALL ON tripleseat_venue_mapping TO service_role;

-- ── Tripleseat events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tripleseat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Tripleseat identifiers
  tripleseat_event_id BIGINT NOT NULL,
  tripleseat_booking_id BIGINT,

  -- Event details
  event_name TEXT,
  event_type TEXT,                        -- buyout, private_event, semi_private, reception, etc.
  status TEXT NOT NULL DEFAULT 'prospect', -- prospect, tentative, definite, closed, cancelled, lost

  -- Timing
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,

  -- Revenue
  guest_count INTEGER,
  guaranteed_count INTEGER,
  food_minimum NUMERIC(14,2),
  beverage_minimum NUMERIC(14,2),
  total_minimum NUMERIC(14,2),
  estimated_revenue NUMERIC(14,2),

  -- Space
  room_name TEXT,
  is_buyout BOOLEAN NOT NULL DEFAULT false,

  -- Contact
  contact_name TEXT,
  contact_email TEXT,

  -- Metadata
  raw_payload JSONB,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tripleseat_event UNIQUE(tripleseat_event_id)
);

CREATE INDEX IF NOT EXISTS idx_tripleseat_events_venue_date
  ON tripleseat_events(venue_id, event_date);

CREATE INDEX IF NOT EXISTS idx_tripleseat_events_date
  ON tripleseat_events(event_date) WHERE status IN ('definite', 'tentative');

CREATE INDEX IF NOT EXISTS idx_tripleseat_events_status
  ON tripleseat_events(status);

ALTER TABLE tripleseat_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on tripleseat_events"
  ON tripleseat_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can view tripleseat_events"
  ON tripleseat_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = tripleseat_events.venue_id AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON tripleseat_events TO authenticated;
GRANT ALL ON tripleseat_events TO service_role;

-- ── Extend detection_method constraint to include tripleseat_event ──────
ALTER TABLE venue_day_anomalies DROP CONSTRAINT IF EXISTS venue_day_anomalies_detection_method_check;
ALTER TABLE venue_day_anomalies ADD CONSTRAINT venue_day_anomalies_detection_method_check
  CHECK (detection_method IN ('auto_threshold', 'manual', 'tripleseat_event'));

-- ── Auto-flag anomalies from confirmed events ───────────────────────────
-- This function runs after tripleseat_events inserts/updates
-- to auto-create forecast anomalies for buyouts and large private events
CREATE OR REPLACE FUNCTION auto_flag_event_anomalies()
RETURNS TRIGGER AS $$
BEGIN
  -- Only flag definite or tentative events
  IF NEW.status NOT IN ('definite', 'tentative') THEN
    RETURN NEW;
  END IF;

  -- Flag buyouts
  IF NEW.is_buyout = true THEN
    INSERT INTO venue_day_anomalies (
      venue_id, business_date, anomaly_type, detection_method,
      expected_covers, notes, flagged_by
    ) VALUES (
      NEW.venue_id,
      NEW.event_date,
      'buyout',
      'tripleseat_event',
      NEW.guest_count,
      format('Tripleseat buyout: %s (guests: %s, min: $%s)',
        COALESCE(NEW.event_name, 'Unnamed'),
        COALESCE(NEW.guest_count::text, '?'),
        COALESCE(NEW.total_minimum::text, '?')),
      'system'
    )
    ON CONFLICT (venue_id, business_date) DO UPDATE SET
      anomaly_type = 'buyout',
      notes = EXCLUDED.notes,
      resolved_at = NULL;

  -- Flag large private events (75+ guests or $5K+ minimum)
  ELSIF (COALESCE(NEW.guest_count, 0) >= 75
      OR COALESCE(NEW.food_minimum, 0) >= 5000
      OR COALESCE(NEW.estimated_revenue, 0) >= 10000) THEN
    INSERT INTO venue_day_anomalies (
      venue_id, business_date, anomaly_type, detection_method,
      expected_covers, notes, flagged_by
    ) VALUES (
      NEW.venue_id,
      NEW.event_date,
      'private_event',
      'tripleseat_event',
      NEW.guest_count,
      format('Tripleseat event: %s (guests: %s, min: $%s, rev: $%s)',
        COALESCE(NEW.event_name, 'Unnamed'),
        COALESCE(NEW.guest_count::text, '?'),
        COALESCE(NEW.food_minimum::text, '?'),
        COALESCE(NEW.estimated_revenue::text, '?')),
      'system'
    )
    ON CONFLICT (venue_id, business_date) DO UPDATE SET
      anomaly_type = CASE
        WHEN venue_day_anomalies.anomaly_type = 'buyout' THEN 'buyout'
        ELSE 'private_event'
      END,
      notes = EXCLUDED.notes,
      resolved_at = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_tripleseat_auto_anomaly
  AFTER INSERT OR UPDATE ON tripleseat_events
  FOR EACH ROW
  EXECUTE FUNCTION auto_flag_event_anomalies();

SELECT 'Tripleseat integration tables created' AS status;

-- ── Seed venue mappings ──────────────────────────────────────────────────
-- Tripleseat location_id → OpSOS venue_id
DO $$
DECLARE
  v_mapping RECORD;
BEGIN
  FOR v_mapping IN
    SELECT * FROM (VALUES
      ('Delilah LA',       '7043', '11111111-1111-1111-1111-111111111111'),
      ('Didi',             '7044', 'c6776476-44c5-454b-9765-29f3737e3776'),
      ('Poppy',            '7045', 'a2f9d28d-8dde-4b57-8013-2c94602fe078'),
      ('Nice Guy',         '7047', '22222222-2222-2222-2222-222222222222'),
      ('Harriets WHo',     '7050', '98be7b04-918e-4e08-8d7a-fce8fe854d3c'),
      ('Bird Streets',     '21706', 'a7da18a4-a70b-4492-abed-c9fed5851c9e'),
      ('Delilah Miami',    '25807', '288b7f22-ffdc-4701-a396-a6b415aff0f1'),
      ('Keys',             '27845', 'f9fb757b-e2dc-4c16-835d-9de80f983073'),
      ('Delilah Dallas',   '33898', '79c33e6a-eb21-419f-9606-7494d1a9584c')
    ) AS t(name, ts_site_id, venue_id)
  LOOP
    INSERT INTO tripleseat_venue_mapping (
      venue_id, tripleseat_site_id, tripleseat_site_name, is_active
    ) VALUES (
      v_mapping.venue_id::uuid,
      v_mapping.ts_site_id,
      v_mapping.name,
      true
    ) ON CONFLICT ON CONSTRAINT uq_tripleseat_venue DO UPDATE SET
      tripleseat_site_id = EXCLUDED.tripleseat_site_id,
      tripleseat_site_name = EXCLUDED.tripleseat_site_name,
      updated_at = NOW();
  END LOOP;
END $$;

SELECT 'Tripleseat venue mappings seeded' AS status;
