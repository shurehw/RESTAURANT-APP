-- Add revenue centers table
-- Revenue centers are structural divisions of the restaurant (Main Dining, Bar, Patio, Private Room, etc.)
-- Each can have different service periods and check averages

create table if not exists proforma_revenue_centers (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references proforma_scenarios(id) on delete cascade,
  center_name text not null,
  seats int not null check (seats > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scenario_id, center_name)
);

create index if not exists idx_proforma_revenue_centers_scenario
  on proforma_revenue_centers (scenario_id);

-- RLS policies
alter table proforma_revenue_centers enable row level security;

create policy "Users can view revenue centers for their scenarios"
  on proforma_revenue_centers for select
  using (
    exists (
      select 1 from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where s.id = proforma_revenue_centers.scenario_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can insert revenue centers for their scenarios"
  on proforma_revenue_centers for insert
  with check (
    exists (
      select 1 from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where s.id = proforma_revenue_centers.scenario_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can update revenue centers for their scenarios"
  on proforma_revenue_centers for update
  using (
    exists (
      select 1 from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where s.id = proforma_revenue_centers.scenario_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can delete revenue centers for their scenarios"
  on proforma_revenue_centers for delete
  using (
    exists (
      select 1 from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where s.id = proforma_revenue_centers.scenario_id
        and ou.user_id = auth.uid()
    )
  );
