-- Add day-of-week selection and sales distribution to service periods
-- This allows each service period to specify which days it operates
-- and how sales are distributed across those days

-- Add array of operating days (0=Sunday, 1=Monday, ..., 6=Saturday)
alter table proforma_revenue_service_periods
  add column if not exists operating_days integer[] default '{0,1,2,3,4,5,6}';

-- Add day-of-week sales distribution (7 values, one for each day, should sum to 100)
-- Default is equal distribution
alter table proforma_revenue_service_periods
  add column if not exists day_of_week_distribution numeric(5,2)[] default '{14.3,14.3,14.3,14.3,14.3,14.3,14.2}';

-- Add constraint that day_of_week_distribution has exactly 7 elements
alter table proforma_revenue_service_periods
  add constraint day_distribution_length
  check (array_length(day_of_week_distribution, 1) = 7);

-- Add constraint that operating_days only contains valid day indices (0-6)
alter table proforma_revenue_service_periods
  add constraint operating_days_valid
  check (
    operating_days <@ array[0,1,2,3,4,5,6]
    and array_length(operating_days, 1) >= 1
  );

-- Update existing records to have default values
update proforma_revenue_service_periods
set
  operating_days = '{0,1,2,3,4,5,6}',
  day_of_week_distribution = '{14.3,14.3,14.3,14.3,14.3,14.3,14.2}'
where operating_days is null;
