-- Rename "Keys Los Angeles" to just "Keys"
UPDATE venues SET name = 'Keys' WHERE name = 'Keys Los Angeles';

-- Enroll Delilah Dallas in sales pace monitoring (Simphony POS — live data available)
INSERT INTO sales_pace_settings (venue_id, polling_interval_seconds, service_start_hour, service_end_hour, is_active)
SELECT id, 300, 11, 3, TRUE
FROM venues
WHERE name ILIKE '%Delilah%Dallas%'
ON CONFLICT (venue_id) DO NOTHING;
