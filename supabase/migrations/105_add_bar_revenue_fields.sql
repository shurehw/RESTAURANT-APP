-- Add F&B split and revenue fields for standing bars

ALTER TABLE proforma_center_service_participation
ADD COLUMN IF NOT EXISTS bar_food_pct DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS bar_bev_pct DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS bar_revenue DECIMAL(10,2);

COMMENT ON COLUMN proforma_center_service_participation.bar_food_pct IS 'Food % for standing bar (typically 5-15%)';
COMMENT ON COLUMN proforma_center_service_participation.bar_bev_pct IS 'Beverage % for standing bar (typically 85-95%)';
COMMENT ON COLUMN proforma_center_service_participation.bar_revenue IS 'Calculated bar revenue: bar_guests × avg_spend_per_guest';

-- Set defaults for existing standing bars
UPDATE proforma_center_service_participation
SET
  avg_spend_per_guest = COALESCE(avg_spend_per_guest, 18.0),
  bar_food_pct = COALESCE(bar_food_pct, 10.0),
  bar_bev_pct = COALESCE(bar_bev_pct, 90.0),
  bar_revenue = CASE
    WHEN bar_guests IS NOT NULL AND avg_spend_per_guest IS NOT NULL
    THEN bar_guests * COALESCE(avg_spend_per_guest, 18.0)
    ELSE NULL
  END
WHERE bar_mode_override = 'standing' OR (bar_guests IS NOT NULL AND bar_guests > 0);
