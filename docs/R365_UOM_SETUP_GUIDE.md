# R365 UOM Conversion Setup Guide

## Overview

This guide explains how to configure Unit of Measure (UOM) conversions in Restaurant365 based on your OpSOS item data.

## Key Concepts

### The UOM Hierarchy in R365

```
Purchase UOM (How you buy it)
    ↓
Inventory UOM (How you count it)
    ↓
Recipe UOM (How recipes use it)
```

### The Three Measure Types

All UOMs must map to one of three measure types:

1. **Weight** - lb, oz, kg, g
2. **Volume** - L, mL, oz (fl oz), gal, qt, pt
3. **Each** - ea, count, unit

## Common Conversion Patterns

### Pattern 1: Liquor (Wine/Spirits)

**Example: Grey Goose Vodka**

```
Purchase UOM:  Case (6/750mL)
    ↓ Conversion: 1 case = 6 bottles
Inventory UOM: Bottle (750mL)
    ↓ Conversion: 750mL = 25.36 oz
Recipe UOM:    oz (fluid ounce)
```

**R365 Setup:**
- Measure Type: `Volume`
- Purchase UOM: `Case`
- Pack Size: `6/750mL`
- Inventory UOM: `Bottle` or `mL`
- Recipe UOM: `oz`
- Conversion Factor: `152.16` (one case = 152.16 oz)

### Pattern 2: Beer

**Example: Stella Artois**

```
Purchase UOM:  Case (24/12oz)
    ↓ Conversion: 1 case = 24 cans
Inventory UOM: Can (12oz)
    ↓ Conversion: 12oz = 12 oz
Recipe UOM:    oz (fluid ounce)
```

**R365 Setup:**
- Measure Type: `Volume`
- Purchase UOM: `Case`
- Pack Size: `24/12oz`
- Inventory UOM: `Can` or `oz`
- Recipe UOM: `oz`
- Conversion Factor: `288` (one case = 288 oz)

### Pattern 3: Food Items (Weight)

**Example: Ground Beef**

```
Purchase UOM:  Case (4/5lb)
    ↓ Conversion: 1 case = 20 lb
Inventory UOM: lb (pound)
    ↓ Conversion: 1 lb = 16 oz
Recipe UOM:    oz (ounce)
```

**R365 Setup:**
- Measure Type: `Weight`
- Purchase UOM: `Case`
- Pack Size: `4/5lb`
- Inventory UOM: `lb`
- Recipe UOM: `oz`
- Conversion Factor: `320` (one case = 320 oz)

### Pattern 4: Each/Count Items

**Example: Plates (Smallwares)**

```
Purchase UOM:  Case (100 ea)
    ↓ Conversion: 1 case = 100 plates
Inventory UOM: Each
    ↓ Conversion: 1 ea = 1 ea
Recipe UOM:    Each
```

**R365 Setup:**
- Measure Type: `Each`
- Purchase UOM: `Case`
- Pack Size: `100 ea`
- Inventory UOM: `Each`
- Recipe UOM: `Each`
- Conversion Factor: `100` (one case = 100 each)

## Setting Up Your Items in R365

### Step 1: Verify Measure Type

For each item, confirm the measure type:

```sql
-- Check items by measure type
SELECT
  category,
  r365_measure_type,
  COUNT(*) as item_count
FROM items
WHERE is_active = true
GROUP BY category, r365_measure_type
ORDER BY category;
```

**Expected Measure Types by Category:**
- Wine, Liquor, Beer → `Volume`
- Food (meat, produce, dry goods) → `Weight` (mostly) or `Each`
- Smallwares, Supplies → `Each`

### Step 2: Review Pack Configurations

Your pack configurations define how items can be purchased:

```sql
-- Review pack configurations for a specific item
SELECT
  i.sku,
  i.name,
  i.base_uom as recipe_uom,
  pc.pack_type as purchase_uom,
  pc.display_name as pack_size,
  pc.unit_size_uom as inventory_uom,
  pc.conversion_factor,
  pc.vendor_item_code
FROM items i
JOIN item_pack_configurations pc ON pc.item_id = i.id
WHERE i.sku = 'YOUR-SKU-HERE';
```

### Step 3: Import Purchase Items to R365

Use the generated CSV to import purchase items:

1. Run the guide generator:
   ```bash
   npx tsx scripts/generate-r365-uom-guide.ts
   ```

2. This creates two files:
   - `R365_UOM_CONVERSION_GUIDE.md` - Human-readable reference
   - `R365_PURCHASE_ITEMS.csv` - Import file for R365

3. Import `R365_PURCHASE_ITEMS.csv` into R365:
   - Navigate to: **Inventory → Items → Import**
   - Select "Purchase Items" import type
   - Upload the CSV file
   - Map columns if needed
   - Review and import

## Understanding Conversion Factors

### How Conversion Factors Are Calculated

The conversion factor tells R365: **"How many recipe units are in one purchase unit?"**

**Formula:**
```
Conversion Factor = Units Per Pack × Unit Size × UOM Conversion
```

**Examples:**

1. **Case of 6/750mL wine bottles (recipe UOM = oz)**
   ```
   = 6 bottles × 750 mL × 0.033814 (mL to oz)
   = 152.16 oz per case
   ```

2. **Case of 24/12oz beer cans (recipe UOM = oz)**
   ```
   = 24 cans × 12 oz × 1 (oz to oz)
   = 288 oz per case
   ```

3. **5lb bag of flour (recipe UOM = oz)**
   ```
   = 1 bag × 5 lb × 16 (lb to oz)
   = 80 oz per bag
   ```

### Your Conversion Factors Are Already Calculated!

Good news: The `item_pack_configurations` table automatically calculates conversion factors using the `calculate_pack_conversion_factor()` function.

View them:
```sql
SELECT
  i.name,
  i.base_uom,
  pc.display_name,
  pc.conversion_factor,
  CONCAT(pc.conversion_factor, ' ', i.base_uom, ' per ', pc.pack_type) as explanation
FROM items i
JOIN item_pack_configurations pc ON pc.item_id = i.id
LIMIT 20;
```

## Common Issues & Solutions

### Issue 1: Wrong Measure Type

**Problem:** Item is set to "Each" but should be "Volume"

**Solution:**
```sql
UPDATE items
SET r365_measure_type = 'Volume',
    r365_reporting_uom = 'oz',
    r365_inventory_uom = 'oz'
WHERE category = 'liquor' AND r365_measure_type = 'Each';
```

### Issue 2: Missing Conversion Factor

**Problem:** Pack configuration exists but conversion factor is 0 or NULL

**Solution:** The trigger should auto-calculate, but you can force recalculation:
```sql
-- Force recalculation
UPDATE item_pack_configurations
SET conversion_factor = calculate_pack_conversion_factor(
  units_per_pack,
  unit_size,
  unit_size_uom,
  (SELECT base_uom FROM items WHERE id = item_id)
)
WHERE conversion_factor IS NULL OR conversion_factor = 0;
```

### Issue 3: Multiple Purchase Options

**Problem:** Same item can be purchased as case or bottle

**Solution:** This is correct! Create multiple pack configurations:

```sql
-- Example: Add both case and bottle options
INSERT INTO item_pack_configurations (item_id, pack_type, units_per_pack, unit_size, unit_size_uom)
SELECT
  id,
  'case',
  6,
  750,
  'mL'
FROM items WHERE sku = 'GREYGOOSE-750';

INSERT INTO item_pack_configurations (item_id, pack_type, units_per_pack, unit_size, unit_size_uom)
SELECT
  id,
  'bottle',
  1,
  750,
  'mL'
FROM items WHERE sku = 'GREYGOOSE-750';
```

## Validation Checklist

Before importing to R365, verify:

- [ ] All items have a measure type (Weight/Volume/Each)
- [ ] All items have at least one pack configuration
- [ ] Conversion factors are > 0 for all pack configs
- [ ] Recipe UOM (base_uom) makes sense for the category
- [ ] Inventory UOM matches how you'll count during inventory
- [ ] Purchase UOM matches how vendors sell the item

## Next Steps

1. ✅ Run the UOM guide generator
2. ✅ Review the generated markdown guide
3. ✅ Validate conversion factors spot-check 10-20 items
4. ✅ Import the CSV to R365
5. ✅ Test purchasing and inventory in R365
6. ✅ Verify recipe costing works correctly

## Resources

- [R365 Unit of Measure Conversions](https://docs.restaurant365.com/docs/unit-of-measure-conversions)
- [R365 Unit of Measure](https://docs.restaurant365.com/docs/unit-of-measure)
- [R365 Golden Rules of Operations](https://docs.restaurant365.com/doc/docs/golden-rules-of-operations)

---

**Generated by OpSOS** - Operational Standard Operating System
