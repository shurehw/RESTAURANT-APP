-- Fix fake venue IDs in venue_tipsee_mapping
-- Replace placeholder UUIDs with real venue IDs

-- Get actual venue IDs and update mappings
UPDATE venue_tipsee_mapping vtm
SET venue_id = v.id
FROM venues v
WHERE vtm.tipsee_location_name ILIKE '%' || v.name || '%'
  AND vtm.venue_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  );

-- Show updated mappings
SELECT 
  vtm.venue_id,
  v.name as venue_name,
  vtm.tipsee_location_name,
  vtm.tipsee_location_uuid
FROM venue_tipsee_mapping vtm
JOIN venues v ON v.id = vtm.venue_id
WHERE vtm.is_active = true
ORDER BY v.name;
