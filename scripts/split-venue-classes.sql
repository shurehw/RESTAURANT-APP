-- ============================================================================
-- SPLIT: Nice Guy stays high_end_social, Delilahs become supper_club
-- Based on holiday performance analysis showing very different demand regimes
-- ============================================================================

-- 1. Add new venue_class enum value
ALTER TYPE venue_class ADD VALUE IF NOT EXISTS 'supper_club';

-- 2. Update Delilah venues to supper_club
UPDATE venues SET venue_class = 'supper_club' WHERE name ILIKE '%delilah%';

-- 3. Create holiday adjustments for supper_club (based on Delilah data)
--    NYE: massively under-predicted (pred 178 vs actual 447) → +200 (conservative)
--    BLACK_FRIDAY: over-predicted (pred 448 vs actual 380) → -50
INSERT INTO holiday_adjustments (holiday_code, venue_class, covers_offset, notes)
VALUES
  ('NYE',            'supper_club', 200, 'Delilah NYE massive - pred 178 actual 447'),
  ('NYD',            'supper_club', -30, 'Post-NYE drop expected'),
  ('VALENTINES',     'supper_club',  80, 'Supper club + Valentine = huge night'),
  ('BLACK_FRIDAY',   'supper_club', -50, 'Over-predicted: pred 448 actual 380'),
  ('THANKSGIVING',   'supper_club', -30, 'Lower demand'),
  ('CHRISTMAS',      'supper_club', -40, 'Closed or very low'),
  ('JULY_4TH',       'supper_club', -20, 'People travel'),
  ('LABOR_DAY',      'supper_club', -10, 'Slightly lower'),
  ('MEMORIAL_DAY',   'supper_club', -10, 'Slightly lower'),
  ('MLK_DAY',        'supper_club',   0, 'Normal'),
  ('PRESIDENTS_DAY', 'supper_club',   0, 'Normal')
ON CONFLICT (holiday_code, venue_class) DO UPDATE SET
  covers_offset = EXCLUDED.covers_offset,
  notes = EXCLUDED.notes;

-- 4. Verify
SELECT name, venue_class FROM venues ORDER BY name;

SELECT holiday_code, venue_class, covers_offset, notes
FROM holiday_adjustments
WHERE venue_class IN ('high_end_social', 'supper_club')
ORDER BY venue_class, holiday_code;
