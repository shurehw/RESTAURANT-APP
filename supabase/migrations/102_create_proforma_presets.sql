-- Create table for storing complete proforma setting presets
-- Users can save their entire proforma configuration as named presets

CREATE TABLE proforma_setting_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Preset metadata
  preset_name TEXT NOT NULL,
  description TEXT,
  is_system_default BOOLEAN DEFAULT FALSE, -- System presets (Nice Guy, Fast Casual, etc.)
  is_org_default BOOLEAN DEFAULT FALSE,    -- Organization's default preset

  -- Complete settings snapshot (stores all proforma_settings columns)
  settings JSONB NOT NULL,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_preset_name_per_org UNIQUE(org_id, preset_name)
);

-- Indexes
CREATE INDEX idx_proforma_presets_org ON proforma_setting_presets(org_id);

-- Partial unique index to ensure only one org default per organization
CREATE UNIQUE INDEX idx_only_one_org_default_per_org
  ON proforma_setting_presets(org_id)
  WHERE is_org_default = TRUE;

-- RLS Policies
ALTER TABLE proforma_setting_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view presets in their organization"
  ON proforma_setting_presets FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can create presets in their organization"
  ON proforma_setting_presets FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can update presets in their organization"
  ON proforma_setting_presets FOR UPDATE
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can delete non-system presets in their organization"
  ON proforma_setting_presets FOR DELETE
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND is_system_default = FALSE
  );

-- Updated timestamp trigger
CREATE TRIGGER update_proforma_presets_updated_at
  BEFORE UPDATE ON proforma_setting_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert system default presets
-- These represent common industry configurations

-- Nice Guy Hospitality Standards (Premium Casual)
INSERT INTO proforma_setting_presets (org_id, preset_name, description, is_system_default, settings)
SELECT
  id as org_id,
  'Nice Guy Hospitality Standards',
  'Premium casual dining with balanced bar program - industry best practices',
  TRUE,
  jsonb_build_object(
    'default_density_benchmark', 'premium-casual',
    'premium_casual_sf_per_seat_min', 22,
    'premium_casual_sf_per_seat_max', 26,
    'premium_casual_dining_area_pct_min', 65,
    'premium_casual_dining_area_pct_max', 75,
    'default_concept_archetype', 'balanced_resto_bar',
    'default_bar_zone_pct', 15,
    'default_bar_net_to_gross', 0.70,
    'default_standable_pct', 0.60,
    'default_sf_per_standing_guest', 8.0,
    'default_utilization_factor', 0.85,
    'bar_lf_ratio', 0.02,
    'bar_min_lf', 22,
    'bar_max_lf', 50,
    'bar_inches_per_seat', 24,
    'bar_max_pct_of_dining', 25,
    'default_food_cogs_pct', 28,
    'default_bev_cogs_pct', 22,
    'default_other_cogs_pct', 20,
    'default_foh_hours_per_100_covers', 12,
    'default_boh_hours_per_100_covers', 8,
    'default_foh_hourly_rate', 18,
    'default_boh_hourly_rate', 20,
    'default_payroll_burden_pct', 25,
    'default_food_mix_pct', 60,
    'default_bev_mix_pct', 35,
    'default_other_mix_pct', 5,
    'default_ramp_months', 12,
    'default_ramp_start_pct', 80,
    'default_ramp_curve', 'linear'
  )
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM proforma_setting_presets
  WHERE preset_name = 'Nice Guy Hospitality Standards'
  AND org_id = organizations.id
);

-- Fast Casual / QSR
INSERT INTO proforma_setting_presets (org_id, preset_name, description, is_system_default, settings)
SELECT
  id as org_id,
  'Fast Casual / QSR',
  'Quick service restaurant with minimal bar, high efficiency operations',
  TRUE,
  jsonb_build_object(
    'default_density_benchmark', 'fast-casual',
    'fast_casual_sf_per_seat_min', 12,
    'fast_casual_sf_per_seat_max', 18,
    'fast_casual_dining_area_pct_min', 55,
    'fast_casual_dining_area_pct_max', 65,
    'default_concept_archetype', 'dining_led',
    'default_bar_zone_pct', 10,
    'default_bar_net_to_gross', 0.65,
    'default_standable_pct', 0.50,
    'default_sf_per_standing_guest', 9.5,
    'default_utilization_factor', 0.80,
    'bar_lf_ratio', 0.015,
    'bar_min_lf', 15,
    'bar_max_lf', 30,
    'bar_inches_per_seat', 24,
    'bar_max_pct_of_dining', 15,
    'default_food_cogs_pct', 30,
    'default_bev_cogs_pct', 25,
    'default_other_cogs_pct', 20,
    'default_foh_hours_per_100_covers', 8,
    'default_boh_hours_per_100_covers', 6,
    'default_foh_hourly_rate', 15,
    'default_boh_hourly_rate', 17,
    'default_payroll_burden_pct', 25,
    'default_food_mix_pct', 70,
    'default_bev_mix_pct', 25,
    'default_other_mix_pct', 5,
    'default_ramp_months', 6,
    'default_ramp_start_pct', 85,
    'default_ramp_curve', 'linear'
  )
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM proforma_setting_presets
  WHERE preset_name = 'Fast Casual / QSR'
  AND org_id = organizations.id
);

-- Fine Dining
INSERT INTO proforma_setting_presets (org_id, preset_name, description, is_system_default, settings)
SELECT
  id as org_id,
  'Fine Dining',
  'Upscale full-service dining with extensive wine/cocktail program',
  TRUE,
  jsonb_build_object(
    'default_density_benchmark', 'fine-dining',
    'fine_dining_sf_per_seat_min', 28,
    'fine_dining_sf_per_seat_max', 40,
    'fine_dining_dining_area_pct_min', 70,
    'fine_dining_dining_area_pct_max', 80,
    'default_concept_archetype', 'balanced_resto_bar',
    'default_bar_zone_pct', 18,
    'default_bar_net_to_gross', 0.72,
    'default_standable_pct', 0.65,
    'default_sf_per_standing_guest', 7.5,
    'default_utilization_factor', 0.87,
    'bar_lf_ratio', 0.025,
    'bar_min_lf', 30,
    'bar_max_lf', 60,
    'bar_inches_per_seat', 26,
    'bar_max_pct_of_dining', 30,
    'default_food_cogs_pct', 32,
    'default_bev_cogs_pct', 20,
    'default_other_cogs_pct', 18,
    'default_foh_hours_per_100_covers', 18,
    'default_boh_hours_per_100_covers', 12,
    'default_foh_hourly_rate', 22,
    'default_boh_hourly_rate', 25,
    'default_payroll_burden_pct', 28,
    'default_food_mix_pct', 55,
    'default_bev_mix_pct', 40,
    'default_other_mix_pct', 5,
    'default_ramp_months', 18,
    'default_ramp_start_pct', 70,
    'default_ramp_curve', 'exponential'
  )
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM proforma_setting_presets
  WHERE preset_name = 'Fine Dining'
  AND org_id = organizations.id
);

-- Bar-Forward / Cocktail Lounge
INSERT INTO proforma_setting_presets (org_id, preset_name, description, is_system_default, settings)
SELECT
  id as org_id,
  'Bar-Forward / Cocktail Lounge',
  'Beverage-focused concept with significant standing bar capacity',
  TRUE,
  jsonb_build_object(
    'default_density_benchmark', 'bar-lounge',
    'bar_lounge_sf_per_seat_min', 14,
    'bar_lounge_sf_per_seat_max', 20,
    'bar_lounge_dining_area_pct_min', 50,
    'bar_lounge_dining_area_pct_max', 65,
    'default_concept_archetype', 'bar_forward',
    'default_bar_zone_pct', 22,
    'default_bar_net_to_gross', 0.72,
    'default_standable_pct', 0.70,
    'default_sf_per_standing_guest', 7.0,
    'default_utilization_factor', 0.88,
    'bar_lf_ratio', 0.03,
    'bar_min_lf', 35,
    'bar_max_lf', 70,
    'bar_inches_per_seat', 22,
    'bar_max_pct_of_dining', 40,
    'default_food_cogs_pct', 25,
    'default_bev_cogs_pct', 18,
    'default_other_cogs_pct', 15,
    'default_foh_hours_per_100_covers', 10,
    'default_boh_hours_per_100_covers', 5,
    'default_foh_hourly_rate', 20,
    'default_boh_hourly_rate', 22,
    'default_payroll_burden_pct', 25,
    'default_food_mix_pct', 35,
    'default_bev_mix_pct', 60,
    'default_other_mix_pct', 5,
    'default_ramp_months', 9,
    'default_ramp_start_pct', 75,
    'default_ramp_curve', 'linear'
  )
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM proforma_setting_presets
  WHERE preset_name = 'Bar-Forward / Cocktail Lounge'
  AND org_id = organizations.id
);

COMMENT ON TABLE proforma_setting_presets IS 'Stores complete proforma configuration presets that users can save, load, and share';
COMMENT ON COLUMN proforma_setting_presets.settings IS 'Complete JSONB snapshot of all proforma_settings columns for this preset';
COMMENT ON COLUMN proforma_setting_presets.is_system_default IS 'Built-in presets provided by the system (cannot be deleted)';
COMMENT ON COLUMN proforma_setting_presets.is_org_default IS 'The organization default preset that applies to new projects';
