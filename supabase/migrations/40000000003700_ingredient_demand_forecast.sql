-- ============================================================================
-- COGS Module: Demand Forecast → Ingredient Needs
-- ============================================================================
-- Connects existing covers/revenue forecast to recipes.
-- Predicts ingredient consumption by:
--   1. Computing item mix ratios (what sells per cover, by DOW)
--   2. Multiplying forecast × mix × recipe BOM
-- Better than Nory: leverages existing EWMA forecast pipeline,
-- DOW-aware mix ratios, and full sub-recipe expansion.
-- ============================================================================

-- 1. Item Mix Ratios (materialized, refreshed weekly)
-- ============================================================================
-- Historical ratio of each menu item's quantity to total covers,
-- by venue and day-of-week. This is the bridge between
-- "we expect 120 covers" and "we need 30 lbs of salmon."

create materialized view if not exists mv_item_mix_ratios as
select
  idf.venue_id,
  idf.menu_item_name,
  extract(dow from idf.business_date)::int as dow,
  -- Average qty sold per cover
  case when sum(vdf.covers_count) > 0 then
    sum(idf.quantity_sold)::numeric / sum(vdf.covers_count)
  else 0 end as avg_qty_per_cover,
  -- Average qty per day (fallback when covers are unreliable)
  avg(idf.quantity_sold) as avg_qty_per_day,
  -- Sample size for confidence
  count(distinct idf.business_date) as sample_days,
  sum(idf.net_sales) as total_sales,
  -- Revenue mix (what % of net sales is this item)
  case when sum(sum(idf.net_sales)) over (partition by idf.venue_id, extract(dow from idf.business_date)) > 0 then
    sum(idf.net_sales) / sum(sum(idf.net_sales)) over (partition by idf.venue_id, extract(dow from idf.business_date))
  else 0 end as revenue_mix_pct
from item_day_facts idf
join venue_day_facts vdf
  on vdf.venue_id = idf.venue_id and vdf.business_date = idf.business_date
where idf.business_date >= current_date - interval '90 days'
  and vdf.covers_count > 0
  and idf.quantity_sold > 0
group by idf.venue_id, idf.menu_item_name, extract(dow from idf.business_date);

create unique index if not exists idx_mv_item_mix_venue_item_dow
  on mv_item_mix_ratios(venue_id, menu_item_name, dow);
create index if not exists idx_mv_item_mix_venue_dow
  on mv_item_mix_ratios(venue_id, dow);

-- Refresh function
create or replace function refresh_item_mix_ratios()
returns void language plpgsql security definer as $$
begin
  refresh materialized view concurrently mv_item_mix_ratios;
end;
$$;

-- 2. Ingredient Demand Forecast view
-- ============================================================================
-- Joins forecast → mix ratios → recipe mapping → recipe BOM
-- to produce ingredient-level demand for future dates.

create or replace view v_ingredient_demand_forecast as
with forecasted_items as (
  select
    df.venue_id,
    df.business_date,
    mix.menu_item_name,
    df.covers_predicted * mix.avg_qty_per_cover as forecasted_item_qty,
    mix.sample_days,
    df.confidence_level as forecast_confidence
  from demand_forecasts df
  join mv_item_mix_ratios mix
    on mix.venue_id = df.venue_id
    and mix.dow = extract(dow from df.business_date)::int
  where df.business_date >= current_date
    -- Use most recent forecast for each date
    and df.forecast_date = (
      select max(df2.forecast_date)
      from demand_forecasts df2
      where df2.venue_id = df.venue_id
        and df2.business_date = df.business_date
        and df2.shift_type = df.shift_type
    )
),
mapped_recipes as (
  select
    fi.venue_id,
    fi.business_date,
    fi.menu_item_name,
    fi.forecasted_item_qty,
    fi.forecast_confidence,
    m.recipe_id,
    r.name as recipe_name
  from forecasted_items fi
  join menu_item_recipe_map m
    on m.venue_id = fi.venue_id
    and normalize_menu_item_name(m.menu_item_name) = normalize_menu_item_name(fi.menu_item_name)
    and m.is_active = true
  join recipes r on r.id = m.recipe_id and r.effective_to is null
)
select
  mr.venue_id,
  mr.business_date,
  rc.item_id,
  i.name as item_name,
  i.category as item_category,
  i.unit_of_measure as uom,
  sum(mr.forecasted_item_qty * rc.total_qty) as forecasted_qty,
  sum(mr.forecasted_item_qty * rc.line_cost) as forecasted_cost,
  coalesce(min(vi.lead_time_days), 7) as lead_time_days
from mapped_recipes mr
join v_recipe_costs rc on rc.recipe_id = mr.recipe_id
join items i on i.id = rc.item_id
left join vendor_items vi on vi.item_id = rc.item_id and vi.is_active = true
group by mr.venue_id, mr.business_date, rc.item_id, i.name, i.category, i.unit_of_measure;

-- 3. Ingredient Needs Summary (net of on-hand)
-- ============================================================================

create or replace view v_ingredient_needs_summary as
with horizon_demand as (
  select
    f.venue_id,
    f.item_id,
    f.item_name,
    f.item_category,
    f.uom,
    f.lead_time_days,
    sum(f.forecasted_qty) as total_forecasted_qty,
    sum(f.forecasted_cost) as total_forecasted_cost,
    min(f.business_date) as first_need_date,
    max(f.business_date) as last_need_date,
    count(distinct f.business_date) as forecast_days
  from v_ingredient_demand_forecast f
  where f.business_date <= current_date + (f.lead_time_days + 2)
  group by f.venue_id, f.item_id, f.item_name, f.item_category, f.uom, f.lead_time_days
)
select
  hd.venue_id,
  hd.item_id,
  hd.item_name,
  hd.item_category,
  hd.uom,
  hd.lead_time_days,
  hd.total_forecasted_qty,
  hd.total_forecasted_cost,
  coalesce(ib.quantity_on_hand, 0) as on_hand_qty,
  greatest(hd.total_forecasted_qty - coalesce(ib.quantity_on_hand, 0), 0) as net_need_qty,
  coalesce(ip.par_level, 0) as par_level,
  coalesce(ip.reorder_point, 0) as reorder_point,
  coalesce(ip.reorder_quantity, 0) as reorder_quantity,
  coalesce(ib.quantity_on_hand, 0) < coalesce(ip.reorder_point, 0) as below_reorder,
  case
    when coalesce(ib.quantity_on_hand, 0) < coalesce(ip.reorder_point, 0)
      and hd.total_forecasted_qty > coalesce(ib.quantity_on_hand, 0) then 'critical'
    when hd.total_forecasted_qty > coalesce(ib.quantity_on_hand, 0) then 'warning'
    else 'ok'
  end as urgency,
  hd.first_need_date,
  hd.last_need_date,
  hd.forecast_days
from horizon_demand hd
left join inventory_balances ib
  on ib.venue_id = hd.venue_id and ib.item_id = hd.item_id
left join item_pars ip
  on ip.venue_id = hd.venue_id and ip.item_id = hd.item_id;
