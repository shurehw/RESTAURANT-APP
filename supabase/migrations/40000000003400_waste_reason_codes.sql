-- ============================================================================
-- COGS Module: Waste/Scrap Tracking with Reason Codes
-- ============================================================================
-- Structured waste tracking replaces untyped inventory adjustments.
-- Every waste event requires a reason code, creating accountability
-- and enabling root-cause analysis (spoilage vs theft vs prep error).
-- Alerts route to Action Center via control_plane_violations.
-- ============================================================================

-- 1. Waste Reason Codes (reference data, org-scoped)
-- ============================================================================

create table if not exists waste_reason_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  requires_notes boolean not null default false,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table waste_reason_codes
  add constraint uq_waste_reason_org_code unique (org_id, code);

create index idx_waste_reason_codes_org
  on waste_reason_codes(org_id, is_active, display_order);

-- RLS
alter table waste_reason_codes enable row level security;

create policy "Users can view waste reason codes for their org"
  on waste_reason_codes for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Admins can manage waste reason codes"
  on waste_reason_codes for all
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
      and role in ('admin', 'owner')
    )
  );

create policy "Service role bypass waste_reason_codes"
  on waste_reason_codes for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Waste Logs (structured waste events)
-- ============================================================================

create table if not exists waste_logs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  reason_code_id uuid not null references waste_reason_codes(id),

  -- Quantities
  quantity numeric(12,3) not null check (quantity > 0),
  uom text,
  unit_cost numeric(12,4),
  total_cost numeric(12,4) generated always as (quantity * coalesce(unit_cost, 0)) stored,

  -- Context
  notes text,
  recorded_by uuid references auth.users(id),
  business_date date not null,
  shift_period text check (shift_period in ('prep', 'lunch', 'dinner', 'late_night', 'close')),

  -- Link to inventory transaction (set by trigger)
  inventory_transaction_id uuid references inventory_transactions(id),

  created_at timestamptz not null default now()
);

create index idx_waste_logs_venue_date on waste_logs(venue_id, business_date desc);
create index idx_waste_logs_item on waste_logs(item_id, business_date desc);
create index idx_waste_logs_reason on waste_logs(reason_code_id);
create index idx_waste_logs_recorded_by on waste_logs(recorded_by);

-- RLS
alter table waste_logs enable row level security;

create policy "Users can view waste logs for their venues"
  on waste_logs for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Users can insert waste logs"
  on waste_logs for insert
  with check (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass waste_logs"
  on waste_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. Trigger: Auto-create inventory transaction + deplete balance
-- ============================================================================

create or replace function process_waste_log()
returns trigger language plpgsql security definer as $$
declare
  v_txn_id uuid;
  v_unit_cost numeric(12,4);
  v_reason_label text;
begin
  -- Get reason label for notes
  select label into v_reason_label
  from waste_reason_codes where id = new.reason_code_id;

  -- Get current unit cost if not provided
  if new.unit_cost is null then
    select ib.last_cost into v_unit_cost
    from inventory_balances ib
    where ib.venue_id = new.venue_id and ib.item_id = new.item_id;

    if v_unit_cost is null then
      select cost into v_unit_cost
      from item_cost_history
      where item_id = new.item_id
      order by effective_date desc limit 1;
    end if;

    new.unit_cost := coalesce(v_unit_cost, 0);
  end if;

  -- Record inventory usage via existing function
  perform record_inventory_usage(
    new.venue_id,
    new.item_id,
    new.quantity,
    'waste',
    new.id::text,
    'Waste (' || coalesce(v_reason_label, 'unknown') || '): ' || coalesce(new.notes, '')
  );

  -- Get the transaction ID we just created
  select id into v_txn_id
  from inventory_transactions
  where venue_id = new.venue_id
    and item_id = new.item_id
    and reference_type = 'waste'
    and reference_id = new.id::text
  order by created_at desc limit 1;

  new.inventory_transaction_id := v_txn_id;

  return new;
end;
$$;

create trigger trg_process_waste_log
  before insert on waste_logs
  for each row execute function process_waste_log();

-- 4. Views
-- ============================================================================

create or replace view v_waste_summary as
select
  wl.venue_id,
  wl.business_date,
  wrc.code as reason_code,
  wrc.label as reason_label,
  count(*) as log_count,
  sum(wl.quantity) as total_quantity,
  sum(wl.total_cost) as total_cost,
  count(distinct wl.item_id) as distinct_items
from waste_logs wl
join waste_reason_codes wrc on wrc.id = wl.reason_code_id
group by wl.venue_id, wl.business_date, wrc.code, wrc.label;

create or replace view v_waste_by_item as
select
  wl.venue_id,
  wl.item_id,
  i.name as item_name,
  i.category as item_category,
  wl.business_date,
  wrc.code as reason_code,
  wrc.label as reason_label,
  sum(wl.quantity) as total_quantity,
  sum(wl.total_cost) as total_cost,
  count(*) as log_count
from waste_logs wl
join waste_reason_codes wrc on wrc.id = wl.reason_code_id
join items i on i.id = wl.item_id
group by wl.venue_id, wl.item_id, i.name, i.category,
         wl.business_date, wrc.code, wrc.label;

create or replace view v_waste_trend as
select
  wl.venue_id,
  wrc.code as reason_code,
  wrc.label as reason_label,
  date_trunc('week', wl.business_date)::date as week_start,
  count(*) as log_count,
  sum(wl.total_cost) as total_cost,
  avg(wl.total_cost) as avg_cost_per_event
from waste_logs wl
join waste_reason_codes wrc on wrc.id = wl.reason_code_id
group by wl.venue_id, wrc.code, wrc.label, date_trunc('week', wl.business_date);

-- 5. Seed default reason codes for all existing orgs
-- ============================================================================

insert into waste_reason_codes (org_id, code, label, description, requires_notes, display_order)
select
  o.id,
  v.code,
  v.label,
  v.description,
  v.requires_notes,
  v.display_order
from organizations o
cross join (values
  ('spoilage',         'Spoilage',              'Product expired or went bad before use',                         false, 1),
  ('overproduction',   'Over-Production',       'Excess prep beyond demand',                                      false, 2),
  ('prep_error',       'Prep Error',            'Incorrect preparation, wrong cut, wrong recipe',                 false, 3),
  ('damaged',          'Damaged',               'Product damaged during storage, handling, or delivery',          false, 4),
  ('expired',          'Expired',               'Past use-by or best-before date',                                false, 5),
  ('quality_reject',   'Quality Rejection',     'Product did not meet quality standards on receipt or during use', true,  6),
  ('theft',            'Suspected Theft',       'Unaccounted loss suspected to be theft',                         true,  7),
  ('return_to_vendor', 'Return to Vendor',      'Sent back to vendor (credit expected)',                          true,  8),
  ('spillage',         'Spillage',              'Accidental spill during service or prep',                        false, 9),
  ('customer_return',  'Customer Return',       'Plate sent back by guest, food cannot be reused',                false, 10),
  ('other',            'Other',                 'Reason not listed — notes required',                             true,  11)
) as v(code, label, description, requires_notes, display_order)
on conflict (org_id, code) do nothing;

-- 6. Waste enforcement thresholds in procurement_settings
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'procurement_settings'
    and column_name = 'waste_daily_warning_dollars'
  ) then
    alter table procurement_settings
      add column waste_daily_warning_dollars numeric(12,2) not null default 500.00,
      add column waste_daily_critical_dollars numeric(12,2) not null default 1500.00,
      add column waste_weekly_warning_dollars numeric(12,2) not null default 2000.00,
      add column waste_weekly_critical_dollars numeric(12,2) not null default 5000.00,
      add column waste_theft_auto_escalate boolean not null default true;
  end if;
end $$;
