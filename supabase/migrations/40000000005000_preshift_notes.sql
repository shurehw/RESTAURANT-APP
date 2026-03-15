-- Preshift notes: manager-authored content for the preshift document
-- One row per venue per business date. Upsert on (venue_id, business_date).

CREATE TABLE preshift_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  venue_id        UUID NOT NULL REFERENCES venues(id),
  business_date   DATE NOT NULL,
  flow_of_service TEXT,
  announcements   TEXT,
  service_notes   TEXT,
  food_notes      TEXT,
  beverage_notes  TEXT,
  company_news    TEXT,
  zone_cleaning   TEXT,
  eightysixed     JSONB DEFAULT '[]'::jsonb,
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, business_date)
);

CREATE INDEX idx_preshift_notes_venue ON preshift_notes(venue_id, business_date);

ALTER TABLE preshift_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON preshift_notes
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE TRIGGER set_preshift_notes_updated_at
  BEFORE UPDATE ON preshift_notes
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
