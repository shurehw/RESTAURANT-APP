-- Add fields for proper covers calculation: Covers = Seats × Turns × Utilization
-- Turns = Service Hours ÷ Avg Dining Time

alter table proforma_revenue_service_periods
  add column if not exists service_hours numeric(4,2) default 3.0,
  add column if not exists avg_dining_time_hours numeric(4,2) default 1.5,
  add column if not exists default_utilization_pct numeric(5,2) default 65.0;

comment on column proforma_revenue_service_periods.service_hours is
  'Length of service period in hours (e.g., 6.0 for a 6-hour dinner service)';

comment on column proforma_revenue_service_periods.avg_dining_time_hours is
  'Average time guests spend dining in hours (e.g., 2.5 for a 2.5-hour dinner)';

comment on column proforma_revenue_service_periods.default_utilization_pct is
  'Default utilization % for this service (e.g., 65% = seats are 65% full on average)';

-- Add per-center utilization override to center participation table
alter table proforma_center_service_participation
  add column if not exists utilization_pct numeric(5,2) null;

comment on column proforma_center_service_participation.utilization_pct is
  'Override utilization % for this specific center in this service. If null, uses service default_utilization_pct.';
