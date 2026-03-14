-- ============================================================================
-- COGS Module: GL-based Actual COGS
-- ============================================================================
-- Replaces invoice-total proxy with real GL data from R365.
-- Maps GL accounts to COGS categories (food, beverage, liquor, etc.)
-- and stores actual GL period data for true variance calculation.
-- Better than Nory: real accounting integration, not just operational.
-- ============================================================================

-- 1. GL Actuals (stores GL data pulled from R365)
-- ============================================================================

create table if not exists gl_actuals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  gl_account_id uuid not null references gl_accounts(id),

  -- Period
  period_start date not null,
  period_end date not null,
  amount numeric(14,2) not null,

  -- Source tracking
  source text not null default 'r365' check (source in ('r365', 'manual', 'import')),
  source_ref text, -- R365 batch/journal ID
  synced_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  -- Prevent duplicate imports
  constraint uq_gl_actuals_period unique (venue_id, gl_account_id, period_start, period_end, source_ref)
);

create index idx_gl_actuals_venue_period on gl_actuals(venue_id, period_start desc);
create index idx_gl_actuals_account on gl_actuals(gl_account_id);
create index idx_gl_actuals_org on gl_actuals(org_id, period_start desc);

-- RLS
alter table gl_actuals enable row level security;

create policy "Users can view GL actuals for their org"
  on gl_actuals for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Admins can manage GL actuals"
  on gl_actuals for all
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
      and role in ('admin', 'owner')
    )
  );

create policy "Service role bypass gl_actuals"
  on gl_actuals for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. GL COGS Mapping (which GL accounts = COGS by category)
-- ============================================================================

create table if not exists gl_cogs_mapping (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  gl_account_id uuid not null references gl_accounts(id) on delete cascade,
  cogs_category text not null check (cogs_category in (
    'food', 'beverage', 'liquor', 'beer', 'wine', 'other'
  )),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_gl_cogs_mapping unique (org_id, gl_account_id)
);

create index idx_gl_cogs_mapping_org on gl_cogs_mapping(org_id, is_active);
create index idx_gl_cogs_mapping_account on gl_cogs_mapping(gl_account_id);

-- RLS
alter table gl_cogs_mapping enable row level security;

create policy "Users can view GL COGS mapping for their org"
  on gl_cogs_mapping for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Admins can manage GL COGS mapping"
  on gl_cogs_mapping for all
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
      and role in ('admin', 'owner')
    )
  );

create policy "Service role bypass gl_cogs_mapping"
  on gl_cogs_mapping for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. Auto-map existing COGS GL accounts
-- ============================================================================

insert into gl_cogs_mapping (org_id, gl_account_id, cogs_category)
select
  ga.org_id,
  ga.id,
  case
    when lower(ga.name) like '%liquor%' or lower(ga.name) like '%spirit%' then 'liquor'
    when lower(ga.name) like '%wine%' then 'wine'
    when lower(ga.name) like '%beer%' then 'beer'
    when lower(ga.name) like '%bev%' or lower(ga.name) like '%drink%' then 'beverage'
    when lower(ga.name) like '%food%' then 'food'
    else 'other'
  end
from gl_accounts ga
where ga.section = 'COGS'
  and ga.is_active = true
  and ga.is_summary = false
on conflict (org_id, gl_account_id) do nothing;

-- 4. GL-based Food Cost Variance view
-- ============================================================================

create or replace view v_food_cost_variance_gl as
with theoretical as (
  select
    idf.venue_id,
    idf.business_date as sale_date,
    coalesce(r.item_category, 'other') as cogs_category,
    sum(idf.quantity_sold * r.cost_per_unit) as theoretical_cost,
    sum(idf.net_sales) as net_sales
  from item_day_facts idf
  join menu_item_recipe_map m
    on m.venue_id = idf.venue_id
    and normalize_menu_item_name(m.menu_item_name) = normalize_menu_item_name(idf.menu_item_name)
    and m.is_active = true
  join recipes r on r.id = m.recipe_id and r.effective_to is null
  group by idf.venue_id, idf.business_date, r.item_category
),
actual_gl as (
  select
    ga.venue_id,
    ga.period_start as sale_date,
    gcm.cogs_category,
    sum(ga.amount) as actual_cost
  from gl_actuals ga
  join gl_cogs_mapping gcm on gcm.gl_account_id = ga.gl_account_id and gcm.is_active = true
  where ga.period_start = ga.period_end -- daily granularity
  group by ga.venue_id, ga.period_start, gcm.cogs_category
)
select
  t.venue_id,
  t.sale_date,
  t.cogs_category,
  t.net_sales,
  t.theoretical_cost,
  a.actual_cost,
  coalesce(a.actual_cost, 0) - t.theoretical_cost as variance_dollars,
  case when t.theoretical_cost > 0 then
    round(((coalesce(a.actual_cost, 0) - t.theoretical_cost) / t.theoretical_cost * 100)::numeric, 2)
  else null end as variance_pct,
  case when t.net_sales > 0 then
    round((t.theoretical_cost / t.net_sales * 100)::numeric, 2)
  else null end as theoretical_food_cost_pct,
  case when t.net_sales > 0 and a.actual_cost is not null then
    round((a.actual_cost / t.net_sales * 100)::numeric, 2)
  else null end as actual_food_cost_pct
from theoretical t
left join actual_gl a
  on a.venue_id = t.venue_id
  and a.sale_date = t.sale_date
  and a.cogs_category = t.cogs_category;

-- 5. GL COGS Summary (period-level, for monthly P&L)
-- ============================================================================

create or replace view v_gl_cogs_summary as
select
  ga.org_id,
  ga.venue_id,
  v.name as venue_name,
  gcm.cogs_category,
  gla.name as gl_account_name,
  gla.external_code,
  ga.period_start,
  ga.period_end,
  ga.amount,
  ga.source
from gl_actuals ga
join gl_cogs_mapping gcm on gcm.gl_account_id = ga.gl_account_id and gcm.is_active = true
join gl_accounts gla on gla.id = ga.gl_account_id
join venues v on v.id = ga.venue_id;

-- 6. Add cogs_source to procurement_settings
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'procurement_settings'
    and column_name = 'cogs_source'
  ) then
    alter table procurement_settings
      add column cogs_source text not null default 'invoice'
        check (cogs_source in ('invoice', 'gl', 'both'));
  end if;
end $$;
