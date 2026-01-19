-- Add bar mode selection to revenue centers
-- Seated Bar = counts as covers (seat-based math)
-- Standing Bar = separate throughput model (never added to covers)

create type bar_mode as enum ('seated', 'standing', 'none');

alter table proforma_revenue_centers
  add column if not exists bar_mode bar_mode default 'none',
  add column if not exists is_bar boolean default false;

comment on column proforma_revenue_centers.bar_mode is
  'Bar operation mode: seated (covers-based), standing (throughput-based), or none (not a bar)';

comment on column proforma_revenue_centers.is_bar is
  'Whether this center is a bar. If true, bar_mode must be set.';

-- Standing bar throughput model fields (only used when bar_mode = 'standing')
alter table proforma_center_service_participation
  add column if not exists guests_per_hour numeric(10,2) null,
  add column if not exists active_hours numeric(4,2) null,
  add column if not exists standing_capacity int null,
  add column if not exists avg_dwell_hours numeric(4,2) null;

comment on column proforma_center_service_participation.guests_per_hour is
  'For standing bars: Average guests per hour during active period';

comment on column proforma_center_service_participation.active_hours is
  'For standing bars: Active operating hours for this service';

comment on column proforma_center_service_participation.standing_capacity is
  'For standing bars: Maximum standing capacity (people)';

comment on column proforma_center_service_participation.avg_dwell_hours is
  'For standing bars: Average time guests spend at bar (hours)';

-- Validation: if is_bar = true, bar_mode must not be 'none'
alter table proforma_revenue_centers
  add constraint check_bar_mode_if_bar
  check (
    (is_bar = false and bar_mode = 'none') or
    (is_bar = true and bar_mode in ('seated', 'standing'))
  );
