-- ============================================================================
-- Procurement Agent Phase 3: Intelligence Layer
-- ============================================================================
-- Adds:
--   1. Item seasonality profiles (learned demand multipliers)
--   2. Item substitution rules (fallback mappings)
--   3. Agent activity materialized view for dashboard visibility
--
-- Depends on:
--   40000000004300_procurement_agent.sql
--   40000000004400_procurement_bundling_followup.sql
-- ============================================================================

-- 0. Compatibility patch for procurement_agent_runs lifecycle columns
-- ============================================================================
-- 40000000004300 introduced procurement_agent_runs but older snapshots may not
-- include lifecycle columns referenced by this phase.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'procurement_agent_runs' and column_name = 'started_at'
  ) then
    alter table procurement_agent_runs
      add column started_at timestamptz not null default now();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'procurement_agent_runs' and column_name = 'completed_at'
  ) then
    alter table procurement_agent_runs
      add column completed_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'procurement_agent_runs' and column_name = 'status'
  ) then
    alter table procurement_agent_runs
      add column status text not null default 'running'
      check (status in ('running', 'completed', 'failed'));
  end if;

  update procurement_agent_runs
  set started_at = coalesce(started_at, created_at);
end $$;

-- 1. Item Seasonality Profiles — Learned demand patterns
-- ============================================================================

create table if not exists item_seasonality_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  venue_id uuid references venues(id) on delete cascade,  -- null = org-wide
  month smallint not null check (month between 1 and 12),
  day_of_week smallint check (day_of_week between 0 and 6),  -- 0=Sun, null=month-level
  demand_multiplier numeric(5,3) not null default 1.000,
  confidence numeric(4,3) not null default 0.000,  -- 0-1
  sample_size int not null default 0,
  last_computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique per item+venue+month+dow combo
create unique index idx_item_seasonality_unique
  on item_seasonality_profiles(org_id, item_id, coalesce(venue_id, '00000000-0000-0000-0000-000000000000'::uuid), month, coalesce(day_of_week, -1));

create index idx_item_seasonality_item on item_seasonality_profiles(item_id, venue_id);
create index idx_item_seasonality_org on item_seasonality_profiles(org_id);

alter table item_seasonality_profiles enable row level security;

create policy "Users can view seasonality for their org"
  on item_seasonality_profiles for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Service role bypass item_seasonality_profiles"
  on item_seasonality_profiles for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Item Substitution Rules — Fallback mappings
-- ============================================================================

create table if not exists item_substitution_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  primary_item_id uuid not null references items(id) on delete cascade,
  substitute_item_id uuid not null references items(id) on delete cascade,
  substitution_type text not null default 'equivalent'
    check (substitution_type in ('equivalent', 'downgrade', 'upgrade', 'different_brand', 'different_size')),
  priority smallint not null default 1,  -- 1 = first choice
  price_impact_pct numeric(5,2) not null default 0,  -- positive = more expensive
  auto_substitute boolean not null default false,  -- agent can auto-swap without approval
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_different_items check (primary_item_id != substitute_item_id)
);

create unique index idx_substitution_unique
  on item_substitution_rules(org_id, primary_item_id, substitute_item_id)
  where is_active = true;

create index idx_substitution_primary on item_substitution_rules(primary_item_id)
  where is_active = true;
create index idx_substitution_org on item_substitution_rules(org_id);

alter table item_substitution_rules enable row level security;

create policy "Users can view substitutions for their org"
  on item_substitution_rules for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Managers can manage substitution rules"
  on item_substitution_rules for all
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true and role in ('manager', 'admin', 'owner')
    )
  )
  with check (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true and role in ('manager', 'admin', 'owner')
    )
  );

create policy "Service role bypass item_substitution_rules"
  on item_substitution_rules for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. View: Agent Activity Summary (powers the dashboard)
-- ============================================================================

create or replace view v_procurement_agent_activity as
select
  ar.org_id,
  ar.venue_id,
  v.name as venue_name,
  ar.id as run_id,
  ar.triggered_by,
  ar.signal_type,
  ar.items_evaluated,
  ar.pos_generated,
  ar.pos_auto_executed,
  ar.anomalies_detected,
  ar.started_at,
  ar.completed_at,
  ar.status,
  -- Aggregate PO data for this run
  (
    select coalesce(sum(po.total_amount), 0)
    from purchase_orders po
    where po.agent_run_id = ar.id
  ) as run_po_total,
  (
    select count(*)
    from purchase_orders po
    where po.agent_run_id = ar.id and po.status = 'ordered'
  ) as run_pos_dispatched,
  (
    select count(*)
    from purchase_orders po
    where po.agent_run_id = ar.id and po.status = 'received'
  ) as run_pos_received
from procurement_agent_runs ar
join venues v on v.id = ar.venue_id
order by ar.started_at desc;

-- 4. View: Procurement Savings Summary (bundles + rebalancing)
-- ============================================================================

create or replace view v_procurement_savings as
select
  org_id,
  'bundle' as savings_type,
  id as source_id,
  estimated_savings as amount,
  savings_pct,
  status,
  created_at
from po_bundle_groups
where estimated_savings > 0

union all

select
  org_id,
  'transfer' as savings_type,
  id as source_id,
  -- Transfer savings = what it would cost to reorder vs $0 transfer
  round((quantity * coalesce(unit_cost, 0))::numeric, 2) as amount,
  100.00 as savings_pct,  -- 100% savings (transfer vs new order)
  status,
  created_at
from inventory_transfers
where status in ('approved', 'received')

order by created_at desc;

-- 5. View: Substitution candidates (items with active subs)
-- ============================================================================

create or replace view v_substitution_options as
select
  sr.id as rule_id,
  sr.org_id,
  pi.name as primary_item_name,
  sr.primary_item_id,
  si.name as substitute_item_name,
  sr.substitute_item_id,
  sr.substitution_type,
  sr.priority,
  sr.price_impact_pct,
  sr.auto_substitute,
  sr.notes
from item_substitution_rules sr
join items pi on pi.id = sr.primary_item_id
join items si on si.id = sr.substitute_item_id
where sr.is_active = true
order by sr.primary_item_id, sr.priority;

-- 6. Comments
-- ============================================================================

comment on table item_seasonality_profiles is 'Learned demand multipliers per item/venue/month/DOW. Weekly batch recomputed from historical consumption data.';
comment on table item_substitution_rules is 'Fallback item mappings. When primary item unavailable, agent can propose or auto-swap substitutes based on rules.';
