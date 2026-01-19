-- Standing Capacity: Sqft-Based Calculation
-- Seated bars use linear feet → seats
-- Standing bars use net sqft → capacity (fire code density)

-- ============================================================================
-- 1. ADD SQFT FIELDS TO REVENUE CENTERS
-- ============================================================================

-- Add bar zone area to centers (for standing capacity calculation)
alter table proforma_revenue_centers
  add column if not exists bar_zone_area_sqft numeric(10,2) null check (bar_zone_area_sqft >= 0),
  add column if not exists bar_zone_depth_ft numeric(5,2) null check (bar_zone_depth_ft >= 0);

comment on column proforma_revenue_centers.bar_zone_area_sqft is
  'Total bar zone footprint (sqft). Used to calculate standing capacity.
   For standing bars: NSA = bar_zone_area × standing_factor.';

comment on column proforma_revenue_centers.bar_zone_depth_ft is
  'Bar zone depth estimate (ft). Used when only linear feet available.
   Approximation: bar_zone_area ≈ linear_feet × depth.';

-- ============================================================================
-- 2. ADD STANDING CAPACITY CALCULATION FIELDS TO PARTICIPATION
-- ============================================================================

alter table proforma_center_service_participation
  add column if not exists standing_factor numeric(4,2) null check (standing_factor between 0 and 1),
  add column if not exists sqft_per_person numeric(5,2) null check (sqft_per_person > 0),
  add column if not exists net_standing_area_sqft numeric(10,2) null check (net_standing_area_sqft >= 0),
  add column if not exists calculated_standing_capacity int null check (calculated_standing_capacity >= 0),
  add column if not exists bar_rail_ft_per_guest numeric(4,2) null check (bar_rail_ft_per_guest > 0);

comment on column proforma_center_service_participation.standing_factor is
  'Planning factor for net standing area (NSA = zone_area × factor).
   Typical values: 0.50 (conservative), 0.60 (normal), 0.70 (aggressive).';

comment on column proforma_center_service_participation.sqft_per_person is
  'Occupant density (sqft per standing person).
   Typical values: 14 (comfortable), 12 (busy), 9 (packed/clubby).';

comment on column proforma_center_service_participation.net_standing_area_sqft is
  'Net standing area (NSA) after subtracting circulation, obstructions.
   Calculated: zone_area × standing_factor.';

comment on column proforma_center_service_participation.calculated_standing_capacity is
  'Standing capacity calculated from NSA ÷ sqft_per_person.
   User can override via standing_capacity field.';

comment on column proforma_center_service_participation.bar_rail_ft_per_guest is
  'Linear feet of bar rail per standing guest (ordering friction).
   Typical: 2.0-2.5 ft/guest. Used as sanity check warning.';

-- ============================================================================
-- 3. CREATE STANDING CAPACITY CALCULATION FUNCTION
-- ============================================================================

create or replace function calculate_standing_capacity(
  p_bar_zone_area_sqft numeric,
  p_standing_factor numeric,
  p_sqft_per_person numeric
)
returns int
language plpgsql
immutable
as $$
declare
  v_nsa numeric;
begin
  if p_bar_zone_area_sqft is null or p_standing_factor is null or p_sqft_per_person is null then
    return null;
  end if;

  -- Net Standing Area = zone area × standing factor
  v_nsa := p_bar_zone_area_sqft * p_standing_factor;

  -- Capacity = floor(NSA ÷ sqft/person)
  return floor(v_nsa / p_sqft_per_person);
end;
$$;

comment on function calculate_standing_capacity is
  'Calculates standing capacity from zone area, standing factor, and density.
   Formula: floor((zone_area × standing_factor) ÷ sqft_per_person)';

-- ============================================================================
-- 4. CREATE BAR RAIL SUPPORT VALIDATION FUNCTION
-- ============================================================================

create or replace function check_bar_rail_support(
  p_bar_linear_feet numeric,
  p_standing_capacity int,
  p_rail_ft_per_guest numeric default 2.0
)
returns table(
  rail_supported_guests int,
  warning text
)
language plpgsql
immutable
as $$
declare
  v_rail_supported int;
  v_capacity_ratio numeric;
begin
  if p_bar_linear_feet is null or p_standing_capacity is null then
    return;
  end if;

  -- Rail-supported guests = bar feet ÷ ft/guest
  v_rail_supported := floor(p_bar_linear_feet / coalesce(p_rail_ft_per_guest, 2.0));

  -- Ratio check: if capacity >> rail support × 4, ordering friction warning
  v_capacity_ratio := p_standing_capacity::numeric / nullif(v_rail_supported, 0);

  return query select
    v_rail_supported,
    case
      when v_capacity_ratio > 4 then
        format('Standing capacity (%s) far exceeds rail support (%s at %s ft/guest). Ordering friction risk.',
          p_standing_capacity, v_rail_supported, p_rail_ft_per_guest)
      when v_capacity_ratio > 3 then
        format('Warning: Capacity/rail ratio is high (%s). Consider bar throughput.',
          round(v_capacity_ratio, 1))
      else
        null
    end;
end;
$$;

comment on function check_bar_rail_support is
  'Validates standing capacity against bar rail support capacity.
   Returns rail-supported guest count and warning if capacity >> rail support.';

-- ============================================================================
-- 5. CREATE TRIGGER: AUTO-CALCULATE STANDING CAPACITY
-- ============================================================================

create or replace function auto_calculate_standing_capacity()
returns trigger
language plpgsql
as $$
declare
  v_bar_zone_area numeric;
  v_bar_linear_feet numeric;
  v_bar_depth numeric;
  v_nsa numeric;
  v_capacity int;
begin
  -- Only auto-calculate if standing_capacity is null
  if NEW.standing_capacity is not null then
    return NEW;
  end if;

  -- Get bar zone area from center
  select bar_zone_area_sqft, bar_zone_depth_ft
  into v_bar_zone_area, v_bar_depth
  from proforma_revenue_centers
  where id = NEW.revenue_center_id;

  -- If no zone area but we have depth, estimate from linear feet
  if v_bar_zone_area is null and v_bar_depth is not null then
    select c.seats * 2.0 -- rough estimate: 2 ft per seat for bar linear feet
    into v_bar_linear_feet
    from proforma_revenue_centers c
    where c.id = NEW.revenue_center_id;

    v_bar_zone_area := v_bar_linear_feet * v_bar_depth;
  end if;

  -- Calculate NSA if we have inputs
  if v_bar_zone_area is not null and NEW.standing_factor is not null then
    NEW.net_standing_area_sqft := v_bar_zone_area * NEW.standing_factor;
  end if;

  -- Calculate capacity if we have NSA and density
  if NEW.net_standing_area_sqft is not null and NEW.sqft_per_person is not null then
    NEW.calculated_standing_capacity := floor(NEW.net_standing_area_sqft / NEW.sqft_per_person);
  end if;

  return NEW;
end;
$$;

drop trigger if exists auto_calculate_standing_capacity_trigger on proforma_center_service_participation;
create trigger auto_calculate_standing_capacity_trigger
  before insert or update on proforma_center_service_participation
  for each row
  execute function auto_calculate_standing_capacity();

-- ============================================================================
-- 6. ADD PRESET DEFAULTS
-- ============================================================================

-- Set default standing factors and densities
comment on column proforma_center_service_participation.standing_factor is
  'Planning factor for net standing area (NSA = zone_area × factor).
   Presets: 0.50 (conservative), 0.60 (normal - default), 0.70 (aggressive).';

comment on column proforma_center_service_participation.sqft_per_person is
  'Occupant density (sqft per standing person).
   Presets: 14 (comfortable), 12 (busy - default), 9 (packed - warning).';

comment on column proforma_center_service_participation.avg_dwell_hours is
  'For standing bars: average dwell time (hours).
   Presets: 1.25 (cocktail lounge), 1.0 (nightlife - default), 0.75 (club - warning).';
