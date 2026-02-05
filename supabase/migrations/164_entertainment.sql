-- ============================================================================
-- ENTERTAINMENT - Live music, DJ, and dancer scheduling
-- ============================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE day_of_week AS ENUM ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE entertainment_type AS ENUM ('Band', 'Dancers', 'DJ');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 1. Entertainment Artists (performers and coordinators)
CREATE TABLE IF NOT EXISTS entertainment_artists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE, -- NULL means org-wide
  name TEXT NOT NULL,
  entertainment_type entertainment_type NOT NULL,
  phone TEXT,
  email TEXT,
  is_coordinator BOOLEAN DEFAULT false,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ent_artists_org ON entertainment_artists(organization_id);
CREATE INDEX IF NOT EXISTS idx_ent_artists_venue ON entertainment_artists(venue_id);
CREATE INDEX IF NOT EXISTS idx_ent_artists_type ON entertainment_artists(entertainment_type);

-- 2. Entertainment Rates
CREATE TABLE IF NOT EXISTS entertainment_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE, -- NULL means org-wide
  artist_id UUID REFERENCES entertainment_artists(id) ON DELETE SET NULL,
  entertainment_type entertainment_type NOT NULL,
  description TEXT NOT NULL, -- e.g., "2 hr", "per dancer", "Jazz Night"
  amount NUMERIC(10,2) NOT NULL,
  is_flat_fee BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ent_rates_org ON entertainment_rates(organization_id);
CREATE INDEX IF NOT EXISTS idx_ent_rates_venue ON entertainment_rates(venue_id);
CREATE INDEX IF NOT EXISTS idx_ent_rates_type ON entertainment_rates(entertainment_type);

-- 3. Entertainment Schedule Templates (weekly recurring schedule)
CREATE TABLE IF NOT EXISTS entertainment_schedule_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  day_of_week day_of_week NOT NULL,
  entertainment_type entertainment_type NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  config TEXT NOT NULL, -- e.g., "SOLO", "DUO", "4 PIECE BAND", "2 DANCERS"
  artist_id UUID REFERENCES entertainment_artists(id) ON DELETE SET NULL,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ent_templates_venue ON entertainment_schedule_templates(venue_id);
CREATE INDEX IF NOT EXISTS idx_ent_templates_day ON entertainment_schedule_templates(day_of_week);
CREATE INDEX IF NOT EXISTS idx_ent_templates_type ON entertainment_schedule_templates(entertainment_type);

-- 4. Entertainment Bookings (actual scheduled performances for specific dates)
CREATE TABLE IF NOT EXISTS entertainment_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  entertainment_type entertainment_type NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  config TEXT NOT NULL,
  artist_id UUID REFERENCES entertainment_artists(id) ON DELETE SET NULL,
  artist_name TEXT, -- Denormalized for when artist not in system
  rate_amount NUMERIC(10,2),
  status TEXT DEFAULT 'confirmed', -- 'confirmed', 'tentative', 'cancelled'
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ent_bookings_venue ON entertainment_bookings(venue_id);
CREATE INDEX IF NOT EXISTS idx_ent_bookings_date ON entertainment_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_ent_bookings_venue_date ON entertainment_bookings(venue_id, booking_date);

-- 5. Updated at triggers
CREATE OR REPLACE FUNCTION update_entertainment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ent_artists_updated_at ON entertainment_artists;
CREATE TRIGGER ent_artists_updated_at
  BEFORE UPDATE ON entertainment_artists
  FOR EACH ROW EXECUTE FUNCTION update_entertainment_timestamp();

DROP TRIGGER IF EXISTS ent_rates_updated_at ON entertainment_rates;
CREATE TRIGGER ent_rates_updated_at
  BEFORE UPDATE ON entertainment_rates
  FOR EACH ROW EXECUTE FUNCTION update_entertainment_timestamp();

DROP TRIGGER IF EXISTS ent_templates_updated_at ON entertainment_schedule_templates;
CREATE TRIGGER ent_templates_updated_at
  BEFORE UPDATE ON entertainment_schedule_templates
  FOR EACH ROW EXECUTE FUNCTION update_entertainment_timestamp();

DROP TRIGGER IF EXISTS ent_bookings_updated_at ON entertainment_bookings;
CREATE TRIGGER ent_bookings_updated_at
  BEFORE UPDATE ON entertainment_bookings
  FOR EACH ROW EXECUTE FUNCTION update_entertainment_timestamp();

-- 6. RLS Policies
ALTER TABLE entertainment_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE entertainment_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE entertainment_schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE entertainment_bookings ENABLE ROW LEVEL SECURITY;

-- Artists policies
CREATE POLICY "Users can view artists in their organization"
  ON entertainment_artists FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can manage artists in their organization"
  ON entertainment_artists FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Rates policies
CREATE POLICY "Users can view rates in their organization"
  ON entertainment_rates FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can manage rates in their organization"
  ON entertainment_rates FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Schedule templates policies
CREATE POLICY "Users can view templates for their venues"
  ON entertainment_schedule_templates FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

CREATE POLICY "Users can manage templates for their venues"
  ON entertainment_schedule_templates FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Bookings policies
CREATE POLICY "Users can view bookings for their venues"
  ON entertainment_bookings FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

CREATE POLICY "Users can manage bookings for their venues"
  ON entertainment_bookings FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

SELECT 'Entertainment tables created successfully' as status;
