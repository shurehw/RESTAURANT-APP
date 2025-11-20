-- Create flexible salaried roles table for labor modeling

create table if not exists proforma_labor_salaried_roles (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references proforma_scenarios(id) on delete cascade,
  role_name text not null,                 -- 'GM','AGM','KM','Security Supervisor'
  annual_salary numeric(12,2) not null,
  start_month int not null default 1,      -- first month role is active
  end_month int default null,              -- null = always active
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_labor_salaried_roles_scenario
  on proforma_labor_salaried_roles (scenario_id);

-- Enable RLS
alter table proforma_labor_salaried_roles enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can view salaried roles for their scenarios" on proforma_labor_salaried_roles;
drop policy if exists "Users can manage salaried roles for their scenarios" on proforma_labor_salaried_roles;

-- RLS policies
create policy "Users can view salaried roles for their scenarios"
  on proforma_labor_salaried_roles for select
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

create policy "Users can manage salaried roles for their scenarios"
  on proforma_labor_salaried_roles for all
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
