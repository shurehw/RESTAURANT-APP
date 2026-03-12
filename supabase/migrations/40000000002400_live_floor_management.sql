-- ============================================================================
-- MIGRATION 2400: Live Floor Management
-- ============================================================================
-- Table status state machine + waitlist for live service floor management.
-- Turns the floor plan canvas into a real-time operational surface.
-- Pattern: 40000000002300_reservation_control_plane.sql
-- ============================================================================

-- ── table_status ──────────────────────────────────────────────────────────
-- Live state per table per business date.
-- One row per (venue, table, date). Reset daily.

CREATE TABLE IF NOT EXISTS table_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  table_id        UUID NOT NULL REFERENCES venue_tables(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,

  -- State machine
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN (
                    'available', 'reserved', 'seated', 'occupied',
                    'check_dropped', 'bussing', 'blocked'
                  )),

  -- Current occupant
  reservation_id  UUID REFERENCES reservations(id) ON DELETE SET NULL,
  party_size      INTEGER,
  seated_at       TIMESTAMPTZ,
  expected_clear  TIMESTAMPTZ,

  -- POS linkage
  pos_check_id    TEXT,
  current_spend   NUMERIC(10,2) DEFAULT 0,

  -- Turn tracking
  turn_number     INTEGER DEFAULT 0,

  -- Timing
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID,

  CONSTRAINT uq_table_status UNIQUE(venue_id, table_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_table_status_venue_date
  ON table_status(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_table_status_active
  ON table_status(venue_id, business_date, status)
  WHERE status NOT IN ('available');

ALTER TABLE table_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to table_status"
  ON table_status FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view table_status"
  ON table_status FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = table_status.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON table_status TO authenticated;
GRANT ALL ON table_status TO service_role;


-- ── table_status_events ───────────────────────────────────────────────────
-- Append-only log of table state transitions. For turn time analysis
-- and operational replay.

CREATE TABLE IF NOT EXISTS table_status_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_status_id UUID NOT NULL REFERENCES table_status(id) ON DELETE CASCADE,
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  table_id        UUID NOT NULL REFERENCES venue_tables(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'reserved', 'seated', 'occupied', 'check_dropped',
    'bussing', 'cleared', 'blocked', 'unblocked'
  )),
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  reservation_id  UUID,
  party_size      INTEGER,
  pos_check_id    TEXT,
  actor_type      TEXT DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'pos_auto')),
  actor_id        UUID,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_events_venue_date
  ON table_status_events(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_table_events_table
  ON table_status_events(table_id, business_date);

ALTER TABLE table_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to table_status_events"
  ON table_status_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view table_status_events"
  ON table_status_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = table_status_events.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON table_status_events TO authenticated;
GRANT ALL ON table_status_events TO service_role;


-- ── waitlist_entries ──────────────────────────────────────────────────────
-- Walk-in queue management.

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id            UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date       DATE NOT NULL,

  -- Guest info
  guest_name          TEXT NOT NULL,
  party_size          INTEGER NOT NULL DEFAULT 2,
  phone               TEXT,

  -- Queue
  added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  estimated_wait      INTEGER,
  quoted_wait         INTEGER,

  -- Status
  status              TEXT NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting', 'notified', 'seated', 'left', 'cancelled')),
  seated_at           TIMESTAMPTZ,
  reservation_id      UUID REFERENCES reservations(id) ON DELETE SET NULL,

  -- Preferences
  notes               TEXT,
  seating_preference  TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_venue_date
  ON waitlist_entries(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_waitlist_active
  ON waitlist_entries(venue_id, business_date, status)
  WHERE status IN ('waiting', 'notified');

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to waitlist_entries"
  ON waitlist_entries FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view waitlist_entries"
  ON waitlist_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = waitlist_entries.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON waitlist_entries TO authenticated;
GRANT ALL ON waitlist_entries TO service_role;


SELECT 'Live floor management created (table_status, table_status_events, waitlist_entries)' AS status;
