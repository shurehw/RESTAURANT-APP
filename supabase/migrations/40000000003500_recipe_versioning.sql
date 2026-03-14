-- ============================================================================
-- COGS Module: Recipe Versioning (Full BOM Version Chain)
-- ============================================================================
-- Recipes are now versioned. Every change to ingredients, quantities,
-- or prep method creates a new version — the old BOM is preserved.
-- menu_item_recipe_map always points to the active version.
-- Better than Nory: full audit trail of every recipe change with BOM diff.
-- ============================================================================

-- 1. Add version columns to recipes
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'recipes' and column_name = 'version'
  ) then
    alter table recipes
      add column version int not null default 1,
      add column parent_recipe_id uuid references recipes(id),
      add column effective_from timestamptz not null default now(),
      add column effective_to timestamptz,
      add column superseded_by uuid references recipes(id),
      add column change_notes text,
      add column changed_by uuid references auth.users(id);
  end if;
end $$;

-- Index for version chain lookups
create index if not exists idx_recipes_parent_version
  on recipes(coalesce(parent_recipe_id, id), version);

-- Index for active recipes only
create index if not exists idx_recipes_active
  on recipes(id) where effective_to is null;

-- 2. Create Recipe Version function
-- ============================================================================
-- Deep-copies recipe + recipe_items, updates menu_item_recipe_map.
-- Old version gets effective_to set, new version gets effective_from.

create or replace function create_recipe_version(
  p_recipe_id uuid,
  p_change_notes text default null,
  p_changed_by uuid default null
)
returns uuid language plpgsql security definer as $$
declare
  v_new_id uuid;
  v_parent_id uuid;
  v_new_version int;
  v_old_recipe record;
begin
  -- Get current recipe
  select * into v_old_recipe
  from recipes where id = p_recipe_id and effective_to is null;

  if not found then
    raise exception 'Recipe % not found or already superseded', p_recipe_id;
  end if;

  -- Determine parent (original recipe in the chain)
  v_parent_id := coalesce(v_old_recipe.parent_recipe_id, v_old_recipe.id);
  v_new_version := v_old_recipe.version + 1;
  v_new_id := gen_random_uuid();

  -- Insert new version (copy of current)
  insert into recipes (
    id, name, recipe_type, category, item_category,
    yield_qty, yield_uom, labor_minutes,
    menu_price, pos_sku, food_cost_target,
    cost_per_unit, venue_id, created_by,
    version, parent_recipe_id, effective_from,
    change_notes, changed_by, created_at
  )
  select
    v_new_id, name, recipe_type, category, item_category,
    yield_qty, yield_uom, labor_minutes,
    menu_price, pos_sku, food_cost_target,
    cost_per_unit, venue_id, created_by,
    v_new_version, v_parent_id, now(),
    p_change_notes, p_changed_by, now()
  from recipes where id = p_recipe_id;

  -- Deep-copy recipe_items
  insert into recipe_items (recipe_id, item_id, sub_recipe_id, qty, uom)
  select v_new_id, item_id, sub_recipe_id, qty, uom
  from recipe_items where recipe_id = p_recipe_id;

  -- Retire old version
  update recipes
  set effective_to = now(),
      superseded_by = v_new_id
  where id = p_recipe_id;

  -- Update menu_item_recipe_map to point to new version
  update menu_item_recipe_map
  set recipe_id = v_new_id,
      updated_at = now()
  where recipe_id = p_recipe_id;

  return v_new_id;
end;
$$;

-- 3. Recipe Version History view
-- ============================================================================

create or replace view v_recipe_version_history as
select
  coalesce(r.parent_recipe_id, r.id) as recipe_lineage_id,
  r.id as recipe_id,
  r.name,
  r.version,
  r.cost_per_unit,
  r.effective_from,
  r.effective_to,
  r.change_notes,
  r.changed_by,
  r.superseded_by,
  r.effective_to is null as is_current,
  -- Cost delta from previous version
  r.cost_per_unit - lag(r.cost_per_unit) over (
    partition by coalesce(r.parent_recipe_id, r.id)
    order by r.version
  ) as cost_delta,
  -- % change from previous version
  case
    when lag(r.cost_per_unit) over (
      partition by coalesce(r.parent_recipe_id, r.id) order by r.version
    ) > 0 then
      round(
        (r.cost_per_unit - lag(r.cost_per_unit) over (
          partition by coalesce(r.parent_recipe_id, r.id) order by r.version
        )) / lag(r.cost_per_unit) over (
          partition by coalesce(r.parent_recipe_id, r.id) order by r.version
        ) * 100, 2
      )
    else null
  end as cost_change_pct
from recipes r
order by coalesce(r.parent_recipe_id, r.id), r.version;

-- 4. Active recipe costs view (only current versions)
-- ============================================================================

create or replace view v_active_recipe_costs as
select
  rc.recipe_id,
  rc.item_id,
  rc.total_qty,
  rc.unit_cost,
  rc.line_cost
from v_recipe_costs rc
join recipes r on r.id = rc.recipe_id
where r.effective_to is null;

-- 5. Recipe BOM diff function (compare two versions)
-- ============================================================================

create or replace function diff_recipe_versions(
  p_version_a uuid,
  p_version_b uuid
)
returns table (
  item_id uuid,
  item_name text,
  qty_a numeric,
  qty_b numeric,
  qty_delta numeric,
  uom_a text,
  uom_b text,
  change_type text -- 'added', 'removed', 'modified', 'unchanged'
) language sql stable as $$
  select
    coalesce(a.item_id, b.item_id) as item_id,
    coalesce(ia.name, ib.name) as item_name,
    a.qty as qty_a,
    b.qty as qty_b,
    coalesce(b.qty, 0) - coalesce(a.qty, 0) as qty_delta,
    a.uom as uom_a,
    b.uom as uom_b,
    case
      when a.item_id is null and a.sub_recipe_id is null then 'added'
      when b.item_id is null and b.sub_recipe_id is null then 'removed'
      when a.qty != b.qty or a.uom is distinct from b.uom then 'modified'
      else 'unchanged'
    end as change_type
  from recipe_items a
  full outer join recipe_items b
    on b.recipe_id = p_version_b
    and coalesce(a.item_id, a.sub_recipe_id) = coalesce(b.item_id, b.sub_recipe_id)
  left join items ia on ia.id = a.item_id
  left join items ib on ib.id = b.item_id
  where a.recipe_id = p_version_a or b.recipe_id = p_version_b;
$$;
