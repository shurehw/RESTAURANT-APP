-- ============================================================================
-- COMP NOTES
-- Manager notes for individual comps from POS
-- ============================================================================

CREATE TABLE IF NOT EXISTS comp_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  check_id TEXT NOT NULL,  -- TipSee check ID
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date, check_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_notes_venue_date ON comp_notes(venue_id, business_date);

-- RLS
ALTER TABLE comp_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comp notes for their org"
  ON comp_notes FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can insert comp notes for their org"
  ON comp_notes FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can update comp notes for their org"
  ON comp_notes FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

SELECT 'Created comp_notes table' as status;
