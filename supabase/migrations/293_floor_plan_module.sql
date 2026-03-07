-- ============================================================================
-- MIGRATION 293: Floor Plan Module
-- ============================================================================
-- Adds venue sections, tables, and staff-to-section assignments.
-- Replaces hardcoded VENUE_FLOOR_PLANS maps in reservation stats API.
-- Pattern: 1007_sevenrooms_venue_settings.sql
-- ============================================================================

-- ── venue_sections ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venue_sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '#6B7280',
  sr_seating_area TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, name)
);

CREATE INDEX IF NOT EXISTS idx_venue_sections_org ON venue_sections(org_id);
CREATE INDEX IF NOT EXISTS idx_venue_sections_venue ON venue_sections(venue_id);

ALTER TABLE venue_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to venue_sections"
  ON venue_sections FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view venue_sections"
  ON venue_sections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = venue_sections.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON venue_sections TO authenticated;
GRANT ALL ON venue_sections TO service_role;

-- ── venue_tables ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venue_tables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  section_id      UUID REFERENCES venue_sections(id) ON DELETE SET NULL,
  table_number    TEXT NOT NULL,
  max_capacity    INT NOT NULL DEFAULT 4,
  shape           TEXT NOT NULL DEFAULT 'round'
                    CHECK (shape IN ('round','square','rectangle','bar_seat')),
  pos_x           NUMERIC NOT NULL DEFAULT 50,
  pos_y           NUMERIC NOT NULL DEFAULT 50,
  width           NUMERIC NOT NULL DEFAULT 6,
  height          NUMERIC NOT NULL DEFAULT 6,
  rotation        NUMERIC NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, table_number)
);

CREATE INDEX IF NOT EXISTS idx_venue_tables_org ON venue_tables(org_id);
CREATE INDEX IF NOT EXISTS idx_venue_tables_venue ON venue_tables(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_tables_section ON venue_tables(section_id);

ALTER TABLE venue_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to venue_tables"
  ON venue_tables FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view venue_tables"
  ON venue_tables FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = venue_tables.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON venue_tables TO authenticated;
GRANT ALL ON venue_tables TO service_role;

-- ── section_staff_assignments ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS section_staff_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  section_id      UUID NOT NULL REFERENCES venue_sections(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,
  shift_type      TEXT NOT NULL CHECK (shift_type IN ('breakfast','lunch','dinner','late_night')),
  assigned_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, employee_id, business_date, shift_type)
);

CREATE INDEX IF NOT EXISTS idx_section_staff_org ON section_staff_assignments(org_id);
CREATE INDEX IF NOT EXISTS idx_section_staff_venue_date ON section_staff_assignments(venue_id, business_date);
CREATE INDEX IF NOT EXISTS idx_section_staff_section ON section_staff_assignments(section_id);

ALTER TABLE section_staff_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to section_staff_assignments"
  ON section_staff_assignments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view section_staff_assignments"
  ON section_staff_assignments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = section_staff_assignments.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON section_staff_assignments TO authenticated;
GRANT ALL ON section_staff_assignments TO service_role;

SELECT 'Floor plan module tables created (venue_sections, venue_tables, section_staff_assignments)' AS status;
