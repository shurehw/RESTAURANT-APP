-- Three-Tier Labor Classification System
-- Class 1: VOLUME-ELASTIC (scales with covers)
-- Class 2: PRESENCE-REQUIRED (fixed per service period)
-- Class 3: THRESHOLD (step-function based on volume)

-- ============================================================================
-- 1. ADD LABOR DRIVER TYPE TO POSITION TEMPLATES
-- ============================================================================

ALTER TABLE proforma_labor_position_templates
ADD COLUMN IF NOT EXISTS labor_driver_type text DEFAULT 'VOLUME' CHECK (labor_driver_type IN ('VOLUME', 'PRESENCE', 'THRESHOLD'));

ALTER TABLE proforma_labor_position_templates
ADD COLUMN IF NOT EXISTS staff_per_service numeric(5,2),  -- for PRESENCE roles
ADD COLUMN IF NOT EXISTS hours_per_shift numeric(5,2),    -- for PRESENCE roles
ADD COLUMN IF NOT EXISTS cover_threshold integer;         -- for THRESHOLD roles (kicks in after X covers)

COMMENT ON COLUMN proforma_labor_position_templates.labor_driver_type IS
  'VOLUME = scales with covers (hrs/100 covers)
   PRESENCE = fixed per active service period (security, maître d if always on)
   THRESHOLD = kicks in after cover threshold (extra maître d after 250 covers)';

COMMENT ON COLUMN proforma_labor_position_templates.staff_per_service IS
  'For PRESENCE roles: number of staff required per service period.
   Example: Security = 2 staff per dinner service.';

COMMENT ON COLUMN proforma_labor_position_templates.hours_per_shift IS
  'For PRESENCE/THRESHOLD roles: hours per staff shift.
   Example: Security = 6 hours per shift.';

COMMENT ON COLUMN proforma_labor_position_templates.cover_threshold IS
  'For THRESHOLD roles: cover count that triggers additional staff.
   Example: +1 maître d after 250 covers.';

-- ============================================================================
-- 2. UPDATE EXISTING VOLUME-ELASTIC POSITIONS
-- ============================================================================

-- All existing positions default to VOLUME (already set by default)
UPDATE proforma_labor_position_templates
SET labor_driver_type = 'VOLUME'
WHERE labor_driver_type IS NULL;

-- ============================================================================
-- 3. ADD PRESENCE-REQUIRED POSITIONS
-- ============================================================================

-- SECURITY (PRESENCE - required when service is active)
INSERT INTO proforma_labor_position_templates (
  concept_type, position_name, category, labor_driver_type,
  staff_per_service, hours_per_shift, hourly_rate, applies_to
) VALUES
-- Nightclub: heavy security presence
('Nightclub', 'Security', 'FOH', 'PRESENCE', 3.0, 8.0, 28.00, '{bar}'),
-- Bar Lounge: moderate security
('Bar Lounge', 'Security', 'FOH', 'PRESENCE', 2.0, 6.0, 28.00, '{bar,dining}'),
-- Fine Dining: door/valet security
('Fine Dining', 'Security/Valet', 'FOH', 'PRESENCE', 1.0, 6.0, 24.00, '{dining,pdr}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- MAÎTRE D' (PRESENCE - always on when dining is open)
INSERT INTO proforma_labor_position_templates (
  concept_type, position_name, category, labor_driver_type,
  staff_per_service, hours_per_shift, hourly_rate, applies_to
) VALUES
('Fine Dining', 'Maître d'' (Base)', 'FOH', 'PRESENCE', 1.0, 6.0, 30.00, '{dining,pdr}'),
('Premium Casual', 'Host Captain', 'FOH', 'PRESENCE', 1.0, 6.0, 24.00, '{dining}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- ============================================================================
-- 4. ADD THRESHOLD POSITIONS (STEP-FUNCTION)
-- ============================================================================

-- EXTRA MAÎTRE D' (THRESHOLD - kicks in at high volume)
INSERT INTO proforma_labor_position_templates (
  concept_type, position_name, category, labor_driver_type,
  staff_per_service, hours_per_shift, hourly_rate, cover_threshold, applies_to
) VALUES
('Fine Dining', 'Maître d'' (Additional)', 'FOH', 'THRESHOLD', 1.0, 6.0, 30.00, 250, '{dining,pdr}'),
('Premium Casual', 'Host Captain (Additional)', 'FOH', 'THRESHOLD', 1.0, 6.0, 24.00, 300, '{dining}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- EXTRA BARBACK (THRESHOLD - needed at high bar volume)
INSERT INTO proforma_labor_position_templates (
  concept_type, position_name, category, labor_driver_type,
  staff_per_service, hours_per_shift, hourly_rate, cover_threshold, applies_to
) VALUES
('Nightclub', 'Barback (Additional)', 'FOH', 'THRESHOLD', 1.0, 6.0, 22.00, 400, '{bar}'),
('Bar Lounge', 'Barback (Additional)', 'FOH', 'THRESHOLD', 1.0, 6.0, 20.00, 300, '{bar}')
ON CONFLICT (concept_type, position_name) DO NOTHING;

-- ============================================================================
-- 5. RECALCULATE POSITION MIX % (VOLUME-ONLY)
-- ============================================================================

-- Update the view to only include VOLUME positions in mix %
DROP VIEW IF EXISTS proforma_labor_position_mix CASCADE;

CREATE VIEW proforma_labor_position_mix AS
WITH category_totals AS (
  -- Sum VOLUME-ELASTIC hours only
  SELECT
    concept_type,
    category,
    SUM(hours_per_100_covers) as total_hours_per_100
  FROM proforma_labor_position_templates
  WHERE is_active = true
    AND labor_driver_type = 'VOLUME'
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
  -- Position mix % (only for VOLUME positions)
  CASE
    WHEN t.labor_driver_type = 'VOLUME' AND ct.total_hours_per_100 > 0
    THEN ROUND((t.hours_per_100_covers / ct.total_hours_per_100) * 100, 1)
    ELSE NULL
  END as position_mix_pct
FROM proforma_labor_position_templates t
LEFT JOIN category_totals ct
  ON ct.concept_type = t.concept_type
  AND ct.category = t.category
WHERE t.is_active = true
ORDER BY
  t.concept_type,
  t.category,
  CASE t.labor_driver_type
    WHEN 'VOLUME' THEN 1
    WHEN 'PRESENCE' THEN 2
    WHEN 'THRESHOLD' THEN 3
  END,
  t.position_name;

COMMENT ON VIEW proforma_labor_position_mix IS
  'Position definitions with three-tier labor classification:
   - VOLUME: Scales with covers (has mix %)
   - PRESENCE: Fixed per service period
   - THRESHOLD: Step-function based on cover threshold
   Mix % only applies to VOLUME positions.';

-- ============================================================================
-- 6. UPDATE MONTHLY POSITION HOURS CALCULATION
-- ============================================================================

DROP VIEW IF EXISTS proforma_monthly_position_hours CASCADE;

CREATE VIEW proforma_monthly_position_hours AS
WITH labor_hours AS (
  SELECT
    scenario_id,
    month_num,
    total_covers,
    foh_hours,
    boh_hours
  FROM proforma_monthly_labor_hours
),
scenario_concept AS (
  SELECT
    s.id as scenario_id,
    'Casual Dining' as concept_type  -- TODO: pull from s.concept_type
  FROM proforma_scenarios s
),
service_period_info AS (
  -- Get count of active service periods per scenario/month
  SELECT
    s.id as scenario_id,
    COUNT(DISTINCT sp.id) as active_services
  FROM proforma_scenarios s
  JOIN proforma_revenue_service_periods sp ON sp.scenario_id = s.id
  GROUP BY s.id
),
volume_positions AS (
  -- Class 1: VOLUME-ELASTIC positions
  SELECT
    lh.scenario_id,
    lh.month_num,
    lh.total_covers,
    sc.concept_type,
    pm.position_name,
    pm.category,
    pm.labor_driver_type,
    pm.hourly_rate,
    pm.applies_to,
    pm.position_mix_pct,
    CASE
      WHEN pm.category = 'FOH' THEN lh.foh_hours
      WHEN pm.category = 'BOH' THEN lh.boh_hours
    END as category_total_hours,
    ROUND(
      CASE
        WHEN pm.category = 'FOH' THEN lh.foh_hours * (pm.position_mix_pct / 100.0)
        WHEN pm.category = 'BOH' THEN lh.boh_hours * (pm.position_mix_pct / 100.0)
      END,
      1
    ) as position_hours,
    NULL::numeric as staff_per_service,
    NULL::numeric as hours_per_shift,
    NULL::integer as cover_threshold
  FROM labor_hours lh
  JOIN scenario_concept sc ON sc.scenario_id = lh.scenario_id
  JOIN proforma_labor_position_mix pm ON pm.concept_type = sc.concept_type
  WHERE pm.labor_driver_type = 'VOLUME'
),
presence_positions AS (
  -- Class 2: PRESENCE-REQUIRED positions
  SELECT
    lh.scenario_id,
    lh.month_num,
    lh.total_covers,
    sc.concept_type,
    pm.position_name,
    pm.category,
    pm.labor_driver_type,
    pm.hourly_rate,
    pm.applies_to,
    NULL::numeric as position_mix_pct,
    NULL::numeric as category_total_hours,
    -- Position hours = staff × hours per shift × ~services per week × ~4.33 weeks
    ROUND(pm.staff_per_service * pm.hours_per_shift * spi.active_services * 7 * 4.33, 1) as position_hours,
    pm.staff_per_service,
    pm.hours_per_shift,
    NULL::integer as cover_threshold
  FROM labor_hours lh
  JOIN scenario_concept sc ON sc.scenario_id = lh.scenario_id
  JOIN service_period_info spi ON spi.scenario_id = lh.scenario_id
  JOIN proforma_labor_position_mix pm ON pm.concept_type = sc.concept_type
  WHERE pm.labor_driver_type = 'PRESENCE'
),
threshold_positions AS (
  -- Class 3: THRESHOLD positions (only active when covers exceed threshold)
  SELECT
    lh.scenario_id,
    lh.month_num,
    lh.total_covers,
    sc.concept_type,
    pm.position_name,
    pm.category,
    pm.labor_driver_type,
    pm.hourly_rate,
    pm.applies_to,
    NULL::numeric as position_mix_pct,
    NULL::numeric as category_total_hours,
    -- Only count hours if monthly covers exceed threshold
    CASE
      WHEN lh.total_covers >= pm.cover_threshold
      THEN ROUND(pm.staff_per_service * pm.hours_per_shift * spi.active_services * 7 * 4.33, 1)
      ELSE 0
    END as position_hours,
    pm.staff_per_service,
    pm.hours_per_shift,
    pm.cover_threshold
  FROM labor_hours lh
  JOIN scenario_concept sc ON sc.scenario_id = lh.scenario_id
  JOIN service_period_info spi ON spi.scenario_id = lh.scenario_id
  JOIN proforma_labor_position_mix pm ON pm.concept_type = sc.concept_type
  WHERE pm.labor_driver_type = 'THRESHOLD'
),
all_positions AS (
  SELECT * FROM volume_positions
  UNION ALL
  SELECT * FROM presence_positions
  UNION ALL
  SELECT * FROM threshold_positions
)
SELECT
  scenario_id,
  month_num,
  total_covers,
  concept_type,
  position_name,
  category,
  labor_driver_type,
  hourly_rate,
  applies_to,
  position_mix_pct,
  category_total_hours,
  position_hours,
  staff_per_service,
  hours_per_shift,
  cover_threshold,
  -- Position labor cost
  ROUND(position_hours * hourly_rate, 2) as position_labor_cost,
  -- Implied shifts (informational only)
  CASE
    WHEN labor_driver_type = 'VOLUME' THEN
      ROUND(position_hours / CASE WHEN category = 'FOH' THEN 6.0 WHEN category = 'BOH' THEN 8.0 END, 1)
    WHEN labor_driver_type IN ('PRESENCE', 'THRESHOLD') THEN
      staff_per_service
    ELSE NULL
  END as implied_shifts
FROM all_positions
WHERE position_hours > 0;

COMMENT ON VIEW proforma_monthly_position_hours IS
  'Monthly position hours with three-tier classification:
   - VOLUME: hours = total hrs × mix %
   - PRESENCE: hours = staff × shift hrs × active services
   - THRESHOLD: hours = staff × shift hrs × active services (only if covers > threshold)

   This keeps the model honest without becoming scheduling software.';

-- ============================================================================
-- 7. UPDATE LABOR COST VIEW TO INCLUDE ALL THREE CLASSES
-- ============================================================================

-- The existing proforma_monthly_labor_cost view will automatically pick up
-- the new position hours since it sums from proforma_monthly_position_hours

COMMENT ON VIEW proforma_monthly_labor_cost IS
  'Complete monthly labor cost calculation.
   Now includes three labor classes:
   - Volume-elastic (servers, cooks, etc.)
   - Presence-required (security, maître d base)
   - Threshold (additional maître d after 250 covers)
   Plus salaried management.';
