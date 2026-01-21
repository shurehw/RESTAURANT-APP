/**
 * Extract brand/manufacturer from item description
 * Uses common beverage and food brand patterns
 */
export function extractBrand(description: string): string | null {
  const normalized = description.toLowerCase();

  // Common beverage brands
  const beverageBrands = [
    'fee brothers',
    'angostura',
    'patron',
    'casamigos',
    'grey goose',
    'titos',
    'luxardo',
    'aperol',
    'campari',
    'cointreau',
    'grand marnier',
    'st germain',
    'bombay',
    'tanqueray',
    'hendricks',
    'bacardi',
    'captain morgan',
    'don julio',
    'espolon',
    'maker\'s mark',
    'jack daniel\'s',
    'jameson',
    'glenlivet',
    'macallan',
  ];

  // Find matching brand
  for (const brand of beverageBrands) {
    if (normalized.includes(brand)) {
      // Return in proper case
      return brand
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }

  // Try to extract brand from start of description (e.g., "BrandName ProductName")
  const firstWord = description.split(/[\s-/]/)[0];
  if (firstWord && firstWord.length > 2) {
    return firstWord;
  }

  return null;
}
