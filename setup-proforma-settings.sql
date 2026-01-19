-- Combined script to set up proforma_settings with FP&A defaults
-- Run this if migrations haven't been applied yet

-- Step 1: Create proforma_settings table (from migration 081)
CREATE TABLE IF NOT EXISTS proforma_settings (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- Seating density benchmarks (can be customized per org)
  default_density_benchmark text NOT NULL DEFAULT 'casual-dining',

  -- Bar calculation settings
  bar_lf_ratio numeric(5,4) NOT NULL DEFAULT 0.0200,
  bar_min_lf numeric(5,2) NOT NULL DEFAULT 22,
  bar_max_lf numeric(5,2) NOT NULL DEFAULT 50,
  bar_inches_per_seat numeric(5,2) NOT NULL DEFAULT 24,
  bar_max_pct_of_dining numeric(5,2) NOT NULL DEFAULT 25,

  -- Default projection settings
  default_projection_years int NOT NULL DEFAULT 5,
  default_sf_per_seat numeric(6,2) NOT NULL DEFAULT 20,
  default_dining_area_pct numeric(5,2) NOT NULL DEFAULT 65,
  default_boh_pct numeric(5,2) NOT NULL DEFAULT 30,

  -- COGS defaults
  default_food_cogs_pct numeric(5,2) NOT NULL DEFAULT 28,
  default_bev_cogs_pct numeric(5,2) NOT NULL DEFAULT 22,
  default_other_cogs_pct numeric(5,2) NOT NULL DEFAULT 20,

  -- Labor productivity defaults
  default_foh_hours_per_100_covers numeric(6,2) NOT NULL DEFAULT 12,
  default_boh_hours_per_100_covers numeric(6,2) NOT NULL DEFAULT 8,
  default_foh_hourly_rate numeric(10,2) NOT NULL DEFAULT 18,
  default_boh_hourly_rate numeric(10,2) NOT NULL DEFAULT 20,
  default_payroll_burden_pct numeric(5,2) NOT NULL DEFAULT 25,

  -- OpEx defaults
  default_linen_pct numeric(5,2) NOT NULL DEFAULT 1.5,
  default_smallwares_pct numeric(5,2) NOT NULL DEFAULT 1.0,
  default_cleaning_pct numeric(5,2) NOT NULL DEFAULT 0.5,
  default_cc_fees_pct numeric(5,2) NOT NULL DEFAULT 2.5,
  default_marketing_pct numeric(5,2) NOT NULL DEFAULT 3.0,
  default_gna_pct numeric(5,2) NOT NULL DEFAULT 5.0,

  -- FP&A Standing Capacity defaults (from migration 100)
  default_concept_archetype text NOT NULL DEFAULT 'balanced_resto_bar'
    CHECK (default_concept_archetype IN ('dining_led', 'balanced_resto_bar', 'bar_forward', 'lounge_nightlife')),
  default_bar_zone_pct numeric(5,2) NOT NULL DEFAULT 15.00
    CHECK (default_bar_zone_pct >= 0 AND default_bar_zone_pct <= 100),
  default_bar_net_to_gross numeric(4,2) NOT NULL DEFAULT 0.70
    CHECK (default_bar_net_to_gross > 0 AND default_bar_net_to_gross <= 1),
  default_standable_pct numeric(4,2) NOT NULL DEFAULT 0.60
    CHECK (default_standable_pct >= 0 AND default_standable_pct <= 1),
  default_sf_per_standing_guest numeric(5,2) NOT NULL DEFAULT 8.00
    CHECK (default_sf_per_standing_guest > 0),
  default_utilization_factor numeric(4,2) NOT NULL DEFAULT 0.85
    CHECK (default_utilization_factor > 0 AND default_utilization_factor <= 1),
  default_code_sf_per_person numeric(5,2) NOT NULL DEFAULT 15.00
    CHECK (default_code_sf_per_person > 0),

  -- Seating density benchmarks
  fine_dining_sf_per_seat_min numeric(5,2) NOT NULL DEFAULT 25.0,
  fine_dining_sf_per_seat_max numeric(5,2) NOT NULL DEFAULT 30.0,
  fine_dining_dining_pct_min numeric(5,2) NOT NULL DEFAULT 50.0,
  fine_dining_dining_pct_max numeric(5,2) NOT NULL DEFAULT 60.0,

  casual_dining_sf_per_seat_min numeric(5,2) NOT NULL DEFAULT 18.0,
  casual_dining_sf_per_seat_max numeric(5,2) NOT NULL DEFAULT 22.0,
  casual_dining_dining_pct_min numeric(5,2) NOT NULL DEFAULT 60.0,
  casual_dining_dining_pct_max numeric(5,2) NOT NULL DEFAULT 70.0,

  fast_casual_sf_per_seat_min numeric(5,2) NOT NULL DEFAULT 12.0,
  fast_casual_sf_per_seat_max numeric(5,2) NOT NULL DEFAULT 16.0,
  fast_casual_dining_pct_min numeric(5,2) NOT NULL DEFAULT 65.0,
  fast_casual_dining_pct_max numeric(5,2) NOT NULL DEFAULT 75.0,

  qsr_sf_per_seat_min numeric(5,2) NOT NULL DEFAULT 8.0,
  qsr_sf_per_seat_max numeric(5,2) NOT NULL DEFAULT 12.0,
  qsr_dining_pct_min numeric(5,2) NOT NULL DEFAULT 50.0,
  qsr_dining_pct_max numeric(5,2) NOT NULL DEFAULT 60.0,

  bar_tavern_sf_per_seat_min numeric(5,2) NOT NULL DEFAULT 15.0,
  bar_tavern_sf_per_seat_max numeric(5,2) NOT NULL DEFAULT 20.0,
  bar_tavern_dining_pct_min numeric(5,2) NOT NULL DEFAULT 65.0,
  bar_tavern_dining_pct_max numeric(5,2) NOT NULL DEFAULT 75.0,

  coffee_shop_sf_per_seat_min numeric(5,2) NOT NULL DEFAULT 10.0,
  coffee_shop_sf_per_seat_max numeric(5,2) NOT NULL DEFAULT 15.0,
  coffee_shop_dining_pct_min numeric(5,2) NOT NULL DEFAULT 60.0,
  coffee_shop_dining_pct_max numeric(5,2) NOT NULL DEFAULT 70.0,

  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Step 2: Enable RLS
ALTER TABLE proforma_settings ENABLE ROW LEVEL SECURITY;

-- Step 3: Create RLS policies
DROP POLICY IF EXISTS "Users can view settings for their organization" ON proforma_settings;
CREATE POLICY "Users can view settings for their organization"
  ON proforma_settings FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update settings for their organization" ON proforma_settings;
CREATE POLICY "Users can update settings for their organization"
  ON proforma_settings FOR UPDATE
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "System can insert settings" ON proforma_settings;
CREATE POLICY "System can insert settings"
  ON proforma_settings FOR INSERT
  WITH CHECK (true);

-- Step 4: Create helper function
CREATE OR REPLACE FUNCTION get_proforma_settings(p_org_id uuid)
RETURNS proforma_settings
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_settings proforma_settings;
BEGIN
  SELECT * INTO v_settings
  FROM proforma_settings
  WHERE org_id = p_org_id;

  IF NOT FOUND THEN
    INSERT INTO proforma_settings (org_id)
    VALUES (p_org_id)
    RETURNING * INTO v_settings;
  END IF;

  RETURN v_settings;
END;
$$;

-- Step 5: Create default settings for existing organizations
INSERT INTO proforma_settings (org_id)
SELECT id FROM organizations
ON CONFLICT (org_id) DO NOTHING;

SELECT 'Proforma settings table created successfully with FP&A defaults!' AS status;
