-- Restructure: Make revenue centers primary with their own check averages and F&B splits per service period
-- Each (center, service_period) combination has its own metrics

-- Drop the old service_period_covers table if it exists
drop table if exists proforma_service_period_covers cascade;

-- Create new table: revenue center metrics per service period
create table if not exists proforma_center_service_metrics (
  id uuid primary key default gen_random_uuid(),
  revenue_center_id uuid not null references proforma_revenue_centers(id) on delete cascade,
  service_period_id uuid not null references proforma_revenue_service_periods(id) on delete cascade,

  -- Metrics specific to this center at this service period
  covers_per_service numeric(10,2) not null default 0 check (covers_per_service >= 0),
  avg_check numeric(10,2) not null default 0 check (avg_check >= 0),
  food_pct numeric(5,2) not null default 60.00 check (food_pct >= 0 and food_pct <= 100),
  bev_pct numeric(5,2) not null default 35.00 check (bev_pct >= 0 and bev_pct <= 100),
  other_pct numeric(5,2) not null default 5.00 check (other_pct >= 0 and other_pct <= 100),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(revenue_center_id, service_period_id),
  check (abs((food_pct + bev_pct + other_pct) - 100.00) < 0.01)
);

create index if not exists idx_center_service_metrics_center
  on proforma_center_service_metrics (revenue_center_id);

create index if not exists idx_center_service_metrics_service
  on proforma_center_service_metrics (service_period_id);

-- RLS policies
alter table proforma_center_service_metrics enable row level security;

create policy "Users can view center service metrics for their scenarios"
  on proforma_center_service_metrics for select
  using (
    exists (
      select 1 from proforma_revenue_centers rc
      join proforma_scenarios s on s.id = rc.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where rc.id = proforma_center_service_metrics.revenue_center_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can insert center service metrics for their scenarios"
  on proforma_center_service_metrics for insert
  with check (
    exists (
      select 1 from proforma_revenue_centers rc
      join proforma_scenarios s on s.id = rc.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where rc.id = proforma_center_service_metrics.revenue_center_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can update center service metrics for their scenarios"
  on proforma_center_service_metrics for update
  using (
    exists (
      select 1 from proforma_revenue_centers rc
      join proforma_scenarios s on s.id = rc.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where rc.id = proforma_center_service_metrics.revenue_center_id
        and ou.user_id = auth.uid()
    )
  );

create policy "Users can delete center service metrics for their scenarios"
  on proforma_center_service_metrics for delete
  using (
    exists (
      select 1 from proforma_revenue_centers rc
      join proforma_scenarios s on s.id = rc.scenario_id
      join proforma_projects p on p.id = s.project_id
      join organization_users ou on ou.organization_id = p.org_id
      where rc.id = proforma_center_service_metrics.revenue_center_id
        and ou.user_id = auth.uid()
    )
  );

-- Remove check/F&B split columns from service_periods table since they're now per-center
-- (Commented for safety - these become unused)
-- alter table proforma_revenue_service_periods drop column if exists avg_check;
-- alter table proforma_revenue_service_periods drop column if exists food_pct;
-- alter table proforma_revenue_service_periods drop column if exists bev_pct;
-- alter table proforma_revenue_service_periods drop column if exists other_pct;
