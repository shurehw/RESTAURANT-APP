-- ============================================================================
-- Enable 5-minute pulse polling for Mistral
-- Toast integration is now fully wired (sales + labor), safe to activate.
-- Service hours: 5 PM – 11 PM PT (fine dining schedule)
-- ============================================================================

UPDATE sales_pace_settings
SET is_active = true
WHERE venue_id = (SELECT id FROM venues WHERE name = 'Mistral')
  AND is_active = false;

SELECT
  v.name AS venue,
  sps.polling_interval_seconds,
  sps.service_start_hour,
  sps.service_end_hour,
  sps.is_active
FROM sales_pace_settings sps
JOIN venues v ON v.id = sps.venue_id
WHERE v.name = 'Mistral';
