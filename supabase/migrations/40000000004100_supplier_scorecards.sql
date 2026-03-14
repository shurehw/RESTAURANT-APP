-- ============================================================================
-- COGS Module: Supplier Scorecards
-- ============================================================================
-- Tracks vendor delivery performance: accuracy, quality, timeliness,
-- short deliveries, and price stability.
-- Feeds into waste reason codes (quality_reject, return_to_vendor)
-- and surfaces in Action Center for vendor accountability.
-- Nory doesn't have this — we track vendor reliability, not just cost.
-- ============================================================================

-- 1. Delivery Receipts (extends existing receipt flow)
-- ============================================================================

create table if not exists delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  purchase_order_id uuid references purchase_orders(id),

  -- Delivery details
  delivery_date date not null,
  received_by uuid references auth.users(id),
  delivery_time timestamptz,

  -- Timeliness
  expected_delivery_date date,
  days_late int generated always as (
    case when expected_delivery_date is not null and delivery_date > expected_delivery_date
    then delivery_date - expected_delivery_date else 0 end
  ) stored,

  -- Overall assessment
  overall_rating int check (overall_rating between 1 and 5),
  notes text,

  -- Counts
  total_line_items int not null default 0,
  lines_correct int not null default 0,
  lines_short int not null default 0,
  lines_over int not null default 0,
  lines_rejected int not null default 0,
  lines_substituted int not null default 0,

  -- Dollars
  po_total numeric(12,2),
  received_total numeric(12,2),
  shortage_value numeric(12,2) generated always as (
    coalesce(po_total, 0) - coalesce(received_total, 0)
  ) stored,

  created_at timestamptz not null default now()
);

create index idx_delivery_receipts_venue on delivery_receipts(venue_id, delivery_date desc);
create index idx_delivery_receipts_vendor on delivery_receipts(vendor_id, delivery_date desc);
create index idx_delivery_receipts_po on delivery_receipts(purchase_order_id);

-- RLS
alter table delivery_receipts enable row level security;

create policy "Users can view delivery receipts for their venues"
  on delivery_receipts for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Users can insert delivery receipts"
  on delivery_receipts for insert
  with check (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass delivery_receipts"
  on delivery_receipts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Delivery Receipt Lines (item-level detail)
-- ============================================================================

create table if not exists delivery_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_receipt_id uuid not null references delivery_receipts(id) on delete cascade,
  item_id uuid not null references items(id),
  po_item_id uuid references purchase_order_items(id),

  -- Ordered vs received
  ordered_qty numeric(12,3),
  received_qty numeric(12,3) not null,
  unit_price_expected numeric(12,4),
  unit_price_actual numeric(12,4) not null,

  -- Issue tracking
  line_status text not null default 'correct'
    check (line_status in ('correct', 'short', 'over', 'rejected', 'substituted', 'damaged')),
  issue_reason text,   -- free text: 'bruised produce', 'wrong cut', 'expired on arrival'
  issue_photo_url text, -- evidence

  -- Quality
  quality_rating int check (quality_rating between 1 and 5),
  temperature_ok boolean,

  created_at timestamptz not null default now()
);

create index idx_delivery_receipt_lines_receipt on delivery_receipt_lines(delivery_receipt_id);
create index idx_delivery_receipt_lines_item on delivery_receipt_lines(item_id);
create index idx_delivery_receipt_lines_status on delivery_receipt_lines(line_status) where line_status != 'correct';

-- RLS
alter table delivery_receipt_lines enable row level security;

create policy "Users can view delivery receipt lines for their venues"
  on delivery_receipt_lines for select
  using (
    delivery_receipt_id in (
      select dr.id from delivery_receipts dr
      join venues v on v.id = dr.venue_id
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Users can insert delivery receipt lines"
  on delivery_receipt_lines for insert
  with check (
    delivery_receipt_id in (
      select dr.id from delivery_receipts dr
      join venues v on v.id = dr.venue_id
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass delivery_receipt_lines"
  on delivery_receipt_lines for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. Trigger: Update delivery receipt summary counts
-- ============================================================================

create or replace function update_delivery_receipt_counts()
returns trigger language plpgsql security definer as $$
begin
  update delivery_receipts
  set total_line_items = sub.total,
      lines_correct = sub.correct,
      lines_short = sub.short,
      lines_over = sub.over_qty,
      lines_rejected = sub.rejected,
      lines_substituted = sub.substituted,
      received_total = sub.received_total
  from (
    select
      delivery_receipt_id,
      count(*) as total,
      count(*) filter (where line_status = 'correct') as correct,
      count(*) filter (where line_status = 'short') as short,
      count(*) filter (where line_status = 'over') as over_qty,
      count(*) filter (where line_status = 'rejected') as rejected,
      count(*) filter (where line_status = 'substituted') as substituted,
      sum(received_qty * unit_price_actual) as received_total
    from delivery_receipt_lines
    where delivery_receipt_id = coalesce(new.delivery_receipt_id, old.delivery_receipt_id)
    group by delivery_receipt_id
  ) sub
  where id = sub.delivery_receipt_id;

  return coalesce(new, old);
end;
$$;

create trigger trg_update_delivery_receipt_counts
  after insert or update or delete on delivery_receipt_lines
  for each row execute function update_delivery_receipt_counts();

-- 4. Supplier Scorecard view (rolling 90-day metrics)
-- ============================================================================

create or replace view v_supplier_scorecard as
with delivery_stats as (
  select
    dr.vendor_id,
    dr.venue_id,
    count(*) as total_deliveries,
    -- Timeliness
    count(*) filter (where dr.days_late = 0) as on_time_deliveries,
    avg(dr.days_late) as avg_days_late,
    max(dr.days_late) as max_days_late,
    -- Accuracy
    sum(dr.total_line_items) as total_items_delivered,
    sum(dr.lines_correct) as total_correct,
    sum(dr.lines_short) as total_short,
    sum(dr.lines_rejected) as total_rejected,
    -- Financial
    sum(dr.po_total) as total_ordered_value,
    sum(dr.received_total) as total_received_value,
    sum(dr.shortage_value) as total_shortage_value,
    -- Quality
    avg(dr.overall_rating) as avg_rating
  from delivery_receipts dr
  where dr.delivery_date >= current_date - interval '90 days'
  group by dr.vendor_id, dr.venue_id
)
select
  ds.vendor_id,
  vnd.name as vendor_name,
  ds.venue_id,
  v.name as venue_name,
  ds.total_deliveries,
  -- On-time rate
  case when ds.total_deliveries > 0 then
    round((ds.on_time_deliveries::numeric / ds.total_deliveries * 100)::numeric, 1)
  else null end as on_time_pct,
  ds.avg_days_late,
  -- Accuracy rate
  case when ds.total_items_delivered > 0 then
    round((ds.total_correct::numeric / ds.total_items_delivered * 100)::numeric, 1)
  else null end as accuracy_pct,
  -- Fill rate (received value / ordered value)
  case when ds.total_ordered_value > 0 then
    round((ds.total_received_value / ds.total_ordered_value * 100)::numeric, 1)
  else null end as fill_rate_pct,
  ds.total_short,
  ds.total_rejected,
  ds.total_shortage_value,
  round(ds.avg_rating::numeric, 1) as avg_quality_rating,
  -- Composite score (weighted: 40% accuracy, 30% on-time, 20% fill rate, 10% quality)
  round((
    coalesce(ds.total_correct::numeric / nullif(ds.total_items_delivered, 0), 0) * 40 +
    coalesce(ds.on_time_deliveries::numeric / nullif(ds.total_deliveries, 0), 0) * 30 +
    coalesce(ds.total_received_value / nullif(ds.total_ordered_value, 0), 0) * 20 +
    coalesce(ds.avg_rating / 5.0, 0) * 10
  )::numeric, 1) as composite_score,
  -- Grade
  case
    when (
      coalesce(ds.total_correct::numeric / nullif(ds.total_items_delivered, 0), 0) * 40 +
      coalesce(ds.on_time_deliveries::numeric / nullif(ds.total_deliveries, 0), 0) * 30 +
      coalesce(ds.total_received_value / nullif(ds.total_ordered_value, 0), 0) * 20 +
      coalesce(ds.avg_rating / 5.0, 0) * 10
    ) >= 90 then 'A'
    when (
      coalesce(ds.total_correct::numeric / nullif(ds.total_items_delivered, 0), 0) * 40 +
      coalesce(ds.on_time_deliveries::numeric / nullif(ds.total_deliveries, 0), 0) * 30 +
      coalesce(ds.total_received_value / nullif(ds.total_ordered_value, 0), 0) * 20 +
      coalesce(ds.avg_rating / 5.0, 0) * 10
    ) >= 75 then 'B'
    when (
      coalesce(ds.total_correct::numeric / nullif(ds.total_items_delivered, 0), 0) * 40 +
      coalesce(ds.on_time_deliveries::numeric / nullif(ds.total_deliveries, 0), 0) * 30 +
      coalesce(ds.total_received_value / nullif(ds.total_ordered_value, 0), 0) * 20 +
      coalesce(ds.avg_rating / 5.0, 0) * 10
    ) >= 60 then 'C'
    else 'D'
  end as grade
from delivery_stats ds
join vendors vnd on vnd.id = ds.vendor_id
join venues v on v.id = ds.venue_id;

-- 5. Price stability tracking per vendor per item
-- ============================================================================

create or replace view v_vendor_price_stability as
select
  drl.item_id,
  i.name as item_name,
  dr.vendor_id,
  vnd.name as vendor_name,
  dr.venue_id,
  count(*) as delivery_count,
  avg(drl.unit_price_actual) as avg_price,
  min(drl.unit_price_actual) as min_price,
  max(drl.unit_price_actual) as max_price,
  max(drl.unit_price_actual) - min(drl.unit_price_actual) as price_range,
  case when avg(drl.unit_price_actual) > 0 then
    round((stddev(drl.unit_price_actual) / avg(drl.unit_price_actual) * 100)::numeric, 2)
  else 0 end as price_volatility_pct -- coefficient of variation
from delivery_receipt_lines drl
join delivery_receipts dr on dr.id = drl.delivery_receipt_id
join items i on i.id = drl.item_id
join vendors vnd on vnd.id = dr.vendor_id
where dr.delivery_date >= current_date - interval '90 days'
group by drl.item_id, i.name, dr.vendor_id, vnd.name, dr.venue_id
having count(*) >= 3; -- need enough data points

-- 6. Supplier alert thresholds in procurement_settings
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'procurement_settings'
    and column_name = 'supplier_accuracy_warning_pct'
  ) then
    alter table procurement_settings
      add column supplier_accuracy_warning_pct numeric(5,2) not null default 90.00,
      add column supplier_accuracy_critical_pct numeric(5,2) not null default 80.00,
      add column supplier_ontime_warning_pct numeric(5,2) not null default 85.00,
      add column supplier_ontime_critical_pct numeric(5,2) not null default 70.00,
      add column supplier_price_volatility_warning_pct numeric(5,2) not null default 10.00,
      add column supplier_scorecard_enabled boolean not null default true;
  end if;
end $$;
