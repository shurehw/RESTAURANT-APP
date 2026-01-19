-- Add standing bar revenue defaults to proforma_settings
-- These are used when toggling a bar to "T" (throughput/standing mode)

-- ============================================================================
-- STANDING BAR REVENUE DEFAULTS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bar_avg_spend_per_guest numeric(10,2) DEFAULT 18.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bar_food_pct numeric(5,2) DEFAULT 10.00;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bar_bev_pct numeric(5,2) DEFAULT 90.00;

-- Standing bar throughput defaults
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bar_dwell_hours numeric(5,2) DEFAULT 1.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bar_active_pct numeric(5,2) DEFAULT 60.0;

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS default_bar_utilization_pct numeric(5,2) DEFAULT 85.0;

UPDATE proforma_settings
SET
  default_bar_avg_spend_per_guest = COALESCE(default_bar_avg_spend_per_guest, 18.00),
  default_bar_food_pct = COALESCE(default_bar_food_pct, 10.00),
  default_bar_bev_pct = COALESCE(default_bar_bev_pct, 90.00),
  default_bar_dwell_hours = COALESCE(default_bar_dwell_hours, 1.0),
  default_bar_active_pct = COALESCE(default_bar_active_pct, 60.0),
  default_bar_utilization_pct = COALESCE(default_bar_utilization_pct, 85.0);

ALTER TABLE proforma_settings
ALTER COLUMN default_bar_avg_spend_per_guest SET NOT NULL,
ALTER COLUMN default_bar_food_pct SET NOT NULL,
ALTER COLUMN default_bar_bev_pct SET NOT NULL,
ALTER COLUMN default_bar_dwell_hours SET NOT NULL,
ALTER COLUMN default_bar_active_pct SET NOT NULL,
ALTER COLUMN default_bar_utilization_pct SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bar_fb_split_totals_100'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT bar_fb_split_totals_100
      CHECK (default_bar_food_pct + default_bar_bev_pct = 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_bar_active_pct_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_bar_active_pct_check
      CHECK (default_bar_active_pct >= 0 AND default_bar_active_pct <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'default_bar_utilization_pct_check'
  ) THEN
    ALTER TABLE proforma_settings
    ADD CONSTRAINT default_bar_utilization_pct_check
      CHECK (default_bar_utilization_pct >= 0 AND default_bar_utilization_pct <= 100);
  END IF;
END $$;

COMMENT ON COLUMN proforma_settings.default_bar_avg_spend_per_guest IS 'Default average spend per guest at standing bar (typically $15-25 for 2-3 drinks)';
COMMENT ON COLUMN proforma_settings.default_bar_food_pct IS 'Default food % for standing bar revenue (typically 10%)';
COMMENT ON COLUMN proforma_settings.default_bar_bev_pct IS 'Default beverage % for standing bar revenue (typically 90%)';
COMMENT ON COLUMN proforma_settings.default_bar_dwell_hours IS 'Default dwell time at standing bar (typically 1.0 hour)';
COMMENT ON COLUMN proforma_settings.default_bar_active_pct IS 'Default % of service hours bar is at peak capacity (typically 60%)';
COMMENT ON COLUMN proforma_settings.default_bar_utilization_pct IS 'Default % of standing capacity actually achieved (typically 85%)';

-- Update the summary view to include new standing bar columns
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

  -- Bar Operations (General)
  default_bar_rail_ft_per_guest,
  default_realization_rate,

  -- Standing Bar Revenue
  default_bar_avg_spend_per_guest,
  default_bar_food_pct,
  default_bar_bev_pct,
  default_bar_dwell_hours,
  default_bar_active_pct,
  default_bar_utilization_pct,

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
