-- ============================================================================
-- ENTERTAINMENT SHIFT LOGS
-- Manager feedback on nightly entertainment performance
-- ============================================================================

-- Create the shift logs table
CREATE TABLE IF NOT EXISTS entertainment_shift_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,

  -- Manager feedback
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  crowd_energy TEXT CHECK (crowd_energy IN ('low', 'moderate', 'high', 'exceptional')),
  entertainment_feedback TEXT,
  would_rebook BOOLEAN,

  -- Specifics per entertainment type (JSONB for flexibility)
  -- e.g., {"Band": {"rating": 4, "notes": "Great energy", "performer": "Ryan Cross Trio"}}
  type_feedback JSONB DEFAULT '{}',

  -- Financial summary (denormalized for quick access)
  total_entertainment_cost NUMERIC(10,2),
  actual_sales NUMERIC(14,2),
  entertainment_pct NUMERIC(5,2),

  -- Metadata
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shift_logs_venue_date
  ON entertainment_shift_logs(venue_id, business_date DESC);

CREATE INDEX IF NOT EXISTS idx_shift_logs_org
  ON entertainment_shift_logs(organization_id, business_date DESC);

-- RLS Policies
ALTER TABLE entertainment_shift_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's shift logs"
  ON entertainment_shift_logs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert shift logs for their org"
  ON entertainment_shift_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their org's shift logs"
  ON entertainment_shift_logs FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to shift logs"
  ON entertainment_shift_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_shift_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shift_log_updated_at ON entertainment_shift_logs;
CREATE TRIGGER shift_log_updated_at
  BEFORE UPDATE ON entertainment_shift_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_shift_log_timestamp();

-- Add rate_amount column to entertainment_schedule if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'entertainment_schedule'
  ) THEN
    ALTER TABLE entertainment_schedule
    ADD COLUMN IF NOT EXISTS rate_amount NUMERIC(10,2);

    COMMENT ON COLUMN entertainment_schedule.rate_amount IS
      'Cost/rate for this entertainment entry';
  END IF;
END $$;

-- Add rate_amount to entertainment_bookings if not exists
ALTER TABLE entertainment_bookings
ADD COLUMN IF NOT EXISTS rate_amount NUMERIC(10,2);

COMMENT ON COLUMN entertainment_bookings.rate_amount IS
  'Actual cost paid for this booking';

SELECT 'Created entertainment_shift_logs table and added rate columns' as status;
