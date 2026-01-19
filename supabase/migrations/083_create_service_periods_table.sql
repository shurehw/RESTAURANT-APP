-- Create proforma service periods table
-- Service periods are time-based divisions (Lunch, Dinner, Late Night, etc.)
-- defined per scenario with their own covers and check averages

create table if not exists proforma_revenue_service_periods (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references proforma_scenarios(id) on delete cascade,
  service_name text not null,
  avg_covers_per_service numeric(10,2) not null check (avg_covers_per_service >= 0),
  avg_check numeric(10,2) not null check (avg_check >= 0),
  days_per_week int not null default 7 check (days_per_week between 1 and 7),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scenario_id, service_name)
);

create index if not exists idx_proforma_service_periods_scenario
  on proforma_revenue_service_periods (scenario_id, sort_order);

-- RLS policies
alter table proforma_revenue_service_periods enable row level security;

create policy "Users can view service periods for their scenarios"
  on proforma_revenue_service_periods for select
  using (
    exists (
      select 1 from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where s.id = proforma_revenue_service_periods.scenario_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can insert service periods for their scenarios"
  on proforma_revenue_service_periods for insert
  with check (
    exists (
      select 1 from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where s.id = proforma_revenue_service_periods.scenario_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can update service periods for their scenarios"
  on proforma_revenue_service_periods for update
  using (
    exists (
      select 1 from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where s.id = proforma_revenue_service_periods.scenario_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can delete service periods for their scenarios"
  on proforma_revenue_service_periods for delete
  using (
    exists (
      select 1 from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where s.id = proforma_revenue_service_periods.scenario_id
        and ou.user_id = auth.uid()
    )
  );
