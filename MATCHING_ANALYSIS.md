# Invoice Matching & Item Creation Analysis

## Current State

### Matching Quality
- **76% match rate** - Good, but room for improvement
- **24% unmatched** - These need better matching logic

### Item Creation Quality
- ✅ **100% have Category** - Excellent
- ✅ **100% have UOM** - Excellent
- ⚠️ **30% have GL Account** - **MAJOR ISSUE**
- ⚠️ **30% have Subcategory** - Room for improvement
- ✅ **Pack Configurations** - Being captured for some items

## Key Issues Found

### 1. GL Account Assignment (30% coverage)
**Problem**: 70% of items created without GL accounts
**Examples**:
- Zucchini Squash, Green 1lb - ❌ No GL
- Zaatar 1lb - ❌ No GL
- Yuzu Ponzu 1gal - ❌ No GL

**Root Cause**: GL account dropdown was empty, now fixed

### 2. Matching Failures (24% unmatched)
**Common patterns**:
```
- ECONOMY BUS TUB BLA CK 7" (packaging item - truncated OCR)
- Case*Estrella Jalisco*Lot 5 12OZ (beer - format mismatch)
- Case*Acqua Panna Water*1 Lt 1LT (water - case notation)
- Gyre's Pink London Spirit* 700ML (gin - apostrophe issue)
```

**Root Causes**:
1. **OCR artifacts**: Truncated words ("BLA CK"), asterisks, extra spaces
2. **Case notation**: "Case*Brand*Variant SIZE" format not normalized
3. **Punctuation**: Apostrophes, special chars breaking matches
4. **Pack size confusion**: "1 Lt 1LT" duplicates

### 3. Normalization Gaps
**Issues**:
1. Item names still include pack sizes (e.g., "Zucchini Squash, Green 1lb")
2. OCR truncation ("BLA CK" should be "BLACK")
3. Brand/variant format varies ("Case*Brand*" vs clean names)

## Improvements Needed

### Priority 1: Fix GL Account Assignment
- [x] Fixed dropdown to show all GL accounts
- [ ] Ensure API always returns suggestions
- [ ] Validate GL account is selected before save
- [ ] Add fallback GL account selection logic

### Priority 2: Improve Matching Logic
- [ ] Add pre-processing for "Case*Brand*Variant" format
- [ ] Remove apostrophes and special chars before matching
- [ ] Handle OCR truncation (fuzzy matching)
- [ ] Normalize "Lt/LT/Liter/L" variations
- [ ] Add brand-aware matching (Estrella Jalisco -> Estrella)

### Priority 3: Enhance Normalization
- [ ] Remove pack sizes from item names consistently
- [ ] Fix OCR truncation artifacts
- [ ] Standardize brand/variant format
- [ ] Ensure subcategory is always filled for beverages

### Priority 4: Pack Configuration
- [x] Pack configs being captured
- [ ] Ensure all beverage items have bottle size config
- [ ] Add case/pack conversion for all packaged goods
