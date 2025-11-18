import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/api/guard';

export async function GET(request: NextRequest) {
  return guard(async () => {
    const supabase = await createClient();

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim();
    const vendorId = searchParams.get('vendor_id');
    const includeRecipes = searchParams.get('include_recipes') === 'true';
    const limit = Math.min(Number(searchParams.get('limit')) || 10, 50);

    // Require minimum 2 characters for search
    if (!query || query.length < 2) {
      return NextResponse.json({ items: [], recipes: [] });
    }

    // Use trigram similarity search for fuzzy matching (from migration 058)
    // This leverages the GIN indexes we created on name and SKU
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('id, sku, name, category, base_uom')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
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

    // Optional: Vendor-specific search
    let finalItems = itemsWithCosts;
    if (vendorId) {
      const { data: vendorMappings } = await supabase
        .from('vendor_item_mapping')
        .select('item_id, vendor_item_name')
        .eq('vendor_id', vendorId)
        .ilike('vendor_item_name', `%${query}%`)
        .limit(limit);

      const vendorItemIds = new Set(
        (vendorMappings || []).map((vm) => vm.item_id)
      );

      // Prioritize vendor-matched items, then append others
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
        .ilike('name', `%${query}%`)
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
