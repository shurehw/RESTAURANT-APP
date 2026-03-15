-- ============================================================================
-- Procurement Agent Phase 2: Bundling, Follow-ups, PO Matching, Rebalancing
-- ============================================================================
-- Adds:
--   1. Cross-venue PO bundling for volume discounts
--   2. Automated follow-up cadence (T-48h → T-24h → T-4h → T+4h)
--   3. Vendor confirmation tracking
--   4. PO-to-receipt matching (auto-match delivery receipts to PO lines)
--   5. 3-way match (PO → receipt → invoice) for AP reconciliation
--   6. Inter-venue inventory transfers
--
-- Depends on:
--   40000000004300_procurement_agent.sql
--   40000000004100_supplier_scorecards.sql (delivery_receipts)
-- ============================================================================

-- 1. PO Bundle Groups — Cross-venue consolidated orders
-- ============================================================================

create table if not exists po_bundle_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity_code text,
  vendor_id uuid references vendors(id),
  venue_ids uuid[] not null default '{}',
  total_amount numeric(12,2) not null default 0,
  volume_discount_pct numeric(5,2) not null default 0,
  estimated_savings numeric(12,2) not null default 0,
  delivery_addresses jsonb not null default '[]'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'ordered', 'delivered', 'cancelled')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_po_bundle_groups_org on po_bundle_groups(org_id, status);
create index idx_po_bundle_groups_vendor on po_bundle_groups(vendor_id);

alter table po_bundle_groups enable row level security;

create policy "Users can view bundles for their org"
  on po_bundle_groups for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Managers can manage bundles"
  on po_bundle_groups for all
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

create policy "Service role bypass po_bundle_groups"
  on po_bundle_groups for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. PO Follow-ups — Scheduled vendor follow-up actions
-- ============================================================================

create table if not exists po_followups (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  followup_type text not null check (followup_type in (
    'confirmation_request',
    'confirmation_escalation',
    'at_risk_alert',
    'missed_delivery',
    'debit_memo_draft'
  )),
  scheduled_at timestamptz not null,
  executed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'skipped', 'cancelled')),
  result jsonb,
  created_at timestamptz not null default now()
);

create index idx_po_followups_pending on po_followups(status, scheduled_at)
  where status = 'pending';
create index idx_po_followups_po on po_followups(purchase_order_id);

alter table po_followups enable row level security;

create policy "Users can view followups for their org"
  on po_followups for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Service role bypass po_followups"
  on po_followups for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. Vendor Confirmations — Track vendor PO acknowledgments
-- ============================================================================

create table if not exists vendor_confirmations (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  confirmed_at timestamptz,
  confirmed_by text, -- vendor contact name/email
  confirmation_method text check (confirmation_method in ('email', 'phone', 'portal', 'auto')),
  estimated_delivery_date date,
  notes text,
  created_at timestamptz not null default now()
);

create unique index idx_vendor_confirmations_po on vendor_confirmations(purchase_order_id);

alter table vendor_confirmations enable row level security;

create policy "Users can view confirmations for their venues"
  on vendor_confirmations for select
  using (
    purchase_order_id in (
      select po.id from purchase_orders po
      join venues v on v.id = po.venue_id
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass vendor_confirmations"
  on vendor_confirmations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 4. PO-Receipt Matches — Auto-match delivery receipts to PO lines
-- ============================================================================

create table if not exists po_receipt_matches (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  delivery_receipt_id uuid not null references delivery_receipts(id) on delete cascade,
  match_status text not null default 'unmatched'
    check (match_status in ('full', 'partial', 'unmatched')),
  line_matches jsonb not null default '[]'::jsonb,
  -- Array of { po_item_id, receipt_line_id, item_id, ordered_qty, received_qty, variance }
  variance_amount numeric(12,2) not null default 0,
  matched_at timestamptz not null default now(),
  matched_by text not null default 'system'
    check (matched_by in ('system', 'manual')),
  created_at timestamptz not null default now()
);

create index idx_po_receipt_matches_po on po_receipt_matches(purchase_order_id);
create index idx_po_receipt_matches_receipt on po_receipt_matches(delivery_receipt_id);
create index idx_po_receipt_matches_status on po_receipt_matches(match_status)
  where match_status != 'full';

alter table po_receipt_matches enable row level security;

create policy "Users can view PO receipt matches for their venues"
  on po_receipt_matches for select
  using (
    purchase_order_id in (
      select po.id from purchase_orders po
      join venues v on v.id = po.venue_id
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass po_receipt_matches"
  on po_receipt_matches for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 5. Invoice Matches — 3-way match (PO → receipt → invoice)
-- ============================================================================

create table if not exists invoice_matches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  delivery_receipt_id uuid references delivery_receipts(id),
  invoice_number text not null,
  invoice_date date not null,
  invoice_amount numeric(12,2) not null,
  po_amount numeric(12,2) not null,
  receipt_amount numeric(12,2),
  variance_amount numeric(12,2) generated always as (
    invoice_amount - po_amount
  ) stored,
  variance_pct numeric(5,2) generated always as (
    case when po_amount > 0 then
      round(((invoice_amount - po_amount) / po_amount * 100)::numeric, 2)
    else 0 end
  ) stored,
  match_status text not null default 'pending'
    check (match_status in ('clean', 'variance', 'dispute', 'pending', 'resolved')),
  resolution_notes text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  r365_sync_status text default 'pending'
    check (r365_sync_status in ('pending', 'synced', 'held', 'failed')),
  r365_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_invoice_matches_po on invoice_matches(purchase_order_id);
create index idx_invoice_matches_org on invoice_matches(org_id, match_status);
create index idx_invoice_matches_r365 on invoice_matches(r365_sync_status)
  where r365_sync_status = 'pending';

alter table invoice_matches enable row level security;

create policy "Users can view invoice matches for their org"
  on invoice_matches for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Admins can manage invoice matches"
  on invoice_matches for all
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

create policy "Service role bypass invoice_matches"
  on invoice_matches for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 6. Inventory Transfers — Inter-venue rebalancing
-- ============================================================================

create table if not exists inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  from_venue_id uuid not null references venues(id),
  to_venue_id uuid not null references venues(id),
  item_id uuid not null references items(id),
  quantity numeric(12,3) not null,
  unit_cost numeric(12,4),
  total_cost numeric(12,2) generated always as (
    round((quantity * coalesce(unit_cost, 0))::numeric, 2)
  ) stored,
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'in_transit', 'received', 'cancelled')),
  proposed_by text not null default 'manual'
    check (proposed_by in ('agent', 'manual')),
  proposed_reason text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  received_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_different_venues check (from_venue_id != to_venue_id)
);

create index idx_inventory_transfers_org on inventory_transfers(org_id, status);
create index idx_inventory_transfers_from on inventory_transfers(from_venue_id, status);
create index idx_inventory_transfers_to on inventory_transfers(to_venue_id, status);
create index idx_inventory_transfers_item on inventory_transfers(item_id);

alter table inventory_transfers enable row level security;

create policy "Users can view transfers for their org"
  on inventory_transfers for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Managers can manage transfers"
  on inventory_transfers for all
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

create policy "Service role bypass inventory_transfers"
  on inventory_transfers for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 7. View: Unmatched receipts needing manual PO match
-- ============================================================================

create or replace view v_unmatched_receipts as
select
  dr.id as receipt_id,
  dr.venue_id,
  v.name as venue_name,
  dr.vendor_id,
  vnd.name as vendor_name,
  dr.delivery_date,
  dr.total_line_items,
  dr.received_total,
  dr.purchase_order_id as linked_po_id,
  case
    when dr.purchase_order_id is null then 'no_po_linked'
    when prm.id is null then 'not_matched'
    when prm.match_status = 'partial' then 'partial_match'
    else 'matched'
  end as match_state
from delivery_receipts dr
join venues v on v.id = dr.venue_id
left join vendors vnd on vnd.id = dr.vendor_id
left join po_receipt_matches prm on prm.delivery_receipt_id = dr.id
where dr.delivery_date >= current_date - interval '30 days'
  and (prm.id is null or prm.match_status != 'full')
order by dr.delivery_date desc;

-- 8. View: 3-way match summary for AP
-- ============================================================================

create or replace view v_three_way_match_summary as
select
  im.id as match_id,
  im.org_id,
  po.order_number,
  po.venue_id,
  v.name as venue_name,
  vnd.name as vendor_name,
  im.invoice_number,
  im.invoice_date,
  im.po_amount,
  im.receipt_amount,
  im.invoice_amount,
  im.variance_amount,
  im.variance_pct,
  im.match_status,
  im.r365_sync_status,
  im.created_at
from invoice_matches im
join purchase_orders po on po.id = im.purchase_order_id
join venues v on v.id = po.venue_id
left join vendors vnd on vnd.id = po.vendor_id
order by im.created_at desc;

-- 9. View: Pending inventory transfer proposals
-- ============================================================================

create or replace view v_pending_transfers as
select
  it.id as transfer_id,
  it.org_id,
  fv.name as from_venue,
  tv.name as to_venue,
  i.name as item_name,
  it.quantity,
  it.unit_cost,
  it.total_cost,
  it.proposed_by,
  it.proposed_reason,
  it.status,
  it.created_at
from inventory_transfers it
join venues fv on fv.id = it.from_venue_id
join venues tv on tv.id = it.to_venue_id
join items i on i.id = it.item_id
where it.status in ('proposed', 'approved')
order by it.created_at desc;

-- 10. Comments
-- ============================================================================

comment on table po_bundle_groups is 'Cross-venue consolidated purchase orders for volume discount optimization.';
comment on table po_followups is 'Scheduled follow-up actions for PO lifecycle management (T-48h confirmation, T-24h escalation, T-4h at-risk, T+4h missed).';
comment on table vendor_confirmations is 'Vendor acknowledgment and delivery date confirmation for purchase orders.';
comment on table po_receipt_matches is 'Auto-matched delivery receipt lines to PO lines. Foundation for receiving accuracy tracking.';
comment on table invoice_matches is '3-way match: PO amount vs receipt amount vs invoice amount. Clean matches auto-sync to R365 AP.';
comment on table inventory_transfers is 'Inter-venue inventory rebalancing. Agent proposes transfers when one venue has surplus and another has deficit.';
