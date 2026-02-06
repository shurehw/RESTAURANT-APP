-- ============================================================================
-- OFFSET TUNING - Based on per-day-type accuracy analysis (2026-02-06)
-- ============================================================================

-- 1. Keys Saturday: +27 → +15 (overcorrecting, halve it)
UPDATE forecast_bias_adjustments
SET day_type_offsets = jsonb_set(day_type_offsets, '{saturday}', '15'::jsonb)
WHERE venue_id = (SELECT id FROM venues WHERE name ILIKE '%keys%' LIMIT 1)
  AND effective_to IS NULL;

-- 2. Bird Streets Saturday: +11 → +5 (overcorrecting)
UPDATE forecast_bias_adjustments
SET day_type_offsets = jsonb_set(day_type_offsets, '{saturday}', '5'::jsonb)
WHERE venue_id = (SELECT id FROM venues WHERE name ILIKE '%bird%' LIMIT 1)
  AND effective_to IS NULL;

-- 3. Bird Streets Sunday: +4 → 0 (adding variance, not helping)
UPDATE forecast_bias_adjustments
SET day_type_offsets = jsonb_set(day_type_offsets, '{sunday}', '0'::jsonb)
WHERE venue_id = (SELECT id FROM venues WHERE name ILIKE '%bird%' LIMIT 1)
  AND effective_to IS NULL;

-- 4. Nice Guy holidays: add holiday adjustment for high_end_social
--    avg_bias = -21.3 means under-predicting by 21 on holidays
--    Use conservative +15 (not full 21) to avoid overcorrection
INSERT INTO holiday_adjustments (holiday_code, venue_class, covers_offset, notes)
VALUES
  ('NYE', 'high_end_social', 30, 'High demand NYE'),
  ('NYD', 'high_end_social', 10, 'Post-NYE moderate'),
  ('VALENTINES', 'high_end_social', 20, 'Big social dining holiday'),
  ('JULY_4TH', 'high_end_social', -10, 'Lower demand - people travel'),
  ('THANKSGIVING', 'high_end_social', -15, 'Closed or very low'),
  ('CHRISTMAS', 'high_end_social', -20, 'Closed or very low'),
  ('BLACK_FRIDAY', 'high_end_social', 5, 'Slight bump'),
  ('LABOR_DAY', 'high_end_social', -5, 'Slightly lower'),
  ('MEMORIAL_DAY', 'high_end_social', -5, 'Slightly lower'),
  ('MLK_DAY', 'high_end_social', 0, 'Normal'),
  ('PRESIDENTS_DAY', 'high_end_social', 0, 'Normal')
ON CONFLICT (holiday_code, venue_class) DO UPDATE SET
  covers_offset = EXCLUDED.covers_offset,
  notes = EXCLUDED.notes;

-- Verify changes
SELECT v.name, ba.day_type_offsets
FROM forecast_bias_adjustments ba
JOIN venues v ON v.id = ba.venue_id
WHERE ba.effective_to IS NULL
ORDER BY v.name;

SELECT holiday_code, venue_class, covers_offset, notes
FROM holiday_adjustments
WHERE venue_class = 'high_end_social'
ORDER BY holiday_code;
