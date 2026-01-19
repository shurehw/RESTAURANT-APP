-- Add PDR fields to proforma_center_service_participation table

ALTER TABLE proforma_center_service_participation
ADD COLUMN IF NOT EXISTS events_per_service DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS avg_guests_per_event INTEGER,
ADD COLUMN IF NOT EXISTS pricing_model TEXT CHECK (pricing_model IN ('per_guest', 'minimum_spend')),
ADD COLUMN IF NOT EXISTS avg_spend_per_guest DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS min_spend_per_event DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS realization_rate DECIMAL(5,4) DEFAULT 0.90,
ADD COLUMN IF NOT EXISTS pdr_covers DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS pdr_revenue DECIMAL(10,2);

-- Add comments
COMMENT ON COLUMN proforma_center_service_participation.events_per_service IS 'Number of events per service period (e.g., 0.35 = ~2-3 events/week)';
COMMENT ON COLUMN proforma_center_service_participation.avg_guests_per_event IS 'Average number of guests per PDR event';
COMMENT ON COLUMN proforma_center_service_participation.pricing_model IS 'PDR pricing model: per_guest or minimum_spend';
COMMENT ON COLUMN proforma_center_service_participation.avg_spend_per_guest IS 'Average spend per guest for per_guest pricing model';
COMMENT ON COLUMN proforma_center_service_participation.min_spend_per_event IS 'Minimum spend per event for minimum_spend pricing model';
COMMENT ON COLUMN proforma_center_service_participation.realization_rate IS 'Percentage of expected revenue actually realized (0.90 = 90%)';
COMMENT ON COLUMN proforma_center_service_participation.pdr_covers IS 'Calculated PDR covers: events_per_service × avg_guests_per_event';
COMMENT ON COLUMN proforma_center_service_participation.pdr_revenue IS 'Calculated PDR revenue based on pricing model and realization rate';
