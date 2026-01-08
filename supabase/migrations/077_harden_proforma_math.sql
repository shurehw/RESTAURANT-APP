-- =====================================================================
-- Migration 077: Harden Proforma Math
-- =====================================================================
-- Purpose: Add calc run tracking, enforce percentage constraints (0-1),
--          restrict result inserts to service role, add membership module
-- =====================================================================

-- =====================================================================
-- 1) CALC RUNS TABLE
-- =====================================================================
-- Track each calculation run with versioning and input hash for reproducibility

create table if not exists proforma_calc_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references proforma_scenarios(id) on delete cascade,

  engine_version text not null,           -- git sha or semver
  inputs_hash text not null,              -- sha256 of canonical input json
  status text not null check (status in ('queued','running','succeeded','failed')),
  error text,

  created_at timestamptz not null default now()
);

create index if not exists idx_proforma_calc_runs_scenario
  on proforma_calc_runs (scenario_id, created_at desc);

-- Add calc_run_id to results tables
alter table proforma_monthly_categories
  add column if not exists calc_run_id uuid references proforma_calc_runs(id) on delete cascade;

alter table proforma_monthly_gl
  add column if not exists calc_run_id uuid references proforma_calc_runs(id) on delete cascade;

alter table proforma_monthly_summary
  add column if not exists calc_run_id uuid references proforma_calc_runs(id) on delete cascade;

-- Drop old unique constraint on monthly_summary (scenario_id, month_index)
-- because we want to allow multiple calc runs
alter table proforma_monthly_summary
  drop constraint if exists proforma_monthly_summary_scenario_id_month_index_key;

-- Make results unique per calc run (prevents duplicate/confusing data)
create unique index if not exists uq_proforma_monthly_categories_run
  on proforma_monthly_categories (calc_run_id, month_index, category_id)
  where calc_run_id is not null;

create unique index if not exists uq_proforma_monthly_gl_run
  on proforma_monthly_gl (calc_run_id, month_index, gl_account_id)
  where calc_run_id is not null;

create unique index if not exists uq_proforma_monthly_summary_run
  on proforma_monthly_summary (calc_run_id, month_index)
  where calc_run_id is not null;

-- Enable RLS on calc_runs
alter table proforma_calc_runs enable row level security;

drop policy if exists "Users can view calc runs for their scenarios" on proforma_calc_runs;
create policy "Users can view calc runs for their scenarios"
  on proforma_calc_runs for select
  using (
    scenario_id in (
      select s.id from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      where p.org_id in (
        select organization_id from organization_users
        where user_id = auth.uid() and is_active = true
      )
    )
  );

drop policy if exists "Service role can insert calc runs" on proforma_calc_runs;
create policy "Service role can insert calc runs"
  on proforma_calc_runs for insert
  with check ( (auth.jwt() ->> 'role') = 'service_role' );

drop policy if exists "Service role can update calc runs" on proforma_calc_runs;
create policy "Service role can update calc runs"
  on proforma_calc_runs for update
  using ( (auth.jwt() ->> 'role') = 'service_role' );

-- =====================================================================
-- 2) PERCENTAGE CONSTRAINTS (0-1 decimals)
-- =====================================================================
-- Enforce that all percentage fields store values in [0,1] range
-- This prevents 7 vs 0.07 confusion

-- Revenue assumptions
alter table proforma_revenue_assumptions
  add constraint chk_days_open_per_week
    check (days_open_per_week between 1 and 7),
  add constraint chk_services_per_day
    check (services_per_day between 1 and 6),
  add constraint chk_food_mix_range
    check (food_mix_pct is null or food_mix_pct between 0 and 1),
  add constraint chk_bev_mix_range
    check (bev_mix_pct is null or bev_mix_pct between 0 and 1),
  add constraint chk_other_mix_range
    check (other_mix_pct is null or other_mix_pct between 0 and 1),
  add constraint chk_mix_sums_to_one
    check (
      food_mix_pct is null
      or bev_mix_pct is null
      or other_mix_pct is null
      or abs((food_mix_pct + bev_mix_pct + other_mix_pct) - 1.0) <= 0.0001
    );

-- COGS assumptions
alter table proforma_cogs_assumptions
  add constraint chk_food_cogs_range
    check (food_cogs_pct is null or food_cogs_pct between 0 and 1),
  add constraint chk_bev_cogs_range
    check (bev_cogs_pct is null or bev_cogs_pct between 0 and 1),
  add constraint chk_other_cogs_range
    check (other_cogs_pct is null or other_cogs_pct between 0 and 1);

-- Labor assumptions
alter table proforma_labor_assumptions
  add constraint chk_payroll_burden_range
    check (payroll_burden_pct is null or payroll_burden_pct between 0 and 1),
  add constraint chk_foh_hours_positive
    check (foh_hours_per_100_covers is null or foh_hours_per_100_covers >= 0),
  add constraint chk_boh_hours_positive
    check (boh_hours_per_100_covers is null or boh_hours_per_100_covers >= 0);

-- Opex assumptions
alter table proforma_occupancy_opex_assumptions
  add constraint chk_opex_pct_fields_range
    check (
      (linen_pct_of_sales is null or linen_pct_of_sales between 0 and 1) and
      (smallwares_pct_of_sales is null or smallwares_pct_of_sales between 0 and 1) and
      (cleaning_supplies_pct is null or cleaning_supplies_pct between 0 and 1) and
      (cc_fees_pct_of_sales is null or cc_fees_pct_of_sales between 0 and 1) and
      (marketing_pct_of_sales is null or marketing_pct_of_sales between 0 and 1) and
      (gna_pct_of_sales is null or gna_pct_of_sales between 0 and 1)
    ),
  add constraint chk_marketing_boost_positive
    check (marketing_boost_multiplier is null or marketing_boost_multiplier >= 0);

-- Capex assumptions
alter table proforma_capex_assumptions
  add constraint chk_equity_pct_range
    check (equity_pct is null or equity_pct between 0 and 1),
  add constraint chk_interest_rate_range
    check (debt_interest_rate is null or debt_interest_rate between 0 and 1);

-- =====================================================================
-- 3) RESTRICT RESULT INSERTS TO SERVICE ROLE
-- =====================================================================
-- Results should only be written by the calculation engine, not users

drop policy if exists "System can insert category results" on proforma_monthly_categories;
create policy "Service role can insert category results"
  on proforma_monthly_categories for insert
  with check ( (auth.jwt() ->> 'role') = 'service_role' );

drop policy if exists "System can insert GL results" on proforma_monthly_gl;
create policy "Service role can insert GL results"
  on proforma_monthly_gl for insert
  with check ( (auth.jwt() ->> 'role') = 'service_role' );

drop policy if exists "System can insert monthly summary" on proforma_monthly_summary;
create policy "Service role can insert monthly summary"
  on proforma_monthly_summary for insert
  with check ( (auth.jwt() ->> 'role') = 'service_role' );

drop policy if exists "System can delete monthly summary" on proforma_monthly_summary;
create policy "Service role can delete monthly summary"
  on proforma_monthly_summary for delete
  using ( (auth.jwt() ->> 'role') = 'service_role' );

-- =====================================================================
-- 4) MEMBERSHIP ASSUMPTIONS TABLE
-- =====================================================================
-- Track membership revenue for club/membership concepts

create table if not exists proforma_membership_assumptions (
  scenario_id uuid primary key references proforma_scenarios(id) on delete cascade,

  members_at_open int not null default 0 check (members_at_open >= 0),
  member_cap int not null default 0 check (member_cap >= 0),
  monthly_dues numeric(12,2) not null default 0 check (monthly_dues >= 0),
  initiation_fee numeric(12,2) not null default 0 check (initiation_fee >= 0),

  churn_monthly numeric(6,4) not null default 0 check (churn_monthly between 0 and 1),
  churn_start_month_index int not null default 1 check (churn_start_month_index >= 1),

  ramp_curve jsonb default null,        -- optional [0..1] length = ramp_months
  growth_curve jsonb default null,      -- optional length 60
  extra jsonb default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (member_cap >= members_at_open)
);

alter table proforma_membership_assumptions enable row level security;

create policy "Users can view membership assumptions for their scenarios"
  on proforma_membership_assumptions for select
  using (
    scenario_id in (
      select s.id from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      where p.org_id in (
        select organization_id from organization_users
        where user_id = auth.uid() and is_active = true
      )
    )
  );

create policy "Users can manage membership assumptions for their scenarios"
  on proforma_membership_assumptions for all
  using (
    scenario_id in (
      select s.id from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      where p.org_id in (
        select organization_id from organization_users
        where user_id = auth.uid() and is_active = true
      )
    )
  );

-- =====================================================================
-- NOTES
-- =====================================================================
-- After this migration, you should:
-- 1. Update calculation engine to create calc_run before inserting results
-- 2. Update all percentage inputs in UI to work with 0-1 decimals (not 0-100)
-- 3. Add membership assumptions UI component
-- 4. Backfill existing results with calc_run_id if needed, or mark legacy
