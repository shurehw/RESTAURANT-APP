-- ============================================================================
-- FIX: Correct closed weekdays for Keys and Poppy
--
-- Keys LA: open Tue(1), Thu(3), Sat(5), Sun(6) → closed Mon(0), Wed(2), Fri(4)
-- Poppy:   open Mon(0), Fri(4), Sat(5)         → closed Tue(1), Wed(2), Thu(3), Sun(6)
-- ============================================================================

UPDATE location_config
SET closed_weekdays = '{0,2,4}', updated_at = NOW()
WHERE venue_id = (SELECT id FROM venues WHERE name ILIKE '%Keys%' LIMIT 1);

UPDATE location_config
SET closed_weekdays = '{1,2,3,6}', updated_at = NOW()
WHERE venue_id = (SELECT id FROM venues WHERE name ILIKE '%Poppy%' LIMIT 1);

SELECT v.name, lc.closed_weekdays
FROM location_config lc
JOIN venues v ON v.id = lc.venue_id
WHERE v.name ILIKE '%Keys%' OR v.name ILIKE '%Poppy%';
