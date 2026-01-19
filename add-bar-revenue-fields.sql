-- Add revenue fields for standing bars
ALTER TABLE proforma_center_service_participation
ADD COLUMN IF NOT EXISTS avg_spend_per_guest DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS bar_food_pct DECIMAL(5,2) DEFAULT 10.0,
ADD COLUMN IF NOT EXISTS bar_bev_pct DECIMAL(5,2) DEFAULT 90.0;

COMMENT ON COLUMN proforma_center_service_participation.avg_spend_per_guest IS 'Average spend per guest for standing/throughput bars (drinks only)';
COMMENT ON COLUMN proforma_center_service_participation.bar_food_pct IS 'Food % for bar (typically 5-15%)';
COMMENT ON COLUMN proforma_center_service_participation.bar_bev_pct IS 'Beverage % for bar (typically 85-95%)';

-- Update existing standing bar with defaults
UPDATE proforma_center_service_participation
SET 
  avg_spend_per_guest = 18.0,  -- Default $18 per guest for standing bar
  bar_food_pct = 10.0,
  bar_bev_pct = 90.0
WHERE bar_mode_override = 'standing' AND avg_spend_per_guest IS NULL;
