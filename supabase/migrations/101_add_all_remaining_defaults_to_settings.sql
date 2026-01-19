-- Add all remaining calculation defaults to proforma_settings
-- Completes the centralization of all hardcoded values

-- ============================================================================
-- 1. REVENUE MIX DEFAULTS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_food_mix_pct numeric(5,2) DEFAULT 60.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bev_mix_pct numeric(5,2) DEFAULT 35.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_other_mix_pct numeric(5,2) DEFAULT 5.00;

UPDATE proforma_settings
SET
  default_food_mix_pct = COALESCE(default_food_mix_pct, 60.00),
  default_bev_mix_pct = COALESCE(default_bev_mix_pct, 35.00),
  default_other_mix_pct = COALESCE(default_other_mix_pct, 5.00);

ALTER TABLE proforma_settings
ALTER COLUMN default_food_mix_pct SET NOT NULL,
ALTER COLUMN default_bev_mix_pct SET NOT NULL,
ALTER COLUMN default_other_mix_pct SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'revenue_mix_totals_100'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT revenue_mix_totals_100
      CHECK (default_food_mix_pct + default_bev_mix_pct + default_other_mix_pct = 100);
  END IF;
END $$;

COMMENT ON COLUMN proforma_settings.default_food_mix_pct IS 'Default food % of revenue (must sum to 100% with bev and other)';
COMMENT ON COLUMN proforma_settings.default_bev_mix_pct IS 'Default beverage % of revenue';
COMMENT ON COLUMN proforma_settings.default_other_mix_pct IS 'Default other % of revenue (retail, merchandise, etc.)';

-- ============================================================================
-- 2. RAMP-UP DEFAULTS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_ramp_months int DEFAULT 12;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_ramp_start_pct numeric(5,2) DEFAULT 80.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_ramp_curve text DEFAULT 'linear';

UPDATE proforma_settings
SET
  default_ramp_months = COALESCE(default_ramp_months, 12),
  default_ramp_start_pct = COALESCE(default_ramp_start_pct, 80.00),
  default_ramp_curve = COALESCE(default_ramp_curve, 'linear');

ALTER TABLE proforma_settings
ALTER COLUMN default_ramp_months SET NOT NULL,
ALTER COLUMN default_ramp_start_pct SET NOT NULL,
ALTER COLUMN default_ramp_curve SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_ramp_curve_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_ramp_curve_check
      CHECK (default_ramp_curve IN ('linear', 'exponential', 's_curve'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_ramp_start_pct_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_ramp_start_pct_check
      CHECK (default_ramp_start_pct >= 0 AND default_ramp_start_pct <= 100);
  END IF;
END $$;

COMMENT ON COLUMN proforma_settings.default_ramp_months IS 'Default ramp-up period in months (time to reach steady state)';
COMMENT ON COLUMN proforma_settings.default_ramp_start_pct IS 'Default starting % of steady-state revenue (typically 70-90%)';
COMMENT ON COLUMN proforma_settings.default_ramp_curve IS 'Default ramp curve shape: linear, exponential, or s_curve';

-- ============================================================================
-- 3. DAY OF WEEK DISTRIBUTION
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_dow_monday_pct numeric(5,2) DEFAULT 14.3;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_dow_tuesday_pct numeric(5,2) DEFAULT 14.3;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_dow_wednesday_pct numeric(5,2) DEFAULT 14.3;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_dow_thursday_pct numeric(5,2) DEFAULT 14.3;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_dow_friday_pct numeric(5,2) DEFAULT 14.3;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_dow_saturday_pct numeric(5,2) DEFAULT 14.3;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_dow_sunday_pct numeric(5,2) DEFAULT 14.2;

UPDATE proforma_settings
SET
  default_dow_monday_pct = COALESCE(default_dow_monday_pct, 14.3),
  default_dow_tuesday_pct = COALESCE(default_dow_tuesday_pct, 14.3),
  default_dow_wednesday_pct = COALESCE(default_dow_wednesday_pct, 14.3),
  default_dow_thursday_pct = COALESCE(default_dow_thursday_pct, 14.3),
  default_dow_friday_pct = COALESCE(default_dow_friday_pct, 14.3),
  default_dow_saturday_pct = COALESCE(default_dow_saturday_pct, 14.3),
  default_dow_sunday_pct = COALESCE(default_dow_sunday_pct, 14.2);

ALTER TABLE proforma_settings
ALTER COLUMN default_dow_monday_pct SET NOT NULL,
ALTER COLUMN default_dow_tuesday_pct SET NOT NULL,
ALTER COLUMN default_dow_wednesday_pct SET NOT NULL,
ALTER COLUMN default_dow_thursday_pct SET NOT NULL,
ALTER COLUMN default_dow_friday_pct SET NOT NULL,
ALTER COLUMN default_dow_saturday_pct SET NOT NULL,
ALTER COLUMN default_dow_sunday_pct SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dow_totals_100'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT dow_totals_100
      CHECK (
        ROUND(default_dow_monday_pct + default_dow_tuesday_pct + default_dow_wednesday_pct +
              default_dow_thursday_pct + default_dow_friday_pct + default_dow_saturday_pct +
              default_dow_sunday_pct, 1) = 100.0
      );
  END IF;
END $$;

COMMENT ON COLUMN proforma_settings.default_dow_monday_pct IS 'Default % of weekly revenue on Monday (must sum to 100%)';
COMMENT ON COLUMN proforma_settings.default_dow_tuesday_pct IS 'Default % of weekly revenue on Tuesday';
COMMENT ON COLUMN proforma_settings.default_dow_wednesday_pct IS 'Default % of weekly revenue on Wednesday';
COMMENT ON COLUMN proforma_settings.default_dow_thursday_pct IS 'Default % of weekly revenue on Thursday';
COMMENT ON COLUMN proforma_settings.default_dow_friday_pct IS 'Default % of weekly revenue on Friday';
COMMENT ON COLUMN proforma_settings.default_dow_saturday_pct IS 'Default % of weekly revenue on Saturday';
COMMENT ON COLUMN proforma_settings.default_dow_sunday_pct IS 'Default % of weekly revenue on Sunday';

-- ============================================================================
-- 4. PRIVATE DINING ROOM (PDR) DEFAULTS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_pdr_capacity int DEFAULT 20;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_pdr_events_per_month int DEFAULT 8;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_pdr_avg_spend_per_person numeric(10,2) DEFAULT 150.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_pdr_avg_party_size int DEFAULT 15;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_pdr_ramp_months int DEFAULT 12;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_pdr_food_pct numeric(5,2) DEFAULT 60.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_pdr_bev_pct numeric(5,2) DEFAULT 35.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_pdr_other_pct numeric(5,2) DEFAULT 5.00;

UPDATE proforma_settings
SET
  default_pdr_capacity = COALESCE(default_pdr_capacity, 20),
  default_pdr_events_per_month = COALESCE(default_pdr_events_per_month, 8),
  default_pdr_avg_spend_per_person = COALESCE(default_pdr_avg_spend_per_person, 150.00),
  default_pdr_avg_party_size = COALESCE(default_pdr_avg_party_size, 15),
  default_pdr_ramp_months = COALESCE(default_pdr_ramp_months, 12),
  default_pdr_food_pct = COALESCE(default_pdr_food_pct, 60.00),
  default_pdr_bev_pct = COALESCE(default_pdr_bev_pct, 35.00),
  default_pdr_other_pct = COALESCE(default_pdr_other_pct, 5.00);

ALTER TABLE proforma_settings
ALTER COLUMN default_pdr_capacity SET NOT NULL,
ALTER COLUMN default_pdr_events_per_month SET NOT NULL,
ALTER COLUMN default_pdr_avg_spend_per_person SET NOT NULL,
ALTER COLUMN default_pdr_avg_party_size SET NOT NULL,
ALTER COLUMN default_pdr_ramp_months SET NOT NULL,
ALTER COLUMN default_pdr_food_pct SET NOT NULL,
ALTER COLUMN default_pdr_bev_pct SET NOT NULL,
ALTER COLUMN default_pdr_other_pct SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pdr_mix_totals_100'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT pdr_mix_totals_100
      CHECK (default_pdr_food_pct + default_pdr_bev_pct + default_pdr_other_pct = 100);
  END IF;
END $$;

COMMENT ON COLUMN proforma_settings.default_pdr_capacity IS 'Default private dining room capacity (seats)';
COMMENT ON COLUMN proforma_settings.default_pdr_events_per_month IS 'Default PDR events per month at steady state';
COMMENT ON COLUMN proforma_settings.default_pdr_avg_spend_per_person IS 'Default average spend per person for PDR events';
COMMENT ON COLUMN proforma_settings.default_pdr_avg_party_size IS 'Default average party size for PDR bookings';
COMMENT ON COLUMN proforma_settings.default_pdr_ramp_months IS 'Default PDR ramp-up period (months to build event volume)';
COMMENT ON COLUMN proforma_settings.default_pdr_food_pct IS 'Default food % for PDR events';
COMMENT ON COLUMN proforma_settings.default_pdr_bev_pct IS 'Default beverage % for PDR events';
COMMENT ON COLUMN proforma_settings.default_pdr_other_pct IS 'Default other % for PDR events';

-- ============================================================================
-- 5. SERVICE PERIOD DEFAULTS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_service_days_per_week int DEFAULT 7;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_services_per_day int DEFAULT 2;

UPDATE proforma_settings
SET
  default_service_days_per_week = COALESCE(default_service_days_per_week, 7),
  default_services_per_day = COALESCE(default_services_per_day, 2);

ALTER TABLE proforma_settings
ALTER COLUMN default_service_days_per_week SET NOT NULL,
ALTER COLUMN default_services_per_day SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_service_days_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_service_days_check
      CHECK (default_service_days_per_week >= 1 AND default_service_days_per_week <= 7);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_services_per_day_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_services_per_day_check
      CHECK (default_services_per_day >= 1 AND default_services_per_day <= 5);
  END IF;
END $$;

COMMENT ON COLUMN proforma_settings.default_service_days_per_week IS 'Default days open per week (1-7)';
COMMENT ON COLUMN proforma_settings.default_services_per_day IS 'Default service periods per day (e.g., 2 = lunch + dinner)';

-- ============================================================================
-- 6. VALIDATION THRESHOLDS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS min_boh_pct numeric(5,2) DEFAULT 25.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS max_rent_per_seat_warning numeric(10,2) DEFAULT 250.00;

UPDATE proforma_settings
SET
  min_boh_pct = COALESCE(min_boh_pct, 25.00),
  max_rent_per_seat_warning = COALESCE(max_rent_per_seat_warning, 250.00);

ALTER TABLE proforma_settings
ALTER COLUMN min_boh_pct SET NOT NULL,
ALTER COLUMN max_rent_per_seat_warning SET NOT NULL;

COMMENT ON COLUMN proforma_settings.min_boh_pct IS 'Minimum BOH % (below this triggers error) - typical 25%';
COMMENT ON COLUMN proforma_settings.max_rent_per_seat_warning IS 'Rent per seat per month warning threshold ($/seat/month)';

-- ============================================================================
-- 7. CALENDAR CONSTANTS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS days_per_year int DEFAULT 360;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS weeks_per_year int DEFAULT 52;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS avg_days_per_month numeric(5,2) DEFAULT 30.00;

UPDATE proforma_settings
SET
  days_per_year = COALESCE(days_per_year, 360),
  weeks_per_year = COALESCE(weeks_per_year, 52),
  avg_days_per_month = COALESCE(avg_days_per_month, 30.00);

ALTER TABLE proforma_settings
ALTER COLUMN days_per_year SET NOT NULL,
ALTER COLUMN weeks_per_year SET NOT NULL,
ALTER COLUMN avg_days_per_month SET NOT NULL;

COMMENT ON COLUMN proforma_settings.days_per_year IS 'Days per year for revenue calculations (360 = 12 months × 30 days)';
COMMENT ON COLUMN proforma_settings.weeks_per_year IS 'Weeks per year for labor calculations';
COMMENT ON COLUMN proforma_settings.avg_days_per_month IS 'Average days per month (360÷12 = 30.0)';

-- ============================================================================
-- 8. SERVICE PERIOD TIMING DEFAULTS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_service_hours numeric(5,2) DEFAULT 3.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_avg_dining_time_hours numeric(5,2) DEFAULT 1.5;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_utilization_pct numeric(5,2) DEFAULT 65.0;

UPDATE proforma_settings
SET
  default_service_hours = COALESCE(default_service_hours, 3.0),
  default_avg_dining_time_hours = COALESCE(default_avg_dining_time_hours, 1.5),
  default_utilization_pct = COALESCE(default_utilization_pct, 65.0);

ALTER TABLE proforma_settings
ALTER COLUMN default_service_hours SET NOT NULL,
ALTER COLUMN default_avg_dining_time_hours SET NOT NULL,
ALTER COLUMN default_utilization_pct SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_utilization_pct_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_utilization_pct_check
      CHECK (default_utilization_pct >= 0 AND default_utilization_pct <= 100);
  END IF;
END $$;

COMMENT ON COLUMN proforma_settings.default_service_hours IS 'Default service period duration in hours (e.g., 3.0 for lunch/dinner)';
COMMENT ON COLUMN proforma_settings.default_avg_dining_time_hours IS 'Default average time guest occupies table (used for turns calculation)';
COMMENT ON COLUMN proforma_settings.default_utilization_pct IS 'Default % of theoretical capacity actually achieved (typically 60-75%)';

-- ============================================================================
-- 9. BAR OPERATIONS DEFAULTS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bar_rail_ft_per_guest numeric(5,2) DEFAULT 2.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_realization_rate numeric(5,2) DEFAULT 0.90;

UPDATE proforma_settings
SET
  default_bar_rail_ft_per_guest = COALESCE(default_bar_rail_ft_per_guest, 2.0),
  default_realization_rate = COALESCE(default_realization_rate, 0.90);

ALTER TABLE proforma_settings
ALTER COLUMN default_bar_rail_ft_per_guest SET NOT NULL,
ALTER COLUMN default_realization_rate SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_realization_rate_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_realization_rate_check
      CHECK (default_realization_rate >= 0 AND default_realization_rate <= 1);
  END IF;
END $$;

COMMENT ON COLUMN proforma_settings.default_bar_rail_ft_per_guest IS 'Default linear feet of bar rail per standing guest';
COMMENT ON COLUMN proforma_settings.default_realization_rate IS 'Default realization rate for revenue (accounts for voids, comps, etc.) - typically 0.85-0.95';

-- ============================================================================
-- 10. SEATING CONCEPT BENCHMARKS (RANGES)
-- ============================================================================

-- Fast Casual
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fast_casual_sf_per_seat_min numeric(5,2) DEFAULT 12.0,
ADD COLUMN IF NOT EXISTS fast_casual_sf_per_seat_max numeric(5,2) DEFAULT 18.0,
ADD COLUMN IF NOT EXISTS fast_casual_dining_area_pct_min numeric(5,2) DEFAULT 55.0,
ADD COLUMN IF NOT EXISTS fast_casual_dining_area_pct_max numeric(5,2) DEFAULT 65.0;

-- Casual Dining
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS casual_dining_sf_per_seat_min numeric(5,2) DEFAULT 18.0,
ADD COLUMN IF NOT EXISTS casual_dining_sf_per_seat_max numeric(5,2) DEFAULT 22.0,
ADD COLUMN IF NOT EXISTS casual_dining_dining_area_pct_min numeric(5,2) DEFAULT 60.0,
ADD COLUMN IF NOT EXISTS casual_dining_dining_area_pct_max numeric(5,2) DEFAULT 70.0;

-- Premium Casual
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS premium_casual_sf_per_seat_min numeric(5,2) DEFAULT 22.0,
ADD COLUMN IF NOT EXISTS premium_casual_sf_per_seat_max numeric(5,2) DEFAULT 26.0,
ADD COLUMN IF NOT EXISTS premium_casual_dining_area_pct_min numeric(5,2) DEFAULT 65.0,
ADD COLUMN IF NOT EXISTS premium_casual_dining_area_pct_max numeric(5,2) DEFAULT 75.0;

-- Fine Dining
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fine_dining_sf_per_seat_min numeric(5,2) DEFAULT 28.0,
ADD COLUMN IF NOT EXISTS fine_dining_sf_per_seat_max numeric(5,2) DEFAULT 40.0,
ADD COLUMN IF NOT EXISTS fine_dining_dining_area_pct_min numeric(5,2) DEFAULT 70.0,
ADD COLUMN IF NOT EXISTS fine_dining_dining_area_pct_max numeric(5,2) DEFAULT 80.0;

-- Bar Lounge
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS bar_lounge_sf_per_seat_min numeric(5,2) DEFAULT 14.0,
ADD COLUMN IF NOT EXISTS bar_lounge_sf_per_seat_max numeric(5,2) DEFAULT 20.0,
ADD COLUMN IF NOT EXISTS bar_lounge_dining_area_pct_min numeric(5,2) DEFAULT 50.0,
ADD COLUMN IF NOT EXISTS bar_lounge_dining_area_pct_max numeric(5,2) DEFAULT 65.0;

-- Nightclub
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS nightclub_sf_per_seat_min numeric(5,2) DEFAULT 7.0,
ADD COLUMN IF NOT EXISTS nightclub_sf_per_seat_max numeric(5,2) DEFAULT 10.0,
ADD COLUMN IF NOT EXISTS nightclub_dining_area_pct_min numeric(5,2) DEFAULT 60.0,
ADD COLUMN IF NOT EXISTS nightclub_dining_area_pct_max numeric(5,2) DEFAULT 80.0;

UPDATE proforma_settings
SET
  -- Fast Casual
  fast_casual_sf_per_seat_min = COALESCE(fast_casual_sf_per_seat_min, 12.0),
  fast_casual_sf_per_seat_max = COALESCE(fast_casual_sf_per_seat_max, 18.0),
  fast_casual_dining_area_pct_min = COALESCE(fast_casual_dining_area_pct_min, 55.0),
  fast_casual_dining_area_pct_max = COALESCE(fast_casual_dining_area_pct_max, 65.0),
  -- Casual Dining
  casual_dining_sf_per_seat_min = COALESCE(casual_dining_sf_per_seat_min, 18.0),
  casual_dining_sf_per_seat_max = COALESCE(casual_dining_sf_per_seat_max, 22.0),
  casual_dining_dining_area_pct_min = COALESCE(casual_dining_dining_area_pct_min, 60.0),
  casual_dining_dining_area_pct_max = COALESCE(casual_dining_dining_area_pct_max, 70.0),
  -- Premium Casual
  premium_casual_sf_per_seat_min = COALESCE(premium_casual_sf_per_seat_min, 22.0),
  premium_casual_sf_per_seat_max = COALESCE(premium_casual_sf_per_seat_max, 26.0),
  premium_casual_dining_area_pct_min = COALESCE(premium_casual_dining_area_pct_min, 65.0),
  premium_casual_dining_area_pct_max = COALESCE(premium_casual_dining_area_pct_max, 75.0),
  -- Fine Dining
  fine_dining_sf_per_seat_min = COALESCE(fine_dining_sf_per_seat_min, 28.0),
  fine_dining_sf_per_seat_max = COALESCE(fine_dining_sf_per_seat_max, 40.0),
  fine_dining_dining_area_pct_min = COALESCE(fine_dining_dining_area_pct_min, 70.0),
  fine_dining_dining_area_pct_max = COALESCE(fine_dining_dining_area_pct_max, 80.0),
  -- Bar Lounge
  bar_lounge_sf_per_seat_min = COALESCE(bar_lounge_sf_per_seat_min, 14.0),
  bar_lounge_sf_per_seat_max = COALESCE(bar_lounge_sf_per_seat_max, 20.0),
  bar_lounge_dining_area_pct_min = COALESCE(bar_lounge_dining_area_pct_min, 50.0),
  bar_lounge_dining_area_pct_max = COALESCE(bar_lounge_dining_area_pct_max, 65.0),
  -- Nightclub
  nightclub_sf_per_seat_min = COALESCE(nightclub_sf_per_seat_min, 7.0),
  nightclub_sf_per_seat_max = COALESCE(nightclub_sf_per_seat_max, 10.0),
  nightclub_dining_area_pct_min = COALESCE(nightclub_dining_area_pct_min, 60.0),
  nightclub_dining_area_pct_max = COALESCE(nightclub_dining_area_pct_max, 80.0);

ALTER TABLE proforma_settings
ALTER COLUMN fast_casual_sf_per_seat_min SET NOT NULL,
ALTER COLUMN fast_casual_sf_per_seat_max SET NOT NULL,
ALTER COLUMN fast_casual_dining_area_pct_min SET NOT NULL,
ALTER COLUMN fast_casual_dining_area_pct_max SET NOT NULL,
ALTER COLUMN casual_dining_sf_per_seat_min SET NOT NULL,
ALTER COLUMN casual_dining_sf_per_seat_max SET NOT NULL,
ALTER COLUMN casual_dining_dining_area_pct_min SET NOT NULL,
ALTER COLUMN casual_dining_dining_area_pct_max SET NOT NULL,
ALTER COLUMN premium_casual_sf_per_seat_min SET NOT NULL,
ALTER COLUMN premium_casual_sf_per_seat_max SET NOT NULL,
ALTER COLUMN premium_casual_dining_area_pct_min SET NOT NULL,
ALTER COLUMN premium_casual_dining_area_pct_max SET NOT NULL,
ALTER COLUMN fine_dining_sf_per_seat_min SET NOT NULL,
ALTER COLUMN fine_dining_sf_per_seat_max SET NOT NULL,
ALTER COLUMN fine_dining_dining_area_pct_min SET NOT NULL,
ALTER COLUMN fine_dining_dining_area_pct_max SET NOT NULL,
ALTER COLUMN bar_lounge_sf_per_seat_min SET NOT NULL,
ALTER COLUMN bar_lounge_sf_per_seat_max SET NOT NULL,
ALTER COLUMN bar_lounge_dining_area_pct_min SET NOT NULL,
ALTER COLUMN bar_lounge_dining_area_pct_max SET NOT NULL,
ALTER COLUMN nightclub_sf_per_seat_min SET NOT NULL,
ALTER COLUMN nightclub_sf_per_seat_max SET NOT NULL,
ALTER COLUMN nightclub_dining_area_pct_min SET NOT NULL,
ALTER COLUMN nightclub_dining_area_pct_max SET NOT NULL;

COMMENT ON COLUMN proforma_settings.fast_casual_sf_per_seat_min IS 'Fast casual concept: minimum SF per seat (industry benchmark)';
COMMENT ON COLUMN proforma_settings.fast_casual_sf_per_seat_max IS 'Fast casual concept: maximum SF per seat (industry benchmark)';
COMMENT ON COLUMN proforma_settings.casual_dining_sf_per_seat_min IS 'Casual dining concept: minimum SF per seat (industry benchmark)';
COMMENT ON COLUMN proforma_settings.fine_dining_sf_per_seat_min IS 'Fine dining concept: minimum SF per seat (hard constraint - below this triggers error)';

-- ============================================================================
-- 11. CREATE HELPER VIEW: ALL DEFAULTS SUMMARY
-- ============================================================================

DROP VIEW IF EXISTS proforma_settings_summary;

CREATE VIEW proforma_settings_summary AS
SELECT
  org_id,

  -- Space Planning
  default_density_benchmark,
  default_sf_per_seat,
  default_dining_area_pct,
  default_boh_pct,

  -- Bar Calculations (Seated)
  bar_lf_ratio,
  bar_min_lf,
  bar_max_lf,
  bar_inches_per_seat,
  bar_max_pct_of_dining,

  -- FP&A Standing Capacity
  default_concept_archetype,
  default_bar_zone_pct,
  default_bar_net_to_gross,
  default_standable_pct,
  default_sf_per_standing_guest,
  default_utilization_factor,
  default_code_sf_per_person,

  -- Revenue Mix
  default_food_mix_pct,
  default_bev_mix_pct,
  default_other_mix_pct,

  -- Ramp
  default_ramp_months,
  default_ramp_start_pct,
  default_ramp_curve,

  -- Day of Week
  default_dow_monday_pct,
  default_dow_tuesday_pct,
  default_dow_wednesday_pct,
  default_dow_thursday_pct,
  default_dow_friday_pct,
  default_dow_saturday_pct,
  default_dow_sunday_pct,

  -- PDR
  default_pdr_capacity,
  default_pdr_events_per_month,
  default_pdr_avg_spend_per_person,
  default_pdr_avg_party_size,
  default_pdr_ramp_months,
  default_pdr_food_pct,
  default_pdr_bev_pct,
  default_pdr_other_pct,

  -- Service Periods
  default_service_days_per_week,
  default_services_per_day,
  default_service_hours,
  default_avg_dining_time_hours,
  default_utilization_pct,

  -- Bar Operations
  default_bar_rail_ft_per_guest,
  default_realization_rate,

  -- Concept Benchmarks
  fast_casual_sf_per_seat_min,
  fast_casual_sf_per_seat_max,
  fast_casual_dining_area_pct_min,
  fast_casual_dining_area_pct_max,
  casual_dining_sf_per_seat_min,
  casual_dining_sf_per_seat_max,
  casual_dining_dining_area_pct_min,
  casual_dining_dining_area_pct_max,
  premium_casual_sf_per_seat_min,
  premium_casual_sf_per_seat_max,
  premium_casual_dining_area_pct_min,
  premium_casual_dining_area_pct_max,
  fine_dining_sf_per_seat_min,
  fine_dining_sf_per_seat_max,
  fine_dining_dining_area_pct_min,
  fine_dining_dining_area_pct_max,
  bar_lounge_sf_per_seat_min,
  bar_lounge_sf_per_seat_max,
  bar_lounge_dining_area_pct_min,
  bar_lounge_dining_area_pct_max,
  nightclub_sf_per_seat_min,
  nightclub_sf_per_seat_max,
  nightclub_dining_area_pct_min,
  nightclub_dining_area_pct_max,

  -- COGS
  default_food_cogs_pct,
  default_bev_cogs_pct,
  default_other_cogs_pct,

  -- Labor
  default_foh_hours_per_100_covers,
  default_boh_hours_per_100_covers,
  default_foh_hourly_rate,
  default_boh_hourly_rate,
  default_payroll_burden_pct,

  -- OpEx
  default_linen_pct,
  default_smallwares_pct,
  default_cleaning_pct,
  default_cc_fees_pct,
  default_marketing_pct,
  default_gna_pct,

  -- Validation
  min_boh_pct,
  max_rent_per_seat_warning,

  -- Calendar
  days_per_year,
  weeks_per_year,
  avg_days_per_month,

  created_at,
  updated_at
FROM proforma_settings;

COMMENT ON VIEW proforma_settings_summary IS
  'Complete view of all proforma calculation defaults.
   Use this for auditing, documentation, and IC/partner reviews.
   Every hardcoded value in the system is now visible and editable.';
