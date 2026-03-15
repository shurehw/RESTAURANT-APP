-- Manager email notes: parsed from Lightspeed/Wynn nightly digest emails
-- Used to generate structured narratives for the nightly report

CREATE TABLE IF NOT EXISTS manager_email_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  business_date DATE NOT NULL,
  org_id UUID NOT NULL,

  -- Source tracking
  source_email TEXT NOT NULL,
  source_subject TEXT,
  email_message_id TEXT,
  received_at TIMESTAMPTZ,

  -- Raw parsed sections (flexible across email formats)
  raw_sections JSONB NOT NULL DEFAULT '{}',

  -- AI-generated structured narrative (same format as attestation closing_narrative)
  closing_narrative TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, business_date, email_message_id)
);

CREATE INDEX idx_manager_email_notes_lookup
  ON manager_email_notes(venue_id, business_date);

ALTER TABLE manager_email_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON manager_email_notes
  FOR ALL USING (true) WITH CHECK (true);
