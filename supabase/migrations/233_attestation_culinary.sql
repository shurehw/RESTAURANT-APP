-- 233: Add culinary attestation step
-- Culinary tags + notes on attestation, plus chef's nightly kitchen log

-- 1. Attestation columns for manager tags/notes
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS culinary_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS culinary_notes TEXT;

-- 2. Chef's nightly kitchen log (filled independently by BOH)
CREATE TABLE IF NOT EXISTS culinary_shift_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- 86'd items (array of item names that ran out)
  eightysixed_items TEXT[] DEFAULT '{}',

  -- Specials performance
  specials_notes TEXT,

  -- Kitchen operations
  equipment_issues TEXT,
  prep_notes TEXT,          -- prep notes for next service
  waste_notes TEXT,
  vendor_issues TEXT,

  -- Overall assessment
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  general_notes TEXT,

  -- Metadata
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_culinary_logs_venue_date
  ON culinary_shift_logs(venue_id, business_date DESC);

CREATE INDEX IF NOT EXISTS idx_culinary_logs_org
  ON culinary_shift_logs(organization_id, business_date DESC);

-- RLS Policies
ALTER TABLE culinary_shift_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org culinary logs"
  ON culinary_shift_logs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert culinary logs for their org"
  ON culinary_shift_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their org culinary logs"
  ON culinary_shift_logs FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to culinary logs"
  ON culinary_shift_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_culinary_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS culinary_log_updated_at ON culinary_shift_logs;
CREATE TRIGGER culinary_log_updated_at
  BEFORE UPDATE ON culinary_shift_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_culinary_log_timestamp();
