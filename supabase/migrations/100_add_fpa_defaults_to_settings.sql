-- Add FP&A Standing Capacity defaults to proforma_settings
-- This centralizes all calculation parameters in one visible, auditable location

-- ============================================================================
-- 1. ADD FP&A STANDING CAPACITY DEFAULTS
-- ============================================================================

-- Add columns with defaults (nullable first to avoid constraint errors)
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_concept_archetype text DEFAULT 'balanced_resto_bar';

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bar_zone_pct numeric(5,2) DEFAULT 15.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bar_net_to_gross numeric(4,2) DEFAULT 0.70;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_standable_pct numeric(4,2) DEFAULT 0.60;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_sf_per_standing_guest numeric(5,2) DEFAULT 8.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_utilization_factor numeric(4,2) DEFAULT 0.85;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_code_sf_per_person numeric(5,2) DEFAULT 15.00;

-- Update any NULL values with defaults
UPDATE proforma_settings
SET
  default_concept_archetype = COALESCE(default_concept_archetype, 'balanced_resto_bar'),
  default_bar_zone_pct = COALESCE(default_bar_zone_pct, 15.00),
  default_bar_net_to_gross = COALESCE(default_bar_net_to_gross, 0.70),
  default_standable_pct = COALESCE(default_standable_pct, 0.60),
  default_sf_per_standing_guest = COALESCE(default_sf_per_standing_guest, 8.00),
  default_utilization_factor = COALESCE(default_utilization_factor, 0.85),
  default_code_sf_per_person = COALESCE(default_code_sf_per_person, 15.00);

-- Now add NOT NULL constraints and checks
ALTER TABLE proforma_settings
ALTER COLUMN default_concept_archetype SET NOT NULL;

ALTER TABLE proforma_settings
ALTER COLUMN default_bar_zone_pct SET NOT NULL;

ALTER TABLE proforma_settings
ALTER COLUMN default_bar_net_to_gross SET NOT NULL;

ALTER TABLE proforma_settings
ALTER COLUMN default_standable_pct SET NOT NULL;

ALTER TABLE proforma_settings
ALTER COLUMN default_sf_per_standing_guest SET NOT NULL;

ALTER TABLE proforma_settings
ALTER COLUMN default_utilization_factor SET NOT NULL;

ALTER TABLE proforma_settings
ALTER COLUMN default_code_sf_per_person SET NOT NULL;

-- Add check constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_concept_archetype_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_concept_archetype_check
      CHECK (default_concept_archetype IN ('dining_led', 'balanced_resto_bar', 'bar_forward', 'lounge_nightlife'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_bar_zone_pct_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_bar_zone_pct_check
      CHECK (default_bar_zone_pct >= 0 AND default_bar_zone_pct <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_bar_net_to_gross_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_bar_net_to_gross_check
      CHECK (default_bar_net_to_gross > 0 AND default_bar_net_to_gross <= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_standable_pct_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_standable_pct_check
      CHECK (default_standable_pct >= 0 AND default_standable_pct <= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_sf_per_standing_guest_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_sf_per_standing_guest_check
      CHECK (default_sf_per_standing_guest > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_utilization_factor_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_utilization_factor_check
      CHECK (default_utilization_factor > 0 AND default_utilization_factor <= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_code_sf_per_person_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_code_sf_per_person_check
      CHECK (default_code_sf_per_person > 0);
  END IF;
END $$;

COMMENT ON COLUMN proforma_settings.default_concept_archetype IS
  'Default concept archetype for new projects: dining_led, balanced_resto_bar, bar_forward, lounge_nightlife';

COMMENT ON COLUMN proforma_settings.default_bar_zone_pct IS
  'Default bar zone as % of total gross SF (industry benchmarks: 10-30%)';

COMMENT ON COLUMN proforma_settings.default_bar_net_to_gross IS
  'Default net-to-gross ratio for bar zone accounting for circulation (0.65-0.75)';

COMMENT ON COLUMN proforma_settings.default_standable_pct IS
  'Default standable % of bar zone net SF excluding fixtures (0.50-0.80)';

COMMENT ON COLUMN proforma_settings.default_sf_per_standing_guest IS
  'Default SF per standing guest - lower = more dense (6.0-9.5)';

COMMENT ON COLUMN proforma_settings.default_utilization_factor IS
  'Default peak utilization factor - realistic vs theoretical max (0.80-0.90)';

COMMENT ON COLUMN proforma_settings.default_code_sf_per_person IS
  'Default life-safety code SF per person - verify with local AHJ (7-15)';

-- ============================================================================
-- 2. ADD SEATING DENSITY BENCHMARK DEFAULTS
-- ============================================================================

-- Fine dining
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fine_dining_sf_per_seat_min numeric(5,2) DEFAULT 25.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fine_dining_sf_per_seat_max numeric(5,2) DEFAULT 30.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fine_dining_dining_pct_min numeric(5,2) DEFAULT 50.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fine_dining_dining_pct_max numeric(5,2) DEFAULT 60.0;

-- Casual dining
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS casual_dining_sf_per_seat_min numeric(5,2) DEFAULT 18.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS casual_dining_sf_per_seat_max numeric(5,2) DEFAULT 22.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS casual_dining_dining_pct_min numeric(5,2) DEFAULT 60.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS casual_dining_dining_pct_max numeric(5,2) DEFAULT 70.0;

-- Fast casual
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fast_casual_sf_per_seat_min numeric(5,2) DEFAULT 12.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fast_casual_sf_per_seat_max numeric(5,2) DEFAULT 16.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fast_casual_dining_pct_min numeric(5,2) DEFAULT 65.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fast_casual_dining_pct_max numeric(5,2) DEFAULT 75.0;

-- QSR
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS qsr_sf_per_seat_min numeric(5,2) DEFAULT 8.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS qsr_sf_per_seat_max numeric(5,2) DEFAULT 12.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS qsr_dining_pct_min numeric(5,2) DEFAULT 50.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS qsr_dining_pct_max numeric(5,2) DEFAULT 60.0;

-- Bar/Tavern
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS bar_tavern_sf_per_seat_min numeric(5,2) DEFAULT 15.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS bar_tavern_sf_per_seat_max numeric(5,2) DEFAULT 20.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS bar_tavern_dining_pct_min numeric(5,2) DEFAULT 65.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS bar_tavern_dining_pct_max numeric(5,2) DEFAULT 75.0;

-- Coffee shop
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS coffee_shop_sf_per_seat_min numeric(5,2) DEFAULT 10.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS coffee_shop_sf_per_seat_max numeric(5,2) DEFAULT 15.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS coffee_shop_dining_pct_min numeric(5,2) DEFAULT 60.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS coffee_shop_dining_pct_max numeric(5,2) DEFAULT 70.0;

-- Update NULL values for benchmark fields
UPDATE proforma_settings
SET
  fine_dining_sf_per_seat_min = COALESCE(fine_dining_sf_per_seat_min, 25.0),
  fine_dining_sf_per_seat_max = COALESCE(fine_dining_sf_per_seat_max, 30.0),
  fine_dining_dining_pct_min = COALESCE(fine_dining_dining_pct_min, 50.0),
  fine_dining_dining_pct_max = COALESCE(fine_dining_dining_pct_max, 60.0),
  casual_dining_sf_per_seat_min = COALESCE(casual_dining_sf_per_seat_min, 18.0),
  casual_dining_sf_per_seat_max = COALESCE(casual_dining_sf_per_seat_max, 22.0),
  casual_dining_dining_pct_min = COALESCE(casual_dining_dining_pct_min, 60.0),
  casual_dining_dining_pct_max = COALESCE(casual_dining_dining_pct_max, 70.0),
  fast_casual_sf_per_seat_min = COALESCE(fast_casual_sf_per_seat_min, 12.0),
  fast_casual_sf_per_seat_max = COALESCE(fast_casual_sf_per_seat_max, 16.0),
  fast_casual_dining_pct_min = COALESCE(fast_casual_dining_pct_min, 65.0),
  fast_casual_dining_pct_max = COALESCE(fast_casual_dining_pct_max, 75.0),
  qsr_sf_per_seat_min = COALESCE(qsr_sf_per_seat_min, 8.0),
  qsr_sf_per_seat_max = COALESCE(qsr_sf_per_seat_max, 12.0),
  qsr_dining_pct_min = COALESCE(qsr_dining_pct_min, 50.0),
  qsr_dining_pct_max = COALESCE(qsr_dining_pct_max, 60.0),
  bar_tavern_sf_per_seat_min = COALESCE(bar_tavern_sf_per_seat_min, 15.0),
  bar_tavern_sf_per_seat_max = COALESCE(bar_tavern_sf_per_seat_max, 20.0),
  bar_tavern_dining_pct_min = COALESCE(bar_tavern_dining_pct_min, 65.0),
  bar_tavern_dining_pct_max = COALESCE(bar_tavern_dining_pct_max, 75.0),
  coffee_shop_sf_per_seat_min = COALESCE(coffee_shop_sf_per_seat_min, 10.0),
  coffee_shop_sf_per_seat_max = COALESCE(coffee_shop_sf_per_seat_max, 15.0),
  coffee_shop_dining_pct_min = COALESCE(coffee_shop_dining_pct_min, 60.0),
  coffee_shop_dining_pct_max = COALESCE(coffee_shop_dining_pct_max, 70.0);

-- Set NOT NULL on benchmark fields
ALTER TABLE proforma_settings
ALTER COLUMN fine_dining_sf_per_seat_min SET NOT NULL,
ALTER COLUMN fine_dining_sf_per_seat_max SET NOT NULL,
ALTER COLUMN fine_dining_dining_pct_min SET NOT NULL,
ALTER COLUMN fine_dining_dining_pct_max SET NOT NULL,
ALTER COLUMN casual_dining_sf_per_seat_min SET NOT NULL,
ALTER COLUMN casual_dining_sf_per_seat_max SET NOT NULL,
ALTER COLUMN casual_dining_dining_pct_min SET NOT NULL,
ALTER COLUMN casual_dining_dining_pct_max SET NOT NULL,
ALTER COLUMN fast_casual_sf_per_seat_min SET NOT NULL,
ALTER COLUMN fast_casual_sf_per_seat_max SET NOT NULL,
ALTER COLUMN fast_casual_dining_pct_min SET NOT NULL,
ALTER COLUMN fast_casual_dining_pct_max SET NOT NULL,
ALTER COLUMN qsr_sf_per_seat_min SET NOT NULL,
ALTER COLUMN qsr_sf_per_seat_max SET NOT NULL,
ALTER COLUMN qsr_dining_pct_min SET NOT NULL,
ALTER COLUMN qsr_dining_pct_max SET NOT NULL,
ALTER COLUMN bar_tavern_sf_per_seat_min SET NOT NULL,
ALTER COLUMN bar_tavern_sf_per_seat_max SET NOT NULL,
ALTER COLUMN bar_tavern_dining_pct_min SET NOT NULL,
ALTER COLUMN bar_tavern_dining_pct_max SET NOT NULL,
ALTER COLUMN coffee_shop_sf_per_seat_min SET NOT NULL,
ALTER COLUMN coffee_shop_sf_per_seat_max SET NOT NULL,
ALTER COLUMN coffee_shop_dining_pct_min SET NOT NULL,
ALTER COLUMN coffee_shop_dining_pct_max SET NOT NULL;

COMMENT ON COLUMN proforma_settings.fine_dining_sf_per_seat_min IS 'Fine dining: Min SF per seat benchmark';
COMMENT ON COLUMN proforma_settings.fine_dining_sf_per_seat_max IS 'Fine dining: Max SF per seat benchmark';
COMMENT ON COLUMN proforma_settings.fine_dining_dining_pct_min IS 'Fine dining: Min dining area % benchmark';
COMMENT ON COLUMN proforma_settings.fine_dining_dining_pct_max IS 'Fine dining: Max dining area % benchmark';

-- ============================================================================
-- 3. CREATE FUNCTION TO GET ORG SETTINGS WITH FALLBACK
-- ============================================================================

CREATE OR REPLACE FUNCTION get_proforma_settings(p_org_id uuid)
RETURNS proforma_settings
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_settings proforma_settings;
BEGIN
  -- Try to get org-specific settings
  SELECT * INTO v_settings
  FROM proforma_settings
  WHERE org_id = p_org_id;

  -- If not found, create default settings
  IF NOT FOUND THEN
    INSERT INTO proforma_settings (org_id)
    VALUES (p_org_id)
    RETURNING * INTO v_settings;
  END IF;

  RETURN v_settings;
END;
$$;

COMMENT ON FUNCTION get_proforma_settings IS
  'Get proforma settings for organization, creating defaults if not exist.
   Use this function to ensure settings always available.';
