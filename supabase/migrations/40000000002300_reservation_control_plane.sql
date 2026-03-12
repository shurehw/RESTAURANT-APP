-- ============================================================================
-- MIGRATION 2300: Reservation Control Plane
-- ============================================================================
-- OpSOS-native reservation data model and access rules engine.
-- Replaces SevenRooms as the system of record for reservations and pacing.
-- External platforms (SR, Resy, OpenTable) become booking inlets.
-- Pattern: 40000000000700_sevenrooms_venue_settings.sql
-- ============================================================================

-- ── reservations ──────────────────────────────────────────────────────────
-- Master reservation record. One row per reservation regardless of source.
-- Deduplication: UNIQUE(venue_id, channel, external_id) prevents double-sync.

CREATE TABLE IF NOT EXISTS reservations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id            UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Guest info
  first_name          TEXT NOT NULL DEFAULT '',
  last_name           TEXT NOT NULL DEFAULT '',
  email               TEXT,
  phone               TEXT,
  party_size          INTEGER NOT NULL DEFAULT 2,

  -- Timing
  business_date       DATE NOT NULL,
  arrival_time        TIME NOT NULL,
  seated_time         TIMESTAMPTZ,
  departed_time       TIMESTAMPTZ,
  expected_duration   INTEGER NOT NULL DEFAULT 90,

  -- Assignment
  table_ids           UUID[] DEFAULT '{}',
  section_id          UUID REFERENCES venue_sections(id) ON DELETE SET NULL,
  server_id           UUID,

  -- Status (enforced state machine)
  status              TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN (
                        'pending', 'confirmed', 'waitlisted',
                        'arrived', 'seated', 'no_show',
                        'cancelled', 'completed'
                      )),

  -- Channel tracking
  channel             TEXT NOT NULL DEFAULT 'direct'
                      CHECK (channel IN (
                        'direct', 'sevenrooms', 'resy', 'opentable',
                        'phone', 'walkin', 'concierge', 'agent'
                      )),
  external_id         TEXT,
  external_channel_id TEXT,

  -- Guest attributes
  is_vip              BOOLEAN NOT NULL DEFAULT false,
  tags                JSONB DEFAULT '[]',
  notes               TEXT,
  client_requests     TEXT,
  min_spend           NUMERIC(10,2),

  -- Booked by
  booked_by           TEXT,
  booked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- POS linkage
  pos_check_ids       TEXT[] DEFAULT '{}',
  actual_spend        NUMERIC(10,2),

  -- Sync metadata
  last_synced_at      TIMESTAMPTZ,
  sync_source         TEXT,

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Deduplication
  CONSTRAINT uq_reservation_external UNIQUE(venue_id, channel, external_id)
);

CREATE INDEX IF NOT EXISTS idx_reservations_venue_date
  ON reservations(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_reservations_status
  ON reservations(venue_id, status)
  WHERE status NOT IN ('cancelled', 'completed', 'no_show');

CREATE INDEX IF NOT EXISTS idx_reservations_org
  ON reservations(org_id);

CREATE INDEX IF NOT EXISTS idx_reservations_external
  ON reservations(channel, external_id);

CREATE INDEX IF NOT EXISTS idx_reservations_table
  ON reservations USING GIN(table_ids);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to reservations"
  ON reservations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view reservations"
  ON reservations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = reservations.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON reservations TO authenticated;
GRANT ALL ON reservations TO service_role;


-- ── reservation_access_rules ──────────────────────────────────────────────
-- Native pacing rules — the enforcement layer.
-- AI can directly modify rules where ai_managed = true.

CREATE TABLE IF NOT EXISTS reservation_access_rules (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id                UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Scope
  name                    TEXT NOT NULL,
  shift_type              TEXT NOT NULL CHECK (shift_type IN ('breakfast', 'lunch', 'dinner', 'late_night', 'brunch')),
  section_id              UUID REFERENCES venue_sections(id) ON DELETE SET NULL,

  -- Time window
  start_time              TIME NOT NULL,
  end_time                TIME NOT NULL,

  -- Pacing limits (enforced ceiling)
  interval_minutes        INTEGER NOT NULL DEFAULT 30,
  max_covers_per_interval INTEGER NOT NULL DEFAULT 20,
  custom_pacing           JSONB DEFAULT '{}',

  -- Party size rules
  min_party_size          INTEGER NOT NULL DEFAULT 1,
  max_party_size          INTEGER NOT NULL DEFAULT 20,

  -- Turn time expectations (party_size_key → minutes)
  turn_times              JSONB DEFAULT '{"2": 90, "4": 90, "6": 105, "8": 120, "-1": 90}',

  -- Channel allocation (covers per interval per channel)
  channel_allocation      JSONB DEFAULT '{}',

  -- Booking policies
  min_spend               NUMERIC(10,2),
  service_charge_pct      NUMERIC(5,2) DEFAULT 0,
  gratuity_pct            NUMERIC(5,2) DEFAULT 0,
  requires_deposit        BOOLEAN DEFAULT false,
  deposit_amount          NUMERIC(10,2),

  -- Schedule: which days this rule applies
  active_days             INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',
  effective_from          DATE,
  effective_until         DATE,

  -- AI control
  ai_managed              BOOLEAN NOT NULL DEFAULT false,
  last_ai_change_at       TIMESTAMPTZ,
  last_ai_change_by       TEXT,

  -- Status
  is_active               BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              UUID,

  CONSTRAINT uq_access_rule UNIQUE(venue_id, name, shift_type)
);

CREATE INDEX IF NOT EXISTS idx_access_rules_venue
  ON reservation_access_rules(venue_id);

CREATE INDEX IF NOT EXISTS idx_access_rules_active
  ON reservation_access_rules(venue_id, is_active)
  WHERE is_active = true;

ALTER TABLE reservation_access_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to reservation_access_rules"
  ON reservation_access_rules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view reservation_access_rules"
  ON reservation_access_rules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = reservation_access_rules.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON reservation_access_rules TO authenticated;
GRANT ALL ON reservation_access_rules TO service_role;


-- ── reservation_events ────────────────────────────────────────────────────
-- Append-only audit log for reservation lifecycle.
-- Pattern: violation_events in enforcement state machine.

CREATE TABLE IF NOT EXISTS reservation_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id      UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL CHECK (event_type IN (
    'created', 'confirmed', 'arrived', 'seated', 'table_assigned',
    'table_changed', 'departed', 'completed', 'cancelled', 'no_show',
    'synced', 'modified', 'pos_linked'
  )),
  from_status         TEXT,
  to_status           TEXT,
  actor_id            UUID,
  actor_type          TEXT DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'ai', 'sync')),
  metadata            JSONB DEFAULT '{}',
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rez_events_reservation
  ON reservation_events(reservation_id);

CREATE INDEX IF NOT EXISTS idx_rez_events_type
  ON reservation_events(event_type);

ALTER TABLE reservation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to reservation_events"
  ON reservation_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view reservation_events"
  ON reservation_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reservations r
      JOIN venues v ON v.id = r.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE r.id = reservation_events.reservation_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON reservation_events TO authenticated;
GRANT ALL ON reservation_events TO service_role;


-- ── access_rule_changes ──────────────────────────────────────────────────
-- Audit trail for pacing rule modifications (manual + AI).

CREATE TABLE IF NOT EXISTS access_rule_changes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id             UUID NOT NULL REFERENCES reservation_access_rules(id) ON DELETE CASCADE,
  change_type         TEXT NOT NULL CHECK (change_type IN ('ai_adjustment', 'manual_override', 'schedule_change', 'creation')),
  field_changed       TEXT NOT NULL,
  old_value           JSONB,
  new_value           JSONB NOT NULL,
  reasoning           TEXT,
  changed_by          UUID,
  changed_by_model    TEXT,
  recommendation_id   UUID REFERENCES pacing_recommendations(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_changes_rule
  ON access_rule_changes(rule_id);

CREATE INDEX IF NOT EXISTS idx_rule_changes_type
  ON access_rule_changes(change_type);

ALTER TABLE access_rule_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to access_rule_changes"
  ON access_rule_changes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view access_rule_changes"
  ON access_rule_changes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reservation_access_rules r
      JOIN venues v ON v.id = r.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE r.id = access_rule_changes.rule_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON access_rule_changes TO authenticated;
GRANT ALL ON access_rule_changes TO service_role;


SELECT 'Reservation control plane created (reservations, reservation_access_rules, reservation_events, access_rule_changes)' AS status;
