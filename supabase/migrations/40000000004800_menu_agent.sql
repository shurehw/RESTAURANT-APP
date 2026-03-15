-- ============================================================================
-- Menu Agent: Autonomous Menu Intelligence
-- ============================================================================
-- The menu agent detects margin breaches, underperformers, cannibalization,
-- and comp-set pricing gaps — then creates the fix, not just the alert.
-- Respects physical constraints: printed menus batch to reprint windows,
-- MP/digital items adjust in real-time.
--
-- Pattern: follows procurement agent (policy -> classify -> detect -> act).
-- Philosophy: the rules are always on. Calibration is allowed. Escape is not.
-- ============================================================================

-- ============================================================================
-- 1. Menu Agent Settings (P0 version-controlled, per org)
-- ============================================================================

create table if not exists menu_agent_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  version int not null default 1,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,

  -- Agent behavior
  mode text not null default 'advise' check (mode in ('advise', 'auto_low', 'full_auto')),
  enabled_signals text[] not null default '{margin_breach,underperformer,menu_bloat,comp_set_gap}',

  -- Price adjustment guardrails
  auto_price_band_pct numeric(5,2) not null default 5.00,
  auto_price_band_dollars numeric(10,2) not null default 2.00,

  -- Menu composition thresholds
  max_menu_size int,  -- null = no cap
  min_contribution_margin_dollars numeric(10,2) not null default 8.00,
  min_item_velocity_per_week numeric(10,2) not null default 5.0,
  underperformer_observation_days int not null default 21,

  -- Cannibalization
  cannibalization_correlation_threshold numeric(3,2) not null default 0.70,

  -- Sacred items (never auto-remove)
  sacred_recipe_ids uuid[] not null default '{}',

  -- Comp set
  comp_set_scan_enabled boolean not null default false,
  comp_set_scan_frequency_days int not null default 14,

  -- Learning
  seasonality_window_days int not null default 90,
  elasticity_observation_days int not null default 14,
  min_price_changes_for_elasticity int not null default 3,

  -- Hard constraints (enforcement rails)
  max_single_price_increase_pct numeric(5,2) not null default 15.00,
  require_comp_set_validation boolean not null default true,

  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  unique (org_id, version)
);

create index idx_menu_agent_settings_active on menu_agent_settings(org_id)
  where is_active = true and effective_to is null;

alter table menu_agent_settings enable row level security;

create policy "Users can view menu agent settings for their org"
  on menu_agent_settings for select
  using (
    org_id in (
      select ou.organization_id from organization_users ou
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass menu_agent_settings"
  on menu_agent_settings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 2. Menu Item Surfaces (where each item physically appears)
-- ============================================================================

create table if not exists menu_item_surfaces (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,

  surface text not null check (surface in (
    'printed_fixed', 'printed_rotating', 'insert', 'digital', 'verbal_only'
  )),
  reprint_cycle_days int,          -- null for digital/verbal
  next_reprint_date date,          -- null for digital/verbal
  is_market_price boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (venue_id, recipe_id)
);

create index idx_menu_item_surfaces_venue on menu_item_surfaces(venue_id);
create index idx_menu_item_surfaces_surface on menu_item_surfaces(venue_id, surface);
create index idx_menu_item_surfaces_reprint on menu_item_surfaces(venue_id, next_reprint_date)
  where next_reprint_date is not null;

alter table menu_item_surfaces enable row level security;

create policy "Users can view menu item surfaces for their venues"
  on menu_item_surfaces for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Users can manage menu item surfaces"
  on menu_item_surfaces for all
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass menu_item_surfaces"
  on menu_item_surfaces for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 3. Menu Agent Price Queue (batched for reprint windows)
-- ============================================================================

create table if not exists menu_agent_price_queue (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  recipe_id uuid not null references recipes(id),
  menu_item_name text not null,

  current_price numeric(10,2) not null,
  recommended_price numeric(10,2) not null,
  price_delta numeric(10,2) generated always as (recommended_price - current_price) stored,
  price_change_pct numeric(5,2),

  reason text not null,
  action_type text not null check (action_type in (
    'price_increase', 'price_decrease', 'market_price_update'
  )),

  -- Impact tracking
  margin_bleed_per_week numeric(10,2),   -- estimated GP loss while waiting
  comp_set_context jsonb default '{}'::jsonb,  -- competitor prices at time of rec

  -- Reprint scheduling
  surface text,
  target_reprint_date date,

  -- Lifecycle
  status text not null default 'queued' check (status in (
    'queued', 'approved', 'applied', 'rejected', 'expired'
  )),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  applied_at timestamptz,
  rejected_reason text,

  -- Agent linkage
  run_id uuid,
  recommendation_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_price_queue_venue_status on menu_agent_price_queue(venue_id, status);
create index idx_price_queue_reprint on menu_agent_price_queue(target_reprint_date)
  where status = 'queued';
create index idx_price_queue_recipe on menu_agent_price_queue(recipe_id);

alter table menu_agent_price_queue enable row level security;

create policy "Users can view price queue for their venues"
  on menu_agent_price_queue for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Users can manage price queue"
  on menu_agent_price_queue for all
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass menu_agent_price_queue"
  on menu_agent_price_queue for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 4. Comp Set Venues (competitors to track per location)
-- ============================================================================

create table if not exists comp_set_venues (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,

  comp_venue_name text not null,
  comp_venue_address text,
  source_url text,
  platform text check (platform in (
    'doordash', 'ubereats', 'grubhub', 'google', 'yelp', 'manual', 'website'
  )),

  last_scraped_at timestamptz,
  scrape_status text not null default 'pending' check (scrape_status in (
    'pending', 'success', 'failed', 'no_menu_found'
  )),

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (venue_id, comp_venue_name)
);

create index idx_comp_set_venues_venue on comp_set_venues(venue_id) where is_active = true;

alter table comp_set_venues enable row level security;

create policy "Users can view comp set venues"
  on comp_set_venues for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Users can manage comp set venues"
  on comp_set_venues for all
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass comp_set_venues"
  on comp_set_venues for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 5. Comp Set Items (competitor menu items with fuzzy match)
-- ============================================================================

create table if not exists comp_set_items (
  id uuid primary key default gen_random_uuid(),
  comp_set_venue_id uuid not null references comp_set_venues(id) on delete cascade,

  item_name text not null,
  item_category text,
  item_description text,

  price numeric(10,2),
  previous_price numeric(10,2),
  price_changed_at timestamptz,

  -- AI fuzzy match to internal recipe
  matched_recipe_id uuid references recipes(id),
  match_confidence numeric(3,2),  -- 0.00-1.00

  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (comp_set_venue_id, item_name)
);

create index idx_comp_set_items_matched on comp_set_items(matched_recipe_id)
  where matched_recipe_id is not null;
create index idx_comp_set_items_venue on comp_set_items(comp_set_venue_id);

alter table comp_set_items enable row level security;

create policy "Users can view comp set items via venue"
  on comp_set_items for select
  using (
    comp_set_venue_id in (
      select csv.id from comp_set_venues csv
      join venues v on v.id = csv.venue_id
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass comp_set_items"
  on comp_set_items for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 6. Menu Agent Runs (audit trail)
-- ============================================================================

create table if not exists menu_agent_runs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,

  triggered_by text not null check (triggered_by in ('cron', 'manual', 'signal')),
  signal_type text,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),

  -- Results
  items_evaluated int not null default 0,
  signals_detected int not null default 0,
  recommendations_generated int not null default 0,
  auto_executed int not null default 0,
  pending_approval int not null default 0,
  prices_queued int not null default 0,

  agent_reasoning jsonb not null default '{}'::jsonb,
  error_message text,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_menu_agent_runs_venue on menu_agent_runs(venue_id, created_at desc);

alter table menu_agent_runs enable row level security;

create policy "Users can view menu agent runs for their venues"
  on menu_agent_runs for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass menu_agent_runs"
  on menu_agent_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 7. Menu Agent Recommendations (individual actions from a run)
-- ============================================================================

create table if not exists menu_agent_recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references menu_agent_runs(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,

  recipe_id uuid references recipes(id),
  menu_item_name text,

  action_type text not null check (action_type in (
    'price_increase', 'price_decrease', 'remove_item', 'add_item',
    'substitute_ingredient', 'reduce_prep', 'reposition',
    'flag_cannibalization', 'flag_sacred_cow'
  )),

  reasoning text not null,
  expected_impact jsonb not null default '{}'::jsonb,
  -- { margin_delta_pct, revenue_delta_weekly, gp_delta_weekly, comp_set_position }

  -- Lifecycle
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected', 'auto_executed', 'expired'
  )),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  rejected_reason text,

  -- Outcome tracking (feedback loop)
  outcome_tracked boolean not null default false,
  outcome_data jsonb,
  -- { actual_margin_delta, actual_volume_change, measured_at, observation_days }

  -- Linkage
  price_queue_id uuid references menu_agent_price_queue(id),
  violation_id uuid references control_plane_violations(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_menu_recs_run on menu_agent_recommendations(run_id);
create index idx_menu_recs_venue_status on menu_agent_recommendations(venue_id, status);
create index idx_menu_recs_recipe on menu_agent_recommendations(recipe_id);
create index idx_menu_recs_pending on menu_agent_recommendations(venue_id)
  where status = 'pending';

alter table menu_agent_recommendations enable row level security;

create policy "Users can view menu agent recommendations"
  on menu_agent_recommendations for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Users can manage menu agent recommendations"
  on menu_agent_recommendations for update
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass menu_agent_recommendations"
  on menu_agent_recommendations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 8. Menu Price History (tracks all price changes for elasticity learning)
-- ============================================================================

create table if not exists menu_price_history (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  recipe_id uuid not null references recipes(id),

  old_price numeric(10,2) not null,
  new_price numeric(10,2) not null,
  price_change_pct numeric(5,2) generated always as (
    case when old_price > 0 then round(((new_price - old_price) / old_price * 100)::numeric, 2)
    else null end
  ) stored,

  changed_at timestamptz not null default now(),
  source text not null check (source in (
    'menu_agent', 'manual', 'pos_sync', 'recipe_version', 'seasonal_update'
  )),
  recommendation_id uuid references menu_agent_recommendations(id),
  notes text,

  created_at timestamptz not null default now()
);

create index idx_price_history_recipe on menu_price_history(recipe_id, changed_at desc);
create index idx_price_history_venue on menu_price_history(venue_id, changed_at desc);

alter table menu_price_history enable row level security;

create policy "Users can view price history"
  on menu_price_history for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass menu_price_history"
  on menu_price_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 9. Views: Contribution Margin & Item Performance
-- ============================================================================

-- Contribution margin: GP per unit x units sold, weekly
create or replace view v_contribution_margin as
with item_sales as (
  select
    idf.venue_id,
    mirm.recipe_id,
    r.name as recipe_name,
    r.item_category,
    r.menu_price,
    r.cost_per_unit,
    r.menu_price - r.cost_per_unit as gp_per_unit,
    sum(idf.quantity_sold) as total_qty,
    sum(idf.net_sales) as total_revenue,
    count(distinct idf.business_date) as days_observed,
    min(idf.business_date) as first_sale,
    max(idf.business_date) as last_sale
  from item_day_facts idf
  join menu_item_recipe_map mirm on mirm.pos_item_name = idf.item_name
    and mirm.venue_id = idf.venue_id
  join recipes r on r.id = mirm.recipe_id
    and r.effective_to is null
  where idf.business_date >= current_date - interval '90 days'
    and idf.quantity_sold > 0
  group by idf.venue_id, mirm.recipe_id, r.name, r.item_category,
           r.menu_price, r.cost_per_unit
)
select
  venue_id,
  recipe_id,
  recipe_name,
  item_category,
  menu_price,
  cost_per_unit,
  gp_per_unit,
  total_qty,
  total_revenue,
  days_observed,
  -- Weekly velocity
  round((total_qty::numeric / greatest(days_observed, 1) * 7), 1) as velocity_per_week,
  -- Weekly contribution margin (GP x volume)
  round((gp_per_unit * total_qty / greatest(days_observed, 1) * 7)::numeric, 2) as contribution_margin_per_week,
  -- Revenue contribution
  round((total_revenue / nullif(sum(total_revenue) over (partition by venue_id), 0) * 100)::numeric, 2) as revenue_pct,
  -- Food cost %
  case when menu_price > 0 then
    round((cost_per_unit / menu_price * 100)::numeric, 2)
  else null end as food_cost_pct,
  first_sale,
  last_sale
from item_sales;

-- Comprehensive item performance (used by the menu agent)
create or replace view v_menu_item_performance as
with recent as (
  select
    cm.*,
    -- Trend: compare last 30d vs prior 30d
    (select coalesce(sum(idf2.quantity_sold), 0)
     from item_day_facts idf2
     join menu_item_recipe_map m2 on m2.pos_item_name = idf2.item_name
       and m2.venue_id = idf2.venue_id
     where m2.recipe_id = cm.recipe_id
       and idf2.venue_id = cm.venue_id
       and idf2.business_date >= current_date - interval '30 days'
    ) as qty_last_30d,
    (select coalesce(sum(idf3.quantity_sold), 0)
     from item_day_facts idf3
     join menu_item_recipe_map m3 on m3.pos_item_name = idf3.item_name
       and m3.venue_id = idf3.venue_id
     where m3.recipe_id = cm.recipe_id
       and idf3.venue_id = cm.venue_id
       and idf3.business_date >= current_date - interval '60 days'
       and idf3.business_date < current_date - interval '30 days'
    ) as qty_prior_30d
  from v_contribution_margin cm
)
select
  venue_id,
  recipe_id,
  recipe_name,
  item_category,
  menu_price,
  cost_per_unit,
  gp_per_unit,
  total_qty,
  total_revenue,
  days_observed,
  velocity_per_week,
  contribution_margin_per_week,
  revenue_pct,
  food_cost_pct,
  first_sale,
  last_sale,
  qty_last_30d,
  qty_prior_30d,
  -- Trend direction
  case
    when qty_prior_30d = 0 then 'new'
    when qty_last_30d > qty_prior_30d * 1.10 then 'rising'
    when qty_last_30d < qty_prior_30d * 0.90 then 'declining'
    else 'stable'
  end as trend,
  -- Trend magnitude
  case when qty_prior_30d > 0 then
    round(((qty_last_30d - qty_prior_30d)::numeric / qty_prior_30d * 100), 1)
  else null end as trend_pct,
  -- Underperformer flag (low velocity AND low margin)
  case when velocity_per_week < 5 and gp_per_unit < 8 then true else false end as is_underperformer
from recent;

-- Demand elasticity: learned from historical price changes
create or replace view v_demand_elasticity as
with price_events as (
  select
    mph.recipe_id,
    mph.venue_id,
    mph.old_price,
    mph.new_price,
    mph.price_change_pct,
    mph.changed_at::date as change_date,
    -- 14-day avg daily qty BEFORE price change
    (select round(avg(idf.quantity_sold)::numeric, 2)
     from item_day_facts idf
     join menu_item_recipe_map m on m.pos_item_name = idf.item_name
       and m.venue_id = idf.venue_id
     where m.recipe_id = mph.recipe_id
       and idf.venue_id = mph.venue_id
       and idf.business_date >= mph.changed_at::date - 14
       and idf.business_date < mph.changed_at::date
    ) as avg_qty_before,
    -- 14-day avg daily qty AFTER price change
    (select round(avg(idf.quantity_sold)::numeric, 2)
     from item_day_facts idf
     join menu_item_recipe_map m on m.pos_item_name = idf.item_name
       and m.venue_id = idf.venue_id
     where m.recipe_id = mph.recipe_id
       and idf.venue_id = mph.venue_id
       and idf.business_date > mph.changed_at::date
       and idf.business_date <= mph.changed_at::date + 14
    ) as avg_qty_after
  from menu_price_history mph
  where mph.price_change_pct is not null
    and abs(mph.price_change_pct) >= 1.0  -- ignore sub-1% noise
)
select
  recipe_id,
  venue_id,
  old_price,
  new_price,
  price_change_pct,
  change_date,
  avg_qty_before,
  avg_qty_after,
  case when avg_qty_before > 0 then
    round(((avg_qty_after - avg_qty_before) / avg_qty_before * 100)::numeric, 2)
  else null end as volume_change_pct,
  -- Elasticity coefficient: % volume change / % price change
  case when price_change_pct != 0 and avg_qty_before > 0 then
    round((((avg_qty_after - avg_qty_before) / avg_qty_before * 100) / price_change_pct)::numeric, 3)
  else null end as elasticity_coefficient
from price_events
where avg_qty_before is not null and avg_qty_after is not null;

-- ============================================================================
-- 10. Updated_at triggers
-- ============================================================================

create or replace function update_menu_agent_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_menu_item_surfaces_updated
  before update on menu_item_surfaces
  for each row execute function update_menu_agent_updated_at();

create trigger trg_menu_agent_price_queue_updated
  before update on menu_agent_price_queue
  for each row execute function update_menu_agent_updated_at();

create trigger trg_comp_set_venues_updated
  before update on comp_set_venues
  for each row execute function update_menu_agent_updated_at();

create trigger trg_comp_set_items_updated
  before update on comp_set_items
  for each row execute function update_menu_agent_updated_at();

create trigger trg_menu_agent_recommendations_updated
  before update on menu_agent_recommendations
  for each row execute function update_menu_agent_updated_at();
