/**
 * lib/items/inference.ts
 * Utility functions for inferring item fields (category, subcategory, GL, R365)
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Infers item category from name/description.
 */
export function inferCategory(name: string): string {
  const lower = name.toLowerCase();

  // Wine
  if (/\b(wine|champagne|prosecco|cava|bordeaux|burgundy|montrachet|pinot|chardonnay|cabernet|merlot|sauvignon|riesling|malbec|zinfandel|sangiovese|tempranillo|syrah|shiraz)\b/.test(lower)) {
    return 'wine';
  }

  // Beer
  if (/\b(beer|ale|lager|ipa|stout|pilsner|porter|hefeweizen|kolsch|amber|pale ale|wheat beer|sour|gose)\b/.test(lower)) {
    return 'beer';
  }

  // Liquor/Spirits
  if (/\b(tequila|mezcal|vodka|gin|rum|whiskey|whisky|bourbon|scotch|cognac|brandy|liqueur|amaro|vermouth|aperitivo|aperol|campari|absinthe|schnapps|cordial|triple sec|curacao|chartreuse|benedictine|drambuie|frangelico|kahlua|baileys|sambuca|grappa|ouzo|pisco|sake|soju)\b/.test(lower)) {
    return 'liquor';
  }

  // Non-alcoholic beverages
  if (/\b(soda|juice|water|coffee|tea|lemonade|energy drink|kombucha|sparkling|tonic|ginger beer|club soda|cola|sprite|fanta|red bull|monster|gatorade|na\s|non-?alcoholic|mocktail|lyre|seedlip)\b/.test(lower)) {
    return 'non_alcoholic_beverage';
  }

  // Bar consumables (mixers, garnishes)
  if (/\b(syrup|bitters|grenadine|simple syrup|agave|honey|mixer|garnish|lime|lemon|orange|cherry|olive|cocktail|maraschino|angostura|peychaud)\b/.test(lower)) {
    return 'bar_consumables';
  }

  // Produce
  if (/\b(lettuce|tomato|onion|garlic|pepper|cucumber|carrot|celery|potato|mushroom|herb|basil|cilantro|parsley|mint|arugula|spinach|kale|cabbage|broccoli|cauliflower|asparagus|zucchini|squash|eggplant|avocado|grapefruit|lemon|lime|orange|apple|berry|melon|mango|pineapple|banana|grape|peach|plum|pear|fig|date|watercress|radish|beet|turnip|leek|shallot|scallion|chive)\b/.test(lower)) {
    return 'produce';
  }

  // Meat
  if (/\b(beef|pork|lamb|veal|chicken|turkey|duck|goose|rabbit|venison|bison|wagyu|angus|tenderloin|ribeye|sirloin|strip|filet|chuck|brisket|short rib|bacon|ham|sausage|salami|prosciutto|pancetta|chorizo|ground|patty|burger)\b/.test(lower)) {
    return 'meat';
  }

  // Seafood
  if (/\b(salmon|tuna|cod|halibut|sea bass|seabass|branzino|snapper|trout|tilapia|mahi|swordfish|shrimp|prawn|lobster|crab|scallop|oyster|clam|mussel|calamari|squid|octopus|caviar|roe|anchovy|sardine|mackerel)\b/.test(lower)) {
    return 'seafood';
  }

  // Dairy
  if (/\b(milk|cream|butter|cheese|yogurt|parmesan|mozzarella|cheddar|brie|gouda|gruyere|feta|ricotta|mascarpone|gorgonzola|blue cheese|goat cheese|cream cheese|sour cream|half and half|whipping cream|ice cream|gelato)\b/.test(lower)) {
    return 'dairy';
  }

  // Bakery
  if (/\b(bread|roll|bun|croissant|bagel|muffin|pastry|cake|cookie|brownie|pie|tart|danish|scone|brioche|focaccia|ciabatta|baguette|sourdough|flour|yeast|baking)\b/.test(lower)) {
    return 'bakery';
  }

  // Grocery/Dry goods
  if (/\b(rice|pasta|noodle|grain|cereal|oat|quinoa|couscous|bean|lentil|chickpea|nut|almond|walnut|pecan|pistachio|cashew|peanut|oil|olive oil|evoo|vinegar|sauce|ketchup|mustard|mayo|dressing|salt|pepper|spice|seasoning|sugar|honey|maple|chocolate|vanilla|canned|dried|preserves|jam|jelly)\b/.test(lower)) {
    return 'grocery';
  }

  // Packaging/Supplies
  if (/\b(napkin|towel|foil|wrap|container|box|bag|cup|lid|straw|utensil|plate|bowl|tray|glove|apron|cleaning|sanitizer|soap|detergent)\b/.test(lower)) {
    return 'packaging';
  }

  return 'food'; // Default
}

/**
 * Infers item subcategory from name and category.
 */
export function inferSubcategory(name: string, category: string): string {
  const lower = name.toLowerCase();

  if (category === 'wine') {
    if (/\b(champagne|sparkling|prosecco|cava|cremant|brut)\b/.test(lower)) return 'sparkling';
    if (/\b(cabernet|merlot|pinot noir|syrah|shiraz|malbec|zinfandel|sangiovese|tempranillo|nebbiolo|red blend|bordeaux|burgundy.*rouge)\b/.test(lower)) return 'red';
    if (/\b(chardonnay|sauvignon blanc|pinot grigio|riesling|gewurztraminer|viognier|white blend|burgundy.*blanc|montrachet)\b/.test(lower)) return 'white';
    if (/\b(rose|rosé)\b/.test(lower)) return 'rose';
    if (/\b(port|sherry|madeira|marsala|vermouth)\b/.test(lower)) return 'fortified';
    return 'wine';
  }

  if (category === 'liquor') {
    if (/\b(tequila|mezcal)\b/.test(lower)) return 'tequila';
    if (/\b(vodka)\b/.test(lower)) return 'vodka';
    if (/\b(gin)\b/.test(lower)) return 'gin';
    if (/\b(rum)\b/.test(lower)) return 'rum';
    if (/\b(whiskey|whisky|bourbon|rye)\b/.test(lower)) return 'whiskey';
    if (/\b(scotch)\b/.test(lower)) return 'scotch';
    if (/\b(cognac|brandy|armagnac)\b/.test(lower)) return 'cognac';
    if (/\b(liqueur|amaro|aperitivo|aperol|campari|chartreuse|benedictine|frangelico|kahlua|baileys|sambuca|triple sec|curacao|vermouth|amaretto|limoncello|midori|cointreau|grand marnier)\b/.test(lower)) return 'liqueur';
    return 'spirits';
  }

  if (category === 'beer') {
    if (/\b(ipa|india pale)\b/.test(lower)) return 'ipa';
    if (/\b(lager|pilsner)\b/.test(lower)) return 'lager';
    if (/\b(stout|porter)\b/.test(lower)) return 'stout';
    if (/\b(ale|pale ale|amber)\b/.test(lower)) return 'ale';
    if (/\b(wheat|hefeweizen)\b/.test(lower)) return 'wheat';
    if (/\b(sour|gose)\b/.test(lower)) return 'sour';
    return 'beer';
  }

  if (category === 'non_alcoholic_beverage') {
    if (/\b(soda|cola|sprite|fanta|tonic|ginger)\b/.test(lower)) return 'soda';
    if (/\b(juice|lemonade|limeade)\b/.test(lower)) return 'juice';
    if (/\b(water|sparkling|pellegrino|perrier|evian)\b/.test(lower)) return 'water';
    if (/\b(coffee|espresso)\b/.test(lower)) return 'coffee';
    if (/\b(tea)\b/.test(lower)) return 'tea';
    if (/\b(energy|red bull|monster)\b/.test(lower)) return 'energy';
    return 'na_beverage';
  }

  if (category === 'bar_consumables') {
    if (/\b(syrup|simple|agave|honey|grenadine)\b/.test(lower)) return 'syrup';
    if (/\b(bitters|angostura|peychaud)\b/.test(lower)) return 'bitters';
    if (/\b(mixer|tonic|soda)\b/.test(lower)) return 'mixer';
    if (/\b(garnish|cherry|olive|lime|lemon|orange)\b/.test(lower)) return 'garnish';
    return 'mixer';
  }

  if (category === 'produce') return 'produce';
  if (category === 'meat') return 'meat_protein';
  if (category === 'seafood') return 'seafood';
  if (category === 'dairy') return 'dairy';
  if (category === 'bakery') return 'bakery';
  if (category === 'grocery') return 'dry_goods';
  if (category === 'packaging') return 'supplies';

  return 'dry_goods';
}

/**
 * Infers GL account external code from category and subcategory.
 * Based on h.wood Group GL structure.
 */
export function inferGlExternalCode(category: string, subcategory?: string): string {
  // Food costs
  if (category === 'food' || category === 'grocery') return '5170'; // Food Cost - Dry Goods
  if (category === 'produce') return '5140'; // Food Cost - Produce
  if (category === 'meat') return '5110'; // Food Cost - Meat/Protein
  if (category === 'seafood') return '5120'; // Food Cost - Seafood
  if (category === 'dairy') return '5150'; // Food Cost - Dairy
  if (category === 'bakery') return '5160'; // Food Cost - Bakery

  // Beverage costs
  if (category === 'wine') return '5320'; // Wine Cost
  if (category === 'beer') return '5330'; // Beer Cost
  if (category === 'liquor') return '5310'; // Liquor Cost
  if (category === 'non_alcoholic_beverage') return '5335'; // NA Beverage Cost
  if (category === 'bar_consumables') return '5315'; // Bar Consumables

  // Supplies
  if (category === 'packaging' || category === 'supplies') return '7220'; // Operating Supplies

  return '5100'; // Food Cost - General (default)
}

/**
 * Infers R365 measure type from category.
 */
export function inferR365MeasureType(category: string): 'Each' | 'Weight' | 'Volume' {
  // Weight-based items
  if (['meat', 'seafood', 'produce', 'dairy', 'bakery', 'grocery', 'food'].includes(category)) {
    return 'Weight';
  }
  // Volume-based items (beverages)
  if (['wine', 'beer', 'liquor', 'non_alcoholic_beverage', 'bar_consumables'].includes(category)) {
    return 'Volume';
  }
  return 'Each';
}

/**
 * Gets R365 UOM based on measure type.
 */
export function getR365Uom(measureType: 'Each' | 'Weight' | 'Volume'): string {
  if (measureType === 'Weight') return 'LB';
  if (measureType === 'Volume') return 'L';
  return 'Each';
}

/**
 * Derives R365 cost and inventory accounts from GL external code.
 */
export function deriveR365Accounts(glExternalCode: string): {
  r365_cost_account: string;
  r365_inventory_account: string;
} {
  // Map GL cost codes to R365 accounts
  // Inventory accounts typically follow a pattern (e.g., 1XXX for assets)
  const inventoryMap: Record<string, string> = {
    '5100': '1400', // Food Inventory
    '5110': '1410', // Meat Inventory
    '5120': '1420', // Seafood Inventory
    '5140': '1440', // Produce Inventory
    '5150': '1450', // Dairy Inventory
    '5160': '1460', // Bakery Inventory
    '5170': '1470', // Dry Goods Inventory
    '5310': '1510', // Liquor Inventory
    '5315': '1515', // Bar Consumables Inventory
    '5320': '1520', // Wine Inventory
    '5330': '1530', // Beer Inventory
    '5335': '1535', // NA Beverage Inventory
    '7220': '1700', // Supplies Inventory
  };

  return {
    r365_cost_account: glExternalCode,
    r365_inventory_account: inventoryMap[glExternalCode] || '1400',
  };
}

/**
 * Infers item type (food vs beverage) from category.
 */
export function inferItemType(category: string): 'food' | 'beverage' {
  const beverages = new Set(['wine', 'beer', 'liquor', 'spirits', 'liqueur', 'non_alcoholic_beverage', 'bar_consumables']);
  return beverages.has(category) ? 'beverage' : 'food';
}

/**
 * Looks up GL account ID from external code.
 */
export async function getGlAccountId(
  supabase: SupabaseClient,
  orgId: string,
  externalCode: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('gl_accounts')
    .select('id')
    .eq('org_id', orgId)
    .eq('external_code', externalCode)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}

/**
 * Generates a default pack configuration from item name.
 */
export function inferPackConfigFromName(name: string): {
  pack_type: string;
  units_per_pack: number;
  unit_size: number;
  unit_size_uom: string;
} | null {
  const upper = name.toUpperCase();

  // Pattern 1: "NxSIZE" format (e.g., "12x750ml")
  const nxMatch = upper.match(/(\d+)\s*X\s*(\d+\.?\d*)\s*(ML|L|OZ|LB|KG|G|GAL)/i);
  if (nxMatch) {
    return {
      pack_type: 'case',
      units_per_pack: parseInt(nxMatch[1]),
      unit_size: parseFloat(nxMatch[2]),
      unit_size_uom: normalizeUomForPack(nxMatch[3]),
    };
  }

  // Pattern 2: "N/SIZE" format (e.g., "6/750mL", "(6/750ml)")
  const slashMatch = upper.match(/\(?(\d+)\s*\/\s*(\d+\.?\d*)\s*(ML|L|OZ|LB|#|KG|G|GAL)\)?/i);
  if (slashMatch) {
    return {
      pack_type: 'case',
      units_per_pack: parseInt(slashMatch[1]),
      unit_size: parseFloat(slashMatch[2]),
      unit_size_uom: normalizeUomForPack(slashMatch[3]),
    };
  }

  // Pattern 3: Single bottle size (e.g., "750ml", "1L", "1.75L")
  const bottleMatch = upper.match(/\b(\d+\.?\d*)\s*(ML|L|LT)\b/i);
  if (bottleMatch) {
    return {
      pack_type: 'bottle',
      units_per_pack: 1,
      unit_size: parseFloat(bottleMatch[1]),
      unit_size_uom: normalizeUomForPack(bottleMatch[2]),
    };
  }

  // Pattern 4: Weight-based (e.g., "5lb", "2kg")
  const weightMatch = upper.match(/\b(\d+\.?\d*)\s*(LB|#|KG|OZ|G)\b/i);
  if (weightMatch) {
    return {
      pack_type: 'bag',
      units_per_pack: 1,
      unit_size: parseFloat(weightMatch[1]),
      unit_size_uom: normalizeUomForPack(weightMatch[2]),
    };
  }

  return null;
}

function normalizeUomForPack(uom: string): string {
  const lower = uom.toLowerCase();
  if (lower === 'ml' || lower === 'mls') return 'mL';
  if (lower === 'l' || lower === 'lt' || lower === 'ltr') return 'L';
  if (lower === 'oz' || lower === 'fl.oz') return 'oz';
  if (lower === 'lb' || lower === 'lbs' || lower === '#') return 'lb';
  if (lower === 'kg' || lower === 'kgs') return 'kg';
  if (lower === 'g' || lower === 'gm') return 'g';
  if (lower === 'gal') return 'gal';
  return lower;
}
