-- ============================================================================
-- COGS Module: Auto PO Generation & Ordering
-- ============================================================================
-- Automatically generates purchase orders from:
--   1. Par-based: items below reorder point
--   2. Forecast-based: predicted ingredient needs from demand forecast
--   3. Both: whichever triggers first
-- Consolidates by vendor, respects MOQ/price tiers, requires approval.
-- Better than Nory: dual-mode (par + forecast), vendor consolidation,
-- price tier optimization, and full audit trail.
-- ============================================================================

-- 1. Extend purchase_orders with auto-generation metadata
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'purchase_orders' and column_name = 'generation_type'
  ) then
    alter table purchase_orders
      add column generation_type text not null default 'manual'
        check (generation_type in ('manual', 'auto_par', 'auto_forecast', 'auto_both')),
      add column auto_generation_run_id uuid,
      add column approved_by uuid references auth.users(id),
      add column approved_at timestamptz,
      add column requires_approval boolean not null default false;
  end if;
end $$;

create index if not exists idx_po_generation_type
  on purchase_orders(generation_type) where generation_type != 'manual';
create index if not exists idx_po_requires_approval
  on purchase_orders(requires_approval, status) where requires_approval = true and status = 'draft';

-- 2. PO Generation Runs (audit trail)
-- ============================================================================

create table if not exists po_generation_runs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  generation_type text not null check (generation_type in ('par', 'forecast', 'both')),
  triggered_by text not null check (triggered_by in ('cron', 'manual', 'par_alert')),

  -- Results
  items_evaluated int not null default 0,
  items_needing_order int not null default 0,
  pos_generated int not null default 0,
  total_estimated_cost numeric(12,2) not null default 0,

  -- Detail
  generation_log jsonb not null default '[]'::jsonb,
  -- Array of { item_id, item_name, need_qty, order_qty, vendor_id, reason }

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_po_gen_runs_venue on po_generation_runs(venue_id, created_at desc);

-- RLS
alter table po_generation_runs enable row level security;

create policy "Users can view po generation runs for their venues"
  on po_generation_runs for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass po_generation_runs"
  on po_generation_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. Auto PO settings in procurement_settings
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'procurement_settings'
    and column_name = 'auto_po_enabled'
  ) then
    alter table procurement_settings
      add column auto_po_enabled boolean not null default false,
      add column auto_po_mode text not null default 'par'
        check (auto_po_mode in ('par', 'forecast', 'both')),
      add column auto_po_forecast_horizon_days int not null default 7,
      add column auto_po_requires_approval boolean not null default true,
      add column auto_po_min_order_value numeric(12,2) default 50.00,
      add column auto_po_consolidate_vendors boolean not null default true,
      add column auto_po_schedule text not null default 'daily_6am'
        check (auto_po_schedule in ('daily_6am', 'daily_10pm', 'twice_daily', 'weekly_monday'));
  end if;
end $$;

-- 4. PO Approval function
-- ============================================================================

create or replace function approve_purchase_order(
  p_po_id uuid,
  p_approved_by uuid
)
returns void language plpgsql security definer as $$
begin
  update purchase_orders
  set status = 'pending',
      approved_by = p_approved_by,
      approved_at = now(),
      updated_at = now()
  where id = p_po_id
    and status = 'draft'
    and requires_approval = true;

  if not found then
    raise exception 'PO % not found, not in draft, or does not require approval', p_po_id;
  end if;
end;
$$;

-- 5. Pending Auto PO view (for approval dashboard)
-- ============================================================================

create or replace view v_pending_auto_pos as
select
  po.id as po_id,
  po.order_number,
  po.venue_id,
  v.name as venue_name,
  po.vendor_id,
  vnd.name as vendor_name,
  po.generation_type,
  po.total_amount,
  po.order_date,
  po.delivery_date,
  po.auto_generation_run_id,
  po.created_at,
  (select count(*) from purchase_order_items poi where poi.purchase_order_id = po.id) as item_count
from purchase_orders po
join venues v on v.id = po.venue_id
left join vendors vnd on vnd.id = po.vendor_id
where po.requires_approval = true
  and po.status = 'draft'
  and po.generation_type != 'manual'
order by po.created_at desc;

-- 6. Order Guide view (what needs ordering right now)
-- ============================================================================
-- Combines par-based and forecast-based needs into a unified order guide.

create or replace view v_order_guide as
with par_needs as (
  -- Items below reorder point
  select
    ibr.venue_id,
    ibr.item_id,
    ibr.item_name,
    ibr.quantity_on_hand,
    ibr.reorder_point,
    ibr.par_level,
    ibr.reorder_quantity,
    ibr.estimated_order_cost,
    'par' as need_source,
    greatest(ibr.reorder_quantity, ibr.par_level - ibr.quantity_on_hand) as suggested_qty
  from items_below_reorder ibr
),
forecast_needs as (
  -- Items with net need from demand forecast
  select
    ins.venue_id,
    ins.item_id,
    ins.item_name,
    ins.on_hand_qty as quantity_on_hand,
    ins.reorder_point,
    ins.par_level,
    ins.reorder_quantity,
    ins.total_forecasted_cost as estimated_order_cost,
    'forecast' as need_source,
    ins.net_need_qty as suggested_qty
  from v_ingredient_needs_summary ins
  where ins.net_need_qty > 0
),
combined as (
  select * from par_needs
  union all
  select * from forecast_needs
)
select
  c.venue_id,
  c.item_id,
  c.item_name,
  c.quantity_on_hand,
  c.reorder_point,
  c.par_level,
  max(c.suggested_qty) as suggested_order_qty,
  -- Best vendor pricing
  (select vi.vendor_id from vendor_items vi
   where vi.item_id = c.item_id and vi.is_active = true
   order by vi.tier_price asc limit 1) as best_vendor_id,
  (select vnd.name from vendor_items vi
   join vendors vnd on vnd.id = vi.vendor_id
   where vi.item_id = c.item_id and vi.is_active = true
   order by vi.tier_price asc limit 1) as best_vendor_name,
  (select vi.tier_price from vendor_items vi
   where vi.item_id = c.item_id and vi.is_active = true
   order by vi.tier_price asc limit 1) as best_unit_price,
  array_agg(distinct c.need_source) as need_sources,
  max(c.estimated_order_cost) as estimated_cost
from combined c
group by c.venue_id, c.item_id, c.item_name,
         c.quantity_on_hand, c.reorder_point, c.par_level;
