-- ============================================================================
-- COGS Module: Prep Lists from Forecast
-- ============================================================================
-- Goes beyond ordering — tells the kitchen WHAT to prep and HOW MUCH.
-- Forecast → recipe explosion → prep tasks by station/time.
-- Nory does this. We do it better: station-aware, sub-recipe-aware,
-- with batch sizing and shelf-life tracking.
-- ============================================================================

-- 1. Prep Stations (reference data)
-- ============================================================================

create table if not exists prep_stations (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  name text not null,
  description text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table prep_stations
  add constraint uq_prep_station_venue_name unique (venue_id, name);

create index idx_prep_stations_venue on prep_stations(venue_id, is_active, display_order);

-- RLS
alter table prep_stations enable row level security;

create policy "Users can view prep stations for their venues"
  on prep_stations for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Admins can manage prep stations"
  on prep_stations for all
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
      and ou.role in ('admin', 'owner')
    )
  );

create policy "Service role bypass prep_stations"
  on prep_stations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Recipe prep metadata (station assignment, batch size, shelf life)
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'recipes' and column_name = 'prep_station_id'
  ) then
    alter table recipes
      add column prep_station_id uuid references prep_stations(id),
      add column batch_size numeric(10,2),       -- standard batch multiplier
      add column batch_uom text,                  -- 'each', 'quart', 'sheet_pan', etc.
      add column shelf_life_hours int,            -- how long prep lasts
      add column prep_priority int default 50,    -- lower = prep first (sauces before garnish)
      add column prep_notes text;                 -- special instructions
  end if;
end $$;

-- 3. Prep Lists (generated daily)
-- ============================================================================

create table if not exists prep_lists (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  business_date date not null,
  generated_at timestamptz not null default now(),
  generated_by text not null default 'system' check (generated_by in ('system', 'manual')),

  -- Summary stats
  total_items int not null default 0,
  total_recipes int not null default 0,
  estimated_prep_minutes int,
  covers_forecasted int,

  -- Status
  status text not null default 'draft' check (status in ('draft', 'published', 'in_progress', 'completed')),
  published_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),

  constraint uq_prep_list_venue_date unique (venue_id, business_date)
);

create index idx_prep_lists_venue_date on prep_lists(venue_id, business_date desc);
create index idx_prep_lists_status on prep_lists(status) where status != 'completed';

-- RLS
alter table prep_lists enable row level security;

create policy "Users can view prep lists for their venues"
  on prep_lists for select
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass prep_lists"
  on prep_lists for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 4. Prep List Items (individual prep tasks)
-- ============================================================================

create table if not exists prep_list_items (
  id uuid primary key default gen_random_uuid(),
  prep_list_id uuid not null references prep_lists(id) on delete cascade,
  recipe_id uuid not null references recipes(id),
  prep_station_id uuid references prep_stations(id),

  -- What to prep
  recipe_name text not null,
  forecasted_portions numeric(10,2) not null,
  -- How much existing prep is available (from previous day's leftover)
  on_hand_portions numeric(10,2) not null default 0,
  -- Net prep needed
  prep_portions numeric(10,2) not null generated always as (
    greatest(forecasted_portions - on_hand_portions, 0)
  ) stored,
  -- Batch calculation
  batch_size numeric(10,2),
  batches_needed numeric(10,2),
  batch_uom text,

  -- Timing
  prep_priority int not null default 50,
  estimated_minutes int,
  shelf_life_hours int,
  prep_notes text,

  -- Completion tracking
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  actual_portions numeric(10,2),
  completion_notes text,

  created_at timestamptz not null default now()
);

create index idx_prep_list_items_list on prep_list_items(prep_list_id, prep_priority);
create index idx_prep_list_items_station on prep_list_items(prep_station_id, status);
create index idx_prep_list_items_recipe on prep_list_items(recipe_id);

-- RLS
alter table prep_list_items enable row level security;

create policy "Users can view prep list items for their venues"
  on prep_list_items for select
  using (
    prep_list_id in (
      select pl.id from prep_lists pl
      join venues v on v.id = pl.venue_id
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Users can update prep list items"
  on prep_list_items for update
  using (
    prep_list_id in (
      select pl.id from prep_lists pl
      join venues v on v.id = pl.venue_id
      join organization_users ou on ou.organization_id = v.organization_id
      where ou.user_id = auth.uid() and ou.is_active = true
    )
  );

create policy "Service role bypass prep_list_items"
  on prep_list_items for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 5. Prep Forecast view (what to prep for a future date)
-- ============================================================================
-- This is the read-path that the prep list generator uses.

create or replace view v_prep_forecast as
with recipe_demand as (
  -- How many portions of each recipe are needed per day
  select
    df.venue_id,
    df.business_date,
    m.recipe_id,
    r.name as recipe_name,
    r.prep_station_id,
    r.batch_size,
    r.batch_uom,
    r.shelf_life_hours,
    r.prep_priority,
    r.prep_notes,
    r.labor_minutes,
    -- Sum forecasted covers × item mix → portions
    sum(df.covers_predicted * mix.avg_qty_per_cover) as forecasted_portions
  from demand_forecasts df
  join mv_item_mix_ratios mix
    on mix.venue_id = df.venue_id
    and mix.dow = extract(dow from df.business_date)::int
  join menu_item_recipe_map m
    on m.venue_id = df.venue_id
    and normalize_menu_item_name(m.menu_item_name) = normalize_menu_item_name(mix.menu_item_name)
    and m.is_active = true
  join recipes r on r.id = m.recipe_id and r.effective_to is null
  where df.business_date >= current_date
    and df.forecast_date = (
      select max(df2.forecast_date)
      from demand_forecasts df2
      where df2.venue_id = df.venue_id
        and df2.business_date = df.business_date
        and df2.shift_type = df.shift_type
    )
  group by df.venue_id, df.business_date, m.recipe_id, r.name,
           r.prep_station_id, r.batch_size, r.batch_uom,
           r.shelf_life_hours, r.prep_priority, r.prep_notes, r.labor_minutes
)
select
  rd.venue_id,
  rd.business_date,
  rd.recipe_id,
  rd.recipe_name,
  rd.prep_station_id,
  ps.name as station_name,
  rd.forecasted_portions,
  rd.batch_size,
  case when rd.batch_size > 0 then
    ceil(rd.forecasted_portions / rd.batch_size)
  else null end as batches_needed,
  rd.batch_uom,
  rd.shelf_life_hours,
  rd.prep_priority,
  rd.prep_notes,
  rd.labor_minutes as estimated_minutes_per_batch,
  case when rd.batch_size > 0 then
    ceil(rd.forecasted_portions / rd.batch_size) * coalesce(rd.labor_minutes, 0)
  else coalesce(rd.labor_minutes, 0)
  end as total_estimated_minutes
from recipe_demand rd
left join prep_stations ps on ps.id = rd.prep_station_id;

-- 6. Prep completion stats view
-- ============================================================================

create or replace view v_prep_completion_stats as
select
  pl.venue_id,
  pl.business_date,
  pl.status as list_status,
  pl.covers_forecasted,
  count(pli.id) as total_items,
  count(pli.id) filter (where pli.status = 'completed') as completed_items,
  count(pli.id) filter (where pli.status = 'skipped') as skipped_items,
  count(pli.id) filter (where pli.status = 'pending') as pending_items,
  case when count(pli.id) > 0 then
    round((count(pli.id) filter (where pli.status = 'completed'))::numeric / count(pli.id) * 100, 1)
  else 0 end as completion_pct,
  sum(pli.estimated_minutes) filter (where pli.status = 'pending') as remaining_minutes
from prep_lists pl
left join prep_list_items pli on pli.prep_list_id = pl.id
group by pl.venue_id, pl.business_date, pl.status, pl.covers_forecasted;

-- 7. Seed default prep stations for existing venues
-- ============================================================================

insert into prep_stations (venue_id, name, description, display_order)
select
  v.id,
  s.name,
  s.description,
  s.display_order
from venues v
cross join (values
  ('Cold Station',   'Salads, cold apps, dessert plating',  1),
  ('Hot Station',    'Sauces, soups, hot prep',             2),
  ('Grill/Sauté',   'Proteins, grilled items',             3),
  ('Pastry',        'Bread, pastry, desserts',              4),
  ('Bar Prep',      'Syrups, juices, garnishes',            5),
  ('General',       'Mise en place, portioning',            6)
) as s(name, description, display_order)
on conflict (venue_id, name) do nothing;
