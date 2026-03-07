-- ============================================================================
-- MIGRATION 294: Floor Plan Enhancements
-- ============================================================================
-- Adds min_capacity to venue_tables, expands shape options,
-- and creates venue_labels for canvas text annotations.
-- ============================================================================

-- ── Add min_capacity to venue_tables ──────────────────────────────────────────

ALTER TABLE venue_tables ADD COLUMN IF NOT EXISTS min_capacity INT NOT NULL DEFAULT 1;

-- Drop old shape constraint and re-create with new options
ALTER TABLE venue_tables DROP CONSTRAINT IF EXISTS venue_tables_shape_check;
ALTER TABLE venue_tables ADD CONSTRAINT venue_tables_shape_check
  CHECK (shape IN ('round','square','rectangle','bar_seat','booth','oval'));

-- Add min/max capacity validation
DO $$ BEGIN
  ALTER TABLE venue_tables ADD CONSTRAINT chk_min_max_capacity
    CHECK (min_capacity >= 1 AND min_capacity <= max_capacity);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── venue_labels ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venue_labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id   UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  pos_x      NUMERIC NOT NULL DEFAULT 50,
  pos_y      NUMERIC NOT NULL DEFAULT 50,
  font_size  NUMERIC NOT NULL DEFAULT 14,
  rotation   NUMERIC NOT NULL DEFAULT 0,
  color      TEXT NOT NULL DEFAULT '#FFFFFF',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_labels_org ON venue_labels(org_id);
CREATE INDEX IF NOT EXISTS idx_venue_labels_venue ON venue_labels(venue_id);

ALTER TABLE venue_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to venue_labels"
  ON venue_labels FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view venue_labels"
  ON venue_labels FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = venue_labels.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON venue_labels TO authenticated;
GRANT ALL ON venue_labels TO service_role;

SELECT 'Floor plan enhancements applied (min_capacity, expanded shapes, venue_labels)' AS status;
