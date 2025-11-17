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
  totalAmount: number;
  ocrConfidence: number;
  lines: Array<{
    itemCode?: string; // vendor's item code
    description: string;
    qty: number;
    unitCost: number;
    lineTotal: number;
    ocrConfidence: number;
    itemId?: string; // if matched
    vendorItemId?: string; // vendor_items.id if matched
    matchType?: 'exact' | 'fuzzy' | 'none'; // how it was matched
  }>;
  warnings: string[];
}

/**
 * Normalizes vendor name to lowercase, removes extra whitespace and punctuation.
 */
export function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,\.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
 * Resolves vendor by normalized name.
 */
async function resolveVendor(
  vendorName: string,
  supabase: SupabaseClient
): Promise<{ id: string; name: string } | null> {
  const normalized = normalizeVendorName(vendorName);

  const { data, error } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('normalized_name', normalized)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return data;
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
 * Attempts to match a line item to an item using vendor_items mapping.
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
  // 1. Try exact match by vendor item code (best match)
  if (itemCode && vendorId) {
    const { data: exactMatch } = await supabase
      .from('vendor_items')
      .select('id, item_id')
      .eq('vendor_id', vendorId)
      .eq('vendor_item_code', itemCode)
      .eq('is_active', true)
      .single();

    if (exactMatch) {
      return {
        itemId: exactMatch.item_id,
        vendorItemId: exactMatch.id,
        matchType: 'exact',
      };
    }
  }

  // 2. Try fuzzy match by description in vendor_items
  if (vendorId && description) {
    const { data: fuzzyMatch } = await supabase
      .from('vendor_items')
      .select('id, item_id')
      .eq('vendor_id', vendorId)
      .ilike('vendor_description', `%${description.substring(0, 20)}%`)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (fuzzyMatch) {
      return {
        itemId: fuzzyMatch.item_id,
        vendorItemId: fuzzyMatch.id,
        matchType: 'fuzzy',
      };
    }
  }

  // 3. Try direct item match by description (fallback)
  const keywords = description.toLowerCase().trim().split(/\s+/);
  if (keywords.length > 0) {
    const { data: itemMatch } = await supabase
      .from('items')
      .select('id')
      .ilike('name', `%${keywords[0]}%`)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (itemMatch) {
      return {
        itemId: itemMatch.id,
        vendorItemId: null,
        matchType: 'fuzzy',
      };
    }
  }

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

  // 3. Match line items
  const lines = await Promise.all(
    raw.lineItems.map(async (line) => {
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

      return {
        itemCode: line.itemCode,
        description: line.description.trim(),
        qty: line.qty,
        unitCost: line.unitPrice,
        lineTotal: line.lineTotal,
        ocrConfidence: line.confidence,
        itemId: match.itemId || undefined,
        vendorItemId: match.vendorItemId || undefined,
        matchType: match.matchType,
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
    vendorName: raw.vendor.trim(),
    vendorId: vendor?.id,
    venueId: venue?.id,
    venueName: venue?.name,
    invoiceNumber: raw.invoiceNumber?.trim(),
    invoiceDate,
    dueDate,
    totalAmount: raw.totalAmount,
    ocrConfidence: raw.confidence,
    lines,
    warnings,
  };
}
