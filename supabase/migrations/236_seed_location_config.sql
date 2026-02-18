-- Migration 236: Seed location_config with closed weekdays (dark days)
-- Purpose: Populate venue operating schedules so the demand forecaster
--          excludes closed days from training data and zeroes forecasts.
-- ISO weekdays: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday,
--               4=Friday, 5=Saturday, 6=Sunday

DO $$
DECLARE
  v_venue_id UUID;
BEGIN

  -- =====================================================
  -- Delilah LA — closed Monday
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Delilah%LA%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{0}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Delilah LA (closed Mon)';
  END IF;

  -- =====================================================
  -- Delilah Miami — closed Monday
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Delilah%Miami%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{0}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Delilah Miami (closed Mon)';
  END IF;

  -- =====================================================
  -- Delilah Dallas — closed Monday
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Delilah%Dallas%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{0}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Delilah Dallas (closed Mon)';
  END IF;

  -- =====================================================
  -- Nice Guy LA — open 7 days (empty closed_weekdays)
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Nice Guy%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Nice Guy LA (open 7 days)';
  END IF;

  -- =====================================================
  -- Bird Streets Club — open 7 days (empty closed_weekdays)
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Bird Streets%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Bird Streets Club (open 7 days)';
  END IF;

  -- =====================================================
  -- Keys Los Angeles — open Tue/Thu/Sat/Sun
  -- Closed: Mon(0), Wed(2), Fri(4)
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Keys%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{0,2,4}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Keys Los Angeles (open Tue/Thu/Sat/Sun)';
  END IF;

  -- =====================================================
  -- Poppy — open Mon/Fri/Sat
  -- Closed: Tue(1), Wed(2), Thu(3), Sun(6)
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Poppy%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{1,2,3,6}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Poppy (open Mon/Fri/Sat)';
  END IF;

  -- =====================================================
  -- Delilah Las Vegas — open 7 days (brunch on weekends)
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Delilah%Las Vegas%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Delilah Las Vegas (open 7 days)';
  END IF;

  -- =====================================================
  -- Harriets West Hollywood — open 7 days
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Harriets%West Hollywood%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Harriets West Hollywood (open 7 days)';
  END IF;

  -- =====================================================
  -- Harriets Nashville — open 7 days
  -- =====================================================
  SELECT id INTO v_venue_id FROM venues WHERE name ILIKE '%Harriets%Nashville%' LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO location_config (venue_id, closed_weekdays)
    VALUES (v_venue_id, '{}')
    ON CONFLICT (venue_id) DO UPDATE SET
      closed_weekdays = EXCLUDED.closed_weekdays,
      updated_at = NOW();
    RAISE NOTICE 'Seeded location_config for Harriets Nashville (open 7 days)';
  END IF;

  -- =====================================================
  -- Didi Events — events-only, no location_config row
  -- Forecaster skips venues without a config entry
  -- =====================================================
  -- Avero venues (Harriets WH, Nashville, Delilah LV) are historical-only.
  -- No sales_pace_settings rows needed — live polling requires a live POS feed.

END $$;

-- Verify
SELECT v.name, lc.closed_weekdays, lc.is_active
FROM location_config lc
JOIN venues v ON v.id = lc.venue_id
ORDER BY v.name;
