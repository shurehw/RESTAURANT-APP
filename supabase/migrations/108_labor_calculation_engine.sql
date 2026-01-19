-- Labor Calculation Engine
-- Pulls covers from revenue model, applies productivity benchmarks, outputs monthly labor $ and %

-- ============================================================================
-- 1. MONTHLY COVERS BY SCENARIO (from revenue model)
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_covers AS
WITH service_weeks AS (
  -- Get weekly covers per service period
  SELECT
    s.id as scenario_id,
    sp.id as service_period_id,
    sp.service_name,
    -- Dining covers (seated centers including seated bars)
    COALESCE(SUM(spc.covers_per_service) FILTER (
      WHERE rc.is_bar = false OR (rc.is_bar AND (csp.bar_mode_override = 'seated' OR (csp.bar_mode_override IS NULL AND rc.bar_mode = 'seated')))
    ), 0) as dining_covers_per_service,
    -- Standing bar guests (throughput mode)
    COALESCE(SUM(csp.bar_guests), 0) as bar_guests_per_service,
    -- PDR covers
    COALESCE(SUM(csp.pdr_covers), 0) as pdr_covers_per_service,
    -- Operating days
    COALESCE(array_length(sp.operating_days, 1), 7) as operating_days
  FROM proforma_scenarios s
  JOIN proforma_revenue_service_periods sp ON sp.scenario_id = s.id
  LEFT JOIN proforma_center_service_participation csp ON csp.service_period_id = sp.id AND csp.is_active = true
  LEFT JOIN proforma_revenue_centers rc ON rc.id = csp.revenue_center_id
  LEFT JOIN proforma_service_period_covers spc ON spc.service_period_id = sp.id AND spc.revenue_center_id = rc.id
  GROUP BY s.id, sp.id, sp.service_name, sp.operating_days
),
weekly_totals AS (
  -- Sum to weekly covers
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
  -- Apply ramp curve
  ROUND(wt.dining_covers_per_week * 52 / 12 * COALESCE(ramp_curve->>(month_num - 1), '1.0')::numeric) as dining_covers,
  ROUND(wt.bar_guests_per_week * 52 / 12 * COALESCE(ramp_curve->>(month_num - 1), '1.0')::numeric) as bar_guests,
  ROUND(wt.pdr_covers_per_week * 52 / 12 * COALESCE(ramp_curve->>(month_num - 1), '1.0')::numeric) as pdr_covers,
  ROUND((wt.dining_covers_per_week + wt.bar_guests_per_week + wt.pdr_covers_per_week) * 52 / 12 * COALESCE(ramp_curve->>(month_num - 1), '1.0')::numeric) as total_covers
FROM weekly_totals wt
JOIN proforma_scenarios s ON s.id = wt.scenario_id
JOIN proforma_revenue_assumptions ra ON ra.scenario_id = s.id
CROSS JOIN generate_series(1, 12) as month_num;

COMMENT ON VIEW proforma_monthly_covers IS
  'Monthly cover forecast by scenario.
   Rolls up from service periods, applies ramp curve.
   Source of truth for labor calculations.';

-- ============================================================================
-- 2. MONTHLY LABOR HOURS (productivity-driven)
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_labor_hours AS
SELECT
  mc.scenario_id,
  mc.month_num,
  mc.total_covers,

  -- Labor assumptions
  la.foh_hours_per_100_covers,
  la.boh_hours_per_100_covers,

  -- Calculated hours
  ROUND(mc.total_covers * la.foh_hours_per_100_covers / 100.0, 1) as foh_hours,
  ROUND(mc.total_covers * la.boh_hours_per_100_covers / 100.0, 1) as boh_hours,
  ROUND(mc.total_covers * (la.foh_hours_per_100_covers + la.boh_hours_per_100_covers) / 100.0, 1) as total_hours

FROM proforma_monthly_covers mc
JOIN proforma_labor_assumptions la ON la.scenario_id = mc.scenario_id;

COMMENT ON VIEW proforma_monthly_labor_hours IS
  'Monthly labor hours by FOH/BOH.
   Driven by: covers × (hours per 100 covers).
   This is Layer 1 (aggregated) calculation.';

-- ============================================================================
-- 3. MONTHLY LABOR COST
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_labor_cost AS
WITH hourly_labor AS (
  SELECT
    mlh.scenario_id,
    mlh.month_num,
    mlh.total_covers,
    mlh.foh_hours,
    mlh.boh_hours,
    mlh.total_hours,

    -- Hourly rates
    la.foh_hourly_rate,
    la.boh_hourly_rate,

    -- Hourly wages
    ROUND(mlh.foh_hours * la.foh_hourly_rate, 2) as foh_wages,
    ROUND(mlh.boh_hours * la.boh_hourly_rate, 2) as boh_wages,
    ROUND(mlh.foh_hours * la.foh_hourly_rate + mlh.boh_hours * la.boh_hourly_rate, 2) as total_hourly_wages,

    -- Core management salaries (monthly)
    ROUND(COALESCE(la.gm_salary_annual, 0) / 12.0, 2) as gm_salary_monthly,
    ROUND(COALESCE(la.agm_salary_annual, 0) / 12.0, 2) as agm_salary_monthly,
    ROUND(COALESCE(la.km_salary_annual, 0) / 12.0, 2) as km_salary_monthly,

    -- Payroll burden
    la.payroll_burden_pct

  FROM proforma_monthly_labor_hours mlh
  JOIN proforma_labor_assumptions la ON la.scenario_id = mlh.scenario_id
),
salaried_roles AS (
  -- Additional salaried roles per month
  SELECT
    scenario_id,
    month_num,
    COALESCE(SUM(annual_salary / 12.0), 0) as additional_salary_monthly
  FROM proforma_labor_salaried_roles
  CROSS JOIN generate_series(1, 12) as month_num
  WHERE
    month_num >= start_month
    AND (end_month IS NULL OR month_num <= end_month)
  GROUP BY scenario_id, month_num
)
SELECT
  hl.scenario_id,
  hl.month_num,
  hl.total_covers,

  -- Hours
  hl.foh_hours,
  hl.boh_hours,
  hl.total_hours,

  -- Hourly wages
  hl.foh_wages,
  hl.boh_wages,
  hl.total_hourly_wages,

  -- Salaries
  hl.gm_salary_monthly,
  hl.agm_salary_monthly,
  hl.km_salary_monthly,
  COALESCE(sr.additional_salary_monthly, 0) as additional_salary_monthly,
  (hl.gm_salary_monthly + hl.agm_salary_monthly + hl.km_salary_monthly + COALESCE(sr.additional_salary_monthly, 0)) as total_salary_monthly,

  -- Gross wages (hourly + salary)
  (hl.total_hourly_wages + hl.gm_salary_monthly + hl.agm_salary_monthly + hl.km_salary_monthly + COALESCE(sr.additional_salary_monthly, 0)) as gross_wages,

  -- Payroll burden
  ROUND((hl.total_hourly_wages + hl.gm_salary_monthly + hl.agm_salary_monthly + hl.km_salary_monthly + COALESCE(sr.additional_salary_monthly, 0)) * hl.payroll_burden_pct, 2) as payroll_burden,

  -- Total labor cost
  ROUND(
    (hl.total_hourly_wages + hl.gm_salary_monthly + hl.agm_salary_monthly + hl.km_salary_monthly + COALESCE(sr.additional_salary_monthly, 0)) * (1 + hl.payroll_burden_pct),
    2
  ) as total_labor_cost

FROM hourly_labor hl
LEFT JOIN salaried_roles sr ON sr.scenario_id = hl.scenario_id AND sr.month_num = hl.month_num;

COMMENT ON VIEW proforma_monthly_labor_cost IS
  'Complete monthly labor cost calculation.
   Includes: hourly wages (FOH/BOH) + management salaries + additional salaried roles + payroll burden.
   This is the final labor $ output.';

-- ============================================================================
-- 4. LABOR % VIEW (with revenue for validation)
-- ============================================================================

CREATE OR REPLACE VIEW proforma_monthly_labor_pct AS
SELECT
  lc.scenario_id,
  lc.month_num,
  lc.total_covers,
  lc.total_labor_cost,

  -- Placeholder for monthly revenue (will join to revenue calculation view when built)
  NULL::numeric as monthly_revenue,

  -- Labor % (placeholder until revenue is available)
  NULL::numeric as labor_pct,

  -- Labor cost per cover
  CASE
    WHEN lc.total_covers > 0 THEN ROUND(lc.total_labor_cost / lc.total_covers, 2)
    ELSE NULL
  END as labor_cost_per_cover

FROM proforma_monthly_labor_cost lc;

COMMENT ON VIEW proforma_monthly_labor_pct IS
  'Labor % and per-cover metrics.
   Will integrate with monthly revenue view for labor % validation.
   Validates against concept-based labor % ranges in settings.';

-- ============================================================================
-- 5. HELPER FUNCTION: GET CONCEPT LABOR BENCHMARKS
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
  -- Get aggregates from position templates
  RETURN QUERY
  SELECT
    foh.total_hours_per_100,
    boh.total_hours_per_100,
    foh.blended_rate,
    boh.blended_rate,

    -- Get validation ranges from settings based on concept
    CASE concept
      WHEN 'Fast Casual' THEN (SELECT fast_casual_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Casual Dining' THEN (SELECT casual_dining_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Premium Casual' THEN (SELECT premium_casual_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Fine Dining' THEN (SELECT fine_dining_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Bar Lounge' THEN (SELECT bar_lounge_labor_pct_min FROM proforma_settings LIMIT 1)
      WHEN 'Nightclub' THEN (SELECT nightclub_labor_pct_min FROM proforma_settings LIMIT 1)
      ELSE 25.0
    END as labor_pct_min,

    CASE concept
      WHEN 'Fast Casual' THEN (SELECT fast_casual_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Casual Dining' THEN (SELECT casual_dining_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Premium Casual' THEN (SELECT premium_casual_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Fine Dining' THEN (SELECT fine_dining_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Bar Lounge' THEN (SELECT bar_lounge_labor_pct_max FROM proforma_settings LIMIT 1)
      WHEN 'Nightclub' THEN (SELECT nightclub_labor_pct_max FROM proforma_settings LIMIT 1)
      ELSE 30.0
    END as labor_pct_max

  FROM proforma_labor_concept_aggregates foh
  CROSS JOIN proforma_labor_concept_aggregates boh
  WHERE foh.concept_type = concept AND foh.category = 'FOH'
    AND boh.concept_type = concept AND boh.category = 'BOH';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_labor_benchmarks IS
  'Returns Layer 1 benchmarks for a given concept type.
   Use this when initializing scenario labor assumptions.';
