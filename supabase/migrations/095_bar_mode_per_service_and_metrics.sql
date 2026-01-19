-- Bar Mode: Per-Service Override + Proper Math Separation
-- Fixes: bar_mode must be per-service (seated at dinner, standing late night)
-- Adds: covers vs bar_guests separation, proper validations

-- ============================================================================
-- 1. ADD PER-SERVICE BAR MODE OVERRIDE
-- ============================================================================

-- Allow bar mode to vary per service period
alter table proforma_center_service_participation
  add column if not exists bar_mode_override bar_mode null;

comment on column proforma_center_service_participation.bar_mode_override is
  'Per-service bar mode override. Falls back to proforma_revenue_centers.bar_mode if null.
   Example: seated at dinner, standing late night.';

-- ============================================================================
-- 2. ADD COVERS AND BAR GUESTS FIELDS (MUTUALLY EXCLUSIVE)
-- ============================================================================

-- Add covers field (for seated bars + regular centers)
alter table proforma_center_service_participation
  add column if not exists covers numeric(10,2) null check (covers >= 0);

-- Add bar guests field (for standing bars only)
alter table proforma_center_service_participation
  add column if not exists bar_guests numeric(10,2) null check (bar_guests >= 0);

comment on column proforma_center_service_participation.covers is
  'Covers for this center in this service. Used by dining/patio/PDR/seated bars.
   Mutually exclusive with bar_guests.';

comment on column proforma_center_service_participation.bar_guests is
  'Bar guests (standing bar only). Tracked separately from covers.
   Mutually exclusive with covers.';

-- ============================================================================
-- 3. ADD SEATED BAR CALCULATION FIELDS
-- ============================================================================

alter table proforma_center_service_participation
  add column if not exists avg_dwell_hours_seated numeric(4,2) null check (avg_dwell_hours_seated > 0),
  add column if not exists bar_utilization_pct numeric(5,2) null check (bar_utilization_pct between 0 and 100);

comment on column proforma_center_service_participation.avg_dwell_hours_seated is
  'For seated bars: average dining time (hours). Used to calculate turns.';

comment on column proforma_center_service_participation.bar_utilization_pct is
  'For seated bars: seat utilization percentage. Separate from dining utilization.';

-- ============================================================================
-- 4. RENAME STANDING BAR FIELDS FOR CLARITY
-- ============================================================================

-- avg_dwell_hours → avg_dwell_hours_standing (already exists, just rename in comments)
comment on column proforma_center_service_participation.avg_dwell_hours is
  'For standing bars: average dwell time (hours). Used with capacity to calculate throughput.';

-- ============================================================================
-- 5. ADD VALIDATION CONSTRAINTS
-- ============================================================================

-- Seated bar: covers allowed, bar_guests must be null
-- Standing bar: bar_guests allowed, covers should be null or zero
alter table proforma_center_service_participation
  add constraint check_seated_vs_standing_metrics
  check (
    -- Either covers is set (seated/dining) OR bar_guests is set (standing), not both
    (covers is not null and bar_guests is null) or
    (covers is null and bar_guests is not null) or
    (covers is null and bar_guests is null)
  );

-- Seated bar validation: if covers exist and it's a bar, must have dwell time
alter table proforma_center_service_participation
  add constraint check_seated_bar_has_dwell
  check (
    -- If covers > 0 and this looks like a seated bar calculation, require dwell
    (covers is null or avg_dwell_hours_seated is null or avg_dwell_hours_seated >= 0.5)
  );

-- Standing bar validation: if bar_guests exist, must have throughput inputs
alter table proforma_center_service_participation
  add constraint check_standing_bar_has_throughput
  check (
    bar_guests is null or
    (
      -- Either guests_per_hour + active_hours
      (guests_per_hour is not null and guests_per_hour > 0 and active_hours is not null and active_hours > 0) or
      -- OR capacity + dwell + active_hours
      (standing_capacity is not null and standing_capacity > 0 and
       avg_dwell_hours is not null and avg_dwell_hours > 0 and
       active_hours is not null and active_hours > 0)
    )
  );

-- ============================================================================
-- 6. CREATE HELPER FUNCTION: GET EFFECTIVE BAR MODE
-- ============================================================================

create or replace function get_effective_bar_mode(
  p_center_id uuid,
  p_service_id uuid
)
returns bar_mode
language plpgsql
stable
as $$
declare
  v_override bar_mode;
  v_default bar_mode;
begin
  -- Get override from participation table
  select bar_mode_override into v_override
  from proforma_center_service_participation
  where revenue_center_id = p_center_id
    and service_period_id = p_service_id;

  -- If override exists, use it
  if v_override is not null then
    return v_override;
  end if;

  -- Otherwise fall back to center default
  select bar_mode into v_default
  from proforma_revenue_centers
  where id = p_center_id;

  return coalesce(v_default, 'none');
end;
$$;

comment on function get_effective_bar_mode is
  'Returns the effective bar mode for a center in a service period.
   Uses per-service override if set, otherwise falls back to center default.';

-- ============================================================================
-- 7. CREATE VALIDATION FUNCTION: SEATED BAR GUARDRAILS
-- ============================================================================

create or replace function validate_seated_bar_metrics()
returns trigger
language plpgsql
as $$
declare
  v_bar_mode bar_mode;
  v_seats int;
  v_turns numeric;
  v_service_hours numeric;
begin
  -- Get effective bar mode
  v_bar_mode := get_effective_bar_mode(NEW.revenue_center_id, NEW.service_period_id);

  -- Only validate if this is a seated bar with covers
  if v_bar_mode = 'seated' and NEW.covers is not null and NEW.covers > 0 then

    -- Get seats from center
    select seats into v_seats
    from proforma_revenue_centers
    where id = NEW.revenue_center_id;

    -- Get service hours from service period
    select service_hours into v_service_hours
    from proforma_revenue_service_periods
    where id = NEW.service_period_id;

    -- Calculate turns if we have dwell time
    if NEW.avg_dwell_hours_seated is not null and NEW.avg_dwell_hours_seated > 0 then
      v_turns := v_service_hours / NEW.avg_dwell_hours_seated;

      -- BLOCK: turns > 4.5
      if v_turns > 4.5 then
        raise exception 'Seated bar turns (%) exceed maximum of 4.5. Adjust dwell time or service hours.',
          round(v_turns, 2);
      end if;

      -- BLOCK: avg_dwell_hours < 0.5
      if NEW.avg_dwell_hours_seated < 0.5 then
        raise exception 'Seated bar dwell time (% hours) is too low. Minimum 0.5 hours.',
          NEW.avg_dwell_hours_seated;
      end if;

      -- WARN: avg_dwell_hours < 1.0 (soft warning, logged but not blocked)
      if NEW.avg_dwell_hours_seated < 1.0 then
        raise warning 'Seated bar dwell time (% hours) is below typical minimum (1.0 hours)',
          NEW.avg_dwell_hours_seated;
      end if;
    end if;

    -- WARN: utilization > 90%
    if NEW.bar_utilization_pct is not null and NEW.bar_utilization_pct > 90 then
      raise warning 'Seated bar utilization (%%%) is very high. Confirm this is realistic.',
        NEW.bar_utilization_pct;
    end if;

    -- BLOCK: utilization > 95%
    if NEW.bar_utilization_pct is not null and NEW.bar_utilization_pct > 95 then
      raise exception 'Seated bar utilization (%%%) exceeds maximum of 95%%',
        NEW.bar_utilization_pct;
    end if;
  end if;

  return NEW;
end;
$$;

-- ============================================================================
-- 8. CREATE VALIDATION FUNCTION: STANDING BAR GUARDRAILS
-- ============================================================================

create or replace function validate_standing_bar_metrics()
returns trigger
language plpgsql
as $$
declare
  v_bar_mode bar_mode;
  v_calculated_guests numeric;
  v_max_throughput numeric;
  v_utilization numeric;
begin
  -- Get effective bar mode
  v_bar_mode := get_effective_bar_mode(NEW.revenue_center_id, NEW.service_period_id);

  -- Only validate if this is a standing bar
  if v_bar_mode = 'standing' and NEW.bar_guests is not null and NEW.bar_guests > 0 then

    -- BLOCK: active_hours must be > 0
    if NEW.active_hours is null or NEW.active_hours <= 0 then
      raise exception 'Standing bar requires active_hours > 0';
    end if;

    -- Calculate max throughput if we have capacity and dwell
    if NEW.standing_capacity is not null and NEW.standing_capacity > 0 and
       NEW.avg_dwell_hours is not null and NEW.avg_dwell_hours > 0 then

      -- Max throughput = capacity × (active_hours / dwell_hours)
      v_max_throughput := NEW.standing_capacity * (NEW.active_hours / NEW.avg_dwell_hours);

      -- Calculate implied utilization
      v_utilization := (NEW.bar_guests / v_max_throughput) * 100;

      -- WARN: utilization > 90%
      if v_utilization > 90 then
        raise warning 'Standing bar implied utilization (%%%) exceeds 90%% (fire code / staffing risk)',
          round(v_utilization, 1);
      end if;

      -- BLOCK: bar_guests exceed max_throughput by large margin (> 20%)
      if NEW.bar_guests > (v_max_throughput * 1.2) then
        raise exception 'Standing bar guests (%) exceed capacity-based max throughput (%) by >20%%',
          NEW.bar_guests, round(v_max_throughput, 1);
      end if;
    end if;

    -- Alternative validation: if using guests_per_hour model
    if NEW.guests_per_hour is not null and NEW.guests_per_hour > 0 and
       NEW.active_hours is not null and NEW.active_hours > 0 then

      v_calculated_guests := NEW.guests_per_hour * NEW.active_hours;

      -- Sanity check: bar_guests shouldn't wildly differ from calculated
      if NEW.bar_guests > (v_calculated_guests * 1.5) or NEW.bar_guests < (v_calculated_guests * 0.5) then
        raise warning 'Standing bar guests (%) differs significantly from calculated (guests/hr × hours = %)',
          NEW.bar_guests, round(v_calculated_guests, 1);
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

-- ============================================================================
-- 9. ATTACH VALIDATION TRIGGERS
-- ============================================================================

drop trigger if exists validate_seated_bar_trigger on proforma_center_service_participation;
create trigger validate_seated_bar_trigger
  before insert or update on proforma_center_service_participation
  for each row
  execute function validate_seated_bar_metrics();

drop trigger if exists validate_standing_bar_trigger on proforma_center_service_participation;
create trigger validate_standing_bar_trigger
  before insert or update on proforma_center_service_participation
  for each row
  execute function validate_standing_bar_metrics();

-- ============================================================================
-- 10. BACKFILL EXISTING DATA
-- ============================================================================

-- Existing bars with no mode → default to 'seated' (safer assumption)
update proforma_revenue_centers
set bar_mode = 'seated'
where is_bar = true and bar_mode = 'none';

-- Existing non-bars → ensure bar fields are null
update proforma_center_service_participation p
set
  bar_guests = null,
  guests_per_hour = null,
  active_hours = null,
  standing_capacity = null,
  avg_dwell_hours = null
where exists (
  select 1 from proforma_revenue_centers c
  where c.id = p.revenue_center_id
    and c.is_bar = false
);

-- ============================================================================
-- 11. ADD INDEXES FOR PERFORMANCE
-- ============================================================================

create index if not exists idx_participation_bar_mode_override
  on proforma_center_service_participation (bar_mode_override)
  where bar_mode_override is not null;

create index if not exists idx_participation_covers
  on proforma_center_service_participation (service_period_id, covers)
  where covers is not null;

create index if not exists idx_participation_bar_guests
  on proforma_center_service_participation (service_period_id, bar_guests)
  where bar_guests is not null;
