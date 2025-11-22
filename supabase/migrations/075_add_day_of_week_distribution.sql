-- Add day_of_week_distribution column to proforma_revenue_assumptions
-- Stores percentage of weekly sales for each day (Mon-Sun), totaling 100%

ALTER TABLE proforma_revenue_assumptions
ADD COLUMN IF NOT EXISTS day_of_week_distribution NUMERIC(5,2)[]
DEFAULT ARRAY[14.3, 14.3, 14.3, 14.3, 14.3, 14.3, 14.2];

COMMENT ON COLUMN proforma_revenue_assumptions.day_of_week_distribution IS
'Array of 7 percentages (Mon-Sun) representing daily sales distribution. Must total 100%. Default is equal distribution.';
