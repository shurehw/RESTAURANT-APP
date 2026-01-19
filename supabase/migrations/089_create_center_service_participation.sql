-- Create table for declaring which revenue centers participate in which service periods
-- This is the source of truth for "Bar doesn't do breakfast"

create table if not exists proforma_center_service_participation (
  id uuid primary key default gen_random_uuid(),
  revenue_center_id uuid not null references proforma_revenue_centers(id) on delete cascade,
  service_period_id uuid not null references proforma_revenue_service_periods(id) on delete cascade,
  is_active boolean not null default false,
  default_utilization_pct numeric(5,2) null check (default_utilization_pct >= 0 and default_utilization_pct <= 150),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(revenue_center_id, service_period_id)
);

create index idx_participation_center on proforma_center_service_participation(revenue_center_id);
create index idx_participation_service on proforma_center_service_participation(service_period_id);
create index idx_participation_active on proforma_center_service_participation(service_period_id, is_active) where is_active = true;
create index idx_participation_lookup on proforma_center_service_participation(service_period_id, revenue_center_id, is_active);

-- RLS policies
alter table proforma_center_service_participation enable row level security;

create policy "Users can view participation for their scenarios"
  on proforma_center_service_participation for select
  using (
    exists (
      select 1 from proforma_revenue_service_periods sp
      join proforma_scenarios s on s.id = sp.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where sp.id = proforma_center_service_participation.service_period_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can insert participation for their scenarios"
  on proforma_center_service_participation for insert
  with check (
    exists (
      select 1 from proforma_revenue_service_periods sp
      join proforma_scenarios s on s.id = sp.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where sp.id = proforma_center_service_participation.service_period_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can update participation for their scenarios"
  on proforma_center_service_participation for update
  using (
    exists (
      select 1 from proforma_revenue_service_periods sp
      join proforma_scenarios s on s.id = sp.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where sp.id = proforma_center_service_participation.service_period_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can delete participation for their scenarios"
  on proforma_center_service_participation for delete
  using (
    exists (
      select 1 from proforma_revenue_service_periods sp
      join proforma_scenarios s on s.id = sp.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where sp.id = proforma_center_service_participation.service_period_id
        and ou.user_id = auth.uid()
    )
  );
