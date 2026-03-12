-- ============================================================================
-- MIGRATION 2800: Service Notes
-- ============================================================================
-- Operational notes tied to a table, reservation, or shift context.
-- "Service notes" capture information relevant to tonight's service only.
-- "Guest notes" are also logged here as an audit trail when written back to SR.
-- Pattern: 40000000002400_live_floor_management.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,

  -- Context (at least one should be set)
  table_id        UUID REFERENCES venue_tables(id) ON DELETE SET NULL,
  reservation_id  UUID REFERENCES reservations(id) ON DELETE SET NULL,

  -- Note content
  note_type       TEXT NOT NULL DEFAULT 'service'
                  CHECK (note_type IN ('service', 'guest')),
  note_text       TEXT NOT NULL,

  -- SR write-back tracking (for guest notes)
  sr_write_status TEXT CHECK (sr_write_status IN ('pending', 'success', 'failed', 'unsupported')),
  sr_error        TEXT,

  -- Author
  author_id       UUID,
  author_name     TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_service_notes_venue_date
  ON service_notes(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_service_notes_table
  ON service_notes(table_id, business_date)
  WHERE table_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_notes_reservation
  ON service_notes(reservation_id)
  WHERE reservation_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE service_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to service_notes"
  ON service_notes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view service_notes"
  ON service_notes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = service_notes.venue_id
        AND ou.user_id = auth.uid()
    )
  );

-- ── Grants ──────────────────────────────────────────────────────────────────

GRANT SELECT ON service_notes TO authenticated;
GRANT ALL ON service_notes TO service_role;
