-- ============================================================================
-- Procurement Agent: Entity Routing, AI Classification, Approval Tiers
-- ============================================================================
-- Adds the autonomous procurement agent layer on top of existing auto-PO
-- infrastructure. The agent classifies items to Binyan entities
-- (SHW/Shureprint/E&E Mercantile/GroundOps), determines approval tiers,
-- dispatches orders, and maintains a full audit trail.
--
-- Depends on:
--   027_purchase_orders.sql (purchase_orders, purchase_order_items)
--   034_item_pars_and_costs.sql (item_pars, vendor_items)
--   230_procurement_settings.sql (procurement_settings P0 pattern)
--   40000000003800_auto_po_generation.sql (po_generation_runs, auto PO columns)
--   40000000004100_supplier_scorecards.sql (delivery_receipts)
-- ============================================================================

-- 1. Vendor Entities — Maps Binyan-owned entities to vendor records
-- ============================================================================

create table if not exists vendor_entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity_code text not null check (entity_code in ('shw', 'shureprint', 'ee_mercantile', 'groundops')),
  entity_name text not null,
  vendor_id uuid references vendors(id),
  routing_categories text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_vendor_entities_org_code unique (org_id, entity_code)
);

create index idx_vendor_entities_org on vendor_entities(org_id) where is_active = true;

alter table vendor_entities enable row level security;

create policy "Users can view vendor entities for their org"
  on vendor_entities for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Admins can manage vendor entities"
  on vendor_entities for all
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true and role in ('admin', 'owner')
    )
  )
  with check (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true and role in ('admin', 'owner')
    )
  );

create policy "Service role bypass vendor_entities"
  on vendor_entities for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Item Entity Classifications — AI or manual item-to-entity mapping
-- ============================================================================

create table if not exists item_entity_classifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  entity_code text not null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  classification_source text not null check (classification_source in ('ai', 'manual', 'mercantile_sync')),
  classification_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_item_entity_class_org_item unique (org_id, item_id)
);

create index idx_item_entity_class_org on item_entity_classifications(org_id);
create index idx_item_entity_class_entity on item_entity_classifications(entity_code);

alter table item_entity_classifications enable row level security;

create policy "Users can view item classifications for their org"
  on item_entity_classifications for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Service role bypass item_entity_classifications"
  on item_entity_classifications for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. Procurement Agent Runs — Full audit trail
-- ============================================================================

create table if not exists procurement_agent_runs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  triggered_by text not null check (triggered_by in ('cron', 'manual', 'signal')),
  signal_type text check (signal_type in (
    'par_breach', 'pos_depletion', 'cleaning_threshold',
    'packaging_burn', 'linen_cycle', 'equipment_wear',
    'new_venue', 'schedule', 'forecast'
  )),

  -- Results
  items_evaluated int not null default 0,
  items_classified int not null default 0,
  pos_generated int not null default 0,
  pos_auto_executed int not null default 0,
  pos_pending_approval int not null default 0,
  total_estimated_cost numeric(12,2) not null default 0,

  -- AI decision log
  agent_reasoning jsonb not null default '{}'::jsonb,
  anomalies_detected jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index idx_procurement_agent_runs_venue on procurement_agent_runs(venue_id, created_at desc);
create index idx_procurement_agent_runs_org on procurement_agent_runs(org_id, created_at desc);

alter table procurement_agent_runs enable row level security;

create policy "Users can view agent runs for their venues"
  on procurement_agent_runs for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass procurement_agent_runs"
  on procurement_agent_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 4. Procurement Approval Tiers — Configurable thresholds
-- ============================================================================

create table if not exists procurement_approval_tiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tier_name text not null check (tier_name in ('auto', 'manager', 'executive')),
  max_amount numeric(12,2) not null,
  required_role text not null check (required_role in ('system', 'manager', 'admin', 'owner')),
  auto_execute boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_approval_tiers_org_name unique (org_id, tier_name)
);

alter table procurement_approval_tiers enable row level security;

create policy "Users can view approval tiers for their org"
  on procurement_approval_tiers for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Admins can manage approval tiers"
  on procurement_approval_tiers for all
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true and role in ('admin', 'owner')
    )
  )
  with check (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true and role in ('admin', 'owner')
    )
  );

create policy "Service role bypass procurement_approval_tiers"
  on procurement_approval_tiers for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 5. PO Dispatch Log — Tracks how POs were sent to vendors
-- ============================================================================

create table if not exists po_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  dispatch_method text not null check (dispatch_method in ('email', 'api', 'webhook', 'manual')),
  dispatched_at timestamptz not null default now(),
  dispatched_to text, -- email address or API endpoint
  response_status text, -- 'sent', 'failed', 'pending'
  response_body jsonb,
  created_at timestamptz not null default now()
);

create index idx_po_dispatch_log_po on po_dispatch_log(purchase_order_id);
create index idx_po_dispatch_log_org on po_dispatch_log(org_id, dispatched_at desc);

alter table po_dispatch_log enable row level security;

create policy "Users can view dispatch logs for their org"
  on po_dispatch_log for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Service role bypass po_dispatch_log"
  on po_dispatch_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 6. Extend procurement_settings with agent columns
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'procurement_settings'
    and column_name = 'agent_enabled'
  ) then
    alter table procurement_settings
      add column agent_enabled boolean not null default false,
      add column agent_mode text not null default 'advise'
        check (agent_mode in ('advise', 'auto_low', 'full_auto')),
      add column agent_auto_execute_max numeric(12,2) not null default 500.00,
      add column agent_manager_approval_max numeric(12,2) not null default 2500.00,
      add column agent_cross_venue_bundling boolean not null default false,
      add column agent_consumption_signals text[] not null default '{par_breach}',
      add column agent_seasonality_enabled boolean not null default false;
  end if;
end $$;

-- 7. Extend purchase_orders with agent metadata
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'purchase_orders'
    and column_name = 'agent_run_id'
  ) then
    alter table purchase_orders
      add column agent_run_id uuid references procurement_agent_runs(id),
      add column approval_tier text check (approval_tier in ('auto', 'manager', 'executive')),
      add column entity_code text,
      add column is_bundled boolean not null default false,
      add column bundle_group_id uuid;
  end if;
end $$;

create index if not exists idx_po_agent_run on purchase_orders(agent_run_id) where agent_run_id is not null;
create index if not exists idx_po_entity_code on purchase_orders(entity_code) where entity_code is not null;
create index if not exists idx_po_bundle_group on purchase_orders(bundle_group_id) where bundle_group_id is not null;

-- 8. Determine approval tier function
-- ============================================================================

create or replace function determine_approval_tier(
  p_org_id uuid,
  p_amount numeric
)
returns text language plpgsql stable as $$
declare
  v_tier text;
begin
  select tier_name into v_tier
  from procurement_approval_tiers
  where org_id = p_org_id
    and is_active = true
    and p_amount <= max_amount
  order by max_amount asc
  limit 1;

  return coalesce(v_tier, 'executive');
end;
$$;

-- 9. View: Agent-generated POs pending approval
-- ============================================================================

create or replace view v_agent_pending_pos as
select
  po.id as po_id,
  po.order_number,
  po.venue_id,
  v.name as venue_name,
  po.vendor_id,
  vnd.name as vendor_name,
  po.total_amount,
  po.approval_tier,
  po.entity_code,
  po.agent_run_id,
  po.is_bundled,
  po.order_date,
  po.delivery_date,
  po.created_at,
  (select count(*) from purchase_order_items poi where poi.purchase_order_id = po.id) as item_count,
  ar.agent_reasoning,
  ar.anomalies_detected
from purchase_orders po
join venues v on v.id = po.venue_id
left join vendors vnd on vnd.id = po.vendor_id
left join procurement_agent_runs ar on ar.id = po.agent_run_id
where po.agent_run_id is not null
  and po.status = 'draft'
  and po.requires_approval = true
order by po.created_at desc;

-- 10. Seed default approval tiers function
-- ============================================================================

create or replace function seed_default_approval_tiers(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into procurement_approval_tiers (org_id, tier_name, max_amount, required_role, auto_execute)
  values
    (p_org_id, 'auto', 500.00, 'system', true),
    (p_org_id, 'manager', 2500.00, 'manager', false),
    (p_org_id, 'executive', 999999.99, 'admin', false)
  on conflict (org_id, tier_name) do nothing;
end;
$$;

-- 11. Comments
-- ============================================================================

comment on table vendor_entities is 'Maps Binyan-owned entities (SHW, Shureprint, E&E Mercantile, GroundOps) to vendor records for procurement routing.';
comment on table item_entity_classifications is 'AI-generated or manual classification of items to Binyan entity codes for procurement routing.';
comment on table procurement_agent_runs is 'Full audit trail of autonomous procurement agent executions including AI reasoning.';
comment on table procurement_approval_tiers is 'Configurable approval thresholds: auto-execute, manager approval, executive approval. Tunable rails within fixed standards.';
comment on table po_dispatch_log is 'Tracks how purchase orders were dispatched to vendors (email, API, webhook).';
comment on column procurement_settings.agent_mode is 'advise = recommendations only, auto_low = auto-execute below threshold, full_auto = auto-execute up to manager threshold.';
