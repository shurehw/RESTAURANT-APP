# R365 UOM Conversion Setup - Complete Checklist

## 🎯 Current Status

- ✅ **1,000 items** uploaded to R365
- ✅ All items have pack configurations
- ⚠️  **581 UOM warnings** to fix (mostly measure type mismatches)

## 📋 Step-by-Step Process

### Step 1: Fix UOM Configuration Issues

Run the automated fix script:

```bash
npx tsx scripts/fix-r365-uom-issues.ts
```

This will automatically:
- Set wine/beer/liquor items to `Volume` measure type
- Convert "Each" items with volume/weight packs to proper measure types
- Recalculate all conversion factors
- Fix ~581 warnings

**Alternative:** Run SQL directly (advanced users):
```bash
psql -f scripts/fix-r365-uom-issues.sql
```

---

### Step 2: Validate Fixes

Verify all issues are resolved:

```bash
npx tsx scripts/validate-r365-uom-conversions.ts
```

**Expected result:** 0 errors, 0 warnings (or minimal warnings)

---

### Step 3: Generate Export Files

Create fresh export with corrected UOMs:

```bash
npx tsx scripts/generate-r365-uom-guide.ts
```

**Output files:**
- `R365_UOM_CONVERSION_GUIDE.md` - Human-readable reference (1,000 items)
- `R365_PURCHASE_ITEMS.csv` - Import file for R365

---

### Step 4: Review Guide

Open and review the generated guide:

```bash
code R365_UOM_CONVERSION_GUIDE.md
```

**What to check:**
- ✅ Measure types match category (Wine = Volume, etc.)
- ✅ Conversion factors look reasonable
- ✅ Base UOM makes sense for recipes
- ✅ Pack sizes are formatted correctly (e.g., "6/750mL")

---

### Step 5: Import to R365

#### Option A: Via R365 Web UI (Recommended)

1. Log into Restaurant365
2. Navigate to: **Inventory → Items → Import**
3. Select import type: **"Purchase Items"** or **"Vendor Items"**
4. Upload: `R365_PURCHASE_ITEMS.csv`
5. Map columns (if prompted):
   - SKU → SKU
   - Item Name → Name
   - Purchase UOM → Purchase UOM
   - Pack Size → Pack Size
   - Conversion Factor → Conversion Factor
   - Measure Type → Measure Type
6. Review preview
7. Click **Import**

#### Option B: Via API (Advanced)

If R365 provides an API for bulk imports, use the CSV file format.

---

### Step 6: Verify in R365

After import, spot-check items in R365:

**Test Cases:**

1. **Wine (Volume):**
   - Find: "Grey Goose Vodka" (or similar)
   - Check: Measure Type = Volume
   - Check: Purchase UOM = Case (6/750mL)
   - Check: Inventory UOM = oz or mL
   - Check: Conversion shows correct oz per case

2. **Beer (Volume):**
   - Find: "Stella Artois" (or similar)
   - Check: Measure Type = Volume
   - Check: Purchase UOM = Case (24/12oz)
   - Check: Conversion = 288 oz per case

3. **Food (Weight):**
   - Find: Any meat or produce item
   - Check: Measure Type = Weight
   - Check: Purchase UOM matches (case, bag, box)
   - Check: Conversion to oz or lb is correct

4. **Smallwares (Each):**
   - Find: Plates, cups, etc.
   - Check: Measure Type = Each
   - Check: Purchase UOM = Case
   - Check: Conversion shows count (e.g., 100 ea)

---

## 📚 Understanding R365 UOM System

### The Three Measure Types

| Measure Type | Used For | Base Units |
|--------------|----------|------------|
| **Volume** | Liquids, beverages | oz, mL, L, gal |
| **Weight** | Food, ingredients | oz, lb, kg, g |
| **Each** | Countable items | ea, unit, count |

### UOM Hierarchy

```
┌─────────────────────┐
│   Purchase UOM      │ ← How you BUY it (Case, Keg, Bag)
│   (from vendor)     │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│   Inventory UOM     │ ← How you TRACK it (Bottle, Can, lb)
│   (for counting)    │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│   Recipe UOM        │ ← How RECIPES use it (oz, mL, ea)
│   (base_uom)        │
└─────────────────────┘
```

### Example: Wine Bottle

```
Purchase:   1 Case (6/750mL) = $120
    ↓ Conversion: 1 case = 6 bottles
Inventory:  6 Bottles
    ↓ Conversion: 750mL = 25.36 oz each
Recipe:     152.16 oz total (6 × 25.36)

Cost per oz: $120 ÷ 152.16 oz = $0.79/oz
```

---

## 🔧 Common Issues & Quick Fixes

### Issue 1: "Ambiguous oz" Warning

**Problem:** Base UOM is "oz" but could be weight or volume

**Fix:**
```sql
-- For beverages (volume)
UPDATE items SET base_uom = 'fl oz', r365_measure_type = 'Volume'
WHERE category IN ('beer', 'wine', 'liquor');

-- For food (weight)
UPDATE items SET base_uom = 'oz', r365_measure_type = 'Weight'
WHERE category = 'food';
```

### Issue 2: Conversion Factor is Wrong

**Fix:** Recalculate automatically
```bash
npx tsx scripts/fix-r365-uom-issues.ts
```

### Issue 3: Pack Configuration Missing

**Fix:** Add pack config
```sql
INSERT INTO item_pack_configurations (item_id, pack_type, units_per_pack, unit_size, unit_size_uom)
SELECT id, 'case', 6, 750, 'mL'
FROM items WHERE sku = 'YOUR-SKU';
```

---

## ✅ Final Verification Checklist

Before going live in R365:

- [ ] All 1,000 items have correct measure types
- [ ] Wine/Beer/Liquor = Volume
- [ ] Food items = Weight or Each (as appropriate)
- [ ] Smallwares/Supplies = Each
- [ ] All pack configurations have conversion factors > 0
- [ ] Base UOM matches measure type
- [ ] Spot-checked 20+ items in the guide
- [ ] CSV imported successfully to R365
- [ ] Tested purchasing an item in R365
- [ ] Tested inventory counting in R365
- [ ] Tested recipe costing in R365

---

## 📞 Support Resources

**OpSOS Support:**
- Review the detailed setup guide: `docs/R365_UOM_SETUP_GUIDE.md`
- Check conversion examples in: `R365_UOM_CONVERSION_GUIDE.md`

**R365 Documentation:**
- [Unit of Measure Conversions](https://docs.restaurant365.com/docs/unit-of-measure-conversions)
- [Unit of Measure](https://docs.restaurant365.com/docs/unit-of-measure)
- [Golden Rules of Operations](https://docs.restaurant365.com/doc/docs/golden-rules-of-operations)

---

**Generated:** 2026-02-10
**System:** OpSOS - Operational Standard Operating System
