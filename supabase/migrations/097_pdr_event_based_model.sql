-- PDR (Private Dining Room) — Event-Based Model
-- PDRs don't turn, they book. Covers = events × avg_guests_per_event

-- ============================================================================
-- 1. ADD PDR FLAG TO REVENUE CENTERS
-- ============================================================================

alter table proforma_revenue_centers
  add column if not exists is_pdr boolean default false,
  add column if not exists max_seats int null check (max_seats > 0);

comment on column proforma_revenue_centers.is_pdr is
  'Whether this is a Private Dining Room (event-based, not pacing-based).
   PDRs use events_per_service × avg_guests_per_event, not seat × turn math.';

comment on column proforma_revenue_centers.max_seats is
  'Maximum physical capacity. Used for validation only (avg_guests ≤ max_seats).
   PDRs do not use seats for primary calculation.';

-- Constraint: cannot be both bar and PDR
alter table proforma_revenue_centers
  add constraint check_not_both_bar_and_pdr
  check (not (is_bar = true and is_pdr = true));

-- ============================================================================
-- 2. ADD PDR METRICS TO CENTER-SERVICE PARTICIPATION
-- ============================================================================

-- Create pricing model enum
create type pdr_pricing_model as enum ('per_guest', 'minimum_spend');

-- Add PDR event-based fields
alter table proforma_center_service_participation
  add column if not exists events_per_service numeric(6,4) null check (events_per_service >= 0),
  add column if not exists avg_guests_per_event numeric(6,2) null check (avg_guests_per_event > 0),
  add column if not exists pricing_model pdr_pricing_model null,
  add column if not exists avg_spend_per_guest numeric(10,2) null check (avg_spend_per_guest > 0),
  add column if not exists min_spend_per_event numeric(10,2) null check (min_spend_per_event > 0),
  add column if not exists realization_rate numeric(4,2) null check (realization_rate between 0 and 1),
  add column if not exists pdr_covers numeric(10,2) null check (pdr_covers >= 0),
  add column if not exists pdr_revenue numeric(12,2) null check (pdr_revenue >= 0);

comment on column proforma_center_service_participation.events_per_service is
  'Expected events per service for PDR. Fractional allowed (0.35 = ~2-3 events/week).
   Presets: Conservative (0.15), Normal (0.35), Strong (0.60), Exceptional (0.85).';

comment on column proforma_center_service_participation.avg_guests_per_event is
  'Average guests per PDR event. Presets: Small (18), Medium (32), Large (56).';

comment on column proforma_center_service_participation.pricing_model is
  'PDR pricing model: per_guest (covers × avg_spend) or minimum_spend (flat fee).';

comment on column proforma_center_service_participation.avg_spend_per_guest is
  'Average spend per guest (required if pricing_model = per_guest).';

comment on column proforma_center_service_participation.min_spend_per_event is
  'Minimum spend per event (required if pricing_model = minimum_spend).';

comment on column proforma_center_service_participation.realization_rate is
  'Expected realization rate (default 0.90).
   Presets: Conservative (0.85), Default (0.90), Aggressive (0.95).';

comment on column proforma_center_service_participation.pdr_covers is
  'Calculated PDR covers: events_per_service × avg_guests_per_event.
   Counts toward total covers, NOT utilization %.';

comment on column proforma_center_service_participation.pdr_revenue is
  'Calculated PDR revenue based on pricing model and realization rate.';

-- ============================================================================
-- 3. CREATE PDR CALCULATION FUNCTION
-- ============================================================================

create or replace function calculate_pdr_metrics(
  p_events_per_service numeric,
  p_avg_guests_per_event numeric,
  p_pricing_model pdr_pricing_model,
  p_avg_spend_per_guest numeric,
  p_min_spend_per_event numeric,
  p_realization_rate numeric
)
returns table(
  pdr_covers numeric,
  pdr_revenue numeric
)
language plpgsql
immutable
as $$
declare
  v_covers numeric;
  v_per_guest_revenue numeric;
  v_min_spend_revenue numeric;
  v_revenue numeric;
  v_realization numeric;
begin
  -- Default realization rate
  v_realization := coalesce(p_realization_rate, 0.90);

  -- Calculate covers (always)
  if p_events_per_service is null or p_avg_guests_per_event is null then
    return;
  end if;

  v_covers := p_events_per_service * p_avg_guests_per_event;

  -- Calculate revenue based on pricing model
  if p_pricing_model = 'per_guest' then
    if p_avg_spend_per_guest is null then
      raise exception 'avg_spend_per_guest required for per_guest pricing model';
    end if;
    v_revenue := v_covers * p_avg_spend_per_guest * v_realization;

  elsif p_pricing_model = 'minimum_spend' then
    if p_min_spend_per_event is null then
      raise exception 'min_spend_per_event required for minimum_spend pricing model';
    end if;
    v_revenue := p_events_per_service * p_min_spend_per_event * v_realization;

  else
    -- No pricing model set
    v_revenue := null;
  end if;

  -- Optional: if both pricing models provided, take max
  if p_avg_spend_per_guest is not null and p_min_spend_per_event is not null then
    v_per_guest_revenue := v_covers * p_avg_spend_per_guest * v_realization;
    v_min_spend_revenue := p_events_per_service * p_min_spend_per_event * v_realization;
    v_revenue := greatest(v_per_guest_revenue, v_min_spend_revenue);
  end if;

  return query select v_covers, v_revenue;
end;
$$;

comment on function calculate_pdr_metrics is
  'Calculates PDR covers and revenue based on event-based model.
   Covers = events × avg_guests
   Revenue = per_guest OR minimum_spend (whichever is higher if both provided)';

-- ============================================================================
-- 4. CREATE PDR VALIDATION FUNCTION
-- ============================================================================

create or replace function validate_pdr_metrics()
returns trigger
language plpgsql
as $$
declare
  v_is_pdr boolean;
  v_max_seats int;
  v_service_name text;
begin
  -- Only validate if this is a PDR
  select is_pdr, max_seats into v_is_pdr, v_max_seats
  from proforma_revenue_centers
  where id = NEW.revenue_center_id;

  if not v_is_pdr then
    return NEW;
  end if;

  -- Get service name for warnings
  select service_name into v_service_name
  from proforma_revenue_service_periods
  where id = NEW.service_period_id;

  -- HARD VALIDATIONS (block save)

  -- If events > 0, must have avg_guests
  if NEW.events_per_service is not null and NEW.events_per_service > 0 then
    if NEW.avg_guests_per_event is null or NEW.avg_guests_per_event <= 0 then
      raise exception 'avg_guests_per_event required when events_per_service > 0';
    end if;

    -- Check physical capacity constraint
    if v_max_seats is not null and NEW.avg_guests_per_event > v_max_seats then
      raise exception 'avg_guests_per_event (%) exceeds max_seats (%)',
        NEW.avg_guests_per_event, v_max_seats;
    end if;
  end if;

  -- Pricing model validations
  if NEW.pricing_model = 'per_guest' then
    if NEW.avg_spend_per_guest is null or NEW.avg_spend_per_guest <= 0 then
      raise exception 'avg_spend_per_guest required for per_guest pricing model';
    end if;
  elsif NEW.pricing_model = 'minimum_spend' then
    if NEW.min_spend_per_event is null or NEW.min_spend_per_event <= 0 then
      raise exception 'min_spend_per_event required for minimum_spend pricing model';
    end if;
  end if;

  -- SOFT VALIDATIONS (warnings only)

  -- Warn if more than 1 event per service
  if NEW.events_per_service is not null and NEW.events_per_service > 1.0 then
    raise warning 'PDR: events_per_service (%) > 1.0 (more than one event per service)',
      NEW.events_per_service;
  end if;

  -- Warn if realization rate > 95%
  if NEW.realization_rate is not null and NEW.realization_rate > 0.95 then
    raise warning 'PDR: realization_rate (%) exceeds 95%% (very aggressive)',
      NEW.realization_rate;
  end if;

  -- Warn if PDR active for non-dinner service
  if v_service_name is not null and lower(v_service_name) not like '%dinner%' then
    raise warning 'PDR active for non-dinner service (%)', v_service_name;
  end if;

  return NEW;
end;
$$;

drop trigger if exists validate_pdr_metrics_trigger on proforma_center_service_participation;
create trigger validate_pdr_metrics_trigger
  before insert or update on proforma_center_service_participation
  for each row
  execute function validate_pdr_metrics();

-- ============================================================================
-- 5. CREATE AUTO-CALCULATION TRIGGER FOR PDR METRICS
-- ============================================================================

create or replace function auto_calculate_pdr_metrics()
returns trigger
language plpgsql
as $$
declare
  v_is_pdr boolean;
  v_calculated record;
begin
  -- Only auto-calculate if this is a PDR
  select is_pdr into v_is_pdr
  from proforma_revenue_centers
  where id = NEW.revenue_center_id;

  if not v_is_pdr or NEW.events_per_service is null or NEW.avg_guests_per_event is null then
    return NEW;
  end if;

  -- Calculate PDR metrics
  select * into v_calculated
  from calculate_pdr_metrics(
    NEW.events_per_service,
    NEW.avg_guests_per_event,
    NEW.pricing_model,
    NEW.avg_spend_per_guest,
    NEW.min_spend_per_event,
    NEW.realization_rate
  );

  NEW.pdr_covers := v_calculated.pdr_covers;
  NEW.pdr_revenue := v_calculated.pdr_revenue;

  return NEW;
end;
$$;

drop trigger if exists auto_calculate_pdr_trigger on proforma_center_service_participation;
create trigger auto_calculate_pdr_trigger
  before insert or update on proforma_center_service_participation
  for each row
  execute function auto_calculate_pdr_metrics();

-- ============================================================================
-- 6. ADD INDEXES FOR PERFORMANCE
-- ============================================================================

create index if not exists idx_revenue_centers_is_pdr
  on proforma_revenue_centers (is_pdr)
  where is_pdr = true;

create index if not exists idx_participation_pdr_covers
  on proforma_center_service_participation (service_period_id, pdr_covers)
  where pdr_covers is not null;

-- ============================================================================
-- 7. BACKFILL / DATA INTEGRITY
-- ============================================================================

-- Set default realization rate for existing PDRs
update proforma_center_service_participation p
set realization_rate = 0.90
where exists (
  select 1 from proforma_revenue_centers c
  where c.id = p.revenue_center_id
    and c.is_pdr = true
)
and p.realization_rate is null;
