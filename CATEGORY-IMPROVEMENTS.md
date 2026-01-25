# Category & GL Suggestion Improvements

## Summary
Enhanced the AI-powered category, subcategory, and GL account suggestions for new items created from invoice lines.

## Changes Made

### 1. Category Detection (`/api/items/suggest-gl`)

#### **Liquor/Spirits** (9 subcategories)
- **Tequila**: Don Julio, Patron, Casamigos, Herradura, Espolon, Clase Azul, Reposado, Añejo
- **Vodka**: Grey Goose, Titos, Belvedere, Absolut, Ketel One, Ciroc
- **Bourbon**: Makers Mark, Buffalo Trace, Woodford
- **Scotch**: Glenfiddich, Glenlivet, Macallan, Johnnie Walker
- **Irish Whiskey**: Jameson
- **Rye Whiskey**: Rye
- **Gin**: Tanqueray, Hendricks, Bombay
- **Rum**: Bacardi, Captain Morgan, Kraken, Goslings
- **Cognac/Brandy**: Hennessy, Remy Martin, Courvoisier
- **Bitters/Aperitifs**: Angostura, Aperol, Campari, Amaro, Fernet, Chartreuse, Peychaud
- **Vermouth**: Dolin, Carpano, Noilly Prat
- **Liqueur**: Amaretto, Kahlua, Baileys, Frangelico, St Germain, Cointreau, Grand Marnier

#### **Wine** (4 subcategories + default)
- **Red Wine**: Cabernet, Merlot, Pinot Noir, Zinfandel, Syrah, Shiraz, Malbec, Chianti, Rioja
- **White Wine**: Chardonnay, Sauvignon Blanc, Pinot Grigio, Pinot Gris, Riesling, Moscato
- **Sparkling Wine**: Champagne, Prosecco, Cava, Brut
- **Rosé**: Rose, Pink
- **Default**: Red Wine (if wine detected but subtype unclear)

#### **Beer** (5 subcategories + default)
- **IPA**: IPA keyword
- **Lager**: Lager, Pilsner, Bud Light, Coors, Stella, Corona, Heineken, Modelo
- **Stout**: Stout keyword
- **Porter**: Porter keyword
- **Ale**: Ale (whole word match to avoid "RoyALE" false positive)
- **Default**: Lager (for generic light beers)

#### **Non-Alcoholic Beverages** (NEW - 6 subcategories)
- **Soda**: Coca Cola, Coke, Pepsi, Sprite, Fanta, Dr Pepper, Tonic, Ginger Ale, Club Soda, Seltzer
- **Juice**: Orange Juice, Cranberry, Pineapple Juice, Grapefruit Juice
- **Coffee**: Coffee, Espresso, Latte, Cappuccino
- **Tea**: Tea (excluding "tequila")
- **Water**: Perrier, Pellegrino, Evian, Acqua Panna
- **Energy Drink**: Red Bull, Monster

#### **Food Categories** (Enhanced subcategories)
- **Meat**: Beef/Steak, Pork, Chicken/Poultry, Lamb, Duck
- **Seafood**: Salmon, Tuna, Shrimp, Lobster
- **Produce**: Vegetables, Fruit, Lettuce, Tomato, Onion
- **Dairy**: Cheese, Milk, Cream, Butter, Yogurt
- **Dry Goods**: Bread, Baguette, Roll, Bun, Croissant

#### **Supplies**
- **Packaging**: Box, Bag, Container, Wrap
- **Disposables**: Cup, Plate, Utensil, Napkin, Straw
- **Cleaning**: Sanitizer, Detergent, Bleach

### 2. GL Account Matching (Enhanced Scoring)

**High Confidence (15 points):**
- Exact category match in GL name (wine→"Wine", liquor→"Liquor", beer→"Beer")
- Specific food categories (meat→"Meat"/"Protein", seafood→"Seafood"/"Fish", produce→"Produce", dairy→"Dairy")

**Medium Confidence (8-10 points):**
- Broader category match (liquor→"Beverage", meat→"Food")
- Non-alcoholic beverages→"Beverage"

**Section Boost (+5 points):**
- COGS section for all food/beverage items
- Opex section for supplies

**Confidence Levels:**
- `high`: Score ≥ 15 (exact match)
- `medium`: Score ≥ 8 (category match)
- `low`: Score < 8 (default/fallback)

## Testing Results

**Category Detection Test:** 95% accuracy (21/22 passed)

Sample successful detections:
- ✅ Don Julio Reposado Tequila → liquor/Tequila
- ✅ Grey Goose Vodka → liquor/Vodka
- ✅ Cabernet Sauvignon → wine/Red Wine
- ✅ Stella Artois Lager → beer/Lager
- ✅ Red Bull → non_alcoholic_beverage/Energy Drink
- ✅ Beef Tenderloin → meat/Beef
- ✅ Atlantic Salmon → seafood/Salmon

## Impact

**Before:**
- Many beverages defaulted to "food" category
- Missing subcategories for most items
- Generic GL account suggestions

**After:**
- 95%+ accurate category detection
- All beverages have specific subcategories
- GL suggestions match item types with high confidence
- Covers 100+ brand names and product types

## Files Modified
- `/app/api/items/suggest-gl/route.ts` - Enhanced category detection and GL scoring
- `/scripts/test-category-suggestions.ts` - Test suite for verification
