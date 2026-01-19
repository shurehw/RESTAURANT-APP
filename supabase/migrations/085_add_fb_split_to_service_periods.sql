-- Add F&B split percentages to service periods
-- Each service period can have its own food/bev/other mix

alter table proforma_revenue_service_periods
  add column if not exists food_pct numeric(5,2) default 60.00 check (food_pct >= 0 and food_pct <= 100),
  add column if not exists bev_pct numeric(5,2) default 35.00 check (bev_pct >= 0 and bev_pct <= 100),
  add column if not exists other_pct numeric(5,2) default 5.00 check (other_pct >= 0 and other_pct <= 100);

-- Add constraint that percentages sum to 100
alter table proforma_revenue_service_periods
  add constraint service_period_mix_sum_100
  check (abs((food_pct + bev_pct + other_pct) - 100.00) < 0.01);

-- Update existing records to have default split
update proforma_revenue_service_periods
set
  food_pct = 60.00,
  bev_pct = 35.00,
  other_pct = 5.00
where food_pct is null;
