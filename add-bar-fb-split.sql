-- Add F&B split fields for bars
ALTER TABLE proforma_center_service_participation
ADD COLUMN IF NOT EXISTS bar_food_pct DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS bar_bev_pct DECIMAL(5,2);

COMMENT ON COLUMN proforma_center_service_participation.bar_food_pct IS 'Food % for bar (typically 5-15%)';
COMMENT ON COLUMN proforma_center_service_participation.bar_bev_pct IS 'Beverage % for bar (typically 85-95%)';
