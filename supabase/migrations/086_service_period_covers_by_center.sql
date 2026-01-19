-- Create table linking service periods to revenue centers with covers allocation
-- This allows each service period to specify which areas are active and how many covers per area

create table if not exists proforma_service_period_covers (
  id uuid primary key default gen_random_uuid(),
  service_period_id uuid not null references proforma_revenue_service_periods(id) on delete cascade,
  revenue_center_id uuid not null references proforma_revenue_centers(id) on delete cascade,
  covers_per_service numeric(10,2) not null default 0 check (covers_per_service >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_period_id, revenue_center_id)
);

create index if not exists idx_service_period_covers_period
  on proforma_service_period_covers (service_period_id);

create index if not exists idx_service_period_covers_center
  on proforma_service_period_covers (revenue_center_id);

-- RLS policies
alter table proforma_service_period_covers enable row level security;

create policy "Users can view service period covers for their scenarios"
  on proforma_service_period_covers for select
  using (
    exists (
      select 1 from proforma_revenue_service_periods sp
      join proforma_scenarios s on s.id = sp.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where sp.id = proforma_service_period_covers.service_period_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can insert service period covers for their scenarios"
  on proforma_service_period_covers for insert
  with check (
    exists (
      select 1 from proforma_revenue_service_periods sp
      join proforma_scenarios s on s.id = sp.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where sp.id = proforma_service_period_covers.service_period_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can update service period covers for their scenarios"
  on proforma_service_period_covers for update
  using (
    exists (
      select 1 from proforma_revenue_service_periods sp
      join proforma_scenarios s on s.id = sp.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where sp.id = proforma_service_period_covers.service_period_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can delete service period covers for their scenarios"
  on proforma_service_period_covers for delete
  using (
    exists (
      select 1 from proforma_revenue_service_periods sp
      join proforma_scenarios s on s.id = sp.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where sp.id = proforma_service_period_covers.service_period_id
        and ou.user_id = auth.uid()
    )
  );

-- Remove avg_covers_per_service from service periods table since it's now per-center
-- (Commented out for safety - can be removed after data migration)
-- alter table proforma_revenue_service_periods drop column if exists avg_covers_per_service;
