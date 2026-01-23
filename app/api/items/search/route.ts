import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  return guard(async () => {
    const supabase = await createClient();

    // Get user's organization
    const cookieStore = await cookies();
    const userIdCookie = cookieStore.get('user_id');

    if (!userIdCookie?.value) {
      return NextResponse.json({ items: [], recipes: [] });
    }

    const { data: orgUsers } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userIdCookie.value)
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
      .replace(/[*\-_\/\\|]/g, ' ')  // Replace special chars with spaces
      .replace(/\d+[°']/g, ' ')  // Remove proof/ABV ratings (80', 90°, etc.) - removed \b requirement
      .replace(/\b\d+yr\b/gi, ' ')  // Remove age statements (12yr, 18yr, etc.)
      .replace(/\bmalt\b/gi, ' ')  // Remove generic "malt" word
      .replace(/\bcase\b/gi, ' ')  // Remove "case" word
      .replace(/\b\d+\s*$/g, ' ')  // Remove trailing numbers (pack counts like "6" at end)
      .replace(/\b(tequila|vodka|whiskey|whisky|gin|rum|bourbon|scotch|cognac|brandy|liqueur|wine|beer|champagne|mezcal)\b/gi, ' ') // Remove spirit categories
      .replace(/\b(japanese|french|scottish|american|mexican|irish|canadian)\b/gi, ' ') // Remove origin words
      .replace(/\b(wh|whis|whisk)\b/gi, ' ') // Remove truncated whiskey variants
      .replace(/\b(el0|oro|elo)\b/gi, ' ') // Remove OCR artifacts (El0 -> Oro)
      .replace(/\b(fresh|juice|syrup)\b/gi, ' ') // Remove generic descriptors
      .replace(/\b6\/cs\b/gi, ' ') // Remove pack notation
      .replace(/\s+/g, ' ')           // Collapse multiple spaces
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

    // Use admin client to bypass RLS and filter by organization
    const adminClient = createAdminClient();

    // Use trigram similarity search for fuzzy matching (from migration 058)
    // This leverages the GIN indexes we created on name and SKU
    const { data: items, error: itemsError } = await adminClient
      .from('items')
      .select('id, sku, name, category, base_uom')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .or(`name.ilike.%${normalizedQuery}%,sku.ilike.%${normalizedQuery}%`)
      .order('name')
      .limit(limit);

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

    const itemsWithCosts = items.map((item) => ({
      ...item,
      unit_cost: costMap.get(item.id) || 0,
    }));

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
