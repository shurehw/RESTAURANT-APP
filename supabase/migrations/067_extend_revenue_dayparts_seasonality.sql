-- Extend proforma_revenue_assumptions for dayparts and seasonality

alter table proforma_revenue_assumptions
  -- Dayparts: allow 3 services with separate covers & checks
  add column if not exists avg_covers_late_night numeric(10,2) default 0,
  add column if not exists avg_check_food_lunch numeric(10,2) default null,
  add column if not exists avg_check_food_dinner numeric(10,2) default null,
  add column if not exists avg_check_food_late_night numeric(10,2) default null,
  add column if not exists avg_check_bev_lunch numeric(10,2) default null,
  add column if not exists avg_check_bev_dinner numeric(10,2) default null,
  add column if not exists avg_check_bev_late_night numeric(10,2) default null;

alter table proforma_revenue_assumptions
  -- Seasonality: 12 multipliers (Jan–Dec), nullable
  add column if not exists seasonality_curve jsonb default null,
  -- optional: store which preset is used ('none','fsr_la','nightlife_lv', etc.)
  add column if not exists seasonality_preset text default 'none';

comment on column proforma_revenue_assumptions.seasonality_curve is
  'Array of 12 multipliers (Jan-Dec) for seasonality adjustment, e.g. [1.0, 0.9, 1.1, ...]';
comment on column proforma_revenue_assumptions.seasonality_preset is
  'Preset name: none, fsr_la, nightlife_lv, etc.';
