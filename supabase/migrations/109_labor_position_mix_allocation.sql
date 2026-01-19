-- Labor Position Mix Allocation
-- Converts position templates into % share of FOH/BOH hours
-- This is the "correct FP&A direction": covers → total hours → position hours (not headcount)

-- ============================================================================
-- 1. POSITION MIX % CALCULATION
-- ============================================================================

CREATE OR REPLACE VIEW proforma_labor_position_mix AS
WITH category_totals AS (
  -- Sum hours per 100 by concept and category
  SELECT
    concept_type,
    category,
    SUM(hours_per_100_covers) as total_hours_per_100
  FROM proforma_labor_position_templates
  WHERE is_active = true
  GROUP BY concept_type, category
)
SELECT
  t.concept_type,
  t.position_name,
  t.category,
  t.hours_per_100_covers,
  t.hourly_rate,
  t.applies_to,
  ct.total_hours_per_100 as category_total_hours_per_100,
  -- Position mix % (share of FOH or BOH total)
  ROUND((t.hours_per_100_covers / ct.total_hours_per_100) * 100, 1) as position_mix_pct
FROM proforma_labor_position_templates t
JOIN category_totals ct
  ON ct.concept_type = t.concept_type
  AND ct.category = t.category
WHERE t.is_active = true
ORDER BY t.concept_type, t.category, t.position_name;

COMMENT ON VIEW proforma_labor_position_mix IS
  'Position mix % by concept type.
   Shows each position as a % share of FOH or BOH total hours.
   Example: Servers = 45% of FOH hours.
   These %s are stable across volume and easy to reason about.';

-- ============================================================================
-- 2. MONTHLY POSITION HOURS (THE KEY BACK-SOLVE)
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_position_hours AS
WITH labor_hours AS (
  -- Get total FOH/BOH hours per month (from Layer 1)
  SELECT
    scenario_id,
    month_num,
    total_covers,
    foh_hours,
    boh_hours
  FROM proforma_monthly_labor_hours
),
scenario_concept AS (
  -- Get concept type for scenario (would come from project or scenario table)
  -- For now, default to 'Casual Dining' - TODO: add concept_type to proforma_scenarios
  SELECT
    s.id as scenario_id,
    'Casual Dining' as concept_type  -- TODO: pull from s.concept_type when field added
  FROM proforma_scenarios s
),
position_allocations AS (
  -- Calculate position hours = total hours × position mix %
  SELECT
    lh.scenario_id,
    lh.month_num,
    lh.total_covers,
    sc.concept_type,
    pm.position_name,
    pm.category,
    pm.hourly_rate,
    pm.applies_to,
    pm.position_mix_pct,
    -- Total hours for this category
    CASE
      WHEN pm.category = 'FOH' THEN lh.foh_hours
      WHEN pm.category = 'BOH' THEN lh.boh_hours
    END as category_total_hours,
    -- Position hours = category total × position mix %
    ROUND(
      CASE
        WHEN pm.category = 'FOH' THEN lh.foh_hours * (pm.position_mix_pct / 100.0)
        WHEN pm.category = 'BOH' THEN lh.boh_hours * (pm.position_mix_pct / 100.0)
      END,
      1
    ) as position_hours
  FROM labor_hours lh
  JOIN scenario_concept sc ON sc.scenario_id = lh.scenario_id
  JOIN proforma_labor_position_mix pm ON pm.concept_type = sc.concept_type
)
SELECT
  scenario_id,
  month_num,
  total_covers,
  concept_type,
  position_name,
  category,
  hourly_rate,
  applies_to,
  position_mix_pct,
  category_total_hours,
  position_hours,
  -- Position labor cost
  ROUND(position_hours * hourly_rate, 2) as position_labor_cost,
  -- Implied staffing (informational only, not stored)
  -- Assumes 6-hour avg shift for FOH, 8-hour for BOH
  ROUND(
    position_hours / CASE
      WHEN category = 'FOH' THEN 6.0
      WHEN category = 'BOH' THEN 8.0
    END,
    1
  ) as implied_shifts
FROM position_allocations;

COMMENT ON VIEW proforma_monthly_position_hours IS
  'Monthly position hours by back-solving from total hours.

   Flow: covers → total FOH/BOH hours → position hours (via mix %)

   Position hours are output, not input.
   Implied shifts shown for context only (not headcount).

   Example:
   - FOH total: 90 hrs
   - Servers @ 45% → 40.5 hrs → ~6.8 shifts
   - This is explanatory, not operational.';

-- ============================================================================
-- 3. POSITION SUMMARY (ROLLUP FOR UI)
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_position_summary AS
SELECT
  scenario_id,
  month_num,
  concept_type,
  category,
  position_name,
  position_mix_pct,
  SUM(position_hours) as total_position_hours,
  SUM(position_labor_cost) as total_position_cost,
  AVG(implied_shifts) as avg_shifts_per_service,
  hourly_rate
FROM proforma_monthly_position_hours
GROUP BY scenario_id, month_num, concept_type, category, position_name, position_mix_pct, hourly_rate
ORDER BY scenario_id, month_num, category, position_name;

COMMENT ON VIEW proforma_monthly_position_summary IS
  'Monthly position summary for UI display.
   Shows position hours, cost, and implied staffing.
   This is Layer 2 detail - only shown when user toggles "Show Positions".';

-- ============================================================================
-- 4. VALIDATION: POSITION METRICS
-- ============================================================================

CREATE OR REPLACE VIEW proforma_labor_position_metrics AS
SELECT
  scenario_id,
  month_num,
  position_name,
  category,
  total_covers,
  total_position_hours,
  total_position_cost,

  -- Covers per position-hour (key metric)
  CASE
    WHEN total_position_hours > 0
    THEN ROUND(total_covers / total_position_hours, 2)
    ELSE NULL
  END as covers_per_position_hour,

  -- Position hours per 100 covers (validation)
  CASE
    WHEN total_covers > 0
    THEN ROUND((total_position_hours / total_covers) * 100, 2)
    ELSE NULL
  END as position_hours_per_100_covers,

  -- Labor $ per cover for this position
  CASE
    WHEN total_covers > 0
    THEN ROUND(total_position_cost / total_covers, 2)
    ELSE NULL
  END as position_cost_per_cover

FROM proforma_monthly_position_summary
WHERE total_covers > 0;

COMMENT ON VIEW proforma_labor_position_metrics IS
  'Validation metrics by position.
   Key metrics:
   - Covers per position-hour (e.g., 5 covers/server-hour)
   - Position hours per 100 covers (validation vs benchmarks)
   - Position $ per cover
   Use to catch bullshit and validate assumptions.';

-- ============================================================================
-- 5. ADD CONCEPT TYPE TO SCENARIOS (TODO)
-- ============================================================================

-- TODO: Add this field to proforma_scenarios table
-- ALTER TABLE proforma_scenarios
-- ADD COLUMN IF NOT EXISTS concept_type text DEFAULT 'Casual Dining';

-- For now, we default to 'Casual Dining' in the view
-- This should be set during scenario creation based on project archetype

COMMENT ON COLUMN proforma_scenarios.id IS
  'TODO: Add concept_type column to scenarios table.
   This drives labor position mix defaults via proforma_labor_position_mix.
   Should default from project archetype or be user-selectable.';
