-- Labor Position Templates
-- Provides concept-based starter defaults for labor modeling
-- Users can work at Layer 1 (aggregated FOH/BOH) or Layer 2 (detailed positions)

-- ============================================================================
-- 1. POSITION TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS proforma_labor_position_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_type text NOT NULL,
  position_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('FOH', 'BOH')),
  hours_per_100_covers numeric(5,2) NOT NULL,
  hourly_rate numeric(10,2) NOT NULL,
  applies_to text[] DEFAULT '{dining,bar,pdr}', -- which revenue streams this position serves
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(concept_type, position_name)
);

COMMENT ON TABLE proforma_labor_position_templates IS 'Position-level labor templates by concept type. Roll up to FOH/BOH aggregates.';
COMMENT ON COLUMN proforma_labor_position_templates.concept_type IS 'Fast Casual, Casual Dining, Premium Casual, Fine Dining, Bar Lounge, Nightclub';
COMMENT ON COLUMN proforma_labor_position_templates.hours_per_100_covers IS 'Productivity benchmark: hours needed per 100 covers';
COMMENT ON COLUMN proforma_labor_position_templates.applies_to IS 'Array of revenue streams: dining, bar, pdr';

-- ============================================================================
-- 2. PRELOAD POSITION TEMPLATES
-- ============================================================================

-- QSR / FAST CASUAL (40-45 total hrs/100)
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, hours_per_100_covers, hourly_rate, applies_to) VALUES
-- FOH (18-22 hrs/100)
('Fast Casual', 'Cashier/Counter', 'FOH', 10.0, 16.00, '{dining,bar}'),
('Fast Casual', 'Expo/Runner', 'FOH', 6.0, 17.00, '{dining}'),
('Fast Casual', 'Floor Support', 'FOH', 4.0, 16.00, '{dining,bar}'),
-- BOH (20-25 hrs/100)
('Fast Casual', 'Line Cook', 'BOH', 14.0, 20.00, '{dining,bar}'),
('Fast Casual', 'Prep Cook', 'BOH', 8.0, 18.00, '{dining,bar}'),
('Fast Casual', 'Dishwasher', 'BOH', 3.0, 16.00, '{dining,bar}');

-- CASUAL FULL SERVICE (60-65 total hrs/100)
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, hours_per_100_covers, hourly_rate, applies_to) VALUES
-- FOH (28-32 hrs/100)
('Casual Dining', 'Server', 'FOH', 14.0, 18.00, '{dining}'),
('Casual Dining', 'Bartender', 'FOH', 6.0, 22.00, '{bar}'),
('Casual Dining', 'Host', 'FOH', 4.0, 17.00, '{dining}'),
('Casual Dining', 'Support/Runner', 'FOH', 6.0, 19.00, '{dining,bar}'),
('Casual Dining', 'Barback', 'FOH', 2.0, 18.00, '{bar}'),
-- BOH (30-35 hrs/100)
('Casual Dining', 'Line Cook', 'BOH', 18.0, 22.00, '{dining,bar}'),
('Casual Dining', 'Prep Cook', 'BOH', 10.0, 20.00, '{dining,bar}'),
('Casual Dining', 'Dishwasher', 'BOH', 4.0, 17.00, '{dining,bar,pdr}');

-- PREMIUM CASUAL / UPSCALE FULL SERVICE (70-80 total hrs/100)
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, hours_per_100_covers, hourly_rate, applies_to) VALUES
-- FOH (35-40 hrs/100)
('Premium Casual', 'Server', 'FOH', 16.0, 20.00, '{dining}'),
('Premium Casual', 'Bartender', 'FOH', 8.0, 24.00, '{bar}'),
('Premium Casual', 'Host', 'FOH', 5.0, 18.00, '{dining,pdr}'),
('Premium Casual', 'Support/Runner', 'FOH', 7.0, 20.00, '{dining,bar,pdr}'),
('Premium Casual', 'Barback', 'FOH', 2.0, 19.00, '{bar}'),
('Premium Casual', 'Sommelier/Wine', 'FOH', 2.0, 26.00, '{dining,pdr}'),
-- BOH (35-40 hrs/100)
('Premium Casual', 'Line Cook', 'BOH', 20.0, 24.00, '{dining,bar,pdr}'),
('Premium Casual', 'Prep Cook', 'BOH', 12.0, 22.00, '{dining,bar,pdr}'),
('Premium Casual', 'Pastry/Dessert', 'BOH', 3.0, 23.00, '{dining,pdr}'),
('Premium Casual', 'Dishwasher', 'BOH', 5.0, 18.00, '{dining,bar,pdr}');

-- FINE DINING (90-100 total hrs/100)
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, hours_per_100_covers, hourly_rate, applies_to) VALUES
-- FOH (45-55 hrs/100)
('Fine Dining', 'Server', 'FOH', 20.0, 22.00, '{dining,pdr}'),
('Fine Dining', 'Bartender', 'FOH', 10.0, 26.00, '{bar}'),
('Fine Dining', 'Host/Maître d', 'FOH', 6.0, 20.00, '{dining,pdr}'),
('Fine Dining', 'Support/Runner', 'FOH', 8.0, 21.00, '{dining,bar,pdr}'),
('Fine Dining', 'Sommelier', 'FOH', 4.0, 28.00, '{dining,pdr}'),
('Fine Dining', 'Barback', 'FOH', 2.0, 20.00, '{bar}'),
-- BOH (40-50 hrs/100)
('Fine Dining', 'Line Cook', 'BOH', 22.0, 26.00, '{dining,bar,pdr}'),
('Fine Dining', 'Prep Cook', 'BOH', 14.0, 24.00, '{dining,bar,pdr}'),
('Fine Dining', 'Pastry Chef', 'BOH', 6.0, 25.00, '{dining,pdr}'),
('Fine Dining', 'Dishwasher', 'BOH', 6.0, 19.00, '{dining,bar,pdr}');

-- BAR LOUNGE / BAR-DRIVEN (35-45 total hrs/100)
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, hours_per_100_covers, hourly_rate, applies_to) VALUES
-- FOH (22-28 hrs/100)
('Bar Lounge', 'Bartender', 'FOH', 14.0, 24.00, '{bar}'),
('Bar Lounge', 'Server', 'FOH', 6.0, 19.00, '{dining}'),
('Bar Lounge', 'Barback', 'FOH', 4.0, 19.00, '{bar}'),
('Bar Lounge', 'Host/Door', 'FOH', 2.0, 18.00, '{bar,dining}'),
-- BOH (12-18 hrs/100)
('Bar Lounge', 'Line Cook', 'BOH', 8.0, 22.00, '{dining,bar}'),
('Bar Lounge', 'Prep Cook', 'BOH', 4.0, 20.00, '{dining,bar}'),
('Bar Lounge', 'Dishwasher', 'BOH', 3.0, 17.00, '{dining,bar}');

-- NIGHTCLUB / STANDING (30-35 total hrs/100)
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, hours_per_100_covers, hourly_rate, applies_to) VALUES
-- FOH (18-24 hrs/100)
('Nightclub', 'Bartender', 'FOH', 12.0, 26.00, '{bar}'),
('Nightclub', 'Barback', 'FOH', 6.0, 20.00, '{bar}'),
('Nightclub', 'Host/Door', 'FOH', 2.0, 19.00, '{bar}'),
('Nightclub', 'Security', 'FOH', 2.0, 22.00, '{bar}'),
-- BOH (8-12 hrs/100)
('Nightclub', 'Prep Cook', 'BOH', 6.0, 21.00, '{bar}'),
('Nightclub', 'Dishwasher', 'BOH', 4.0, 18.00, '{bar}');

-- ============================================================================
-- 3. ADD LABOR % VALIDATION TO SETTINGS
-- ============================================================================

ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS fast_casual_labor_pct_min numeric(5,2) DEFAULT 20.0,
ADD COLUMN IF NOT EXISTS fast_casual_labor_pct_max numeric(5,2) DEFAULT 25.0,
ADD COLUMN IF NOT EXISTS casual_dining_labor_pct_min numeric(5,2) DEFAULT 25.0,
ADD COLUMN IF NOT EXISTS casual_dining_labor_pct_max numeric(5,2) DEFAULT 30.0,
ADD COLUMN IF NOT EXISTS premium_casual_labor_pct_min numeric(5,2) DEFAULT 28.0,
ADD COLUMN IF NOT EXISTS premium_casual_labor_pct_max numeric(5,2) DEFAULT 33.0,
ADD COLUMN IF NOT EXISTS fine_dining_labor_pct_min numeric(5,2) DEFAULT 32.0,
ADD COLUMN IF NOT EXISTS fine_dining_labor_pct_max numeric(5,2) DEFAULT 38.0,
ADD COLUMN IF NOT EXISTS bar_lounge_labor_pct_min numeric(5,2) DEFAULT 22.0,
ADD COLUMN IF NOT EXISTS bar_lounge_labor_pct_max numeric(5,2) DEFAULT 28.0,
ADD COLUMN IF NOT EXISTS nightclub_labor_pct_min numeric(5,2) DEFAULT 18.0,
ADD COLUMN IF NOT EXISTS nightclub_labor_pct_max numeric(5,2) DEFAULT 25.0;

UPDATE proforma_settings
SET
  fast_casual_labor_pct_min = COALESCE(fast_casual_labor_pct_min, 20.0),
  fast_casual_labor_pct_max = COALESCE(fast_casual_labor_pct_max, 25.0),
  casual_dining_labor_pct_min = COALESCE(casual_dining_labor_pct_min, 25.0),
  casual_dining_labor_pct_max = COALESCE(casual_dining_labor_pct_max, 30.0),
  premium_casual_labor_pct_min = COALESCE(premium_casual_labor_pct_min, 28.0),
  premium_casual_labor_pct_max = COALESCE(premium_casual_labor_pct_max, 33.0),
  fine_dining_labor_pct_min = COALESCE(fine_dining_labor_pct_min, 32.0),
  fine_dining_labor_pct_max = COALESCE(fine_dining_labor_pct_max, 38.0),
  bar_lounge_labor_pct_min = COALESCE(bar_lounge_labor_pct_min, 22.0),
  bar_lounge_labor_pct_max = COALESCE(bar_lounge_labor_pct_max, 28.0),
  nightclub_labor_pct_min = COALESCE(nightclub_labor_pct_min, 18.0),
  nightclub_labor_pct_max = COALESCE(nightclub_labor_pct_max, 25.0);

ALTER TABLE proforma_settings
ALTER COLUMN fast_casual_labor_pct_min SET NOT NULL,
ALTER COLUMN fast_casual_labor_pct_max SET NOT NULL,
ALTER COLUMN casual_dining_labor_pct_min SET NOT NULL,
ALTER COLUMN casual_dining_labor_pct_max SET NOT NULL,
ALTER COLUMN premium_casual_labor_pct_min SET NOT NULL,
ALTER COLUMN premium_casual_labor_pct_max SET NOT NULL,
ALTER COLUMN fine_dining_labor_pct_min SET NOT NULL,
ALTER COLUMN fine_dining_labor_pct_max SET NOT NULL,
ALTER COLUMN bar_lounge_labor_pct_min SET NOT NULL,
ALTER COLUMN bar_lounge_labor_pct_max SET NOT NULL,
ALTER COLUMN nightclub_labor_pct_min SET NOT NULL,
ALTER COLUMN nightclub_labor_pct_max SET NOT NULL;

COMMENT ON COLUMN proforma_settings.fast_casual_labor_pct_min IS 'Fast casual labor % floor (validation range)';
COMMENT ON COLUMN proforma_settings.fast_casual_labor_pct_max IS 'Fast casual labor % ceiling (validation range)';
COMMENT ON COLUMN proforma_settings.casual_dining_labor_pct_min IS 'Casual dining labor % floor';
COMMENT ON COLUMN proforma_settings.fine_dining_labor_pct_min IS 'Fine dining labor % floor';

-- ============================================================================
-- 4. HELPER VIEW: CONCEPT AGGREGATES
-- ============================================================================

CREATE OR REPLACE VIEW proforma_labor_concept_aggregates AS
SELECT
  concept_type,
  category,
  SUM(hours_per_100_covers) as total_hours_per_100,
  ROUND(SUM(hours_per_100_covers * hourly_rate) / SUM(hours_per_100_covers), 2) as blended_rate
FROM proforma_labor_position_templates
WHERE is_active = true
GROUP BY concept_type, category
ORDER BY concept_type, category;

COMMENT ON VIEW proforma_labor_concept_aggregates IS
  'Rolls up position templates to FOH/BOH aggregates.
   These are the Layer 1 defaults shown to users.
   FOH hrs/100, BOH hrs/100, blended rates.';

-- ============================================================================
-- 5. SCENARIO LABOR POSITIONS (USER OVERRIDES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS proforma_scenario_labor_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES proforma_scenarios(id) ON DELETE CASCADE,
  position_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('FOH', 'BOH')),
  hours_per_100_covers numeric(5,2) NOT NULL,
  hourly_rate numeric(10,2) NOT NULL,
  applies_to text[] DEFAULT '{dining,bar,pdr}',
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_labor_positions_scenario
  ON proforma_scenario_labor_positions (scenario_id);

-- Enable RLS
ALTER TABLE proforma_scenario_labor_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view labor positions for their scenarios" ON proforma_scenario_labor_positions;
DROP POLICY IF EXISTS "Users can manage labor positions for their scenarios" ON proforma_scenario_labor_positions;

CREATE POLICY "Users can view labor positions for their scenarios"
  ON proforma_scenario_labor_positions FOR SELECT
  USING (
    scenario_id IN (
      SELECT s.id FROM proforma_scenarios s
      JOIN proforma_projects p ON p.id = s.project_id
      WHERE p.org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can manage labor positions for their scenarios"
  ON proforma_scenario_labor_positions FOR ALL
  USING (
    scenario_id IN (
      SELECT s.id FROM proforma_scenarios s
      JOIN proforma_projects p ON p.id = s.project_id
      WHERE p.org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

COMMENT ON TABLE proforma_scenario_labor_positions IS
  'Layer 2: Per-scenario position-level labor overrides.
   If empty, scenario uses concept template defaults (Layer 1).
   If populated, these override template values.';
