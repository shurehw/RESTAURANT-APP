-- =====================================================================
-- Migration 078: Convert Percentage Data from 0-100 to 0-1
-- =====================================================================
-- Purpose: Fix existing data to match new percentage constraints
-- =====================================================================

-- Revenue assumptions: divide all percentage fields by 100
update proforma_revenue_assumptions
set
  food_mix_pct = case when food_mix_pct > 1 then food_mix_pct / 100 else food_mix_pct end,
  bev_mix_pct = case when bev_mix_pct > 1 then bev_mix_pct / 100 else bev_mix_pct end,
  other_mix_pct = case when other_mix_pct > 1 then other_mix_pct / 100 else other_mix_pct end
where food_mix_pct > 1 or bev_mix_pct > 1 or other_mix_pct > 1;

-- COGS assumptions
update proforma_cogs_assumptions
set
  food_cogs_pct = case when food_cogs_pct > 1 then food_cogs_pct / 100 else food_cogs_pct end,
  bev_cogs_pct = case when bev_cogs_pct > 1 then bev_cogs_pct / 100 else bev_cogs_pct end,
  other_cogs_pct = case when other_cogs_pct > 1 then other_cogs_pct / 100 else other_cogs_pct end
where food_cogs_pct > 1 or bev_cogs_pct > 1 or other_cogs_pct > 1;

-- Labor assumptions
update proforma_labor_assumptions
set
  payroll_burden_pct = case when payroll_burden_pct > 1 then payroll_burden_pct / 100 else payroll_burden_pct end
where payroll_burden_pct > 1;

-- Opex assumptions
update proforma_occupancy_opex_assumptions
set
  linen_pct_of_sales = case when linen_pct_of_sales > 1 then linen_pct_of_sales / 100 else linen_pct_of_sales end,
  smallwares_pct_of_sales = case when smallwares_pct_of_sales > 1 then smallwares_pct_of_sales / 100 else smallwares_pct_of_sales end,
  cleaning_supplies_pct = case when cleaning_supplies_pct > 1 then cleaning_supplies_pct / 100 else cleaning_supplies_pct end,
  cc_fees_pct_of_sales = case when cc_fees_pct_of_sales > 1 then cc_fees_pct_of_sales / 100 else cc_fees_pct_of_sales end,
  marketing_pct_of_sales = case when marketing_pct_of_sales > 1 then marketing_pct_of_sales / 100 else marketing_pct_of_sales end,
  gna_pct_of_sales = case when gna_pct_of_sales > 1 then gna_pct_of_sales / 100 else gna_pct_of_sales end
where linen_pct_of_sales > 1
   or smallwares_pct_of_sales > 1
   or cleaning_supplies_pct > 1
   or cc_fees_pct_of_sales > 1
   or marketing_pct_of_sales > 1
   or gna_pct_of_sales > 1;

-- Capex assumptions
update proforma_capex_assumptions
set
  equity_pct = case when equity_pct > 1 then equity_pct / 100 else equity_pct end,
  debt_interest_rate = case when debt_interest_rate > 1 then debt_interest_rate / 100 else debt_interest_rate end
where equity_pct > 1 or debt_interest_rate > 1;
