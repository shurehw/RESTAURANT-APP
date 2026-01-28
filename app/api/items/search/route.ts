import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  return guard(async () => {
    const supabase = await createClient();

    // Get user's organization
    const cookieStore = await cookies();
    // Prefer Supabase session user; fallback to legacy `user_id` cookie
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userIdCookie = cookieStore.get('user_id')?.value || null;
    const userId = user?.id || userIdCookie;

    if (!userId) {
      return NextResponse.json({ items: [], recipes: [] });
    }

    // Use admin client to bypass RLS and filter by organization
    const adminClient = createAdminClient();

    const { data: orgUsers } = await adminClient
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    const orgId = orgUsers?.[0]?.organization_id;

    if (!orgId) {
      return NextResponse.json({ items: [], recipes: [] });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim();
    const vendorId = searchParams.get('vendor_id');
    const includeRecipes = searchParams.get('include_recipes') === 'true';
    const limit = Math.min(Number(searchParams.get('limit')) || 10, 50);

    // Require minimum 2 characters for search
    if (!query || query.length < 2) {
      return NextResponse.json({ items: [], recipes: [] });
    }

    // Normalize search query: remove special chars, extra spaces, redundant words
    // OCR often adds *, -, etc. and category/origin words that won't match database items
    let normalizedQuery = query
      // Step 1: Handle "Case*Brand*Variant" format from OCR
      .replace(/^case\*([^*]+)\*/gi, '$1 ')  // "Case*Brand*Variant" -> "Brand Variant"
      .replace(/\*+/g, ' ')  // Remove remaining asterisks

      // Step 2: Remove special chars and punctuation
      .replace(/['\-_\/\\|]/g, ' ')  // Replace special chars with spaces (including apostrophes)
      .replace(/\d+[°']/g, ' ')  // Remove proof/ABV ratings (80', 90°, etc.)

      // Step 3: Remove pack notation and size info
      .replace(/\b\d+yr\b/gi, ' ')  // Remove age statements (12yr, 18yr, etc.)
      .replace(/\bmalt\b/gi, ' ')  // Remove generic "malt" word
      .replace(/\bcase\b/gi, ' ')  // Remove "case" word
      .replace(/\bloose\b/gi, ' ')  // Remove "loose" word
      .replace(/\b\d+pk\b/gi, ' ')  // Remove pack counts (24pk, 6pk, etc.)
      .replace(/\b\d+\s*(oz|ml|lt|l|gal)\b/gi, ' ')  // Remove size info (12oz, 750ml, 1lt, etc.)
      .replace(/\b\d+\s*$/g, ' ')  // Remove trailing numbers
      .replace(/\b6\/cs\b/gi, ' ')  // Remove pack notation

      // Step 4: Remove category words
      .replace(/\b(tequila|vodka|whiskey|whisky|gin|rum|bourbon|scotch|cognac|brandy|liqueur|wine|beer|champagne|mezcal|spirit|ale|ipa|lager|stout)\b/gi, ' ')
      .replace(/\b(water|juice|syrup|soda)\b/gi, ' ')  // Beverage descriptors

      // Step 5: Remove origin/descriptor words
      .replace(/\b(japanese|french|scottish|american|mexican|irish|canadian|london)\b/gi, ' ')
      .replace(/\b(fresh|organic|natural|pure|premium)\b/gi, ' ')

      // Step 6: Fix OCR truncation and artifacts
      .replace(/\b(wh|whis|whisk)\b/gi, 'whiskey')  // Expand truncated whiskey
      .replace(/\b(el0|elo)\b/gi, 'oro')  // Fix OCR artifacts (El0 -> Oro)
      .replace(/\b(bla\s*ck|blac\s*k)\b/gi, 'black')  // Fix truncated "black"
      .replace(/\b(vermou)\b/gi, 'vermouth')  // Fix truncated vermouth
      .replace(/\b(pellegrino|pelligrino)\b/gi, 'san pellegrino')  // Normalize San Pellegrino

      // Step 7: Normalize size abbreviations
      .replace(/\b(lt|ltr|liter)\b/gi, 'l')  // Normalize liter variations to "l"

      // Step 8: Clean up
      .replace(/\s+/g, ' ')  // Collapse multiple spaces
      .trim();

    // Normalize Spanish/English equivalents for better matching
    normalizedQuery = normalizedQuery
      .replace(/\bfamily\b/gi, 'familia')  // Family -> Familia (Cuervo)
      .replace(/\breserva\b/gi, 'reposado') // Reserva -> Reposado (tequila aging terms)
      .replace(/\baperitivo\b/gi, 'apertivo') // Aperitivo -> Apertivo (Nonino)

    // Fix truncated words (OCR cuts off end of line)
    normalizedQuery = normalizedQuery
      .replace(/\bliqueu\b/gi, 'liqueur')  // Truncated liqueur
      .replace(/\bbergamett\b/gi, 'bergamotto') // Truncated bergamotto
      .replace(/\bvermou\b/gi, 'vermouth') // Truncated vermouth
      .replace(/\bchampag\b/gi, 'champagne') // Truncated champagne
      .replace(/\breposad\b/gi, 'reposado') // Truncated reposado

    // Normalize word order for common brands (search both ways)
    const wordOrderFixes: Record<string, string> = {
      'nonino amaro': 'amaro nonino',
      'mr black': 'mr. black',
      'st germain': 'st. germain',
      'noilly pratt': 'noilly prat',
    };

    const lowerQuery = normalizedQuery.toLowerCase();
    for (const [variant, canonical] of Object.entries(wordOrderFixes)) {
      if (lowerQuery.includes(variant)) {
        normalizedQuery = canonical;
        break;
      }
    }

    // Build search patterns: try both normalized query and individual words
    const searchTerms = normalizedQuery.split(' ').filter(word => word.length >= 2);
    const searchPatterns = [
      normalizedQuery, // Full normalized query
      ...searchTerms.slice(0, 3), // First 3 significant words
    ].filter(Boolean);

    // Use trigram similarity search for fuzzy matching (from migration 058)
    // Search for ANY of the patterns in name or SKU
    const orConditions = searchPatterns.flatMap(pattern => [
      `name.ilike.%${pattern}%`,
      `sku.ilike.%${pattern}%`
    ]).join(',');

    const { data: items, error: itemsError } = await adminClient
      .from('items')
      .select('id, sku, name, category, base_uom')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .or(orConditions)
      .order('name')
      .limit(limit * 3); // Get more results for scoring

    if (itemsError) {
      throw itemsError;
    }

    // Efficient cost lookup: Join with lateral subquery instead of N+1
    // This reduces round trips dramatically
    const itemIds = (items || []).map((item) => item.id);
    if (itemIds.length === 0) {
      return NextResponse.json({ items: [], recipes: [] });
    }

    const { data: costs } = await supabase
      .from('item_cost_history')
      .select('item_id, unit_cost')
      .in('item_id', itemIds)
      .order('effective_date', { ascending: false });

    // Create map of item_id -> latest unit_cost
    const costMap = new Map<string, number>();
    (costs || []).forEach((cost) => {
      if (!costMap.has(cost.item_id)) {
        costMap.set(cost.item_id, cost.unit_cost);
      }
    });

    // Score items by relevance
    const scoredItems = items.map((item) => {
      let score = 0;
      const nameLower = item.name.toLowerCase();
      const queryLower = query.toLowerCase();

      // Exact match = highest score
      if (nameLower === queryLower) score += 100;

      // Starts with query
      if (nameLower.startsWith(queryLower)) score += 50;

      // Contains full query
      if (nameLower.includes(queryLower)) score += 30;

      // Contains all search terms
      const allTermsMatch = searchTerms.every(term => nameLower.includes(term.toLowerCase()));
      if (allTermsMatch) score += 20;

      // Bonus for shorter names (more specific match)
      score += Math.max(0, 10 - item.name.length / 10);

      return {
        ...item,
        unit_cost: costMap.get(item.id) || 0,
        _score: score
      };
    });

    // Sort by score descending, then by name
    const itemsWithCosts = scoredItems
      .sort((a, b) => b._score - a._score || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map(({ _score, ...item }) => item); // Remove score from output

    // Optional: Vendor-specific search (includes pack size matching)
    let finalItems = itemsWithCosts;
    if (vendorId) {
      const { data: vendorAliases } = await supabase
        .from('vendor_item_aliases')
        .select('item_id, vendor_description, pack_size')
        .eq('vendor_id', vendorId)
        .eq('is_active', true)
        .or(`vendor_description.ilike.%${normalizedQuery}%,vendor_item_code.ilike.%${normalizedQuery}%`)
        .limit(limit);

      const vendorItemIds = new Set(
        (vendorAliases || []).map((va) => va.item_id)
      );

      // Prioritize vendor-matched items (with pack size), then append others
      const vendorMatched = itemsWithCosts.filter((item) =>
        vendorItemIds.has(item.id)
      );
      const others = itemsWithCosts.filter(
        (item) => !vendorItemIds.has(item.id)
      );

      finalItems = [...vendorMatched, ...others].slice(0, limit);
    }

    // Optional: Include recipes in search
    let recipes: any[] = [];
    if (includeRecipes) {
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .select('id, name, recipe_type, category, yield_uom')
        .eq('is_active', true)
        .ilike('name', `%${normalizedQuery}%`)
        .order('name', { ascending: true })
        .limit(limit);

      if (!recipeError) {
        recipes = recipeData || [];
      }
    }

    return NextResponse.json({
      items: finalItems,
      recipes,
      count: finalItems.length + recipes.length,
    });
  });
}
