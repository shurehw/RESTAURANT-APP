-- ═══════════════════════════════════════════════════════════════════════
-- 40000000003300: Server Section Assignments + Seating Suggestions
-- ═══════════════════════════════════════════════════════════════════════

-- ── server_section_assignments ─────────────────────────────────────────
-- Maps a server (employee) to a floor section for a given service date.
-- Auto-populated from the schedule (Server positions → sections round-robin).
-- Host can override individual assignments during service.

CREATE TABLE IF NOT EXISTS server_section_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL,
  venue_id           UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date      DATE NOT NULL,
  section_id         UUID NOT NULL REFERENCES venue_sections(id) ON DELETE CASCADE,
  employee_id        UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One server per section per date
  UNIQUE(venue_id, business_date, section_id)
);

CREATE INDEX IF NOT EXISTS idx_server_sections_venue_date
  ON server_section_assignments(venue_id, business_date);

ALTER TABLE server_section_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on server_section_assignments"
  ON server_section_assignments FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Auth users can view server_section_assignments"
  ON server_section_assignments FOR SELECT
  TO authenticated USING (true);

-- ── seating_suggestions ─────────────────────────────────────────────────
-- Audit trail for AI-generated table seating suggestions.
-- Tracks which suggestions were accepted, overridden, dismissed, or expired.
-- Powers the "suggestion not followed" loop for model improvement.

CREATE TABLE IF NOT EXISTS seating_suggestions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL,
  venue_id             UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date        DATE NOT NULL,

  -- What triggered the suggestion
  trigger              TEXT NOT NULL CHECK (trigger IN ('arrived', 'table_opened')),

  -- The reservation this suggestion was for
  reservation_id       UUID REFERENCES reservations(id) ON DELETE SET NULL,
  guest_name           TEXT,
  party_size           INTEGER,

  -- The suggested table
  suggested_table_id   UUID REFERENCES venue_tables(id) ON DELETE SET NULL,
  suggested_table_number TEXT,
  suggested_section_id UUID REFERENCES venue_sections(id) ON DELETE SET NULL,
  score                NUMERIC(6,3),
  reason               TEXT,

  -- Outcome
  outcome              TEXT CHECK (outcome IN ('accepted', 'overridden', 'dismissed', 'expired')),
  actual_table_id      UUID REFERENCES venue_tables(id) ON DELETE SET NULL,
  actual_table_number  TEXT,

  -- Timing
  suggested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ,

  -- Auto-expire after 90 seconds if not acted on
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 seconds')
);

CREATE INDEX IF NOT EXISTS idx_seating_suggestions_venue_date
  ON seating_suggestions(venue_id, business_date);

CREATE INDEX IF NOT EXISTS idx_seating_suggestions_reservation
  ON seating_suggestions(reservation_id) WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seating_suggestions_open
  ON seating_suggestions(venue_id, business_date)
  WHERE outcome IS NULL;

ALTER TABLE seating_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on seating_suggestions"
  ON seating_suggestions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Auth users can view seating_suggestions"
  ON seating_suggestions FOR SELECT
  TO authenticated USING (true);
