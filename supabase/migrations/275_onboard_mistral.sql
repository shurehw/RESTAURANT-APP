-- ============================================================================
-- MIGRATION 275: Onboard Mistral Restaurant
-- ============================================================================
-- New organization + venue for Mistral (French fine dining, Sherman Oaks, LA)
-- POS: Toast (direct API integration)
-- Schedule: Closed Mondays, dinner nightly 5-10 PM, lunch Wed-Fri
-- ============================================================================

-- Step 1: Add 'fine_dining' to venue_class enum
ALTER TYPE venue_class ADD VALUE IF NOT EXISTS 'fine_dining';

-- Step 2: Create organization, venue, and all config seeds
DO $$
DECLARE
  v_org_id UUID;
  v_venue_id UUID;
BEGIN

  -- ── ORGANIZATION ──────────────────────────────────────────────────────────
  INSERT INTO organizations (
    name, slug, plan, subscription_status, timezone, currency, is_active, onboarding_completed
  )
  VALUES (
    'Mistral', 'mistral', 'professional', 'active',
    'America/Los_Angeles', 'USD', true, false
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_org_id;

  -- If org already exists, look it up
  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM organizations WHERE slug = 'mistral';
  END IF;

  RAISE NOTICE 'Organization: % (id=%)', 'Mistral', v_org_id;

  -- ── ORGANIZATION SETTINGS ─────────────────────────────────────────────────
  INSERT INTO organization_settings (organization_id)
  VALUES (v_org_id)
  ON CONFLICT (organization_id) DO NOTHING;

  -- ── ORGANIZATION USAGE ────────────────────────────────────────────────────
  INSERT INTO organization_usage (organization_id, period_start, period_end)
  VALUES (
    v_org_id,
    date_trunc('month', CURRENT_DATE)::date,
    (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date
  )
  ON CONFLICT (organization_id, period_start) DO NOTHING;

  -- ── VENUE ─────────────────────────────────────────────────────────────────
  INSERT INTO venues (
    name, organization_id, pos_type, is_active,
    address, city, state, zip_code, phone,
    latitude, longitude, timezone, venue_class
  )
  VALUES (
    'Mistral', v_org_id, 'toast', true,
    '13422 Ventura Blvd', 'Sherman Oaks', 'CA', '91423', '(818) 981-6650',
    34.151100, -118.431200, 'America/Los_Angeles', 'fine_dining'
  )
  ON CONFLICT (name) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    pos_type = EXCLUDED.pos_type,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    zip_code = EXCLUDED.zip_code,
    phone = EXCLUDED.phone,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    timezone = EXCLUDED.timezone,
    venue_class = EXCLUDED.venue_class
  RETURNING id INTO v_venue_id;

  IF v_venue_id IS NULL THEN
    SELECT id INTO v_venue_id FROM venues WHERE name = 'Mistral';
  END IF;

  RAISE NOTICE 'Venue: % (id=%)', 'Mistral', v_venue_id;

  -- ── LOCATION CONFIG ───────────────────────────────────────────────────────
  -- Closed Monday (0). Dinner 5 PM - 10 PM.
  -- Fine dining targets: ~16 covers/server, ~30 covers/bartender
  INSERT INTO location_config (
    venue_id, closed_weekdays, open_hour, close_hour,
    covers_per_server_target, covers_per_bartender_target
  )
  VALUES (v_venue_id, '{0}', 17, 22, 16.0, 30.0)
  ON CONFLICT (venue_id) DO UPDATE SET
    closed_weekdays = EXCLUDED.closed_weekdays,
    open_hour = EXCLUDED.open_hour,
    close_hour = EXCLUDED.close_hour,
    covers_per_server_target = EXCLUDED.covers_per_server_target,
    covers_per_bartender_target = EXCLUDED.covers_per_bartender_target,
    updated_at = NOW();

  -- ── SALES PACE SETTINGS ───────────────────────────────────────────────────
  -- Initially inactive until Toast integration is wired
  INSERT INTO sales_pace_settings (
    venue_id, polling_interval_seconds,
    service_start_hour, service_end_hour, is_active
  )
  VALUES (v_venue_id, 300, 17, 23, false)
  ON CONFLICT ON CONSTRAINT uq_sales_pace_settings_venue DO UPDATE SET
    service_start_hour = EXCLUDED.service_start_hour,
    service_end_hour = EXCLUDED.service_end_hour;

  -- ── COMP SETTINGS ─────────────────────────────────────────────────────────
  -- Seed with defaults (can be tuned later via admin UI)
  INSERT INTO comp_settings (
    org_id, version, approved_reasons,
    high_value_comp_threshold, high_comp_pct_threshold,
    daily_comp_pct_warning, daily_comp_pct_critical,
    server_max_comp_amount, manager_min_for_high_value,
    manager_roles, ai_model, ai_max_tokens, ai_temperature,
    is_active, effective_from
  )
  VALUES (
    v_org_id, 1,
    '[
      {"name": "Guest Recovery", "requires_manager_approval": false, "max_amount": 100},
      {"name": "Staff Discount 20%", "requires_manager_approval": false, "max_amount": null},
      {"name": "Staff Discount 50%", "requires_manager_approval": true, "max_amount": null},
      {"name": "Executive/Partner Comps", "requires_manager_approval": true, "max_amount": null},
      {"name": "Goodwill", "requires_manager_approval": false, "max_amount": 75},
      {"name": "DNL (Did Not Like)", "requires_manager_approval": false, "max_amount": 50},
      {"name": "Spill / Broken items", "requires_manager_approval": false, "max_amount": 50},
      {"name": "FOH Mistake", "requires_manager_approval": false, "max_amount": 75},
      {"name": "BOH Mistake / Wrong Temp", "requires_manager_approval": false, "max_amount": 75},
      {"name": "Media / PR / Celebrity", "requires_manager_approval": true, "max_amount": null},
      {"name": "Manager Meal", "requires_manager_approval": false, "max_amount": 30}
    ]'::JSONB,
    200.00, 50.00, 2.00, 3.00, 50.00, 200.00,
    '["Manager", "General Manager", "Assistant Manager", "AGM", "GM"]'::JSONB,
    'claude-sonnet-4-5-20250929', 4000, 0.30,
    true, NOW()
  )
  ON CONFLICT DO NOTHING;

  -- ── OPERATIONAL STANDARDS ─────────────────────────────────────────────────
  -- Seed with defaults (enforcement rails are fixed, calibration is bounded)
  INSERT INTO operational_standards (
    org_id, version, is_active, effective_from
  )
  VALUES (v_org_id, 1, true, NOW())
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Mistral onboarding complete: org=%, venue=%', v_org_id, v_venue_id;

END $$;

-- ── HOLIDAY ADJUSTMENTS for fine_dining venue class ─────────────────────────
-- Confidence: 'inferred' — no historical data yet for this venue class.
-- Will upgrade to 'observed' after a full calendar year of data.
INSERT INTO holiday_adjustments (holiday_code, venue_class, covers_offset, max_uplift_pct, confidence, notes) VALUES
  ('NYE',           'fine_dining',  80, 200, 'inferred', 'Fine dining NYE: strong demand, special menus'),
  ('VALENTINES',    'fine_dining',  60, 200, 'inferred', 'Fine dining Valentines: peak demand'),
  ('THANKSGIVING',  'fine_dining', -30, 100, 'inferred', 'Fine dining Thanksgiving: family at home'),
  ('CHRISTMAS',     'fine_dining', -50, 100, 'inferred', 'Fine dining Christmas: likely closed or minimal'),
  ('BLACK_FRIDAY',  'fine_dining', -15, 100, 'inferred', 'Fine dining Black Friday: slight shopping diversion'),
  ('NYD',           'fine_dining', -10, 100, 'inferred', 'Fine dining NYD: post-event dip'),
  ('MLK_DAY',       'fine_dining',   0, 100, 'inferred', 'Fine dining MLK: closed Monday anyway'),
  ('PRESIDENTS_DAY','fine_dining',   0, 100, 'inferred', 'Fine dining Presidents Day: closed Monday'),
  ('MEMORIAL_DAY',  'fine_dining',   0, 100, 'inferred', 'Fine dining Memorial Day: closed Monday'),
  ('LABOR_DAY',     'fine_dining',   0, 100, 'inferred', 'Fine dining Labor Day: closed Monday'),
  ('JULY_4TH',      'fine_dining', -10, 100, 'inferred', 'Fine dining July 4th: moderate impact')
ON CONFLICT (holiday_code, venue_class) DO NOTHING;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT o.name as org_name, o.slug, v.name as venue_name, v.venue_class, v.pos_type,
       v.address, v.city, v.latitude, v.longitude
FROM organizations o
JOIN venues v ON v.organization_id = o.id
WHERE o.slug = 'mistral';

SELECT v.name, lc.closed_weekdays, lc.open_hour, lc.close_hour,
       lc.covers_per_server_target, lc.covers_per_bartender_target
FROM location_config lc
JOIN venues v ON v.id = lc.venue_id
WHERE v.name = 'Mistral';
