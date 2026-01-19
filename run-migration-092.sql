-- CONSOLIDATED MIGRATION: Revenue Centers × Service Periods System
-- Run this in Supabase SQL Editor if migrations 080-091 are not applied
-- This consolidates all required tables, triggers, and constraints

-- ============================================================================
-- 1. REVENUE CENTERS TABLE (from 080)
-- ============================================================================
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

-- ============================================================================
-- 2. SERVICE PERIOD COVERS TABLE (from 086)
-- ============================================================================
create table if not exists proforma_service_period_covers (
  id uuid primary key default gen_random_uuid(),
  service_period_id uuid not null references proforma_revenue_service_periods(id) on delete cascade,
  revenue_center_id uuid not null references proforma_revenue_centers(id) on delete cascade,
  covers_per_service numeric(10,2) not null default 0 check (covers_per_service >= 0),
  is_manually_edited boolean not null default false,
  last_edited_at timestamptz null,
  last_edited_by uuid references auth.users(id),
  edit_history jsonb default '[]'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(service_period_id, revenue_center_id)
);

create index if not exists idx_service_period_covers_period
  on proforma_service_period_covers (service_period_id);

create index if not exists idx_service_period_covers_center
  on proforma_service_period_covers (revenue_center_id);

create index if not exists idx_service_period_covers_edited
  on proforma_service_period_covers (service_period_id, is_manually_edited);

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

-- ============================================================================
-- 3. CENTER SERVICE PARTICIPATION TABLE (from 089)
-- ============================================================================
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

create index if not exists idx_participation_center on proforma_center_service_participation(revenue_center_id);
create index if not exists idx_participation_service on proforma_center_service_participation(service_period_id);
create index if not exists idx_participation_active on proforma_center_service_participation(service_period_id, is_active) where is_active = true;
create index if not exists idx_participation_lookup on proforma_center_service_participation(service_period_id, revenue_center_id, is_active);

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

-- ============================================================================
-- 4. VALIDATION TRIGGERS (from 090)
-- ============================================================================

-- Prevent covers for inactive centers
create or replace function validate_covers_only_for_active_centers()
returns trigger as $$
begin
  if new.covers_per_service > 0 then
    if not exists (
      select 1 from proforma_center_service_participation
      where revenue_center_id = new.revenue_center_id
        and service_period_id = new.service_period_id
        and is_active = true
    ) then
      raise exception 'Cannot assign covers to inactive center for this service period';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists enforce_active_center_covers on proforma_service_period_covers;
create trigger enforce_active_center_covers
  before insert or update on proforma_service_period_covers
  for each row
  execute function validate_covers_only_for_active_centers();

-- Lock service estimate when manually edited
create or replace function lock_service_estimate_on_manual_edit()
returns trigger as $$
begin
  if new.is_manually_edited = true and (old.is_manually_edited = false or old.is_manually_edited is null) then
    update proforma_revenue_service_periods
    set avg_covers_per_service = null
    where id = new.service_period_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists lock_on_edit on proforma_service_period_covers;
create trigger lock_on_edit
  after update on proforma_service_period_covers
  for each row
  when (new.is_manually_edited = true and (old.is_manually_edited = false or old.is_manually_edited is null))
  execute function lock_service_estimate_on_manual_edit();

-- Auto-update timestamps
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_participation_timestamp on proforma_center_service_participation;
create trigger update_participation_timestamp
  before update on proforma_center_service_participation
  for each row
  execute function update_updated_at_column();

-- ============================================================================
-- 5. AUDIT TRAIL (from 091)
-- ============================================================================

-- Track cover changes
create or replace function log_cover_change()
returns trigger as $$
begin
  new.edit_history = coalesce(new.edit_history, '[]'::jsonb) || jsonb_build_object(
    'timestamp', now(),
    'user_id', auth.uid(),
    'old_value', old.covers_per_service,
    'new_value', new.covers_per_service,
    'was_auto_allocated', not new.is_manually_edited
  );
  new.last_edited_by = auth.uid();
  new.last_edited_at = now();
  new.version = old.version + 1;
  return new;
end;
$$ language plpgsql;

drop trigger if exists track_cover_edits on proforma_service_period_covers;
create trigger track_cover_edits
  before update on proforma_service_period_covers
  for each row
  when (old.covers_per_service is distinct from new.covers_per_service)
  execute function log_cover_change();

-- ============================================================================
-- 6. DEPRECATE OLD COLUMN
-- ============================================================================

-- Make avg_covers_per_service nullable (backward compatibility)
alter table proforma_revenue_service_periods
  alter column avg_covers_per_service drop not null;

comment on column proforma_revenue_service_periods.avg_covers_per_service is
  'DEPRECATED: Use center-level covers in proforma_service_period_covers. This field is for backward compatibility only.';
