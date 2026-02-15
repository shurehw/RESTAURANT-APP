-- Fix R365 UOM Configuration Issues
-- Run this SQL to correct common UOM problems

-- ============================================================================
-- FIX 1: Set beverages to Volume measure type
-- ============================================================================

-- Wine items should be Volume
UPDATE items
SET r365_measure_type = 'Volume',
    r365_reporting_uom = 'oz',
    r365_inventory_uom = 'oz',
    updated_at = NOW()
WHERE category = 'wine'
  AND r365_measure_type != 'Volume'
  AND is_active = true;

-- Beer items should be Volume
UPDATE items
SET r365_measure_type = 'Volume',
    r365_reporting_uom = 'oz',
    r365_inventory_uom = 'oz',
    updated_at = NOW()
WHERE category = 'beer'
  AND r365_measure_type != 'Volume'
  AND is_active = true;

-- Liquor/spirits items should be Volume
UPDATE items
SET r365_measure_type = 'Volume',
    r365_reporting_uom = 'oz',
    r365_inventory_uom = 'oz',
    updated_at = NOW()
WHERE category IN ('liquor', 'spirits')
  AND r365_measure_type != 'Volume'
  AND is_active = true;

-- ============================================================================
-- FIX 2: Correct base UOM for true "Each" items
-- ============================================================================

-- Items that are truly countable (bakery, smallwares, etc.)
-- Should have base_uom = 'ea' when measure type is 'Each'
UPDATE items
SET base_uom = 'ea',
    updated_at = NOW()
WHERE r365_measure_type = 'Each'
  AND base_uom NOT IN ('ea', 'each', 'unit')
  AND category IN ('bakery', 'smallwares', 'supplies', 'disposables', 'paper_goods')
  AND is_active = true;

-- ============================================================================
-- FIX 3: Convert items incorrectly marked as "Each" to proper measure type
-- ============================================================================

-- If an item is marked "Each" but has volume-based pack configs (mL, L, oz fluid)
-- Change to Volume
UPDATE items i
SET r365_measure_type = 'Volume',
    r365_reporting_uom = 'oz',
    r365_inventory_uom = 'oz',
    updated_at = NOW()
WHERE i.r365_measure_type = 'Each'
  AND i.is_active = true
  AND EXISTS (
    SELECT 1
    FROM item_pack_configurations pc
    WHERE pc.item_id = i.id
      AND pc.unit_size_uom IN ('mL', 'L', 'oz', 'gal', 'qt', 'pt', 'fl oz')
  );

-- If an item is marked "Each" but has weight-based pack configs (lb, kg, g)
-- Change to Weight
UPDATE items i
SET r365_measure_type = 'Weight',
    r365_reporting_uom = 'oz',
    r365_inventory_uom = 'lb',
    updated_at = NOW()
WHERE i.r365_measure_type = 'Each'
  AND i.is_active = true
  AND EXISTS (
    SELECT 1
    FROM item_pack_configurations pc
    WHERE pc.item_id = i.id
      AND pc.unit_size_uom IN ('lb', 'kg', 'g', 'oz')
  );

-- ============================================================================
-- FIX 4: Update base UOM to match new measure type
-- ============================================================================

-- Volume items should have volume-based base UOM
UPDATE items
SET base_uom = CASE
    WHEN base_uom IN ('ea', 'each', 'unit') THEN 'oz'  -- Convert "each" to "oz" for volume
    ELSE base_uom  -- Keep existing if already volume-based
  END,
  updated_at = NOW()
WHERE r365_measure_type = 'Volume'
  AND base_uom IN ('ea', 'each', 'unit')
  AND is_active = true;

-- Weight items should have weight-based base UOM
UPDATE items
SET base_uom = CASE
    WHEN base_uom IN ('ea', 'each', 'unit') THEN 'oz'  -- Convert "each" to "oz" for weight
    ELSE base_uom  -- Keep existing if already weight-based
  END,
  updated_at = NOW()
WHERE r365_measure_type = 'Weight'
  AND base_uom IN ('ea', 'each', 'unit')
  AND is_active = true;

-- ============================================================================
-- FIX 5: Recalculate conversion factors after UOM changes
-- ============================================================================

-- Force recalculation of all conversion factors
-- The trigger will automatically use the new base_uom
UPDATE item_pack_configurations pc
SET conversion_factor = calculate_pack_conversion_factor(
    pc.units_per_pack,
    pc.unit_size,
    pc.unit_size_uom,
    (SELECT base_uom FROM items WHERE id = pc.item_id)
  ),
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM items i
  WHERE i.id = pc.item_id
    AND i.is_active = true
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check how many items were updated
SELECT
  'Wine items fixed' as description,
  COUNT(*) as count
FROM items
WHERE category = 'wine' AND r365_measure_type = 'Volume' AND is_active = true

UNION ALL

SELECT
  'Beer items fixed',
  COUNT(*)
FROM items
WHERE category = 'beer' AND r365_measure_type = 'Volume' AND is_active = true

UNION ALL

SELECT
  'Liquor items fixed',
  COUNT(*)
FROM items
WHERE category IN ('liquor', 'spirits') AND r365_measure_type = 'Volume' AND is_active = true

UNION ALL

SELECT
  'Each items with correct base UOM',
  COUNT(*)
FROM items
WHERE r365_measure_type = 'Each' AND base_uom IN ('ea', 'each', 'unit') AND is_active = true

UNION ALL

SELECT
  'Items still needing review',
  COUNT(*)
FROM items
WHERE r365_measure_type = 'Each'
  AND base_uom NOT IN ('ea', 'each', 'unit')
  AND is_active = true;

-- ============================================================================
-- SUMMARY: What changed
-- ============================================================================

SELECT
  r365_measure_type as measure_type,
  category,
  COUNT(*) as item_count,
  COUNT(DISTINCT base_uom) as unique_base_uoms,
  STRING_AGG(DISTINCT base_uom, ', ') as base_uoms_used
FROM items
WHERE is_active = true
GROUP BY r365_measure_type, category
ORDER BY r365_measure_type, category;
