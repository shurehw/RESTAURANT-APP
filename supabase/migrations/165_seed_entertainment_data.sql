-- ============================================================================
-- SEED ENTERTAINMENT DATA from Excel calendar
-- This populates initial schedule templates, artists, and rates
-- ============================================================================

-- Helper function to get venue_id by name pattern
CREATE OR REPLACE FUNCTION get_venue_id_by_name(venue_pattern TEXT)
RETURNS UUID AS $$
  SELECT id FROM venues WHERE name ILIKE '%' || venue_pattern || '%' LIMIT 1;
$$ LANGUAGE SQL;

-- Helper function to get organization_id for a venue
CREATE OR REPLACE FUNCTION get_org_for_venue(v_id UUID)
RETURNS UUID AS $$
  SELECT organization_id FROM venues WHERE id = v_id;
$$ LANGUAGE SQL;

-- ============================================================================
-- THE NICE GUY
-- ============================================================================
DO $$
DECLARE
  v_venue_id UUID;
  v_org_id UUID;
  v_nikki_id UUID;
BEGIN
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Nice Guy%' LIMIT 1;
  IF v_venue_id IS NULL THEN
    RAISE NOTICE 'The Nice Guy venue not found, skipping...';
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id FROM venues WHERE id = v_venue_id;

  -- Insert artist
  INSERT INTO entertainment_artists (organization_id, venue_id, name, entertainment_type, phone, is_coordinator, notes)
  VALUES (v_org_id, v_venue_id, 'Nikki Bove', 'Band', '302 230 6831', true, 'Band coordinator')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_nikki_id;

  -- Insert rates
  INSERT INTO entertainment_rates (organization_id, venue_id, entertainment_type, description, amount, is_flat_fee)
  VALUES
    (v_org_id, v_venue_id, 'Band', 'Duo Martini Monday', 600, true),
    (v_org_id, v_venue_id, 'Band', 'Solo Thu', 200, true),
    (v_org_id, v_venue_id, 'Band', 'Duo Wed/Fri/Sat', 350, true)
  ON CONFLICT DO NOTHING;

  -- Insert schedule templates
  INSERT INTO entertainment_schedule_templates (venue_id, day_of_week, entertainment_type, time_start, time_end, config, notes)
  VALUES
    (v_venue_id, 'Mon', 'Band', '19:00', '21:00', 'DUO', 'Martini Monday'),
    (v_venue_id, 'Wed', 'Band', '19:30', '21:30', 'DUO', NULL),
    (v_venue_id, 'Thu', 'Band', '19:30', '21:30', 'SOLO', NULL),
    (v_venue_id, 'Fri', 'Band', '19:30', '21:30', 'DUO', NULL),
    (v_venue_id, 'Fri', 'DJ', '22:00', '00:00', 'DJ', NULL),
    (v_venue_id, 'Sat', 'Band', '19:30', '21:30', 'DUO', NULL),
    (v_venue_id, 'Sat', 'DJ', '22:00', '00:00', 'DJ', NULL)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'The Nice Guy entertainment data seeded';
END $$;

-- ============================================================================
-- DELILAH LA
-- ============================================================================
DO $$
DECLARE
  v_venue_id UUID;
  v_org_id UUID;
BEGIN
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Delilah%' AND (name ILIKE '%LA%' OR name NOT ILIKE '%Miami%' AND name NOT ILIKE '%Dallas%') LIMIT 1;
  IF v_venue_id IS NULL THEN
    RAISE NOTICE 'Delilah LA venue not found, skipping...';
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id FROM venues WHERE id = v_venue_id;

  -- Insert artists
  INSERT INTO entertainment_artists (organization_id, venue_id, name, entertainment_type, phone, is_coordinator, notes)
  VALUES
    (v_org_id, v_venue_id, 'Ryan Cross', 'Band', '213 923 1373', true, 'Band coordinator'),
    (v_org_id, v_venue_id, 'Luciana Mancari', 'Band', '708 790 2392', false, 'Wednesday'),
    (v_org_id, v_venue_id, 'Joseph Dockery', 'Band', '630 877 7515', false, 'Wednesday'),
    (v_org_id, v_venue_id, 'Joany', 'Dancers', '310 902 8461', true, 'Dancer coordinator'),
    (v_org_id, v_venue_id, 'Eskae', 'DJ', '213 675 4176', true, 'AV Tech')
  ON CONFLICT DO NOTHING;

  -- Insert rates
  INSERT INTO entertainment_rates (organization_id, venue_id, entertainment_type, description, amount, is_flat_fee)
  VALUES
    (v_org_id, v_venue_id, 'Band', '2 hr', 250, true),
    (v_org_id, v_venue_id, 'Band', '3 hr', 300, true),
    (v_org_id, v_venue_id, 'Band', '3.5 hr', 350, true),
    (v_org_id, v_venue_id, 'Band', '4 hr', 400, true),
    (v_org_id, v_venue_id, 'Band', 'Jazz Night', 1700, true),
    (v_org_id, v_venue_id, 'Dancers', 'Per Dancer', 275, true)
  ON CONFLICT DO NOTHING;

  -- Insert schedule templates
  INSERT INTO entertainment_schedule_templates (venue_id, day_of_week, entertainment_type, time_start, time_end, config, notes)
  VALUES
    (v_venue_id, 'Tue', 'Band', '19:00', '21:00', 'SOLO', NULL),
    (v_venue_id, 'Wed', 'Band', '19:00', '21:00', 'DUO', NULL),
    (v_venue_id, 'Thu', 'Band', '19:30', '21:30', '4 PIECE BAND', NULL),
    (v_venue_id, 'Thu', 'Dancers', '19:30', '21:30', '2 DANCERS', NULL),
    (v_venue_id, 'Fri', 'Band', '19:00', '20:00', 'SOLO', NULL),
    (v_venue_id, 'Fri', 'Band', '21:00', '23:00', '4 PIECE BAND', NULL),
    (v_venue_id, 'Fri', 'Dancers', '21:00', '23:00', '2 DANCERS', NULL),
    (v_venue_id, 'Sat', 'Band', '19:00', '20:00', 'SOLO', NULL),
    (v_venue_id, 'Sat', 'Band', '21:00', '23:00', '4 PIECE BAND', NULL),
    (v_venue_id, 'Sat', 'Dancers', '21:00', '23:00', '2 DANCERS', NULL),
    (v_venue_id, 'Sun', 'Band', '19:00', '20:00', 'SOLO', NULL),
    (v_venue_id, 'Sun', 'Band', '22:00', '00:00', '6 PIECE BAND', 'Jazz Night')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Delilah LA entertainment data seeded';
END $$;

-- ============================================================================
-- DELILAH MIAMI
-- ============================================================================
DO $$
DECLARE
  v_venue_id UUID;
  v_org_id UUID;
BEGIN
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Delilah%' AND name ILIKE '%Miami%' LIMIT 1;
  IF v_venue_id IS NULL THEN
    RAISE NOTICE 'Delilah Miami venue not found, skipping...';
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id FROM venues WHERE id = v_venue_id;

  -- Insert artists
  INSERT INTO entertainment_artists (organization_id, venue_id, name, entertainment_type, phone, is_coordinator, notes)
  VALUES
    (v_org_id, v_venue_id, 'Ryan Cross', 'Band', '213 923 1373', true, 'Band coordinator'),
    (v_org_id, v_venue_id, 'Elena Lee', 'Dancers', '305 902 8500', true, 'Dancer coordinator'),
    (v_org_id, v_venue_id, 'Shane', 'DJ', '917 655 0313', true, 'AV Tech')
  ON CONFLICT DO NOTHING;

  -- Insert rates
  INSERT INTO entertainment_rates (organization_id, venue_id, entertainment_type, description, amount, is_flat_fee)
  VALUES
    (v_org_id, v_venue_id, 'Band', '2 hr', 225, true),
    (v_org_id, v_venue_id, 'Band', '3 hr', 275, true),
    (v_org_id, v_venue_id, 'Band', '3.5 hr', 325, true),
    (v_org_id, v_venue_id, 'Band', '4 hr', 375, true),
    (v_org_id, v_venue_id, 'Band', 'Monthly Management', 3000, true),
    (v_org_id, v_venue_id, 'Dancers', 'Per Dancer', 400, true),
    (v_org_id, v_venue_id, 'Dancers', 'Weekly Coordinating', 250, true),
    (v_org_id, v_venue_id, 'DJ', 'AV Tech/Night', 300, true)
  ON CONFLICT DO NOTHING;

  -- Insert schedule templates
  INSERT INTO entertainment_schedule_templates (venue_id, day_of_week, entertainment_type, time_start, time_end, config, notes)
  VALUES
    (v_venue_id, 'Tue', 'Band', '19:00', '21:00', 'SOLO', NULL),
    (v_venue_id, 'Wed', 'Band', '19:00', '21:00', 'SOLO', NULL),
    (v_venue_id, 'Thu', 'Band', '19:30', '21:30', '4 PIECE', NULL),
    (v_venue_id, 'Thu', 'Dancers', '20:30', '23:00', '2 DANCERS', '1 at 8:30 / 1 starting 9:30pm'),
    (v_venue_id, 'Fri', 'Band', '19:00', '21:00', '4 PIECE', NULL),
    (v_venue_id, 'Fri', 'Dancers', '20:30', '23:00', '2 DANCERS', '1 at 8:30 / 1 starting 9:30pm'),
    (v_venue_id, 'Sat', 'Band', '19:00', '21:00', '4 PIECE', NULL),
    (v_venue_id, 'Sat', 'Dancers', '20:30', '23:00', '2 DANCERS', '1 at 8:30 / 1 starting 9:30pm'),
    (v_venue_id, 'Sun', 'Band', '19:00', '20:00', 'DUO', NULL),
    (v_venue_id, 'Sun', 'Band', '21:00', '23:00', '6 PIECE', NULL),
    (v_venue_id, 'Sun', 'Dancers', '19:30', '23:00', '4 DANCERS', '1 at 7:30pm / 3 starting 9:30pm')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Delilah Miami entertainment data seeded';
END $$;

-- ============================================================================
-- DELILAH DALLAS
-- ============================================================================
DO $$
DECLARE
  v_venue_id UUID;
  v_org_id UUID;
BEGIN
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Delilah%' AND name ILIKE '%Dallas%' LIMIT 1;
  IF v_venue_id IS NULL THEN
    RAISE NOTICE 'Delilah Dallas venue not found, skipping...';
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id FROM venues WHERE id = v_venue_id;

  -- Insert artists
  INSERT INTO entertainment_artists (organization_id, venue_id, name, entertainment_type, phone, is_coordinator, notes)
  VALUES
    (v_org_id, v_venue_id, 'Ryan Cross', 'Band', '213 923 1373', true, 'Band coordinator'),
    (v_org_id, v_venue_id, 'Joany', 'Dancers', '310 902 8461', true, 'Dancer coordinator'),
    (v_org_id, v_venue_id, 'Diana', 'Dancers', '940 256 0447', false, NULL),
    (v_org_id, v_venue_id, 'Dilly', 'DJ', '972 896 6435', true, 'DJ'),
    (v_org_id, v_venue_id, 'Garett', 'DJ', '940 300 0866', false, 'AV Tech')
  ON CONFLICT DO NOTHING;

  -- Insert rates
  INSERT INTO entertainment_rates (organization_id, venue_id, entertainment_type, description, amount, is_flat_fee)
  VALUES
    (v_org_id, v_venue_id, 'Band', '2 hr', 250, true),
    (v_org_id, v_venue_id, 'Band', '3 hr', 300, true),
    (v_org_id, v_venue_id, 'Band', '3.5 hr', 350, true),
    (v_org_id, v_venue_id, 'Band', '4 hr', 400, true),
    (v_org_id, v_venue_id, 'Dancers', 'Per Dancer', 275, true),
    (v_org_id, v_venue_id, 'DJ', 'Per Night', 400, true)
  ON CONFLICT DO NOTHING;

  -- Insert schedule templates (Tue-Sun all same pattern)
  INSERT INTO entertainment_schedule_templates (venue_id, day_of_week, entertainment_type, time_start, time_end, config, notes)
  VALUES
    -- Tuesday
    (v_venue_id, 'Tue', 'Band', '18:00', '20:00', 'TRIO', NULL),
    (v_venue_id, 'Tue', 'Band', '20:30', '22:30', 'QUARTET', 'After turnover'),
    (v_venue_id, 'Tue', 'Dancers', '18:00', '22:00', '4 DANCERS', 'Staggered'),
    -- Wednesday
    (v_venue_id, 'Wed', 'Band', '18:00', '20:00', 'TRIO', NULL),
    (v_venue_id, 'Wed', 'Band', '20:30', '22:30', 'QUARTET', 'After turnover'),
    (v_venue_id, 'Wed', 'Dancers', '18:00', '22:00', '4 DANCERS', 'Staggered'),
    -- Thursday
    (v_venue_id, 'Thu', 'Band', '18:00', '20:00', 'TRIO', NULL),
    (v_venue_id, 'Thu', 'Band', '20:30', '22:30', 'QUARTET', 'After turnover'),
    (v_venue_id, 'Thu', 'Dancers', '18:00', '22:00', '4 DANCERS', 'Staggered'),
    -- Friday
    (v_venue_id, 'Fri', 'Band', '18:00', '20:00', 'TRIO', NULL),
    (v_venue_id, 'Fri', 'Band', '20:30', '22:30', 'QUARTET', 'After turnover'),
    (v_venue_id, 'Fri', 'Dancers', '18:00', '22:00', '4 DANCERS', 'Staggered'),
    -- Saturday
    (v_venue_id, 'Sat', 'Band', '18:00', '20:00', 'TRIO', NULL),
    (v_venue_id, 'Sat', 'Band', '20:30', '22:30', 'QUARTET', 'After turnover'),
    (v_venue_id, 'Sat', 'Dancers', '18:00', '22:00', '4 DANCERS', 'Staggered'),
    -- Sunday
    (v_venue_id, 'Sun', 'Band', '18:00', '20:00', 'TRIO', NULL),
    (v_venue_id, 'Sun', 'Band', '20:30', '22:30', 'QUARTET', 'After turnover'),
    (v_venue_id, 'Sun', 'Dancers', '18:00', '22:00', '4 DANCERS', 'Staggered')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Delilah Dallas entertainment data seeded';
END $$;

-- Cleanup helper functions
DROP FUNCTION IF EXISTS get_venue_id_by_name(TEXT);
DROP FUNCTION IF EXISTS get_org_for_venue(UUID);

SELECT 'Entertainment seed data complete' as status;
