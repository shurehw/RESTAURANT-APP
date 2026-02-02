/**
 * lib/ocr/normalize.ts
 * Normalizes raw OCR JSON into OpsOS invoice schema.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface RawOCRInvoice {
  vendor: string;
  invoiceNumber?: string;
  invoiceDate: string; // ISO or US date
  dueDate?: string;
  paymentTerms?: string;
  totalAmount: number;
  confidence: number;
  deliveryLocation?: {
    name?: string;
    address?: string;
    confidence: number;
  } | null;
  lineItems: Array<{
    itemCode?: string;
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    confidence: number;
  }>;
}

export interface NormalizedInvoice {
  vendorName: string;
  vendorId?: string; // resolved from alias
  venueId?: string; // resolved from delivery location
  venueName?: string; // matched venue name
  invoiceNumber?: string;
  invoiceDate: string; // ISO
  dueDate?: string;
  paymentTerms?: string;
  totalAmount: number;
  ocrConfidence: number;
  lines: Array<{
    itemCode?: string; // vendor's item code (vendor SKU)
    description: string;
    normalizedDescription?: string; // description with variable weights stripped for matching
    qty: number;
    unitCost: number;
    lineTotal: number;
    ocrConfidence: number;
    itemId?: string; // if matched
    vendorItemId?: string; // vendor_items.id if matched
    matchType?: 'exact' | 'fuzzy' | 'none'; // how it was matched
    vendorItemCode?: string; // alias for itemCode (for clarity)
    parsedPack?: { // structured pack info from description
      units_per_pack?: number;
      unit_size?: number;
      unit_size_uom?: string;
      pack_type?: string;
    };
    catch_weight?: number; // actual billed weight
    piece_count?: number; // number of pieces per case
    nominal_case_weight?: number; // expected case weight
    product_specs?: Record<string, any>; // {species, cut, trim, grade, certifications, etc.}
  }>;
  warnings: string[];
}

/**
 * Detects garbled OCR text patterns that indicate OCR misread the text.
 */
function isGarbledOCR(text: string): boolean {
  if (!text) return false;
  const t = text.trim();

  // Multiple consecutive uppercase I's (common OCR error for lowercase l or 1)
  if (/[I]{2,}/.test(t)) return true;

  // Single I surrounded by spaces between words (e.g., "BINGKAI I ST")
  if (/\b[A-Z]+ I [A-Z]+/.test(t)) return true;

  // Excessive all-caps words (4+ consecutive all-caps words of 3+ letters)
  if (/\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b/.test(t)) return true;

  return false;
}

/**
 * Detects junk OCR lines (headers, footers, garbled text) that shouldn't be imported.
 */
function isJunkOCRLine(description: string, unitPrice: number, lineTotal: number): boolean {
  const desc = description.trim();

  // Empty or very short descriptions
  if (desc.length < 3) return true;

  // Zero cost items (likely headers/footers)
  if (unitPrice === 0 && lineTotal === 0) return true;

  // Suspiciously high line totals (likely OCR error)
  if (lineTotal > 100000) return true;

  // Garbled OCR text (prevent garbled text from being ingested)
  if (isGarbledOCR(desc)) return true;

  // Header/footer patterns
  const junkPatterns = [
    /SEND\s+(TO\s+)?IMPORTED/i,
    /ROUTE\s+PRODUCT\s+DESCRIPTION/i,
    /PRODUCT\s+DESCRIPTION/i,
    /PAGE\s+\d+\s+OF\s+\d+/i,
    /TOTAL\s+AMOUNT\s+DUE/i,
    /REMIT\s+TO/i,
    /INVOICE\s+NUMBER/i,
    /BILL\s+TO/i,
    /SHIP\s+TO/i,
    /GROUP\s+TOTAL/i,
    /ORDER\s+SUMMARY/i,
    /UNIT\s+TOTAL\s+UNITS/i,
    /QTY\s+ORDER\s+SPLIT/i,
    /^CUSTOMER\s*#/i,
    /^SALES\s+REPRESENTATIVE/i,
    /^ROUTING\s+STOP/i,
    /^DRIVER\s+NO/i,
    /^TARGET\s+DELIVERY/i,
    /^PRINT\s+JOB/i,
    /^SERVICE\s+CHARGE$/i,
    /^SPECIAL\s+INSTRUCTION/i,
    /^EA\s+CASE\s+(DELIVERED|RETURNED)$/i,
    /^EFFECTIVE\s+\d+/i,
    /^FROZEN$/i,
    /^CANNED\s+&\s+DRY$/i,
  ];

  for (const pattern of junkPatterns) {
    if (pattern.test(desc)) return true;
  }

  // Garbled text patterns
  if (/-\d+L-\d+/.test(desc)) return true;  // Pattern like -31L-2
  if (/^\d{3,}\s+[A-Z]{8,}/.test(desc)) return true;  // Pattern like "800 INITIATIVE"
  if (/^[A-Z]{15,}$/.test(desc)) return true;  // 15+ consecutive caps, no spaces

  // Very long all-caps strings (likely garbled)
  if (/^[A-Z\d\s-]{40,}$/.test(desc)) return true;

  // Contains massive numbers (OCR errors like 380000191)
  if (/\d{8,}/.test(desc)) return true;

  return false;
}

/**
 * Converts a vendor name to proper case with special handling
 */
function toProperCase(name: string): string {
  const lowercase = ['and', 'or', 'the', 'of', 'at', 'by', 'for', 'in', 'on', 'to', 'with'];
  const uppercase = ['llc', 'inc', 'dba', 'usa', 'dfa', 'rndc', 'na', 'co', 'ltd', 'tx', 'mep', 'mfw'];

  const special: { [key: string]: string } = {
    'sysco': 'Sysco',
    'sysco north texas': 'Sysco North Texas',
    'ben e keith': 'Ben E Keith',
    'oak farms-dallas dfa dairy brands': 'Oak Farms-Dallas DFA Dairy Brands',
    'chefs warehouse': "Chef's Warehouse",
    'the chefs warehouse': "The Chef's Warehouse",
    'the chefswarehouse (midwest llc)': "The Chef's Warehouse (Midwest LLC)",
    'republic national distributing company': 'Republic National Distributing Company',
    'dfa dairy brands': 'DFA Dairy Brands',
    'specs': "Spec's",
    'mt greens': 'Mt. Greens',
  };

  const normalized = name.toLowerCase().trim();

  if (special[normalized]) return special[normalized];

  for (const [key, value] of Object.entries(special)) {
    if (normalized.includes(key)) {
      return name.replace(new RegExp(key, 'gi'), value);
    }
  }

  return name
    .split(/(\s+|-|&|\.)/)
    .map((part, index) => {
      if (/^[\s\-&\.]$/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index === 0) {
        return uppercase.includes(lower)
          ? part.toUpperCase()
          : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      if (lowercase.includes(lower)) return lower;
      if (uppercase.includes(lower)) return part.toUpperCase();
      if (part.length === 1 && part === part.toUpperCase()) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

/**
 * Normalizes vendor name to lowercase, removes extra whitespace, punctuation, and legal suffixes.
 * Improved to handle common OCR variations and reduce duplicates.
 */
export function normalizeVendorName(name: string): string {
  let normalized = name
    .toLowerCase()
    .trim();

  // Remove common prefixes
  normalized = normalized.replace(/^(the\s+)/i, '');

  // Standardize common words that appear differently
  normalized = normalized
    .replace(/\bchef'?s?\b/gi, 'chefs') // "Chef's" -> "chefs", "Chefs'" -> "chefs"
    .replace(/\bwarehouse\b/gi, 'warehouse') // Ensure consistent spelling
    .replace(/\brndc\b/gi, 'republic national distributing company') // Expand acronym
    .replace(/\b(dfa|dfr)\s+dairy\s+brands\b/gi, 'dfa dairy brands') // Standardize dairy brands
    .replace(/\b(oak|gaf)\s+farms-dallas\b/gi, 'oak farms dallas'); // Standardize farms

  // Remove ALL punctuation including apostrophes, periods, commas
  normalized = normalized.replace(/[,\.'"()&]/g, '');

  // Remove legal suffixes and extra words
  normalized = normalized
    .replace(/\b(llc|inc|corp|ltd|limited|company|incorporated)\b/gi, '')
    .replace(/\b(dba|d\/b\/a)\s+/gi, '') // Remove "dba" prefix
    .replace(/\s*\([^)]*\)\s*/g, '') // Remove anything in parentheses
    .replace(/\s+-\s+/g, ' ') // Replace " - " with space
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  // Final cleanup
  normalized = normalized
    .replace(/[^a-z0-9\s-]/g, '') // Remove any remaining special chars except hyphens
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Normalizes date from US format (MM/DD/YYYY) or ISO to ISO.
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // US format MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [m, d, y] = dateStr.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Attempt to parse as Date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return dateStr; // Return as-is if cannot parse
}

/**
 * Resolves vendor by normalized name with fuzzy matching.
 * Returns vendor with properly capitalized name.
 */
export async function resolveVendor(
  vendorName: string,
  supabase: SupabaseClient
): Promise<{ id: string; name: string } | null> {
  const normalized = normalizeVendorName(vendorName);

  // Try exact match first
  const { data: exactMatch } = await supabase
    .from('vendors')
    .select('id, name, normalized_name')
    .eq('normalized_name', normalized)
    .eq('is_active', true)
    .maybeSingle();

  if (exactMatch) {
    // Return with proper capitalization
    return {
      id: exactMatch.id,
      name: toProperCase(exactMatch.name),
    };
  }

  // Fuzzy match: check if normalized name contains or is contained by existing vendor
  // This catches cases like "sysco" vs "sysco north texas"
  const { data: allVendors } = await supabase
    .from('vendors')
    .select('id, name, normalized_name')
    .eq('is_active', true);

  if (!allVendors || allVendors.length === 0) return null;

  // Find best match
  const matches = allVendors.filter(vendor => {
    const vendorNorm = vendor.normalized_name.toLowerCase();
    const searchNorm = normalized.toLowerCase();

    // Check if one contains the other (must be at word boundary)
    if (vendorNorm === searchNorm) return true;

    // Split into words for better matching
    const vendorWords = vendorNorm.split(/\s+/);
    const searchWords = searchNorm.split(/\s+/);

    // If all words from shorter name are in longer name, it's a match
    if (vendorWords.length <= searchWords.length) {
      return vendorWords.every((word: string) => searchWords.includes(word));
    } else {
      return searchWords.every((word: string) => vendorWords.includes(word));
    }
  });

  // Return the shortest match (most specific) with proper capitalization
  if (matches.length > 0) {
    matches.sort((a, b) => a.normalized_name.length - b.normalized_name.length);
    return {
      id: matches[0].id,
      name: toProperCase(matches[0].name),
    };
  }

  return null;
}

/**
 * Resolves venue from delivery location name.
 * Matches against venue names (case-insensitive, fuzzy).
 */
async function resolveVenue(
  deliveryLocation: { name?: string; address?: string; confidence: number } | null | undefined,
  supabase: SupabaseClient
): Promise<{ id: string; name: string } | null> {
  if (!deliveryLocation || !deliveryLocation.name) return null;

  const locationName = deliveryLocation.name.toLowerCase().trim();
  if (!locationName) return null;

  // Try exact name match first
  const { data: exactMatch } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', locationName)
    .eq('is_active', true)
    .maybeSingle();

  if (exactMatch) return exactMatch;

  // Try fuzzy match (contains any keyword from venue name)
  const keywords = locationName.split(/\s+/).filter((k) => k.length > 3);
  for (const keyword of keywords) {
    const { data: fuzzyMatch } = await supabase
      .from('venues')
      .select('id, name')
      .ilike('name', `%${keyword}%`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (fuzzyMatch) return fuzzyMatch;
  }

  return null;
}

/**
 * Parses pack configuration from invoice line description.
 * Examples:
 *   "6/750mL" -> {units_per_pack: 6, unit_size: 750, unit_size_uom: "mL", pack_type: "case"}
 *   "1/12 CT" -> {units_per_pack: 12, unit_size: 1, unit_size_uom: "each", pack_type: "case"}
 *   "4/5#"    -> {units_per_pack: 4, unit_size: 5, unit_size_uom: "lb", pack_type: "case"}
 *   "12x750ml" -> {units_per_pack: 12, unit_size: 750, unit_size_uom: "mL", pack_type: "case"}
 */
export function parsePackFromDescription(description: string): {
  units_per_pack?: number;
  unit_size?: number;
  unit_size_uom?: string;
  pack_type?: string;
} | null {
  const desc = description.toUpperCase();
  
  // Normalize UOM casing
  const normalizeUom = (uom: string): string => {
    const lower = uom.toLowerCase();
    if (lower === 'ml' || lower === 'mls') return 'mL';
    if (lower === 'l' || lower === 'lt' || lower === 'ltr' || lower === 'liter') return 'L';
    if (lower === 'oz' || lower === 'fl.oz' || lower === 'floz') return 'oz';
    if (lower === 'lb' || lower === 'lbs' || lower === '#') return 'lb';
    if (lower === 'kg' || lower === 'kgs') return 'kg';
    if (lower === 'g' || lower === 'gm' || lower === 'gms' || lower === 'gram') return 'g';
    if (lower === 'gal' || lower === 'gallon') return 'gal';
    if (lower === 'qt' || lower === 'quart') return 'qt';
    if (lower === 'pt' || lower === 'pint') return 'pt';
    if (lower === 'ct' || lower === 'ea' || lower === 'each' || lower === 'pc' || lower === 'pcs') return 'each';
    return lower;
  };

  // Pattern 1: "NxSIZE" format (e.g., "12x750ml", "6x1L")
  const nxMatch = desc.match(/(\d+)\s*X\s*(\d+\.?\d*)\s*(ML|L|LT|OZ|LB|KG|G|GAL)(?:\s|$|B)/i);
  if (nxMatch) {
    return {
      units_per_pack: parseInt(nxMatch[1]),
      unit_size: parseFloat(nxMatch[2]),
      unit_size_uom: normalizeUom(nxMatch[3]),
      pack_type: 'case',
    };
  }

  // Pattern 2: "N/SIZE" format (e.g., "6/750mL", "4/5#", "1/12 CT")
  const slashMatch = desc.match(/(\d+)\s*\/\s*(\d+\.?\d*)\s*(ML|L|LT|OZ|LB|#|KG|G|GAL|CT|EA|PC)(?:\s|$|B)/i);
  if (slashMatch) {
    const uom = normalizeUom(slashMatch[3]);
    // Handle "1/12 CT" -> 12 each per case
    if (uom === 'each' && parseInt(slashMatch[1]) === 1) {
      return {
        units_per_pack: parseInt(slashMatch[2]),
        unit_size: 1,
        unit_size_uom: 'each',
        pack_type: 'case',
      };
    }
    return {
      units_per_pack: parseInt(slashMatch[1]),
      unit_size: parseFloat(slashMatch[2]),
      unit_size_uom: uom,
      pack_type: 'case',
    };
  }

  // Pattern 3: "N/CS" format (e.g., "6/CS 750ML")
  const csMatch = desc.match(/(\d+)\s*\/\s*CS\s+(\d+\.?\d*)\s*(ML|L|OZ|LB)(?:\s|$)/i);
  if (csMatch) {
    return {
      units_per_pack: parseInt(csMatch[1]),
      unit_size: parseFloat(csMatch[2]),
      unit_size_uom: normalizeUom(csMatch[3]),
      pack_type: 'case',
    };
  }

  // Pattern 4: "SIZE CS" format for single-unit cases (e.g., "28# CS", "750ML")
  const singleMatch = desc.match(/(\d+\.?\d*)\s*(#|LB|OZ|ML|L|KG|G|GAL)\s*(?:CS|CASE)?(?:\s|$)/i);
  if (singleMatch) {
    return {
      units_per_pack: 1,
      unit_size: parseFloat(singleMatch[1]),
      unit_size_uom: normalizeUom(singleMatch[2]),
      pack_type: 'case',
    };
  }

  // Pattern 5: Beverage size only (e.g., "750ml", "1L", "1.75L")
  const beverageMatch = desc.match(/\b(\d+\.?\d*)\s*(ML|L|LT)\b/i);
  if (beverageMatch) {
    return {
      units_per_pack: 1,
      unit_size: parseFloat(beverageMatch[1]),
      unit_size_uom: normalizeUom(beverageMatch[2]),
      pack_type: 'bottle',
    };
  }

  return null;
}

/**
 * Creates a normalized description by stripping variable weights and noise.
 * This is used for consistent matching across invoice lines.
 * 
 * Strips:
 * - Trailing variable weights (e.g., "29.40 LB", "17.26 LB")
 * - Warehouse markers (e.g., "PIH: 2", "Plt#: 10", "Pkg: 50")
 * - Price-per-unit notation (e.g., "/LB", "12.21/LB")
 * - Case notation (e.g., "CS", "BC")
 */
export function createNormalizedDescription(description: string): string {
  return description
    // Remove "Case*" prefix
    .replace(/^case\*?/i, '')
    .replace(/\*+/g, ' ')
    // Remove trailing variable weights like "29.40 LB" or "17.26 LB 16.38 LB"
    .replace(/(\s+\d+\.?\d*\s*(lb|lbs?|#))+\s*$/gi, '')
    // Remove warehouse location codes like "PIH: 2" or "Plt#: 10" or "Pkg: 50"
    .replace(/\s+(pih|plt#?|pkg|plu):?\s*\d+\s*$/gi, '')
    // Remove trailing price-per-unit like "12.21/LB"
    .replace(/\s+\d+\.?\d*\s*\/\s*(lb|lbs?)\s*$/gi, '')
    // Remove trailing "CS" or "BC" (box case)
    .replace(/\s+(cs|bc)\s*$/gi, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Parses product specifications from invoice line description.
 * Example: "USDA BEEF TENDERLOIN PSMO 4 PC 28# CS 29.40 LB"
 * Returns: { catch_weight: 29.40, piece_count: 4, nominal_case_weight: 28,
 *            product_specs: { species: "beef", cut: "tenderloin", trim: "PSMO", grade: "USDA" } }
 */
function parseProductSpecs(description: string): {
  catch_weight?: number;
  piece_count?: number;
  nominal_case_weight?: number;
  product_specs?: Record<string, any>;
} {
  const desc = description.toUpperCase();
  const result: any = {};
  const specs: Record<string, any> = {};

  // Extract catch weight (actual billed weight) - usually at end like "29.40 LB"
  const catchWeightMatch = desc.match(/(\d+\.?\d*)\s*LB(?:\s|$)/i);
  if (catchWeightMatch) {
    result.catch_weight = parseFloat(catchWeightMatch[1]);
  }

  // Extract piece count - patterns like "4 PC", "4PC", "4 PIECE"
  const pieceCountMatch = desc.match(/(\d+)\s*(?:PC|PIECE|EA|EACH)(?:\s|$)/i);
  if (pieceCountMatch) {
    result.piece_count = parseInt(pieceCountMatch[1]);
  }

  // Extract nominal case weight - patterns like "28#", "28# CS", "28LB CS"
  const nominalWeightMatch = desc.match(/(\d+\.?\d*)(?:#|LB)\s*(?:CS|CASE)(?:\s|$)/i);
  if (nominalWeightMatch) {
    result.nominal_case_weight = parseFloat(nominalWeightMatch[1]);
  }

  // Extract species (for proteins/seafood)
  const speciesPatterns = [
    'BEEF', 'PORK', 'CHICKEN', 'TURKEY', 'LAMB', 'DUCK', 'VEAL',
    'SALMON', 'TUNA', 'COD', 'HALIBUT', 'SHRIMP', 'LOBSTER', 'CRAB', 'SCALLOP', 'SEABASS'
  ];
  for (const species of speciesPatterns) {
    if (desc.includes(species)) {
      specs.species = species.toLowerCase();
      break;
    }
  }

  // Extract cut (for proteins)
  const cutPatterns = [
    'TENDERLOIN', 'RIBEYE', 'STRIP', 'SIRLOIN', 'FILET', 'CHUCK', 'BRISKET',
    'SHOULDER', 'LOIN', 'CHOP', 'BELLY', 'BREAST', 'THIGH', 'WING'
  ];
  for (const cut of cutPatterns) {
    if (desc.includes(cut)) {
      specs.cut = cut.toLowerCase();
      break;
    }
  }

  // Extract trim/spec (protein processing specs)
  const trimPatterns = {
    'PSMO': 'Peeled, Silver Skin Off, Side Muscle On',
    'PS': 'Peeled, Silver Skin Off',
    'CHAIN-ON': 'Chain On',
    'CHAIN ON': 'Chain On',
    'CENTER-CUT': 'Center Cut',
    'CENTER CUT': 'Center Cut',
    'BONELESS': 'Boneless',
    'BONE-IN': 'Bone-In'
  };
  for (const [trim, fullName] of Object.entries(trimPatterns)) {
    if (desc.includes(trim)) {
      specs.trim = trim;
      specs.trim_full = fullName;
      break;
    }
  }

  // Extract grade
  const gradePatterns = [
    'PRIME', 'CHOICE', 'SELECT', 'USDA PRIME', 'USDA CHOICE', 'USDA SELECT',
    'AAA', 'AA', 'WAGYU', 'ANGUS', 'CERTIFIED ANGUS BEEF', 'CAB'
  ];
  for (const grade of gradePatterns) {
    if (desc.includes(grade)) {
      specs.grade = grade;
      break;
    }
  }

  // Extract certifications
  const certifications: string[] = [];
  if (desc.includes('USDA')) certifications.push('USDA');
  if (desc.includes('ORGANIC')) certifications.push('Organic');
  if (desc.includes('HALAL')) certifications.push('Halal');
  if (desc.includes('KOSHER')) certifications.push('Kosher');
  if (desc.includes('NON-GMO') || desc.includes('NON GMO')) certifications.push('Non-GMO');
  if (certifications.length > 0) {
    specs.certifications = certifications;
  }

  // Only include product_specs if we found any specs
  if (Object.keys(specs).length > 0) {
    result.product_specs = specs;
  }

  return result;
}

/**
 * Extracts bottle/pack size from a description for size compatibility checking.
 * Returns size in mL for volume, or in lb for weight.
 */
function extractSizeForMatching(text: string): { value: number; type: 'volume' | 'weight' } | null {
  const upper = text.toUpperCase();
  
  // Volume sizes (convert to mL)
  const mlMatch = upper.match(/(\d+\.?\d*)\s*ML\b/);
  if (mlMatch) return { value: parseFloat(mlMatch[1]), type: 'volume' };
  
  const lMatch = upper.match(/(\d+\.?\d*)\s*L(?:T|TR)?\b/);
  if (lMatch) return { value: parseFloat(lMatch[1]) * 1000, type: 'volume' };
  
  const ozMatch = upper.match(/(\d+\.?\d*)\s*(?:FL\.?)?OZ\b/);
  if (ozMatch) return { value: parseFloat(ozMatch[1]) * 29.5735, type: 'volume' };
  
  const galMatch = upper.match(/(\d+\.?\d*)\s*GAL\b/);
  if (galMatch) return { value: parseFloat(galMatch[1]) * 3785.41, type: 'volume' };
  
  // Weight sizes (convert to lb)
  const lbMatch = upper.match(/(\d+\.?\d*)\s*(?:LB|#)\b/);
  if (lbMatch) return { value: parseFloat(lbMatch[1]), type: 'weight' };
  
  const kgMatch = upper.match(/(\d+\.?\d*)\s*KG\b/);
  if (kgMatch) return { value: parseFloat(kgMatch[1]) * 2.20462, type: 'weight' };
  
  return null;
}

/**
 * Checks if two sizes are compatible (within 10% tolerance).
 */
function sizesCompatible(size1: { value: number; type: string } | null, size2: { value: number; type: string } | null): boolean {
  // If either size is missing, don't penalize
  if (!size1 || !size2) return true;
  // Must be same type (volume vs weight)
  if (size1.type !== size2.type) return false;
  // Check within 10% tolerance
  const ratio = size1.value / size2.value;
  return ratio >= 0.9 && ratio <= 1.1;
}

/**
 * Checks for sweet/dry or similar attribute conflicts.
 */
function hasAttributeConflict(desc1: string, desc2: string): boolean {
  const lower1 = desc1.toLowerCase();
  const lower2 = desc2.toLowerCase();
  
  // Sweet vs Dry
  const sweet1 = /\b(sweet|dolce)\b/.test(lower1);
  const dry1 = /\b(dry|sec|brut)\b/.test(lower1);
  const sweet2 = /\b(sweet|dolce)\b/.test(lower2);
  const dry2 = /\b(dry|sec|brut)\b/.test(lower2);
  if ((sweet1 && dry2) || (dry1 && sweet2)) return true;
  
  // Red vs White (wine)
  const red1 = /\b(red|rouge|rosso|tinto)\b/.test(lower1);
  const white1 = /\b(white|blanc|bianco)\b/.test(lower1);
  const red2 = /\b(red|rouge|rosso|tinto)\b/.test(lower2);
  const white2 = /\b(white|blanc|bianco)\b/.test(lower2);
  if ((red1 && white2) || (white1 && red2)) return true;
  
  // Blanco vs Reposado vs Anejo (tequila)
  const blanco1 = /\b(blanco|silver|plata)\b/.test(lower1);
  const repo1 = /\b(reposado|repo)\b/.test(lower1);
  const anejo1 = /\b(anejo|extra anejo)\b/.test(lower1);
  const blanco2 = /\b(blanco|silver|plata)\b/.test(lower2);
  const repo2 = /\b(reposado|repo)\b/.test(lower2);
  const anejo2 = /\b(anejo|extra anejo)\b/.test(lower2);
  if (blanco1 && (repo2 || anejo2)) return true;
  if (repo1 && (blanco2 || anejo2)) return true;
  if (anejo1 && (blanco2 || repo2)) return true;
  
  return false;
}

/**
 * Attempts to match a line item to an item using vendor_items mapping.
 * Enhanced with size compatibility and attribute conflict checks.
 */
async function matchLineItem(
  itemCode: string | undefined,
  description: string,
  vendorId: string | undefined,
  supabase: SupabaseClient
): Promise<{
  itemId: string | null;
  vendorItemId: string | null;
  matchType: 'exact' | 'fuzzy' | 'none';
}> {
  const rawCode = (itemCode || '').trim();
  const normalizedCodes: string[] = [];
  if (rawCode) {
    const noSpaces = rawCode.replace(/\s+/g, '');
    const noDelims = rawCode.replace(/[\s-_/\\.]/g, '');
    const upper = rawCode.toUpperCase();
    const stripLeadingZeros = (s: string) => s.replace(/^0+/, '') || s;

    const candidates = [
      rawCode,
      upper,
      noSpaces,
      noDelims,
      stripLeadingZeros(rawCode),
      stripLeadingZeros(noSpaces),
      stripLeadingZeros(noDelims),
    ];

    for (const c of candidates) {
      const v = c.trim();
      if (v && !normalizedCodes.includes(v)) normalizedCodes.push(v);
    }
  }

  // 1. Try exact match by vendor item code (best match)
  if (rawCode && vendorId) {
    // First try vendor_items (old schema)
    const { data: exactMatch } = await supabase
      .from('vendor_items')
      .select('id, item_id')
      .eq('vendor_id', vendorId)
      .eq('vendor_item_code', rawCode)
      .eq('is_active', true)
      .single();

    if (exactMatch) {
      return {
        itemId: exactMatch.item_id,
        vendorItemId: exactMatch.id,
        matchType: 'exact',
      };
    }

    // Also try vendor_item_aliases (new schema)
    const { data: aliasMatch } = await supabase
      .from('vendor_item_aliases')
      .select('id, item_id')
      .eq('vendor_id', vendorId)
      .eq('vendor_item_code', rawCode)
      .eq('is_active', true)
      .single();

    if (aliasMatch) {
      return {
        itemId: aliasMatch.item_id,
        vendorItemId: aliasMatch.id,
        matchType: 'exact',
      };
    }

    // If we have code variants, attempt vendor-specific lookup via IN and only accept if unambiguous
    if (normalizedCodes.length > 1) {
      const { data: aliasMatches } = await supabase
        .from('vendor_item_aliases')
        .select('id, item_id, vendor_item_code')
        .eq('vendor_id', vendorId)
        .in('vendor_item_code', normalizedCodes)
        .eq('is_active', true);

      const uniqueItemIds = new Set((aliasMatches || []).map((m) => m.item_id));
      if (aliasMatches && aliasMatches.length > 0 && uniqueItemIds.size === 1) {
        // Prefer the exact code match if present
        const exact = aliasMatches.find((m) => m.vendor_item_code === rawCode) || aliasMatches[0];
        return {
          itemId: exact.item_id,
          vendorItemId: exact.id,
          matchType: 'exact',
        };
      }

      const { data: viMatches } = await supabase
        .from('vendor_items')
        .select('id, item_id, vendor_item_code')
        .eq('vendor_id', vendorId)
        .in('vendor_item_code', normalizedCodes)
        .eq('is_active', true);

      const uniqueViItemIds = new Set((viMatches || []).map((m) => m.item_id));
      if (viMatches && viMatches.length > 0 && uniqueViItemIds.size === 1) {
        const exact = viMatches.find((m) => m.vendor_item_code === rawCode) || viMatches[0];
        return {
          itemId: exact.item_id,
          vendorItemId: exact.id,
          matchType: 'exact',
        };
      }
    }
  }

  // 2. Try matching directly to canonical item SKU (global unique)
  if (rawCode) {
    const { data: skuMatches } = await supabase
      .from('items')
      .select('id, sku')
      .in('sku', normalizedCodes.length > 0 ? normalizedCodes : [rawCode])
      .eq('is_active', true);

    if (skuMatches && skuMatches.length === 1) {
      return {
        itemId: skuMatches[0].id,
        vendorItemId: null,
        matchType: 'exact',
      };
    }
  }

  // 3. Try matching to item_pack_configurations.vendor_item_code (often populated from imports)
  if (rawCode) {
    const { data: packMatches } = await supabase
      .from('item_pack_configurations')
      .select('item_id, vendor_item_code')
      .in('vendor_item_code', normalizedCodes.length > 0 ? normalizedCodes : [rawCode]);

    if (packMatches && packMatches.length > 0) {
      const uniqueItemIds = Array.from(new Set(packMatches.map((m) => m.item_id)));
      if (uniqueItemIds.length === 1) {
        return {
          itemId: uniqueItemIds[0],
          vendorItemId: null,
          matchType: 'exact',
        };
      }
    }
  }

  // 4. Try exact match by description in vendor_items (full match only)
  if (vendorId && description) {
    const normalizedDesc = description.toLowerCase().trim();

    const { data: exactDescMatch } = await supabase
      .from('vendor_items')
      .select('id, item_id, vendor_description')
      .eq('vendor_id', vendorId)
      .eq('is_active', true);

    // Only auto-map if exact match (case-insensitive)
    const match = exactDescMatch?.find(
      vi => vi.vendor_description?.toLowerCase().trim() === normalizedDesc
    );

    if (match) {
      return {
        itemId: match.item_id,
        vendorItemId: match.id,
        matchType: 'exact',
      };
    }
  }

  // 5. DO NOT auto-map on fuzzy description matches
  // Fuzzy matching is too unreliable and causes incorrect mappings
  // Instead, return 'none' and let the user review suggestions in the UI

  return {
    itemId: null,
    vendorItemId: null,
    matchType: 'none',
  };
}

/**
 * Normalizes raw OCR output to canonical schema.
 * @param raw - Raw OCR invoice data
 * @param supabase - Supabase client
 * @returns Normalized invoice with warnings
 */
export async function normalizeOCR(
  raw: RawOCRInvoice,
  supabase: SupabaseClient
): Promise<NormalizedInvoice> {
  const warnings: string[] = [];

  // 1. Resolve vendor
  const vendor = await resolveVendor(raw.vendor, supabase);
  if (!vendor) {
    warnings.push(
      `Vendor "${raw.vendor}" not found in master. Manual mapping required.`
    );
  }

  // 2. Resolve venue from delivery location
  const venue = await resolveVenue(raw.deliveryLocation, supabase);
  if (raw.deliveryLocation && !venue) {
    warnings.push(
      `Delivery location "${raw.deliveryLocation.name || 'unknown'}" could not be matched to a venue.`
    );
  }

  // 3. Normalize dates
  const invoiceDate = normalizeDate(raw.invoiceDate);
  const dueDate = raw.dueDate ? normalizeDate(raw.dueDate) : undefined;

  if (!invoiceDate || invoiceDate === raw.invoiceDate) {
    warnings.push(`Could not parse invoice date: "${raw.invoiceDate}"`);
  }

  // 3. Filter and match line items (skip junk OCR and garbled text)
  const garbledLines: string[] = [];
  const validLines = raw.lineItems.filter((line) => {
    const isJunk = isJunkOCRLine(line.description, line.unitPrice, line.lineTotal);
    if (isJunk && isGarbledOCR(line.description)) {
      garbledLines.push(line.description);
    }
    return !isJunk;
  });

  // Track how many lines were filtered
  const filteredCount = raw.lineItems.length - validLines.length;
  if (filteredCount > 0) {
    if (garbledLines.length > 0) {
      warnings.push(`Filtered ${garbledLines.length} garbled OCR line(s): ${garbledLines.slice(0, 3).join(', ')}${garbledLines.length > 3 ? '...' : ''}`);
    }
    const otherFiltered = filteredCount - garbledLines.length;
    if (otherFiltered > 0) {
      warnings.push(`Filtered ${otherFiltered} junk OCR line(s) (headers/footers).`);
    }
  }

  const lines = await Promise.all(
    validLines.map(async (line) => {
      const match = await matchLineItem(
        line.itemCode,
        line.description,
        vendor?.id,
        supabase
      );

      if (match.matchType === 'none') {
        warnings.push(
          `Line "${line.description}" not matched to item catalog.`
        );
      }

      // Parse product specifications from description
      const specs = parseProductSpecs(line.description);
      
      // Parse pack configuration from description
      const parsedPack = parsePackFromDescription(line.description);
      
      // Create normalized description for matching (strips variable weights, etc.)
      const normalizedDescription = createNormalizedDescription(line.description);

      return {
        itemCode: line.itemCode,
        vendorItemCode: line.itemCode, // Pass through for invoice_lines.vendor_item_code
        description: line.description.trim(),
        normalizedDescription, // For consistent matching
        qty: line.qty,
        unitCost: line.unitPrice,
        lineTotal: line.lineTotal,
        ocrConfidence: line.confidence,
        itemId: match.itemId || undefined,
        vendorItemId: match.vendorItemId || undefined,
        matchType: match.matchType,
        // Structured pack info
        parsedPack: parsedPack || undefined,
        // Product specifications (catch weight, piece count, etc.)
        ...specs,
      };
    })
  );

  // 4. Validate total
  const calculatedTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const diff = Math.abs(calculatedTotal - raw.totalAmount);
  if (diff > 0.01) {
    warnings.push(
      `Total mismatch: OCR total $${raw.totalAmount.toFixed(2)} vs calculated $${calculatedTotal.toFixed(2)}`
    );
  }

  return {
    vendorName: vendor ? vendor.name : toProperCase(raw.vendor.trim()),
    vendorId: vendor?.id,
    venueId: venue?.id,
    venueName: venue?.name,
    invoiceNumber: raw.invoiceNumber?.trim(),
    invoiceDate,
    dueDate,
    paymentTerms: raw.paymentTerms?.trim(),
    totalAmount: raw.totalAmount,
    ocrConfidence: raw.confidence,
    lines,
    warnings,
  };
}
