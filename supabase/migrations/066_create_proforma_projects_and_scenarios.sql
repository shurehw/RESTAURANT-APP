-- Create proforma projects table
-- Represents a proforma modeling project (new concept, venue, etc.)

create table if not exists proforma_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  concept_type text not null check (concept_type in (
    'fsr','nightlife','fast_casual','coffee','bakery'
  )),
  location_city text,
  location_state text,
  square_feet_foh int,
  square_feet_boh int,
  seats int,
  bar_seats int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proforma_projects_org
  on proforma_projects (org_id);

-- Create proforma scenarios table
-- Each project can have multiple scenarios (base, upside, downside)

create table if not exists proforma_scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references proforma_projects(id) on delete cascade,
  name text not null,           -- 'Base','Upside','Downside'
  is_base boolean not null default false,
  months int not null default 60,
  start_month date not null,    -- e.g. '2026-01-01'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proforma_scenarios_project
  on proforma_scenarios (project_id);

-- Revenue assumptions
create table if not exists proforma_revenue_assumptions (
  scenario_id uuid primary key references proforma_scenarios(id) on delete cascade,

  days_open_per_week int not null,
  services_per_day int not null,         -- lunch/dinner/late-night count
  avg_covers_lunch numeric(10,2),
  avg_covers_dinner numeric(10,2),

  avg_check_food numeric(10,2),
  avg_check_bev numeric(10,2),
  food_mix_pct numeric(5,2),            -- of total revenue
  bev_mix_pct numeric(5,2),
  other_mix_pct numeric(5,2),

  ramp_months int not null default 12,
  ramp_curve jsonb default null,        -- optional [0.3,0.5,...1.0]
  seasonality_curve jsonb default null, -- optional [1.0,...] length 12

  extra jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- COGS assumptions
create table if not exists proforma_cogs_assumptions (
  scenario_id uuid primary key references proforma_scenarios(id) on delete cascade,
  food_cogs_pct numeric(5,2),
  bev_cogs_pct numeric(5,2),
  other_cogs_pct numeric(5,2),
  extra jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Labor assumptions – productivity, not % of sales
create table if not exists proforma_labor_assumptions (
  scenario_id uuid primary key references proforma_scenarios(id) on delete cascade,

  -- Productivity
  foh_hours_per_100_covers numeric(6,2),
  boh_hours_per_100_covers numeric(6,2),

  foh_hourly_rate numeric(10,2),
  boh_hourly_rate numeric(10,2),

  gm_salary_annual numeric(12,2),
  agm_salary_annual numeric(12,2),
  km_salary_annual numeric(12,2),

  payroll_burden_pct numeric(5,2),   -- taxes/benefits as % of wages

  extra jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Occupancy & opex assumptions
create table if not exists proforma_occupancy_opex_assumptions (
  scenario_id uuid primary key references proforma_scenarios(id) on delete cascade,

  -- Rent & occupancy
  base_rent_monthly numeric(12,2),
  cam_monthly numeric(12,2),
  property_tax_monthly numeric(12,2),

  utilities_monthly numeric(12,2),
  insurance_monthly numeric(12,2),

  -- Opex, high level % of sales or flat
  linen_pct_of_sales numeric(5,2),
  smallwares_pct_of_sales numeric(5,2),
  cleaning_supplies_pct numeric(5,2),
  cc_fees_pct_of_sales numeric(5,2),

  other_opex_flat_monthly numeric(12,2),

  -- Marketing
  marketing_pct_of_sales numeric(5,2),
  marketing_boost_months int default 3,
  marketing_boost_multiplier numeric(5,2) default 2.0, -- 2x spend in first X months

  -- G&A / Corporate
  gna_pct_of_sales numeric(5,2),
  corporate_overhead_flat_monthly numeric(12,2),

  extra jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Capex & financing assumptions
create table if not exists proforma_capex_assumptions (
  scenario_id uuid primary key references proforma_scenarios(id) on delete cascade,

  total_capex numeric(14,2),
  equity_pct numeric(5,2),
  debt_interest_rate numeric(5,2),
  debt_term_months int,
  interest_only_months int default 0,

  extra jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Category monthly results
create table if not exists proforma_monthly_categories (
  id bigserial primary key,
  scenario_id uuid not null references proforma_scenarios(id) on delete cascade,
  month_index int not null,             -- 1..N
  period_start_date date not null,

  category_id uuid not null references proforma_categories(id) on delete restrict,
  amount numeric(14,2) not null,

  created_at timestamptz not null default now()
);

create index if not exists idx_proforma_monthly_categories_scenario
  on proforma_monthly_categories (scenario_id, month_index);

create index if not exists idx_proforma_monthly_categories_category
  on proforma_monthly_categories (category_id);

-- GL monthly results (optional v1.5 for detailed export)
create table if not exists proforma_monthly_gl (
  id bigserial primary key,
  scenario_id uuid not null references proforma_scenarios(id) on delete cascade,
  month_index int not null,
  period_start_date date not null,

  gl_account_id uuid not null references gl_accounts(id) on delete restrict,
  amount numeric(14,2) not null,

  created_at timestamptz not null default now()
);

create index if not exists idx_proforma_monthly_gl_scenario
  on proforma_monthly_gl (scenario_id, month_index);

create index if not exists idx_proforma_monthly_gl_account
  on proforma_monthly_gl (gl_account_id);

-- Enable RLS
alter table proforma_projects enable row level security;
alter table proforma_scenarios enable row level security;
alter table proforma_revenue_assumptions enable row level security;
alter table proforma_cogs_assumptions enable row level security;
alter table proforma_labor_assumptions enable row level security;
alter table proforma_occupancy_opex_assumptions enable row level security;
alter table proforma_capex_assumptions enable row level security;
alter table proforma_monthly_categories enable row level security;
alter table proforma_monthly_gl enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can view proforma projects for their organization" on proforma_projects;
drop policy if exists "Users can insert proforma projects for their organization" on proforma_projects;
drop policy if exists "Users can update proforma projects for their organization" on proforma_projects;
drop policy if exists "Users can delete proforma projects for their organization" on proforma_projects;
drop policy if exists "Users can view scenarios for their organization's projects" on proforma_scenarios;
drop policy if exists "Users can insert scenarios for their organization's projects" on proforma_scenarios;
drop policy if exists "Users can update scenarios for their organization's projects" on proforma_scenarios;
drop policy if exists "Users can delete scenarios for their organization's projects" on proforma_scenarios;
drop policy if exists "Users can view revenue assumptions for their scenarios" on proforma_revenue_assumptions;
drop policy if exists "Users can manage revenue assumptions for their scenarios" on proforma_revenue_assumptions;
drop policy if exists "Users can view COGS assumptions for their scenarios" on proforma_cogs_assumptions;
drop policy if exists "Users can manage COGS assumptions for their scenarios" on proforma_cogs_assumptions;
drop policy if exists "Users can view labor assumptions for their scenarios" on proforma_labor_assumptions;
drop policy if exists "Users can manage labor assumptions for their scenarios" on proforma_labor_assumptions;
drop policy if exists "Users can view occupancy/opex assumptions for their scenarios" on proforma_occupancy_opex_assumptions;
drop policy if exists "Users can manage occupancy/opex assumptions for their scenarios" on proforma_occupancy_opex_assumptions;
drop policy if exists "Users can view capex assumptions for their scenarios" on proforma_capex_assumptions;
drop policy if exists "Users can manage capex assumptions for their scenarios" on proforma_capex_assumptions;
drop policy if exists "Users can view category results for their scenarios" on proforma_monthly_categories;
drop policy if exists "System can insert category results" on proforma_monthly_categories;
drop policy if exists "Users can view GL results for their scenarios" on proforma_monthly_gl;
drop policy if exists "System can insert GL results" on proforma_monthly_gl;

-- RLS policies for proforma_projects
create policy "Users can view proforma projects for their organization"
  on proforma_projects for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can insert proforma projects for their organization"
  on proforma_projects for insert
  with check (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can update proforma projects for their organization"
  on proforma_projects for update
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can delete proforma projects for their organization"
  on proforma_projects for delete
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

-- RLS policies for proforma_scenarios
create policy "Users can view scenarios for their organization's projects"
  on proforma_scenarios for select
  using (
    project_id in (
      select id from proforma_projects
      where org_id in (
        select organization_id from organization_users
        where user_id = auth.uid() and is_active = true
      )
    )
  );

create policy "Users can insert scenarios for their organization's projects"
  on proforma_scenarios for insert
  with check (
    project_id in (
      select id from proforma_projects
      where org_id in (
        select organization_id from organization_users
        where user_id = auth.uid() and is_active = true
      )
    )
  );

create policy "Users can update scenarios for their organization's projects"
  on proforma_scenarios for update
  using (
    project_id in (
      select id from proforma_projects
      where org_id in (
        select organization_id from organization_users
        where user_id = auth.uid() and is_active = true
      )
    )
  );

create policy "Users can delete scenarios for their organization's projects"
  on proforma_scenarios for delete
  using (
    project_id in (
      select id from proforma_projects
      where org_id in (
        select organization_id from organization_users
        where user_id = auth.uid() and is_active = true
      )
    )
  );

-- RLS policies for assumption tables (all follow same pattern)
create policy "Users can view revenue assumptions for their scenarios"
  on proforma_revenue_assumptions for select
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

create policy "Users can manage revenue assumptions for their scenarios"
  on proforma_revenue_assumptions for all
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

create policy "Users can view COGS assumptions for their scenarios"
  on proforma_cogs_assumptions for select
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

create policy "Users can manage COGS assumptions for their scenarios"
  on proforma_cogs_assumptions for all
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

create policy "Users can view labor assumptions for their scenarios"
  on proforma_labor_assumptions for select
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

create policy "Users can manage labor assumptions for their scenarios"
  on proforma_labor_assumptions for all
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

create policy "Users can view occupancy/opex assumptions for their scenarios"
  on proforma_occupancy_opex_assumptions for select
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

create policy "Users can manage occupancy/opex assumptions for their scenarios"
  on proforma_occupancy_opex_assumptions for all
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

create policy "Users can view capex assumptions for their scenarios"
  on proforma_capex_assumptions for select
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

create policy "Users can manage capex assumptions for their scenarios"
  on proforma_capex_assumptions for all
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

-- RLS policies for results tables
create policy "Users can view category results for their scenarios"
  on proforma_monthly_categories for select
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

create policy "System can insert category results"
  on proforma_monthly_categories for insert
  with check (true);

create policy "Users can view GL results for their scenarios"
  on proforma_monthly_gl for select
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

create policy "System can insert GL results"
  on proforma_monthly_gl for insert
  with check (true);
