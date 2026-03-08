-- Migration 295: Shift Table Splits
-- Dynamic per-shift table assignments — replaces static section-based assignments.
-- Tables are auto-split into N groups based on scheduled server count + spatial proximity.

SET ROLE postgres;

CREATE TABLE IF NOT EXISTS shift_table_splits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  shift_type    TEXT NOT NULL CHECK (shift_type IN ('breakfast','lunch','dinner','late_night')),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  table_ids     UUID[] NOT NULL,
  section_label TEXT NOT NULL DEFAULT 'Section',
  section_color TEXT NOT NULL DEFAULT '#6B7280',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, business_date, shift_type, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_shift_splits_lookup
  ON shift_table_splits(venue_id, business_date, shift_type);
CREATE INDEX IF NOT EXISTS idx_shift_splits_org
  ON shift_table_splits(org_id);

ALTER TABLE shift_table_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to shift_table_splits"
  ON shift_table_splits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view shift_table_splits"
  ON shift_table_splits FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN org_users ou ON ou.org_id = v.org_id
      WHERE v.id = shift_table_splits.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON shift_table_splits TO authenticated;
GRANT ALL ON shift_table_splits TO service_role;

SELECT 'shift_table_splits table created' AS status;
