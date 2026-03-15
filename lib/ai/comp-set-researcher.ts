/**
 * Comp Set Researcher
 *
 * Fetches competitor menu data and uses AI to fuzzy-match items
 * to internal recipes. Builds price position maps per category.
 *
 * Data sources: manual entry (MVP), with future hooks for
 * delivery platform APIs and web scraping.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getCompSetVenues,
  getCompSetItems,
  upsertCompSetItems,
  updateScrapeStatus,
  updateCompSetItemMatch,
  getUnmatchedCompSetItems,
  getVenuesDueForCompSetScan,
} from '@/lib/database/comp-set';
import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface ScanResult {
  comp_venue_id: string;
  comp_venue_name: string;
  items_found: number;
  items_matched: number;
  price_changes_detected: number;
  status: 'success' | 'failed' | 'no_menu_found';
  error?: string;
}

// ── Main Scan Orchestrator ──────────────────────────────────

/**
 * Scan a single comp set venue: fetch menu, upsert items, AI match.
 */
export async function scanCompSetVenue(
  compVenueId: string
): Promise<ScanResult> {
  const supabase = getServiceClient();

  // Get comp venue details
  const { data: compVenue } = await (supabase as any)
    .from('comp_set_venues')
    .select('*')
    .eq('id', compVenueId)
    .single();

  if (!compVenue) {
    return {
      comp_venue_id: compVenueId,
      comp_venue_name: 'Unknown',
      items_found: 0,
      items_matched: 0,
      price_changes_detected: 0,
      status: 'failed',
      error: 'Comp venue not found',
    };
  }

  try {
    // For now, comp set items are manually entered via API/UI.
    // Future: fetch from delivery platform APIs or web scraping.
    // The scan step here validates existing items and runs AI matching.

    const existingItems = await getCompSetItems(compVenueId);

    if (existingItems.length === 0) {
      await updateScrapeStatus(compVenueId, 'no_menu_found');
      return {
        comp_venue_id: compVenueId,
        comp_venue_name: compVenue.comp_venue_name,
        items_found: 0,
        items_matched: 0,
        price_changes_detected: 0,
        status: 'no_menu_found',
      };
    }

    // Run AI matching on unmatched items
    const unmatchedItems = existingItems.filter((i) => !i.matched_recipe_id);
    let itemsMatched = 0;

    if (unmatchedItems.length > 0) {
      itemsMatched = await fuzzyMatchCompSetItems(
        compVenue.venue_id,
        compVenueId,
        unmatchedItems
      );
    }

    // Count price changes
    const priceChanges = existingItems.filter(
      (i) => i.previous_price != null && i.price !== i.previous_price
    ).length;

    await updateScrapeStatus(compVenueId, 'success');

    return {
      comp_venue_id: compVenueId,
      comp_venue_name: compVenue.comp_venue_name,
      items_found: existingItems.length,
      items_matched: itemsMatched,
      price_changes_detected: priceChanges,
      status: 'success',
    };
  } catch (err: any) {
    console.error(`[CompSetResearcher] Error scanning ${compVenue.comp_venue_name}:`, err);
    await updateScrapeStatus(compVenueId, 'failed');
    return {
      comp_venue_id: compVenueId,
      comp_venue_name: compVenue.comp_venue_name,
      items_found: 0,
      items_matched: 0,
      price_changes_detected: 0,
      status: 'failed',
      error: err.message,
    };
  }
}

/**
 * Scan all comp set venues due for refresh.
 */
export async function scanDueCompSetVenues(
  frequencyDays: number = 14
): Promise<ScanResult[]> {
  const dueVenues = await getVenuesDueForCompSetScan(frequencyDays);
  const results: ScanResult[] = [];

  for (const venue of dueVenues) {
    const result = await scanCompSetVenue(venue.id);
    results.push(result);
  }

  return results;
}

// ── AI Fuzzy Matching ──────────────────────────────────────────

/**
 * Use Claude to match competitor menu items to internal recipes.
 */
async function fuzzyMatchCompSetItems(
  venueId: string,
  compVenueId: string,
  unmatchedItems: any[]
): Promise<number> {
  const supabase = getServiceClient();

  // Get internal recipes for comparison
  const { data: recipes } = await (supabase as any)
    .from('recipes')
    .select('id, name, item_category, menu_price')
    .eq('venue_id', venueId)
    .is('effective_to', null)
    .eq('recipe_type', 'menu_item');

  if (!recipes || recipes.length === 0) return 0;

  // Batch in groups of 20
  let totalMatched = 0;
  const batchSize = 20;

  for (let i = 0; i < unmatchedItems.length; i += batchSize) {
    const batch = unmatchedItems.slice(i, i + batchSize);

    try {
      const anthropic = new Anthropic();
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are a menu matching expert for high-end restaurants. Match competitor menu items to our internal recipes.

COMPETITOR ITEMS (to match):
${batch.map((item: any, idx: number) => `${idx + 1}. "${item.item_name}" [${item.item_category || 'uncategorized'}] $${item.price || '?'}`).join('\n')}

OUR RECIPES (to match against):
${recipes.map((r: any, idx: number) => `${idx + 1}. id="${r.id}" "${r.name}" [${r.item_category || 'uncategorized'}] $${r.menu_price || '?'}`).join('\n')}

Match rules:
- Match items that are the same dish even if names differ ("Pan-seared Branzino" = "Whole Branzino, Lemon Caper")
- Consider: protein, preparation method, category, price similarity
- Only match if genuinely the same or very similar dish (confidence >= 0.6)
- If no match, omit that item from the result

Respond with JSON only:
[
  { "comp_item_index": 1, "recipe_id": "uuid-here", "confidence": 0.85 }
]

Return [] if no matches found.`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const matches = JSON.parse(jsonMatch[0]);

      for (const match of matches) {
        const compItem = batch[match.comp_item_index - 1];
        if (!compItem || match.confidence < 0.6) continue;

        await updateCompSetItemMatch(
          compItem.id,
          match.recipe_id,
          match.confidence
        );
        totalMatched++;
      }
    } catch (err) {
      console.error('[CompSetResearcher] AI matching error:', err);
    }
  }

  return totalMatched;
}

// ── Price Position Analysis ──────────────────────────────────

/**
 * Build a summary of where our prices sit vs the comp set.
 * Returns per-category position (below/at/above median).
 */
export async function buildCategoryPricePosition(
  venueId: string
): Promise<
  Array<{
    category: string;
    our_avg: number;
    comp_avg: number;
    position: 'below' | 'at' | 'above';
    item_count: number;
  }>
> {
  const supabase = getServiceClient();

  // Get matched items with prices
  const { data: matched } = await (supabase as any)
    .from('comp_set_items')
    .select('item_category, price, matched_recipe_id, comp_set_venues!inner(venue_id)')
    .not('matched_recipe_id', 'is', null)
    .not('price', 'is', null)
    .eq('comp_set_venues.venue_id', venueId);

  if (!matched || matched.length === 0) return [];

  // Get our recipes
  const recipeIds = [...new Set(matched.map((m: any) => m.matched_recipe_id))];
  const { data: recipes } = await (supabase as any)
    .from('recipes')
    .select('id, item_category, menu_price')
    .in('id', recipeIds)
    .is('effective_to', null);

  if (!recipes) return [];

  const recipeMap = new Map<string, any>(recipes.map((r: any) => [r.id, r]));

  // Group by category
  const categoryData = new Map<
    string,
    { ourPrices: number[]; compPrices: number[] }
  >();

  for (const item of matched) {
    const recipe = recipeMap.get(item.matched_recipe_id);
    if (!recipe || !recipe.menu_price) continue;

    const category = recipe.item_category || item.item_category || 'uncategorized';
    if (!categoryData.has(category)) {
      categoryData.set(category, { ourPrices: [], compPrices: [] });
    }
    const catData = categoryData.get(category)!;
    catData.ourPrices.push(recipe.menu_price);
    catData.compPrices.push(item.price);
  }

  return Array.from(categoryData.entries()).map(([category, data]) => {
    const ourAvg =
      data.ourPrices.reduce((a, b) => a + b, 0) / data.ourPrices.length;
    const compAvg =
      data.compPrices.reduce((a, b) => a + b, 0) / data.compPrices.length;

    return {
      category,
      our_avg: Math.round(ourAvg * 100) / 100,
      comp_avg: Math.round(compAvg * 100) / 100,
      position:
        ourAvg < compAvg * 0.95
          ? ('below' as const)
          : ourAvg > compAvg * 1.05
            ? ('above' as const)
            : ('at' as const),
      item_count: data.ourPrices.length,
    };
  });
}
