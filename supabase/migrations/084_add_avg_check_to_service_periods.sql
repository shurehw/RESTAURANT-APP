-- Add avg_check column to service periods table (if it doesn't exist)
-- This consolidates avg_food_check and avg_bev_check into a single avg_check field

-- Add the new column
alter table proforma_revenue_service_periods
  add column if not exists avg_check numeric(10,2);

-- Copy data from avg_food_check if avg_check is null (for existing records)
update proforma_revenue_service_periods
set avg_check = coalesce(avg_food_check, 0) + coalesce(avg_bev_check, 0)
where avg_check is null;

-- Set NOT NULL constraint after data is migrated
alter table proforma_revenue_service_periods
  alter column avg_check set not null;

-- Add check constraint
alter table proforma_revenue_service_periods
  add constraint avg_check_positive check (avg_check >= 0);

-- Optionally drop the old columns (commented out for safety)
-- alter table proforma_revenue_service_periods drop column if exists avg_food_check;
-- alter table proforma_revenue_service_periods drop column if exists avg_bev_check;
