-- Create entertainment_shift_logs if missing (migration 170 may have failed due to RLS)
CREATE TABLE IF NOT EXISTS entertainment_shift_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  crowd_energy TEXT CHECK (crowd_energy IN ('low', 'moderate', 'high', 'exceptional')),
  entertainment_feedback TEXT,
  would_rebook BOOLEAN,
  type_feedback JSONB DEFAULT '{}',
  total_entertainment_cost NUMERIC(10,2),
  actual_sales NUMERIC(14,2),
  entertainment_pct NUMERIC(5,2),
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_shift_logs_venue_date
  ON entertainment_shift_logs(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_shift_logs_org
  ON entertainment_shift_logs(organization_id, business_date DESC);

ALTER TABLE entertainment_shift_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'entertainment_shift_logs' AND policyname = 'Service role has full access to shift logs') THEN
    CREATE POLICY "Service role has full access to shift logs"
      ON entertainment_shift_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Create culinary_shift_logs if missing
ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS culinary_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS culinary_notes TEXT;

CREATE TABLE IF NOT EXISTS culinary_shift_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  eightysixed_items TEXT[] DEFAULT '{}',
  specials_notes TEXT,
  equipment_issues TEXT,
  prep_notes TEXT,
  waste_notes TEXT,
  vendor_issues TEXT,
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  general_notes TEXT,
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_culinary_logs_venue_date
  ON culinary_shift_logs(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_culinary_logs_org
  ON culinary_shift_logs(organization_id, business_date DESC);

ALTER TABLE culinary_shift_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'culinary_shift_logs' AND policyname = 'Service role has full access to culinary logs') THEN
    CREATE POLICY "Service role has full access to culinary logs"
      ON culinary_shift_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Rate amount on entertainment_bookings
ALTER TABLE entertainment_bookings ADD COLUMN IF NOT EXISTS rate_amount NUMERIC(10,2);

SELECT 'shift_log_tables created' as status;
