-- ============================================================================
-- COMPLETE FP&A-GRADE LABOR MODEL
-- Combines migrations 107-110 into single migration
-- ============================================================================

-- ============================================================================
-- PART 1: POSITION TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS proforma_labor_position_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_type text NOT NULL,
  position_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('FOH', 'BOH')),
  labor_driver_type text DEFAULT 'VOLUME' CHECK (labor_driver_type IN ('VOLUME', 'PRESENCE', 'THRESHOLD')),

  -- For VOLUME positions
  hours_per_100_covers numeric(5,2),
  hourly_rate numeric(10,2) NOT NULL,

  -- For PRESENCE/THRESHOLD positions
  staff_per_service numeric(5,2),
  hours_per_shift numeric(5,2),
  cover_threshold integer,

  applies_to text[] DEFAULT '{dining,bar,pdr}',
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(concept_type, position_name)
);

COMMENT ON TABLE proforma_labor_position_templates IS 'Position-level labor templates by concept type with three-tier classification';
COMMENT ON COLUMN proforma_labor_position_templates.labor_driver_type IS 'VOLUME = hrs/100 covers | PRESENCE = fixed per service | THRESHOLD = step-function';
COMMENT ON COLUMN proforma_labor_position_templates.staff_per_service IS 'For PRESENCE/THRESHOLD: staff count per service period';
COMMENT ON COLUMN proforma_labor_position_templates.hours_per_shift IS 'For PRESENCE/THRESHOLD: hours per staff shift';
COMMENT ON COLUMN proforma_labor_position_templates.cover_threshold IS 'For THRESHOLD: cover count that triggers additional staff';

-- ============================================================================
-- PART 2: LABOR % VALIDATION RANGES TO SETTINGS
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

-- ============================================================================
-- PART 3: PRELOAD VOLUME-ELASTIC POSITIONS (CLASS 1)
-- ============================================================================

-- FAST CASUAL
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, labor_driver_type, hours_per_100_covers, hourly_rate, applies_to) VALUES
('Fast Casual', 'Cashier/Counter', 'FOH', 'VOLUME', 10.0, 16.00, '{dining,bar}'),
('Fast Casual', 'Expo/Runner', 'FOH', 'VOLUME', 6.0, 17.00, '{dining}'),
('Fast Casual', 'Floor Support', 'FOH', 'VOLUME', 4.0, 16.00, '{dining,bar}'),
('Fast Casual', 'Line Cook', 'BOH', 'VOLUME', 14.0, 20.00, '{dining,bar}'),
('Fast Casual', 'Prep Cook', 'BOH', 'VOLUME', 8.0, 18.00, '{dining,bar}'),
('Fast Casual', 'Dishwasher', 'BOH', 'VOLUME', 3.0, 16.00, '{dining,bar}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- CASUAL DINING
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, labor_driver_type, hours_per_100_covers, hourly_rate, applies_to) VALUES
('Casual Dining', 'Server', 'FOH', 'VOLUME', 14.0, 18.00, '{dining}'),
('Casual Dining', 'Bartender', 'FOH', 'VOLUME', 6.0, 22.00, '{bar}'),
('Casual Dining', 'Host', 'FOH', 'VOLUME', 4.0, 17.00, '{dining}'),
('Casual Dining', 'Support/Runner', 'FOH', 'VOLUME', 6.0, 19.00, '{dining,bar}'),
('Casual Dining', 'Barback', 'FOH', 'VOLUME', 2.0, 18.00, '{bar}'),
('Casual Dining', 'Line Cook', 'BOH', 'VOLUME', 18.0, 22.00, '{dining,bar}'),
('Casual Dining', 'Prep Cook', 'BOH', 'VOLUME', 10.0, 20.00, '{dining,bar}'),
('Casual Dining', 'Dishwasher', 'BOH', 'VOLUME', 4.0, 17.00, '{dining,bar,pdr}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- PREMIUM CASUAL
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, labor_driver_type, hours_per_100_covers, hourly_rate, applies_to) VALUES
('Premium Casual', 'Server', 'FOH', 'VOLUME', 16.0, 20.00, '{dining}'),
('Premium Casual', 'Bartender', 'FOH', 'VOLUME', 8.0, 24.00, '{bar}'),
('Premium Casual', 'Host', 'FOH', 'VOLUME', 5.0, 18.00, '{dining,pdr}'),
('Premium Casual', 'Support/Runner', 'FOH', 'VOLUME', 7.0, 20.00, '{dining,bar,pdr}'),
('Premium Casual', 'Barback', 'FOH', 'VOLUME', 2.0, 19.00, '{bar}'),
('Premium Casual', 'Sommelier/Wine', 'FOH', 'VOLUME', 2.0, 26.00, '{dining,pdr}'),
('Premium Casual', 'Line Cook', 'BOH', 'VOLUME', 20.0, 24.00, '{dining,bar,pdr}'),
('Premium Casual', 'Prep Cook', 'BOH', 'VOLUME', 12.0, 22.00, '{dining,bar,pdr}'),
('Premium Casual', 'Pastry/Dessert', 'BOH', 'VOLUME', 3.0, 23.00, '{dining,pdr}'),
('Premium Casual', 'Dishwasher', 'BOH', 'VOLUME', 5.0, 18.00, '{dining,bar,pdr}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- FINE DINING
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, labor_driver_type, hours_per_100_covers, hourly_rate, applies_to) VALUES
('Fine Dining', 'Server', 'FOH', 'VOLUME', 20.0, 22.00, '{dining,pdr}'),
('Fine Dining', 'Bartender', 'FOH', 'VOLUME', 10.0, 26.00, '{bar}'),
('Fine Dining', 'Host/Maître d', 'FOH', 'VOLUME', 6.0, 20.00, '{dining,pdr}'),
('Fine Dining', 'Support/Runner', 'FOH', 'VOLUME', 8.0, 21.00, '{dining,bar,pdr}'),
('Fine Dining', 'Sommelier', 'FOH', 'VOLUME', 4.0, 28.00, '{dining,pdr}'),
('Fine Dining', 'Barback', 'FOH', 'VOLUME', 2.0, 20.00, '{bar}'),
('Fine Dining', 'Line Cook', 'BOH', 'VOLUME', 22.0, 26.00, '{dining,bar,pdr}'),
('Fine Dining', 'Prep Cook', 'BOH', 'VOLUME', 14.0, 24.00, '{dining,bar,pdr}'),
('Fine Dining', 'Pastry Chef', 'BOH', 'VOLUME', 6.0, 25.00, '{dining,pdr}'),
('Fine Dining', 'Dishwasher', 'BOH', 'VOLUME', 6.0, 19.00, '{dining,bar,pdr}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- BAR LOUNGE
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, labor_driver_type, hours_per_100_covers, hourly_rate, applies_to) VALUES
('Bar Lounge', 'Bartender', 'FOH', 'VOLUME', 14.0, 24.00, '{bar}'),
('Bar Lounge', 'Server', 'FOH', 'VOLUME', 6.0, 19.00, '{dining}'),
('Bar Lounge', 'Barback', 'FOH', 'VOLUME', 4.0, 19.00, '{bar}'),
('Bar Lounge', 'Host/Door', 'FOH', 'VOLUME', 2.0, 18.00, '{bar,dining}'),
('Bar Lounge', 'Line Cook', 'BOH', 'VOLUME', 8.0, 22.00, '{dining,bar}'),
('Bar Lounge', 'Prep Cook', 'BOH', 'VOLUME', 4.0, 20.00, '{dining,bar}'),
('Bar Lounge', 'Dishwasher', 'BOH', 'VOLUME', 3.0, 17.00, '{dining,bar}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- NIGHTCLUB
INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, labor_driver_type, hours_per_100_covers, hourly_rate, applies_to) VALUES
('Nightclub', 'Bartender', 'FOH', 'VOLUME', 12.0, 26.00, '{bar}'),
('Nightclub', 'Barback', 'FOH', 'VOLUME', 6.0, 20.00, '{bar}'),
('Nightclub', 'Host/Door', 'FOH', 'VOLUME', 2.0, 19.00, '{bar}'),
('Nightclub', 'Prep Cook', 'BOH', 'VOLUME', 6.0, 21.00, '{bar}'),
('Nightclub', 'Dishwasher', 'BOH', 'VOLUME', 4.0, 18.00, '{bar}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- ============================================================================
-- PART 4: PRELOAD PRESENCE-REQUIRED POSITIONS (CLASS 2)
-- ============================================================================

INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, labor_driver_type, staff_per_service, hours_per_shift, hourly_rate, applies_to) VALUES
('Nightclub', 'Security', 'FOH', 'PRESENCE', 3.0, 8.0, 28.00, '{bar}'),
('Bar Lounge', 'Security', 'FOH', 'PRESENCE', 2.0, 6.0, 28.00, '{bar,dining}'),
('Fine Dining', 'Security/Valet', 'FOH', 'PRESENCE', 1.0, 6.0, 24.00, '{dining,pdr}'),
('Fine Dining', 'Maître d'' (Base)', 'FOH', 'PRESENCE', 1.0, 6.0, 30.00, '{dining,pdr}'),
('Premium Casual', 'Host Captain', 'FOH', 'PRESENCE', 1.0, 6.0, 24.00, '{dining}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- ============================================================================
-- PART 5: PRELOAD THRESHOLD POSITIONS (CLASS 3)
-- ============================================================================

INSERT INTO proforma_labor_position_templates (concept_type, position_name, category, labor_driver_type, staff_per_service, hours_per_shift, hourly_rate, cover_threshold, applies_to) VALUES
('Fine Dining', 'Maître d'' (Additional)', 'FOH', 'THRESHOLD', 1.0, 6.0, 30.00, 250, '{dining,pdr}'),
('Premium Casual', 'Host Captain (Additional)', 'FOH', 'THRESHOLD', 1.0, 6.0, 24.00, 300, '{dining}'),
('Nightclub', 'Barback (Additional)', 'FOH', 'THRESHOLD', 1.0, 6.0, 22.00, 400, '{bar}'),
('Bar Lounge', 'Barback (Additional)', 'FOH', 'THRESHOLD', 1.0, 6.0, 20.00, 300, '{bar}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- ============================================================================
-- PART 6: CONCEPT AGGREGATES VIEW
-- ============================================================================

CREATE OR REPLACE VIEW proforma_labor_concept_aggregates AS
SELECT
  concept_type,
  category,
  SUM(hours_per_100_covers) FILTER (WHERE labor_driver_type = 'VOLUME') as total_hours_per_100,
  ROUND(
    SUM(hours_per_100_covers * hourly_rate) FILTER (WHERE labor_driver_type = 'VOLUME') /
    NULLIF(SUM(hours_per_100_covers) FILTER (WHERE labor_driver_type = 'VOLUME'), 0),
    2
  ) as blended_rate
FROM proforma_labor_position_templates
WHERE is_active = true
GROUP BY concept_type, category
ORDER BY concept_type, category;

COMMENT ON VIEW proforma_labor_concept_aggregates IS 'Layer 1 defaults: FOH/BOH hrs/100 and blended rates by concept';

-- ============================================================================
-- PART 7: POSITION MIX VIEW (WITH THREE TIERS)
-- ============================================================================

CREATE OR REPLACE VIEW proforma_labor_position_mix AS
WITH category_totals AS (
  SELECT
    concept_type,
    category,
    SUM(hours_per_100_covers) as total_hours_per_100
  FROM proforma_labor_position_templates
  WHERE is_active = true AND labor_driver_type = 'VOLUME'
  GROUP BY concept_type, category
)
SELECT
  t.concept_type,
  t.position_name,
  t.category,
  t.labor_driver_type,
  t.hours_per_100_covers,
  t.hourly_rate,
  t.applies_to,
  t.staff_per_service,
  t.hours_per_shift,
  t.cover_threshold,
  ct.total_hours_per_100 as category_total_hours_per_100,
  CASE
    WHEN t.labor_driver_type = 'VOLUME' AND ct.total_hours_per_100 > 0
    THEN ROUND((t.hours_per_100_covers / ct.total_hours_per_100) * 100, 1)
    ELSE NULL
  END as position_mix_pct
FROM proforma_labor_position_templates t
LEFT JOIN category_totals ct
  ON ct.concept_type = t.concept_type AND ct.category = t.category
WHERE t.is_active = true
ORDER BY t.concept_type, t.category,
  CASE t.labor_driver_type WHEN 'VOLUME' THEN 1 WHEN 'PRESENCE' THEN 2 WHEN 'THRESHOLD' THEN 3 END,
  t.position_name;

COMMENT ON VIEW proforma_labor_position_mix IS 'Three-tier position classification with mix % for VOLUME positions';

-- ============================================================================
-- PART 8: MONTHLY COVERS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_covers AS
WITH service_weeks AS (
  SELECT
    s.id as scenario_id,
    sp.id as service_period_id,
    sp.service_name,
    COALESCE(SUM(spc.covers_per_service) FILTER (
      WHERE rc.is_bar = false OR (rc.is_bar AND (csp.bar_mode_override = 'seated' OR (csp.bar_mode_override IS NULL AND rc.bar_mode = 'seated')))
    ), 0) as dining_covers_per_service,
    COALESCE(SUM(csp.bar_guests), 0) as bar_guests_per_service,
    COALESCE(SUM(csp.pdr_covers), 0) as pdr_covers_per_service,
    COALESCE(array_length(sp.operating_days, 1), 7) as operating_days
  FROM proforma_scenarios s
  JOIN proforma_revenue_service_periods sp ON sp.scenario_id = s.id
  LEFT JOIN proforma_center_service_participation csp ON csp.service_period_id = sp.id AND csp.is_active = true
  LEFT JOIN proforma_revenue_centers rc ON rc.id = csp.revenue_center_id
  LEFT JOIN proforma_service_period_covers spc ON spc.service_period_id = sp.id AND spc.revenue_center_id = rc.id
  GROUP BY s.id, sp.id, sp.service_name, sp.operating_days
),
weekly_totals AS (
  SELECT
    scenario_id,
    SUM(dining_covers_per_service * operating_days) as dining_covers_per_week,
    SUM(bar_guests_per_service * operating_days) as bar_guests_per_week,
    SUM(pdr_covers_per_service * operating_days) as pdr_covers_per_week
  FROM service_weeks
  GROUP BY scenario_id
)
SELECT
  wt.scenario_id,
  month_num,
  ROUND(wt.dining_covers_per_week * 52 / 12 * COALESCE((ramp_curve->>(month_num - 1))::numeric, 1.0)) as dining_covers,
  ROUND(wt.bar_guests_per_week * 52 / 12 * COALESCE((ramp_curve->>(month_num - 1))::numeric, 1.0)) as bar_guests,
  ROUND(wt.pdr_covers_per_week * 52 / 12 * COALESCE((ramp_curve->>(month_num - 1))::numeric, 1.0)) as pdr_covers,
  ROUND((wt.dining_covers_per_week + wt.bar_guests_per_week + wt.pdr_covers_per_week) * 52 / 12 * COALESCE((ramp_curve->>(month_num - 1))::numeric, 1.0)) as total_covers
FROM weekly_totals wt
JOIN proforma_scenarios s ON s.id = wt.scenario_id
JOIN proforma_revenue_assumptions ra ON ra.scenario_id = s.id
CROSS JOIN generate_series(1, 12) as month_num;

COMMENT ON VIEW proforma_monthly_covers IS 'Monthly cover forecast by scenario (source of truth for labor calculations)';

-- ============================================================================
-- PART 9: MONTHLY LABOR HOURS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_labor_hours AS
SELECT
  mc.scenario_id,
  mc.month_num,
  mc.total_covers,
  la.foh_hours_per_100_covers,
  la.boh_hours_per_100_covers,
  ROUND(mc.total_covers * la.foh_hours_per_100_covers / 100.0, 1) as foh_hours,
  ROUND(mc.total_covers * la.boh_hours_per_100_covers / 100.0, 1) as boh_hours,
  ROUND(mc.total_covers * (la.foh_hours_per_100_covers + la.boh_hours_per_100_covers) / 100.0, 1) as total_hours
FROM proforma_monthly_covers mc
JOIN proforma_labor_assumptions la ON la.scenario_id = mc.scenario_id;

COMMENT ON VIEW proforma_monthly_labor_hours IS 'Monthly labor hours driven by covers × productivity';

-- ============================================================================
-- PART 10: MONTHLY POSITION HOURS (THREE-TIER CALCULATION)
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_position_hours AS
WITH labor_hours AS (
  SELECT scenario_id, month_num, total_covers, foh_hours, boh_hours
  FROM proforma_monthly_labor_hours
),
scenario_concept AS (
  SELECT s.id as scenario_id, 'Casual Dining' as concept_type
  FROM proforma_scenarios s
),
service_period_info AS (
  SELECT s.id as scenario_id, COUNT(DISTINCT sp.id) as active_services
  FROM proforma_scenarios s
  JOIN proforma_revenue_service_periods sp ON sp.scenario_id = s.id
  GROUP BY s.id
),
volume_positions AS (
  SELECT
    lh.scenario_id, lh.month_num, lh.total_covers, sc.concept_type,
    pm.position_name, pm.category, pm.labor_driver_type, pm.hourly_rate, pm.applies_to, pm.position_mix_pct,
    CASE WHEN pm.category = 'FOH' THEN lh.foh_hours WHEN pm.category = 'BOH' THEN lh.boh_hours END as category_total_hours,
    ROUND(CASE WHEN pm.category = 'FOH' THEN lh.foh_hours * (pm.position_mix_pct / 100.0) WHEN pm.category = 'BOH' THEN lh.boh_hours * (pm.position_mix_pct / 100.0) END, 1) as position_hours,
    NULL::numeric as staff_per_service, NULL::numeric as hours_per_shift, NULL::integer as cover_threshold
  FROM labor_hours lh
  JOIN scenario_concept sc ON sc.scenario_id = lh.scenario_id
  JOIN proforma_labor_position_mix pm ON pm.concept_type = sc.concept_type
  WHERE pm.labor_driver_type = 'VOLUME'
),
presence_positions AS (
  SELECT
    lh.scenario_id, lh.month_num, lh.total_covers, sc.concept_type,
    pm.position_name, pm.category, pm.labor_driver_type, pm.hourly_rate, pm.applies_to,
    NULL::numeric as position_mix_pct, NULL::numeric as category_total_hours,
    ROUND(pm.staff_per_service * pm.hours_per_shift * spi.active_services * 7 * 4.33, 1) as position_hours,
    pm.staff_per_service, pm.hours_per_shift, NULL::integer as cover_threshold
  FROM labor_hours lh
  JOIN scenario_concept sc ON sc.scenario_id = lh.scenario_id
  JOIN service_period_info spi ON spi.scenario_id = lh.scenario_id
  JOIN proforma_labor_position_mix pm ON pm.concept_type = sc.concept_type
  WHERE pm.labor_driver_type = 'PRESENCE'
),
threshold_positions AS (
  SELECT
    lh.scenario_id, lh.month_num, lh.total_covers, sc.concept_type,
    pm.position_name, pm.category, pm.labor_driver_type, pm.hourly_rate, pm.applies_to,
    NULL::numeric as position_mix_pct, NULL::numeric as category_total_hours,
    CASE WHEN lh.total_covers >= pm.cover_threshold
    THEN ROUND(pm.staff_per_service * pm.hours_per_shift * spi.active_services * 7 * 4.33, 1) ELSE 0 END as position_hours,
    pm.staff_per_service, pm.hours_per_shift, pm.cover_threshold
  FROM labor_hours lh
  JOIN scenario_concept sc ON sc.scenario_id = lh.scenario_id
  JOIN service_period_info spi ON spi.scenario_id = lh.scenario_id
  JOIN proforma_labor_position_mix pm ON pm.concept_type = sc.concept_type
  WHERE pm.labor_driver_type = 'THRESHOLD'
),
all_positions AS (
  SELECT * FROM volume_positions
  UNION ALL SELECT * FROM presence_positions
  UNION ALL SELECT * FROM threshold_positions
)
SELECT
  scenario_id, month_num, total_covers, concept_type, position_name, category, labor_driver_type,
  hourly_rate, applies_to, position_mix_pct, category_total_hours, position_hours,
  staff_per_service, hours_per_shift, cover_threshold,
  ROUND(position_hours * hourly_rate, 2) as position_labor_cost,
  CASE
    WHEN labor_driver_type = 'VOLUME' THEN ROUND(position_hours / CASE WHEN category = 'FOH' THEN 6.0 WHEN category = 'BOH' THEN 8.0 END, 1)
    WHEN labor_driver_type IN ('PRESENCE', 'THRESHOLD') THEN staff_per_service
    ELSE NULL
  END as implied_shifts
FROM all_positions
WHERE position_hours > 0;

COMMENT ON VIEW proforma_monthly_position_hours IS 'Three-tier labor calculation: VOLUME + PRESENCE + THRESHOLD';

-- ============================================================================
-- PART 11: MONTHLY LABOR COST VIEW
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_labor_cost AS
WITH hourly_labor AS (
  SELECT
    mlh.scenario_id, mlh.month_num, mlh.total_covers, mlh.foh_hours, mlh.boh_hours, mlh.total_hours,
    la.foh_hourly_rate, la.boh_hourly_rate,
    ROUND(mlh.foh_hours * la.foh_hourly_rate, 2) as foh_wages,
    ROUND(mlh.boh_hours * la.boh_hourly_rate, 2) as boh_wages,
    ROUND(mlh.foh_hours * la.foh_hourly_rate + mlh.boh_hours * la.boh_hourly_rate, 2) as total_hourly_wages,
    ROUND(COALESCE(la.gm_salary_annual, 0) / 12.0, 2) as gm_salary_monthly,
    ROUND(COALESCE(la.agm_salary_annual, 0) / 12.0, 2) as agm_salary_monthly,
    ROUND(COALESCE(la.km_salary_annual, 0) / 12.0, 2) as km_salary_monthly,
    la.payroll_burden_pct
  FROM proforma_monthly_labor_hours mlh
  JOIN proforma_labor_assumptions la ON la.scenario_id = mlh.scenario_id
),
salaried_roles AS (
  SELECT scenario_id, month_num, COALESCE(SUM(annual_salary / 12.0), 0) as additional_salary_monthly
  FROM proforma_labor_salaried_roles
  CROSS JOIN generate_series(1, 12) as month_num
  WHERE month_num >= start_month AND (end_month IS NULL OR month_num <= end_month)
  GROUP BY scenario_id, month_num
)
SELECT
  hl.scenario_id, hl.month_num, hl.total_covers, hl.foh_hours, hl.boh_hours, hl.total_hours,
  hl.foh_wages, hl.boh_wages, hl.total_hourly_wages,
  hl.gm_salary_monthly, hl.agm_salary_monthly, hl.km_salary_monthly,
  COALESCE(sr.additional_salary_monthly, 0) as additional_salary_monthly,
  (hl.gm_salary_monthly + hl.agm_salary_monthly + hl.km_salary_monthly + COALESCE(sr.additional_salary_monthly, 0)) as total_salary_monthly,
  (hl.total_hourly_wages + hl.gm_salary_monthly + hl.agm_salary_monthly + hl.km_salary_monthly + COALESCE(sr.additional_salary_monthly, 0)) as gross_wages,
  ROUND((hl.total_hourly_wages + hl.gm_salary_monthly + hl.agm_salary_monthly + hl.km_salary_monthly + COALESCE(sr.additional_salary_monthly, 0)) * hl.payroll_burden_pct, 2) as payroll_burden,
  ROUND((hl.total_hourly_wages + hl.gm_salary_monthly + hl.agm_salary_monthly + hl.km_salary_monthly + COALESCE(sr.additional_salary_monthly, 0)) * (1 + hl.payroll_burden_pct), 2) as total_labor_cost
FROM hourly_labor hl
LEFT JOIN salaried_roles sr ON sr.scenario_id = hl.scenario_id AND sr.month_num = hl.month_num;

COMMENT ON VIEW proforma_monthly_labor_cost IS 'Total labor $ = VOLUME + PRESENCE + THRESHOLD + Salaried + Burden';

-- ============================================================================
-- PART 12: LABOR BENCHMARK HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_labor_benchmarks(concept text)
RETURNS TABLE (
  foh_hours_per_100 numeric,
  boh_hours_per_100 numeric,
  foh_blended_rate numeric,
  boh_blended_rate numeric,
  labor_pct_min numeric,
  labor_pct_max numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    foh.total_hours_per_100, boh.total_hours_per_100, foh.blended_rate, boh.blended_rate,
    CASE concept
      WHEN 'Fast Casual' THEN (SELECT fast_casual_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Casual Dining' THEN (SELECT casual_dining_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Premium Casual' THEN (SELECT premium_casual_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Fine Dining' THEN (SELECT fine_dining_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Bar Lounge' THEN (SELECT bar_lounge_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Nightclub' THEN (SELECT nightclub_labor_pct_min FROM proforma_settings LIMIT 1)
      ELSE 25.0
    END,
    CASE concept
      WHEN 'Fast Casual' THEN (SELECT fast_casual_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Casual Dining' THEN (SELECT casual_dining_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Premium Casual' THEN (SELECT premium_casual_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Fine Dining' THEN (SELECT fine_dining_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Bar Lounge' THEN (SELECT bar_lounge_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Nightclub' THEN (SELECT nightclub_labor_pct_max FROM proforma_settings LIMIT 1)
      ELSE 30.0
    END
  FROM proforma_labor_concept_aggregates foh
  CROSS JOIN proforma_labor_concept_aggregates boh
  WHERE foh.concept_type = concept AND foh.category = 'FOH'
    AND boh.concept_type = concept AND boh.category = 'BOH';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_labor_benchmarks IS 'Returns Layer 1 benchmarks for concept type initialization';

-- ============================================================================
-- PART 13: SCENARIO LABOR POSITIONS (USER OVERRIDES)
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

CREATE INDEX IF NOT EXISTS idx_scenario_labor_positions_scenario ON proforma_scenario_labor_positions (scenario_id);

ALTER TABLE proforma_scenario_labor_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view labor positions for their scenarios" ON proforma_scenario_labor_positions;
DROP POLICY IF EXISTS "Users can manage labor positions for their scenarios" ON proforma_scenario_labor_positions;

CREATE POLICY "Users can view labor positions for their scenarios"
  ON proforma_scenario_labor_positions FOR SELECT
  USING (scenario_id IN (
    SELECT s.id FROM proforma_scenarios s
    JOIN proforma_projects p ON p.id = s.project_id
    WHERE p.org_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid() AND is_active = true)
  ));

CREATE POLICY "Users can manage labor positions for their scenarios"
  ON proforma_scenario_labor_positions FOR ALL
  USING (scenario_id IN (
    SELECT s.id FROM proforma_scenarios s
    JOIN proforma_projects p ON p.id = s.project_id
    WHERE p.org_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid() AND is_active = true)
  ));

COMMENT ON TABLE proforma_scenario_labor_positions IS 'Layer 2: Per-scenario position overrides';
