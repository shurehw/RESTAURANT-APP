-- ============================================================================
-- COGS Module: Menu Price Alerts (GP% Target Breach)
-- ============================================================================
-- Recipes already have food_cost_target (GP% goal).
-- This migration adds continuous monitoring: when ingredient costs
-- push a recipe's actual food cost above target, fire an alert.
-- Suggests new menu price to restore target margin.
-- Better than Nory: auto-calculates suggested price, tracks history,
-- and routes through Action Center enforcement.
-- ============================================================================

-- 1. Menu Price Alert History
-- ============================================================================

create table if not exists menu_price_alerts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  recipe_id uuid not null references recipes(id),

  -- What triggered the alert
  recipe_name text not null,
  current_menu_price numeric(10,2) not null,
  current_cost_per_unit numeric(10,4) not null,
  current_food_cost_pct numeric(5,2) not null,  -- actual food cost %
  target_food_cost_pct numeric(5,2) not null,   -- from recipe.food_cost_target
  breach_pct numeric(5,2) not null,             -- how far over target

  -- Suggested action
  suggested_price numeric(10,2),                -- price to restore target GP%
  price_increase_needed numeric(10,2),          -- delta from current

  -- What changed (which ingredients drove the cost up)
  cost_drivers jsonb not null default '[]'::jsonb,
  -- Array of { item_name, old_cost, new_cost, pct_change, contribution_to_breach }

  -- Lifecycle
  severity text not null check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'price_updated', 'dismissed')),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  resolution_notes text,

  -- Action Center link
  violation_id uuid references control_plane_violations(id),

  business_date date not null,
  created_at timestamptz not null default now()
);

create index idx_menu_price_alerts_venue on menu_price_alerts(venue_id, business_date desc);
create index idx_menu_price_alerts_recipe on menu_price_alerts(recipe_id);
create index idx_menu_price_alerts_open on menu_price_alerts(status) where status = 'open';
create index idx_menu_price_alerts_severity on menu_price_alerts(severity, status);

-- RLS
alter table menu_price_alerts enable row level security;

create policy "Users can view menu price alerts for their venues"
  on menu_price_alerts for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Users can update menu price alerts"
  on menu_price_alerts for update
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass menu_price_alerts"
  on menu_price_alerts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Menu price alert thresholds in procurement_settings
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'procurement_settings'
    and column_name = 'menu_price_alert_enabled'
  ) then
    alter table procurement_settings
      add column menu_price_alert_enabled boolean not null default true,
      -- Alert when food cost % exceeds target by this many points
      add column menu_price_warning_threshold_pct numeric(5,2) not null default 2.00,
      add column menu_price_critical_threshold_pct numeric(5,2) not null default 5.00,
      -- Minimum menu price to bother alerting (skip $2 sodas)
      add column menu_price_alert_min_price numeric(10,2) not null default 10.00;
  end if;
end $$;

-- 3. Current Menu Margin Health view
-- ============================================================================
-- Shows every active recipe with menu_price and food_cost_target,
-- its current cost, and whether it's breaching target.

create or replace view v_menu_margin_health as
select
  r.venue_id,
  r.id as recipe_id,
  r.name as recipe_name,
  r.item_category,
  r.menu_price,
  r.cost_per_unit,
  r.food_cost_target,
  -- Actual food cost %
  case when r.menu_price > 0 then
    round((r.cost_per_unit / r.menu_price * 100)::numeric, 2)
  else null end as actual_food_cost_pct,
  -- Breach amount (positive = over target)
  case when r.menu_price > 0 and r.food_cost_target > 0 then
    round(((r.cost_per_unit / r.menu_price * 100) - r.food_cost_target)::numeric, 2)
  else null end as breach_pct,
  -- Suggested price to hit target
  case when r.food_cost_target > 0 then
    round((r.cost_per_unit / (r.food_cost_target / 100))::numeric, 2)
  else null end as suggested_price,
  -- Price increase needed
  case when r.food_cost_target > 0 and r.menu_price > 0 then
    greatest(
      round((r.cost_per_unit / (r.food_cost_target / 100) - r.menu_price)::numeric, 2),
      0
    )
  else null end as price_increase_needed,
  -- Gross profit per unit
  r.menu_price - r.cost_per_unit as gross_profit,
  -- Status
  case
    when r.menu_price is null or r.menu_price = 0 then 'no_price'
    when r.food_cost_target is null or r.food_cost_target = 0 then 'no_target'
    when (r.cost_per_unit / r.menu_price * 100) > r.food_cost_target + 5 then 'critical'
    when (r.cost_per_unit / r.menu_price * 100) > r.food_cost_target + 2 then 'warning'
    when (r.cost_per_unit / r.menu_price * 100) > r.food_cost_target then 'over'
    else 'healthy'
  end as margin_status
from recipes r
where r.effective_to is null -- only active versions
  and r.recipe_type = 'menu_item';

-- 4. Margin summary by venue
-- ============================================================================

create or replace view v_menu_margin_summary as
select
  venue_id,
  count(*) as total_recipes,
  count(*) filter (where margin_status = 'healthy') as healthy_count,
  count(*) filter (where margin_status = 'over') as over_count,
  count(*) filter (where margin_status = 'warning') as warning_count,
  count(*) filter (where margin_status = 'critical') as critical_count,
  count(*) filter (where margin_status in ('no_price', 'no_target')) as unconfigured_count,
  round(avg(actual_food_cost_pct) filter (where actual_food_cost_pct is not null), 2) as avg_food_cost_pct,
  round(avg(food_cost_target) filter (where food_cost_target > 0), 2) as avg_target_pct,
  sum(price_increase_needed) filter (where price_increase_needed > 0) as total_price_gap
from v_menu_margin_health
group by venue_id;
