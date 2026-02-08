-- Add TipSee location mappings for all venues
-- Maps venue names to TipSee location UUIDs

DO $$
DECLARE
  v_venue_id UUID;
BEGIN
  -- Bird Streets Club
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Bird Streets%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)
    VALUES (v_venue_id, '5c4a4913-bca0-426f-8b51-54e175ea609f', 'Bird Streets Club')
    ON CONFLICT (venue_id) DO UPDATE SET
      tipsee_location_uuid = EXCLUDED.tipsee_location_uuid,
      tipsee_location_name = EXCLUDED.tipsee_location_name;
    RAISE NOTICE 'Mapped Bird Streets Club';
  END IF;

  -- Delilah LA
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Delilah%' AND name ILIKE '%LA%' LIMIT 1;
  IF v_venue_id IS NULL THEN
    SELECT id INTO v_venue_id FROM venues WHERE name ILIKE 'Delilah LA' LIMIT 1;
  END IF;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)
    VALUES (v_venue_id, 'f7a049ac-cf43-42b6-9083-b35d1848b24f', 'Delilah LA')
    ON CONFLICT (venue_id) DO UPDATE SET
      tipsee_location_uuid = EXCLUDED.tipsee_location_uuid,
      tipsee_location_name = EXCLUDED.tipsee_location_name;
    RAISE NOTICE 'Mapped Delilah LA';
  END IF;

  -- Delilah Miami
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Delilah%' AND name ILIKE '%Miami%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)
    VALUES (v_venue_id, 'f1e2158b-e567-4a1c-8750-2e826bdf1a2b', 'Delilah Miami')
    ON CONFLICT (venue_id) DO UPDATE SET
      tipsee_location_uuid = EXCLUDED.tipsee_location_uuid,
      tipsee_location_name = EXCLUDED.tipsee_location_name;
    RAISE NOTICE 'Mapped Delilah Miami';
  END IF;

  -- Didi Events
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Didi%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)
    VALUES (v_venue_id, '9cff9179-c87f-40f1-924b-d8df2edaeb06', 'Didi Events')
    ON CONFLICT (venue_id) DO UPDATE SET
      tipsee_location_uuid = EXCLUDED.tipsee_location_uuid,
      tipsee_location_name = EXCLUDED.tipsee_location_name;
    RAISE NOTICE 'Mapped Didi Events';
  END IF;

  -- Keys Los Angeles
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Keys%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)
    VALUES (v_venue_id, '42b1f4ed-d49a-4ed1-bf0f-75787f08a20f', 'Keys Los Angeles')
    ON CONFLICT (venue_id) DO UPDATE SET
      tipsee_location_uuid = EXCLUDED.tipsee_location_uuid,
      tipsee_location_name = EXCLUDED.tipsee_location_name;
    RAISE NOTICE 'Mapped Keys Los Angeles';
  END IF;

  -- Poppy
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Poppy%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)
    VALUES (v_venue_id, '69db05dd-aabc-4d9a-a11f-fdc09d4e3123', 'Poppy')
    ON CONFLICT (venue_id) DO UPDATE SET
      tipsee_location_uuid = EXCLUDED.tipsee_location_uuid,
      tipsee_location_name = EXCLUDED.tipsee_location_name;
    RAISE NOTICE 'Mapped Poppy';
  END IF;

  -- The Nice Guy (update existing if different)
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Nice Guy%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)
    VALUES (v_venue_id, 'aeb1790a-1ce9-4d6c-b1bc-7ef618294dc4', 'The Nice Guy')
    ON CONFLICT (venue_id) DO UPDATE SET
      tipsee_location_uuid = EXCLUDED.tipsee_location_uuid,
      tipsee_location_name = EXCLUDED.tipsee_location_name;
    RAISE NOTICE 'Mapped The Nice Guy';
  END IF;

END $$;
