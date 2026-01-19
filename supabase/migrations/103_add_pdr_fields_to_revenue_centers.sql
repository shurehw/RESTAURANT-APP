-- Add PDR fields to revenue centers table
ALTER TABLE proforma_revenue_centers
ADD COLUMN IF NOT EXISTS is_pdr BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS max_seats INTEGER;

-- Add comment
COMMENT ON COLUMN proforma_revenue_centers.is_pdr IS 'Whether this revenue center is a Private Dining Room';
COMMENT ON COLUMN proforma_revenue_centers.max_seats IS 'Maximum capacity for PDR events';

-- Update constraint: cannot be both bar and PDR
ALTER TABLE proforma_revenue_centers
ADD CONSTRAINT revenue_centers_not_both_bar_and_pdr
CHECK (NOT (is_bar = TRUE AND is_pdr = TRUE));
